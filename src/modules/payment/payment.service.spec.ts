import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { OrderService } from '../order/order.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { createHmac } from 'crypto';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: Record<string, any>;
  let configService: { get: jest.Mock };
  let orderService: { updateStatus: jest.Mock };
  let gateway: { createPixCharge: jest.Mock };

  beforeEach(async () => {
    prisma = {
      pedido: {
        findUnique: jest.fn(),
      },
      pagamento: {
        update: jest.fn(),
        findFirst: jest.fn(),
      },
      webhookEvent: {
        create: jest.fn(),
      },
    };

    configService = { get: jest.fn() };
    orderService = { updateStatus: jest.fn() };
    gateway = { createPixCharge: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: OrderService, useValue: orderService },
        { provide: PaymentGatewayService, useValue: gateway },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  describe('processWebhook', () => {
    const webhookSecret = 'test-secret-key';
    const transacaoId = 'txn_abc123';
    const pagamentoId = 'pag_001';
    const pedidoId = 'ped_001';

    const makeBody = (event: string, eventId?: string) => ({
      id: eventId ?? 'evt_001',
      event,
      data: { transaction_id: transacaoId, amount: 5000 },
    });

    const makeSignature = (body: Buffer, secret: string) => {
      const hmac = createHmac('sha256', secret).update(body).digest('hex');
      return `sha256=${hmac}`;
    };

    it('should confirm payment on PAYMENT.CONFIRMED event', async () => {
      const body = makeBody('PAYMENT.CONFIRMED');
      const rawBody = Buffer.from(JSON.stringify(body));
      const signature = makeSignature(rawBody, webhookSecret);

      configService.get.mockReturnValue(webhookSecret);
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.pagamento.findFirst.mockResolvedValue({
        id: pagamentoId,
        pedidoId,
        status: 'PENDENTE',
        gatewayTransacaoId: transacaoId,
      });
      prisma.pagamento.update.mockResolvedValue({});
      orderService.updateStatus.mockResolvedValue({});

      await service.processWebhook(signature, body, rawBody);

      expect(prisma.webhookEvent.create).toHaveBeenCalledWith({
        data: { id: 'evt_001', gateway: 'ABACATE_PAY', payload: body },
      });
      expect(prisma.pagamento.update).toHaveBeenCalledWith({
        where: { id: pagamentoId },
        data: expect.objectContaining({
          status: 'CONFIRMADO',
          valorPago: 50,
          gatewayPayloadRaw: body,
        }),
      });
      expect(orderService.updateStatus).toHaveBeenCalledWith(
        pedidoId,
        'PAGO',
        'SYSTEM',
      );
    });

    it('should skip duplicate event (idempotency)', async () => {
      const body = makeBody('PAYMENT.CONFIRMED', 'evt_duplicate');
      const rawBody = Buffer.from(JSON.stringify(body));

      configService.get.mockReturnValue('');
      prisma.webhookEvent.create.mockRejectedValue(
        new Error('Unique constraint failed'),
      );

      await service.processWebhook('', body, rawBody);

      expect(prisma.pagamento.findFirst).not.toHaveBeenCalled();
      expect(prisma.pagamento.update).not.toHaveBeenCalled();
      expect(orderService.updateStatus).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on invalid signature', async () => {
      const body = makeBody('PAYMENT.CONFIRMED');
      const rawBody = Buffer.from(JSON.stringify(body));
      const invalidSignature = 'sha256=invalid_hex_value';

      configService.get.mockReturnValue(webhookSecret);

      await expect(
        service.processWebhook(invalidSignature, body, rawBody),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.webhookEvent.create).not.toHaveBeenCalled();
    });

    it('should handle payment.confirmed (lowercase) event', async () => {
      const body = makeBody('payment.confirmed');
      const rawBody = Buffer.from(JSON.stringify(body));

      configService.get.mockReturnValue('');
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.pagamento.findFirst.mockResolvedValue({
        id: pagamentoId,
        pedidoId,
        status: 'PENDENTE',
        gatewayTransacaoId: transacaoId,
      });
      prisma.pagamento.update.mockResolvedValue({});
      orderService.updateStatus.mockResolvedValue({});

      await service.processWebhook('', body, rawBody);

      expect(prisma.pagamento.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CONFIRMADO' }),
        }),
      );
      expect(orderService.updateStatus).toHaveBeenCalledWith(
        pedidoId,
        'PAGO',
        'SYSTEM',
      );
    });

    it('should skip update when payment already CONFIRMADO', async () => {
      const body = makeBody('PAYMENT.CONFIRMED');
      const rawBody = Buffer.from(JSON.stringify(body));

      configService.get.mockReturnValue('');
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.pagamento.findFirst.mockResolvedValue({
        id: pagamentoId,
        pedidoId,
        status: 'CONFIRMADO',
        gatewayTransacaoId: transacaoId,
      });

      await service.processWebhook('', body, rawBody);

      expect(prisma.pagamento.update).not.toHaveBeenCalled();
      expect(orderService.updateStatus).not.toHaveBeenCalled();
    });

    it('should handle PAYMENT.REFUNDED event', async () => {
      const body = makeBody('PAYMENT.REFUNDED');
      const rawBody = Buffer.from(JSON.stringify(body));

      configService.get.mockReturnValue('');
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.pagamento.findFirst.mockResolvedValue({
        id: pagamentoId,
        pedidoId,
        status: 'CONFIRMADO',
        gatewayTransacaoId: transacaoId,
      });
      prisma.pagamento.update.mockResolvedValue({});

      await service.processWebhook('', body, rawBody);

      expect(prisma.pagamento.update).toHaveBeenCalledWith({
        where: { id: pagamentoId },
        data: expect.objectContaining({ status: 'ESTORNADO' }),
      });
    });

    it('should return early when no transacaoId in webhook data', async () => {
      const body = { id: 'evt_no_txn', event: 'PAYMENT.CONFIRMED', data: {} };
      const rawBody = Buffer.from(JSON.stringify(body));

      configService.get.mockReturnValue('');
      prisma.webhookEvent.create.mockResolvedValue({});

      await service.processWebhook('', body, rawBody);

      expect(prisma.pagamento.findFirst).not.toHaveBeenCalled();
    });

    it('should return early when pagamento not found', async () => {
      const body = makeBody('PAYMENT.CONFIRMED');
      const rawBody = Buffer.from(JSON.stringify(body));

      configService.get.mockReturnValue('');
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.pagamento.findFirst.mockResolvedValue(null);

      await service.processWebhook('', body, rawBody);

      expect(prisma.pagamento.update).not.toHaveBeenCalled();
      expect(orderService.updateStatus).not.toHaveBeenCalled();
    });
  });
});
