import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  UnprocessableEntityException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CapacityService } from '../capacity/capacity.service';
import { NotificationService } from '../notification/notification.service';
import { AuditService } from '../audit/audit.service';
import { CupomService } from '../cupom/cupom.service';
import { PaymentGatewayService } from '../payment/payment-gateway.service';
import { EntregaService } from '../entrega/entrega.service';
import { CreditoService } from '../credito/credito.service';
import { IndicacaoService } from '../indicacao/indicacao.service';
import { EmpresaService } from '../empresa/empresa.service';
import { SazonalService } from '../sazonal/sazonal.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Prisma } from '@prisma/client';

interface CreateOrderData {
  itens: Array<{
    produtoId: string;
    quantidade: number;
    opcoesEscolhidas?: any;
    personalizacao?: string;
  }>;
  modalidadeEntrega: string;
  slotId?: string;
  enderecoEntregaId?: string;
  dataAgendamento?: string;
  observacoes?: string;
  cupomCodigo?: string;
  origem?: 'ONLINE' | 'WHATSAPP' | 'ASSINATURA' | 'BALCAO';
  assinaturaId?: string;
  numeroPessoas?: number;
  ocasiao?: string;
  horaFestaPrevista?: string;
  bufferHorasAntes?: number;
  usarCredito?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
}

