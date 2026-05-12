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
}

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

    let valorDesconto = 0;
    let cupomId: string | undefined;
    if (data.cupomCodigo) {
      const result = await this.cupom.validate(data.cupomCodigo, valorSubtotal);
      valorDesconto = result.desconto;
      cupomId = result.cupom.id;
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

    if (data.dataAgendamento) {
      const ts = new Date(data.dataAgendamento).getTime();
      const minTs = Date.now() + maxLeadHoras * 60 * 60 * 1000;
      if (ts < minTs) {
        const dias = Math.ceil(maxLeadHoras / 24);
        throw new UnprocessableEntityException(
          `Prazo mínimo de ${dias} dias (${maxLeadHoras}h) de antecedência para essa configuração.`,
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
          dataAgendamento: data.dataAgendamento ? new Date(data.dataAgendamento) : null,
          enderecoEntregaId: data.enderecoEntregaId ?? null,
          cupomId,
          assinaturaId: data.assinaturaId,
          valorSubtotal,
          valorFrete: 0,
          valorDesconto,
          valorTotal: valorSubtotal - valorDesconto,
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
        { delay: 2 * 60 * 60 * 1000 },
      );
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

  async findAllAdmin(query: { status?: string; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = query.status ? { status: query.status as any } : {};
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

    const podeCancelar =
      pedido.status === 'AGUARDANDO_PAGAMENTO' ||
      (pedido.status === 'PAGO' &&
        Date.now() - pedido.createdAt.getTime() < 30 * 60 * 1000);

    if (!podeCancelar) {
      throw new ForbiddenException(
        'Pedido não pode mais ser cancelado. Entre em contato conosco.',
      );
    }

    return this.updateStatus(
      pedidoId,
      'CANCELADO',
      clienteId,
      motivo || 'Cancelado pelo cliente',
    );
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
