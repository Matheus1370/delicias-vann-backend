import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderService } from '../order/order.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { createHmac } from 'crypto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private orderService: OrderService,
    private gateway: PaymentGatewayService,
  ) {}

  async criarCobranca(pedidoId: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { cliente: true },
    });
    if (!pedido) throw new BadRequestException('Pedido não encontrado');

    const cobranca = await this.gateway.createPixCharge({
      pedidoId: pedido.id,
      valorCentavos: Math.round(Number(pedido.valorTotal) * 100),
      clienteNome: pedido.cliente.nome,
      clienteEmail: pedido.cliente.email,
      clienteTelefone: pedido.cliente.telefone ?? undefined,
      expiresInMinutes: 30,
    });

    return this.prisma.pagamento.update({
      where: { pedidoId },
      data: {
        gatewayTransacaoId: cobranca.transacaoId,
        pixCopiaCola: cobranca.pixCopiaCola,
        pixQrCodeUrl: cobranca.pixQrCodeUrl,
        expiresAt: cobranca.expiresAt,
        gatewayPayloadRaw: cobranca.raw,
      },
    });
  }

  async processWebhook(signature: string, body: any, rawBody: Buffer) {
    const secret = this.config.get<string>('ABACATE_PAY_WEBHOOK_SECRET') ?? '';

    if (secret) {
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      if (signature !== `sha256=${expected}`) {
        throw new BadRequestException('Assinatura inválida');
      }
    }

    const eventId: string | undefined = body.id ?? body.event_id;
    if (eventId) {
      try {
        await this.prisma.webhookEvent.create({
          data: { id: eventId, gateway: 'ABACATE_PAY', payload: body },
        });
      } catch {
        this.logger.log(`Evento ${eventId} já processado. Ignorando.`);
        return;
      }
    }

    const { event, data } = body;
    const transacaoId = data?.transaction_id ?? data?.id;
    if (!transacaoId) {
      this.logger.warn('Webhook sem transacao_id');
      return;
    }

    const pagamento = await this.prisma.pagamento.findFirst({
      where: { gatewayTransacaoId: transacaoId },
    });

    if (!pagamento) {
      this.logger.warn(`Pagamento não encontrado para transação ${transacaoId}`);
      return;
    }

    if (event === 'PAYMENT.CONFIRMED' || event === 'payment.confirmed') {
      if (pagamento.status === 'CONFIRMADO') return;
      await this.prisma.pagamento.update({
        where: { id: pagamento.id },
        data: {
          status: 'CONFIRMADO',
          valorPago: (data.amount ?? 0) / 100,
          confirmadoEm: new Date(),
          gatewayPayloadRaw: body,
        },
      });
      await this.orderService.updateStatus(pagamento.pedidoId, 'PAGO', 'SYSTEM');
    }

    if (event === 'PAYMENT.REFUNDED' || event === 'payment.refunded') {
      await this.prisma.pagamento.update({
        where: { id: pagamento.id },
        data: { status: 'ESTORNADO', estornadoEm: new Date() },
      });
    }
  }
}
