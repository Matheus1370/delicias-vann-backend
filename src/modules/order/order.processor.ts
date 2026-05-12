import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { OrderService } from './order.service';

@Processor('orders')
export class OrderProcessor {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
    private fiscal: FiscalService,
    private orderService: OrderService,
    private config: ConfigService,
  ) {}

  @Process('payment-timeout')
  async handlePaymentTimeout(job: Job<{ pedidoId: string }>) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: job.data.pedidoId },
    });
    if (!pedido || pedido.status !== 'AGUARDANDO_PAGAMENTO') return;

    await this.orderService.updateStatus(
      job.data.pedidoId,
      'CANCELADO',
      'SYSTEM',
      'Pagamento não confirmado em 30 minutos',
    );
  }

  @Process('status-changed')
  async handleStatusChanged(
    job: Job<{ pedidoId: string; novoStatus: string; clienteId: string }>,
  ) {
    const { pedidoId, novoStatus, clienteId } = job.data;
    const cliente = await this.prisma.usuario.findUnique({ where: { id: clienteId } });
    if (!cliente?.telefone) return;

    const templateMap: Record<string, string> = {
      PAGO: 'confirmacao_pedido',
      EM_PRODUCAO: 'em_producao',
      PRONTO: 'pedido_pronto',
      EM_ENTREGA: 'pedido_enviado',
      ENTREGUE: 'pedido_entregue',
      CANCELADO: 'cancelamento',
      ATRASADO: 'pedido_atrasado',
    };

    const templateId = templateMap[novoStatus];
    if (!templateId) return;

    await this.notifications.send({
      pedidoId,
      telefone: cliente.telefone,
      templateId,
      payload: { nome: cliente.nome, pedidoId },
    });
  }

  @Process('emit-invoice')
  async handleEmitInvoice(job: Job<{ pedidoId: string }>) {
    const result = await this.fiscal.emit(job.data.pedidoId);
    this.logger.log(
      `[fiscal] pedido=${job.data.pedidoId} resultado=${JSON.stringify(result)}`,
    );
  }

  @Process('request-review')
  async handleRequestReview(job: Job<{ pedidoId: string }>) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: job.data.pedidoId },
      include: { cliente: true, avaliacao: true },
    });
    if (!pedido || pedido.avaliacao || !pedido.cliente?.telefone) return;

    const frontUrl =
      this.config.get<string>('FRONTEND_URL') ??
      this.config.get<string>('CORS_ORIGINS')?.split(',')[0] ??
      'http://localhost:5173';
    const linkAvaliacao = `${frontUrl.replace(/\/$/, '')}/avaliar/${job.data.pedidoId}`;

    await this.notifications.send({
      pedidoId: job.data.pedidoId,
      telefone: pedido.cliente.telefone,
      templateId: 'solicitar_avaliacao',
      payload: {
        nome: pedido.cliente.nome,
        pedidoId: job.data.pedidoId,
        linkAvaliacao,
      },
    });
  }

  @Process('watchdog-sla')
  async handleWatchdogSla() {
    const agora = new Date();
    const atrasados = await this.prisma.pedido.findMany({
      where: {
        status: { in: ['PAGO', 'EM_PRODUCAO'] },
        slaDeadline: { lt: agora },
        slaAlertado: false,
      },
      include: { cliente: true },
      take: 50,
    });

    for (const p of atrasados) {
      await this.prisma.pedido.update({
        where: { id: p.id },
        data: { status: 'ATRASADO', slaAlertado: true },
      });
      this.logger.warn(`[sla] pedido ${p.id} atrasado (deadline ${p.slaDeadline})`);
    }
  }

  @Process('check-low-stock')
  async handleCheckLowStock() {
    const insumos = await this.prisma.insumo.findMany({
      where: { ativo: true },
    });
    const baixos = insumos.filter(
      (i) => Number(i.estoqueAtual) <= Number(i.pontoReposicao),
    );
    if (baixos.length === 0) return;

    for (const ins of baixos) {
      const existente = await this.prisma.alertaEstoque.findFirst({
        where: { insumoId: ins.id, resolvido: false },
      });
      if (existente) continue;
      await this.prisma.alertaEstoque.create({
        data: {
          insumoId: ins.id,
          tipo: 'INSUMO_BAIXO',
          mensagem: `${ins.nome}: ${ins.estoqueAtual}${ins.unidadeMedida} (mín ${ins.pontoReposicao})`,
        },
      });
    }
  }

  @Process('gerar-assinaturas')
  async handleGerarAssinaturas() {
    const agora = new Date();
    const assinaturas = await this.prisma.assinatura.findMany({
      where: {
        status: 'ATIVA',
        proximaGeracao: { lte: agora },
      },
      take: 50,
    });

    for (const a of assinaturas) {
      try {
        await this.orderService.create(a.clienteId, {
          itens: [{ produtoId: a.produtoId, quantidade: 1 }],
          modalidadeEntrega: 'RETIRADA_BALCAO',
          origem: 'ASSINATURA',
          assinaturaId: a.id,
          observacoes: a.observacoes ?? undefined,
        });
        await this.prisma.assinatura.update({
          where: { id: a.id },
          data: {
            ultimaGeracaoEm: agora,
            proximaGeracao: new Date(
              agora.getTime() + a.frequenciaDias * 24 * 60 * 60 * 1000,
            ),
          },
        });
      } catch (err: any) {
        this.logger.error(`Falha ao gerar assinatura ${a.id}: ${err?.message}`);
      }
    }
  }

  @Process('cupom-aniversario')
  async handleCupomAniversario() {
    const hoje = new Date();
    const mm = hoje.getMonth() + 1;
    const dd = hoje.getDate();

    const aniversariantes = await this.prisma.$queryRaw<any[]>`
      SELECT id, nome, telefone FROM usuarios
      WHERE "marketingOptIn" = true
        AND "anonimizadoEm" IS NULL
        AND EXTRACT(MONTH FROM "dataNascimento") = ${mm}
        AND EXTRACT(DAY FROM "dataNascimento") = ${dd}
    `;

    for (const u of aniversariantes) {
      const codigo = `NIVER${u.id.slice(0, 6).toUpperCase()}`;
      try {
        const validoAte = new Date();
        validoAte.setDate(validoAte.getDate() + 14);
        await this.prisma.cupom.create({
          data: {
            codigo,
            tipo: 'PERCENTUAL',
            valor: 15,
            usoMaximo: 1,
            validoAte,
            campanha: 'ANIVERSARIO',
            descricao: `Feliz aniversário, ${u.nome}!`,
          },
        });
        if (u.telefone) {
          await this.notifications.send({
            pedidoId: '',
            telefone: u.telefone,
            templateId: 'cupom_aniversario',
            payload: { nome: u.nome, codigo },
          });
        }
      } catch (err: any) {
        this.logger.warn(`Falha cupom aniversário ${u.id}: ${err?.message}`);
      }
    }
  }
}