const BUFFER_MIN_HORAS: Record<string, number> = {
  RETIRADA_BALCAO: 0,
  MOTOBOY_LOCAL: 2,
  UBER_DIRECT: 1,
  NOVENTA_NOVE_ENTREGAS: 1,
};

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private capacity: CapacityService,
    private notifications: NotificationService,
    private audit: AuditService,
    private cupom: CupomService,
    @Inject(forwardRef(() => PaymentGatewayService))
    private gateway: PaymentGatewayService,
    private entrega: EntregaService,
    private credito: CreditoService,
    private indicacao: IndicacaoService,
    private empresa: EmpresaService,
    private sazonal: SazonalService,
    @InjectQueue('orders') private ordersQueue: Queue,
  ) {}

  async create(clienteId: string, data: CreateOrderData) {
    const produtos = await this.prisma.produto.findMany({
      where: {
        id: { in: data.itens.map((i) => i.produtoId) },
        status: 'ATIVO',
        ativo: true,
      },
      include: {
        fichasTecnicas: {
          where: { tipo: 'OPERACIONAL', ativa: true },
          include: { itens: true },
          take: 1,
        },
        opcoesMontagem: true,
      },
    });

    if (produtos.length !== data.itens.length) {
      throw new BadRequestException('Um ou mais produtos não estão disponíveis');
    }

    // Janela festa/buffer: deriva dataAgendamento a partir de horaFestaPrevista
    let dataAgendamentoFinal: string | undefined = data.dataAgendamento;
    const bufferHoras = data.bufferHorasAntes ?? 2;
    if (data.horaFestaPrevista) {
      const minBuffer = BUFFER_MIN_HORAS[data.modalidadeEntrega] ?? 0;
      if (bufferHoras < minBuffer) {
        throw new UnprocessableEntityException(
          `Buffer de ${bufferHoras}h não atende a modalidade ${data.modalidadeEntrega} (mínimo ${minBuffer}h).`,
        );
      }
      const festaTs = new Date(data.horaFestaPrevista).getTime();
      const despacho = new Date(festaTs - bufferHoras * 60 * 60 * 1000);
      dataAgendamentoFinal = despacho.toISOString();
    }

    // Valida modalidade contra a interseção das modalidadesPermitidas de cada item
    const intersecaoModalidades = produtos.reduce<string[] | null>((acc, p) => {
      const permitidas = (p.modalidadesPermitidas ?? []) as string[];
      if (acc === null) return [...permitidas];
      return acc.filter((m) => permitidas.includes(m));
    }, null);
    if (intersecaoModalidades && !intersecaoModalidades.includes(data.modalidadeEntrega)) {
      const incompativel = produtos.find(
        (p) => !((p.modalidadesPermitidas ?? []) as string[]).includes(data.modalidadeEntrega),
      );
      throw new UnprocessableEntityException(
        `Modalidade ${data.modalidadeEntrega} não permitida para este pedido${
          incompativel?.nome ? ` (item incompatível: ${incompativel.nome})` : ''
        }`,
      );
    }

    const itensMapeados = data.itens.map((item) => {
      const produto = produtos.find((p) => p.id === item.produtoId)!;
      const ficha = produto.fichasTecnicas[0];
      return {
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        precoUnitario: produto.precoVenda,
        snapshotCustoProducao: ficha?.custoCalculado ?? new Prisma.Decimal(0),
        snapshotPontosEsforco: produto.pontosEsforco,
        opcoesEscolhidas: item.opcoesEscolhidas ?? Prisma.JsonNull,
        personalizacao: item.personalizacao ?? null,
      };
    });

    const valorSubtotal = itensMapeados.reduce(
      (acc, i) => acc + Number(i.precoUnitario) * i.quantidade,
      0,
    );
    const pontosTotal = itensMapeados.reduce(
      (acc, i) => acc + i.snapshotPontosEsforco * i.quantidade,
      0,
    );

    // Valida mínimo de pedido por modalidade + computa frete
    const configEntrega = await this.entrega.getByModalidade(data.modalidadeEntrega);
    if (configEntrega) {
      const minimo = Number(configEntrega.valorMinimoPedido);
      if (minimo > 0 && valorSubtotal < minimo) {
        throw new UnprocessableEntityException(
          `Valor mínimo de R$ ${minimo.toFixed(2)} para a modalidade ${data.modalidadeEntrega}.`,
        );
      }
    }
    const valorFrete = await this.entrega.computeFrete(data.modalidadeEntrega, valorSubtotal);

    let valorDesconto = 0;
    let cupomId: string | undefined;
    if (data.cupomCodigo) {
      const result = await this.cupom.validate(data.cupomCodigo, valorSubtotal);
      valorDesconto = result.desconto;
      cupomId = result.cupom.id;
    }

    // Desconto corporativo (Fase 3 / 5.5): cliente PJ aprovado ganha % sobre o subtotal
    const descontoEmpresa = await this.empresa.getDescontoAtivo(clienteId);
    let empresaId: string | undefined;
    if (descontoEmpresa) {
      const descontoValor = (valorSubtotal * descontoEmpresa.descontoPct) / 100;
      valorDesconto += descontoValor;
      empresaId = descontoEmpresa.empresaId;
    }

    // Vale-bolo: aplica credito do cliente, sem deixar valorTotal negativo
    let valorCreditoUsado = 0;
    if (data.usarCredito) {
      const saldoCredito = await this.credito.saldoTotal(clienteId);
      const valorPosCupom = Math.max(0, valorSubtotal + valorFrete - valorDesconto);
      valorCreditoUsado = Math.min(saldoCredito, valorPosCupom);
    }

    // Calcula lead time por item somando produto.leadTimeHoras + extras das opcoes escolhidas
    const leadTimePorItem = data.itens.map((item) => {
      const produto = produtos.find((p) => p.id === item.produtoId)!;
      const opcoes = (produto as any).opcoesMontagem as
        | Array<{ label: string; leadTimeHorasExtra?: number }>
        | undefined;
      const labelsEscolhidos = new Set(
        Object.values(item.opcoesEscolhidas ?? {})
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.toLowerCase()),
      );
      const extras = (opcoes ?? [])
        .filter((op) => labelsEscolhidos.has(op.label.toLowerCase()))
        .reduce((acc, op) => acc + (op.leadTimeHorasExtra ?? 0), 0);
      return produto.leadTimeHoras + extras;
    });
    const maxLeadHoras = Math.max(...leadTimePorItem, 24);

    if (dataAgendamentoFinal) {
      const ts = new Date(dataAgendamentoFinal).getTime();
      const minTs = Date.now() + maxLeadHoras * 60 * 60 * 1000;
      if (ts < minTs) {
        const dias = Math.ceil(maxLeadHoras / 24);
        throw new UnprocessableEntityException(
          `Prazo mínimo de ${dias} dias (${maxLeadHoras}h) de antecedência para essa configuração.`,
        );
      }

      // Janela sazonal (6.5)
      const temCustomizacao = data.itens.some(
        (i) =>
          (i.opcoesEscolhidas && Object.keys(i.opcoesEscolhidas).length > 0) ||
          !!i.personalizacao,
      );
      const sazonalCheck = await this.sazonal.checarPedido({
        dataAlvo: new Date(dataAgendamentoFinal),
        temCustomizacao,
      });
      if (!sazonalCheck.ok) {
        throw new UnprocessableEntityException(
          sazonalCheck.motivo ?? 'Pedido bloqueado por janela sazonal.',
        );
      }
    }

    const slaDeadline = new Date(Date.now() + maxLeadHoras * 60 * 60 * 1000);

    const pedido = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.pedido.create({
        data: {
          clienteId,
          origem: (data.origem as any) ?? 'ONLINE',
          modalidadeEntrega: data.modalidadeEntrega as any,
          empresaId: empresaId ?? null,
          utmSource: data.utmSource ?? null,
          utmMedium: data.utmMedium ?? null,
          utmCampaign: data.utmCampaign ?? null,
          utmContent: data.utmContent ?? null,
          dataAgendamento: dataAgendamentoFinal ? new Date(dataAgendamentoFinal) : null,
          horaFestaPrevista: data.horaFestaPrevista ? new Date(data.horaFestaPrevista) : null,
          bufferHorasAntes: bufferHoras,
          enderecoEntregaId: data.enderecoEntregaId ?? null,
          cupomId,
          assinaturaId: data.assinaturaId,
          valorSubtotal,
          valorFrete,
          valorDesconto,
          valorCreditoUsado,
          valorTotal: Math.max(0, valorSubtotal + valorFrete - valorDesconto - valorCreditoUsado),
          numeroPessoas: data.numeroPessoas ?? null,
          ocasiao: data.ocasiao ?? null,
          observacoes: data.observacoes,
          slaDeadline,
          itens: { create: itensMapeados },
          pagamento: {
            create: { gateway: 'ABACATE_PAY', status: 'PENDENTE' },
          },
        },
        include: { itens: true, pagamento: true },
      });

      if (data.slotId && pontosTotal > 0) {
        await this.capacity.reservarSlot(criado.id, data.slotId, pontosTotal, tx);
      }

      if (cupomId) {
        await tx.cupom.update({
          where: { id: cupomId },
          data: { usoAtual: { increment: 1 } },
        });
      }

      await this.ordersQueue.add(
        'payment-timeout',
        { pedidoId: criado.id },
        { delay: 30 * 60 * 1000 },
      );

      if (valorCreditoUsado > 0) {
        await this.credito.consumir(clienteId, valorCreditoUsado, tx);
      }

      return criado;
    });

    try {
      const cobranca = await this.gateway.createPixCharge({
        pedidoId: pedido.id,
        valorCentavos: Math.round(Number(pedido.valorTotal) * 100),
        clienteNome: (await this.prisma.usuario.findUnique({ where: { id: clienteId } }))!.nome,
        clienteEmail: (await this.prisma.usuario.findUnique({ where: { id: clienteId } }))!.email,
        expiresInMinutes: 30,
      });
      await this.prisma.pagamento.update({
        where: { pedidoId: pedido.id },
        data: {
          gatewayTransacaoId: cobranca.transacaoId,
          pixCopiaCola: cobranca.pixCopiaCola,
          pixQrCodeUrl: cobranca.pixQrCodeUrl,
          expiresAt: cobranca.expiresAt,
          gatewayPayloadRaw: cobranca.raw,
        },
      });
    } catch (err: any) {
      // Se a cobrança falhar, o pedido fica em AGUARDANDO_PAGAMENTO e será cancelado pelo timeout.
      // Aqui em dev o mock nunca falha.
    }

    await this.audit.log({
      acao: 'ORDER.CREATED',
      entidade: 'Pedido',
      entidadeId: pedido.id,
      payloadDepois: { id: pedido.id, valorTotal: pedido.valorTotal, pontosTotal },
      usuarioId: clienteId,
    });

    return this.prisma.pedido.findUnique({
      where: { id: pedido.id },
      include: { itens: true, pagamento: true },
    });
  }

  async updateStatus(
    pedidoId: string,
    novoStatus: string,
    operadorId: string,
    motivo?: string,
  ) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        cliente: true,
        itens: {
          include: {
            produto: {
              include: {
                fichasTecnicas: {
                  where: { tipo: 'OPERACIONAL', ativa: true },
                  include: { itens: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');

    const transicoesValidas: Record<string, string[]> = {
      AGUARDANDO_PAGAMENTO: ['PAGO', 'CANCELADO'],
      PAGO: ['EM_PRODUCAO', 'CANCELADO'],
      EM_PRODUCAO: ['PRONTO', 'ATRASADO'],
      ATRASADO: ['PRONTO', 'CANCELADO'],
      PRONTO: ['EM_ENTREGA', 'ENTREGUE'],
      EM_ENTREGA: ['ENTREGUE', 'FALHA_ENTREGA'],
      ENTREGUE: [],
      CANCELADO: [],
      FALHA_ENTREGA: ['EM_ENTREGA'],
    };

    if (!transicoesValidas[pedido.status]?.includes(novoStatus)) {
      throw new BadRequestException(
        `Transição inválida: ${pedido.status} → ${novoStatus}`,
      );
    }

    if (pedido.status === 'PAGO' && novoStatus === 'EM_PRODUCAO') {
      await this.explodirBOM(pedido, operadorId);
    }

    const atualizado = await this.prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        status: novoStatus as any,
        ...(motivo && { canceladoMotivo: motivo, canceladoPor: operadorId }),
      },
    });

    await this.ordersQueue.add('status-changed', {
      pedidoId,
      novoStatus,
      clienteId: pedido.clienteId,
    });

    if (novoStatus === 'CANCELADO') {
      await this.capacity.liberarSlot(pedidoId);
    }

    if (novoStatus === 'ENTREGUE') {
      await this.ordersQueue.add('emit-invoice', { pedidoId }, { delay: 5000 });
      await this.ordersQueue.add(
        'request-review',
        { pedidoId },
        { delay: 48 * 60 * 60 * 1000 },
      );
    }

    // Programa de indicação: quando pedido entra em PAGO, processa eventual conversão
    if (novoStatus === 'PAGO') {
      await this.indicacao.processarConversao(pedido.clienteId, pedidoId);
    }

    await this.audit.log({
      acao: `ORDER.STATUS.${novoStatus}`,
      entidade: 'Pedido',
      entidadeId: pedidoId,
      payloadAntes: { status: pedido.status },
      payloadDepois: { status: novoStatus },
      usuarioId: operadorId,
    });

    return atualizado;
  }

  private async explodirBOM(pedido: any, operadorId: string) {
    const consumos = new Map<string, number>();
    for (const item of pedido.itens) {
      const ficha = item.produto.fichasTecnicas[0];
      if (!ficha) continue;
      for (const linha of ficha.itens) {
        const atual = consumos.get(linha.insumoId) ?? 0;
        consumos.set(linha.insumoId, atual + Number(linha.quantidade) * item.quantidade);
      }
    }

    if (consumos.size === 0) return;

    const insumos = await this.prisma.insumo.findMany({
      where: { id: { in: Array.from(consumos.keys()) } },
    });

    const faltantes: string[] = [];
    for (const ins of insumos) {
      const consumo = consumos.get(ins.id) ?? 0;
      if (Number(ins.estoqueAtual) < consumo) {
        faltantes.push(`${ins.nome} (precisa ${consumo}${ins.unidadeMedida}, tem ${ins.estoqueAtual})`);
      }
    }
    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Insumo insuficiente: ${faltantes.join('; ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [insumoId, quantidade] of consumos.entries()) {
        await tx.insumo.update({
          where: { id: insumoId },
          data: { estoqueAtual: { decrement: quantidade } },
        });
        await tx.movimentacaoEstoque.create({
          data: {
            insumoId,
            tipo: 'SAIDA_PRODUCAO',
            quantidade,
            pedidoId: pedido.id,
            operadorId,
          },
        });
      }
    });
  }

  async findOne(pedidoId: string, userId: string, isAdmin: boolean) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        cliente: { select: { id: true, nome: true, email: true, telefone: true, cpf: true } },
        itens: {
          include: {
            produto: { select: { nome: true, imagemUrl: true, slug: true, alergenicos: true } },
          },
        },
        pagamento: true,
        entrega: true,
        reservaProducao: { include: { slot: true } },
        enderecoEntrega: true,
        cupom: true,
        avaliacao: true,
        fotosEntrega: { orderBy: { enviadaEm: 'desc' } },
      },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');
    if (!isAdmin && pedido.clienteId !== userId) {
      throw new NotFoundException('Pedido não encontrado');
    }
    return pedido;
  }

  async findByCliente(clienteId: string) {
    return this.prisma.pedido.findMany({
      where: { clienteId },
      include: {
        itens: { include: { produto: { select: { nome: true, imagemUrl: true } } } },
        pagamento: {
          select: { status: true, metodo: true, pixCopiaCola: true, pixQrCodeUrl: true },
        },
        entrega: { select: { status: true, trackingCode: true, previsaoEntrega: true } },
        reservaProducao: { include: { slot: true } },
        avaliacao: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllAdmin(query: {
    status?: string;
    utmSource?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.utmSource) where.utmSource = query.utmSource;
    const [pedidos, total] = await this.prisma.$transaction([
      this.prisma.pedido.findMany({
        where,
        include: {
          cliente: { select: { nome: true, email: true, telefone: true } },
          itens: { include: { produto: { select: { nome: true } } } },
          pagamento: { select: { status: true } },
          reservaProducao: {
            include: { slot: { select: { horaInicio: true, horaFim: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.pedido.count({ where }),
    ]);

    return { pedidos, total, page, pages: Math.ceil(total / limit) };
  }

  async cancelByCliente(pedidoId: string, clienteId: string, motivo: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
    });
    if (!pedido || pedido.clienteId !== clienteId) {
      throw new NotFoundException('Pedido não encontrado');
    }

    const statusCancelaveis: string[] = ['AGUARDANDO_PAGAMENTO', 'PAGO'];
    if (!statusCancelaveis.includes(pedido.status)) {
      throw new ForbiddenException(
        'Pedido já entrou em produção. Entre em contato conosco para cancelar.',
      );
    }

    // Política de reembolso: usa dataAgendamento (já é o despacho derivado de festa - buffer)
    const janelaTotal = pedido.janelaReembolsoHoras ?? 48;
    const janelaMeio = janelaTotal / 2;
    const valorTotal = Number(pedido.valorTotal);
    let valorReembolso = 0;
    let valorCreditoFuturo = 0;

    if (pedido.status === 'AGUARDANDO_PAGAMENTO') {
      // Sem pagamento confirmado, nada a reembolsar
      valorReembolso = 0;
    } else if (pedido.dataAgendamento) {
      const horasAteDespacho =
        (pedido.dataAgendamento.getTime() - Date.now()) / (60 * 60 * 1000);
      if (horasAteDespacho >= janelaTotal) {
        valorReembolso = valorTotal;
      } else if (horasAteDespacho >= janelaMeio) {
        valorReembolso = valorTotal / 2;
        valorCreditoFuturo = valorTotal / 2;
      } else {
        valorReembolso = 0;
      }
    } else {
      // Sem dataAgendamento conhecida: política conservadora — reembolsa tudo
      valorReembolso = valorTotal;
    }

    await this.updateStatus(
      pedidoId,
      'CANCELADO',
      clienteId,
      motivo || 'Cancelado pelo cliente',
    );

    // Gera credito real (Fase 3) quando ha valorCreditoFuturo > 0
    if (valorCreditoFuturo > 0) {
      await this.credito.gerar({
        clienteId,
        valor: valorCreditoFuturo,
        motivo: `cancelamento véspera (pedido ${pedidoId.slice(0, 8)})`,
        pedidoOrigemId: pedidoId,
        expiraEm: null,
      });
    }

    return this.prisma.pedido.update({
      where: { id: pedidoId },
      data: {
        valorReembolso,
        valorCreditoFuturo: valorCreditoFuturo > 0 ? valorCreditoFuturo : null,
      },
    });
  }

  async reorder(pedidoId: string, clienteId: string) {
    const original = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { itens: true },
    });
    if (!original || original.clienteId !== clienteId) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.create(clienteId, {
      itens: original.itens.map((it) => ({
        produtoId: it.produtoId,
        quantidade: it.quantidade,
        opcoesEscolhidas: it.opcoesEscolhidas,
        personalizacao: it.personalizacao ?? undefined,
      })),
      modalidadeEntrega: original.modalidadeEntrega,
      enderecoEntregaId: original.enderecoEntregaId ?? undefined,
      observacoes: original.observacoes ?? undefined,
      origem: 'ONLINE',
    });
  }

  async createRascunhoWhatsApp(
    clienteId: string,
    data: {
      itens: Array<{
        produtoId: string;
        quantidade: number;
        opcoesEscolhidas?: any;
        personalizacao?: string;
      }>;
      modalidadeEntrega?: string;
      dataAgendamento?: string;
      observacoes?: string;
      numeroPessoas?: number;
      ocasiao?: string;
    },
  ) {
    const produtos = await this.prisma.produto.findMany({
      where: {
        id: { in: data.itens.map((i) => i.produtoId) },
        status: 'ATIVO',
        ativo: true,
      },
    });

    if (produtos.length !== new Set(data.itens.map((i) => i.produtoId)).size) {
      throw new BadRequestException('Um ou mais produtos não estão disponíveis');
    }

    const itensMapeados = data.itens.map((item) => {
      const produto = produtos.find((p) => p.id === item.produtoId)!;
      return {
        produtoId: item.produtoId,
        quantidade: item.quantidade,
        precoUnitario: produto.precoVenda,
        snapshotCustoProducao: new Prisma.Decimal(0),
        snapshotPontosEsforco: produto.pontosEsforco,
        opcoesEscolhidas: item.opcoesEscolhidas ?? Prisma.JsonNull,
        personalizacao: item.personalizacao ?? null,
      };
    });

    const valorSubtotal = itensMapeados.reduce(
      (acc, i) => acc + Number(i.precoUnitario) * i.quantidade,
      0,
    );

    const draft = await this.prisma.pedido.create({
      data: {
        clienteId,
        status: 'RASCUNHO_WHATSAPP',
        origem: 'WHATSAPP',
        modalidadeEntrega: (data.modalidadeEntrega as any) ?? 'RETIRADA_BALCAO',
        dataAgendamento: data.dataAgendamento ? new Date(data.dataAgendamento) : null,
        valorSubtotal,
        valorFrete: 0,
        valorDesconto: 0,
        valorTotal: valorSubtotal,
        numeroPessoas: data.numeroPessoas ?? null,
        ocasiao: data.ocasiao ?? null,
        observacoes: data.observacoes ?? null,
        itens: { create: itensMapeados },
      },
      include: { itens: true },
    });

    await this.audit.log({
      acao: 'ORDER.WHATSAPP_DRAFT_CREATED',
      entidade: 'Pedido',
      entidadeId: draft.id,
      payloadDepois: { id: draft.id, valorTotal: draft.valorTotal },
      usuarioId: clienteId,
    });

    return draft;
  }

  async findRascunhosWhatsApp() {
    return this.prisma.pedido.findMany({
      where: { status: 'RASCUNHO_WHATSAPP' },
      include: {
        cliente: { select: { id: true, nome: true, telefone: true, email: true } },
        itens: {
          include: {
            produto: { select: { id: true, nome: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async adicionarFotoPronto(
    pedidoId: string,
    url: string,
    legenda: string | undefined,
    operadorId: string,
  ) {
    if (!url || !url.trim()) {
      throw new BadRequestException('URL da foto é obrigatória');
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { cliente: { select: { id: true, nome: true, telefone: true } } },
    });

    if (!pedido) throw new NotFoundException('Pedido não encontrado');

    if (pedido.status !== 'PRONTO') {
      throw new BadRequestException(
        `Foto só pode ser anexada quando pedido está PRONTO (atual: ${pedido.status})`,
      );
    }

    const foto = await this.prisma.fotoEntrega.create({
      data: {
        pedidoId,
        url: url.trim(),
        legenda: legenda ?? null,
      },
    });

    if (pedido.cliente?.telefone) {
      await this.notifications.send({
        pedidoId,
        telefone: pedido.cliente.telefone,
        templateId: 'foto_bolo_pronto',
        payload: {
          nome: pedido.cliente.nome,
          pedidoId,
          fotoUrl: url.trim(),
        },
      });
    }

    await this.audit.log({
      acao: 'ORDER.FOTO_PRONTO_ADDED',
      entidade: 'Pedido',
      entidadeId: pedidoId,
      payloadDepois: { fotoId: foto.id },
      usuarioId: operadorId,
    });

    return foto;
  }

  async fichaProducao(pedidoId: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        cliente: { select: { nome: true, telefone: true } },
        itens: {
          include: {
            produto: {
              include: {
                fichasTecnicas: {
                  where: { tipo: 'OPERACIONAL', ativa: true },
                  include: { itens: { include: { insumo: true } } },
                  take: 1,
                },
              },
            },
          },
        },
        reservaProducao: { include: { slot: true } },
      },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');
    return pedido;
  }
}
