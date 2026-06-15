import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
  let gateway: { createPixCharge: jest.Mock; simulatePayment: jest.Mock };

  beforeEach(async () => {
    prisma = {
      pedido: {
        findUnique: jest.fn(),
      },
      pagamento: {
        update: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      webhookEvent: {
        create: jest.fn(),
      },
    };

    configService = { get: jest.fn() };
    orderService = { updateStatus: jest.fn() };
    gateway = { createPixCharge: jest.fn(), simulatePayment: jest.fn() };

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
        pedido: { id: pedidoId, valorTotal: 50 },
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
        pedido: { id: pedidoId, valorTotal: 50 },
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

    it('should NOT confirm payment when amount is below pedido total (subpagamento)', async () => {
      const body = {
        id: 'evt_underpay',
        event: 'PAYMENT.CONFIRMED',
        data: { transaction_id: transacaoId, amount: 1 },
      };
      const rawBody = Buffer.from(JSON.stringify(body));

      configService.get.mockReturnValue('');
      prisma.webhookEvent.create.mockResolvedValue({});
      prisma.pagamento.findFirst.mockResolvedValue({
        id: pagamentoId,
        pedidoId,
        status: 'PENDENTE',
        gatewayTransacaoId: transacaoId,
        pedido: { id: pedidoId, valorTotal: 50 },
      });

      await service.processWebhook('', body, rawBody);

      expect(prisma.pagamento.update).not.toHaveBeenCalled();
      expect(orderService.updateStatus).not.toHaveBeenCalled();
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

    it('confirma pagamento via evento de checkout de cartão', async () => {
      prisma.pagamento.findFirst.mockResolvedValue({
        id: 'pag-1',
        status: 'PENDENTE',
        pedidoId: 'ped-1',
        pedido: { valorTotal: 50 },
      });
      prisma.pagamento.update.mockResolvedValue({});

      await service.processWebhook(
        '',
        { event: 'checkout.completed', data: { id: 'chk_1', amount: 5000 } },
        Buffer.from('{}'),
      );

      expect(prisma.pagamento.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CONFIRMADO' }) }),
      );
      expect(orderService.updateStatus).toHaveBeenCalledWith('ped-1', 'PAGO', 'SYSTEM');
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

  describe('simularConfirmacao', () => {
    const makePagamentoMock = (overrides: Record<string, any> = {}) => ({
      id: 'pag_sim',
      pedidoId: 'ped_sim',
      status: 'PENDENTE',
      gatewayTransacaoId: 'mock_abc123_999',
      pedido: { id: 'ped_sim', clienteId: 'cli_1', valorTotal: 36 },
      ...overrides,
    });

    it('confirma pagamento mock do próprio cliente e transita para PAGO', async () => {
      prisma.pagamento.findUnique.mockResolvedValue(makePagamentoMock());
      prisma.pagamento.update.mockResolvedValue({});
      orderService.updateStatus.mockResolvedValue({});

      const result = await service.simularConfirmacao('ped_sim', 'cli_1', 'CLIENTE');

      expect(result).toEqual({ ok: true, status: 'PAGO' });
      expect(prisma.pagamento.update).toHaveBeenCalledWith({
        where: { id: 'pag_sim' },
        data: expect.objectContaining({ status: 'CONFIRMADO', valorPago: 36 }),
      });
      expect(orderService.updateStatus).toHaveBeenCalledWith('ped_sim', 'PAGO', 'SYSTEM');
    });

    it('nega simulação de pedido alheio (cliente não-dono, não-staff)', async () => {
      prisma.pagamento.findUnique.mockResolvedValue(makePagamentoMock());

      await expect(
        service.simularConfirmacao('ped_sim', 'outro-cliente', 'CLIENTE'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.pagamento.update).not.toHaveBeenCalled();
    });

    it('permite staff simular pedido de terceiro', async () => {
      prisma.pagamento.findUnique.mockResolvedValue(makePagamentoMock());
      prisma.pagamento.update.mockResolvedValue({});
      orderService.updateStatus.mockResolvedValue({});

      await expect(
        service.simularConfirmacao('ped_sim', 'admin-id', 'ADMINISTRADOR'),
      ).resolves.toEqual({ ok: true, status: 'PAGO' });
    });

    it('rejeita transação não-mock quando não há chave Abacate configurada', async () => {
      prisma.pagamento.findUnique.mockResolvedValue(
        makePagamentoMock({ gatewayTransacaoId: 'pix_char_real_123' }),
      );
      gateway.simulatePayment.mockResolvedValue(null);

      await expect(
        service.simularConfirmacao('ped_sim', 'cli_1', 'CLIENTE'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pagamento.update).not.toHaveBeenCalled();
      expect(orderService.updateStatus).not.toHaveBeenCalled();
    });

    it('usa a simulação oficial da Abacate (dev mode) para transação real', async () => {
      prisma.pagamento.findUnique.mockResolvedValue(
        makePagamentoMock({ gatewayTransacaoId: 'pix_char_dev_456' }),
      );
      gateway.simulatePayment.mockResolvedValue({ status: 'PAID', amount: 3600 });
      prisma.pagamento.update.mockResolvedValue({});
      orderService.updateStatus.mockResolvedValue({});

      const result = await service.simularConfirmacao('ped_sim', 'cli_1', 'CLIENTE');

      expect(gateway.simulatePayment).toHaveBeenCalledWith('pix_char_dev_456');
      expect(result).toEqual({ ok: true, status: 'PAGO' });
      expect(prisma.pagamento.update).toHaveBeenCalledWith({
        where: { id: 'pag_sim' },
        data: expect.objectContaining({ status: 'CONFIRMADO', valorPago: 36 }),
      });
      expect(orderService.updateStatus).toHaveBeenCalledWith('ped_sim', 'PAGO', 'SYSTEM');
    });

    it('não confirma quando a Abacate retorna status diferente de PAID', async () => {
      prisma.pagamento.findUnique.mockResolvedValue(
        makePagamentoMock({ gatewayTransacaoId: 'pix_char_dev_789' }),
      );
      gateway.simulatePayment.mockResolvedValue({ status: 'PENDING' });

      await expect(
        service.simularConfirmacao('ped_sim', 'cli_1', 'CLIENTE'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.pagamento.update).not.toHaveBeenCalled();
    });

    it('404 quando pagamento não existe', async () => {
      prisma.pagamento.findUnique.mockResolvedValue(null);

      await expect(
        service.simularConfirmacao('inexistente', 'cli_1', 'CLIENTE'),
      ).rejects.toThrow(NotFoundException);
    });

    it('é idempotente quando já CONFIRMADO', async () => {
      prisma.pagamento.findUnique.mockResolvedValue(
        makePagamentoMock({ status: 'CONFIRMADO' }),
      );

      await expect(
        service.simularConfirmacao('ped_sim', 'cli_1', 'CLIENTE'),
      ).resolves.toEqual({ ok: true, status: 'PAGO' });
      expect(prisma.pagamento.update).not.toHaveBeenCalled();
    });
  });
});
