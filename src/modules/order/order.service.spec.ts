import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Prisma } from '@prisma/client';
import { OrderService } from './order.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CapacityService } from '../capacity/capacity.service';
import { NotificationService } from '../notification/notification.service';
import { AuditService } from '../audit/audit.service';
import { CupomService } from '../cupom/cupom.service';
import { PaymentGatewayService } from '../payment/payment-gateway.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeProduto = (overrides: Partial<any> = {}) => ({
  id: 'prod-1',
  status: 'ATIVO',
  ativo: true,
  precoVenda: new Prisma.Decimal(50),
  pontosEsforco: 5,
  leadTimeHoras: 24,
  fichasTecnicas: [],
  ...overrides,
});

const makePedido = (overrides: Partial<any> = {}) => ({
  id: 'pedido-1',
  clienteId: 'cliente-1',
  status: 'AGUARDANDO_PAGAMENTO',
  valorSubtotal: 100,
  valorDesconto: 0,
  valorTotal: 100,
  valorFrete: 0,
  createdAt: new Date(),
  itens: [],
  pagamento: { id: 'pag-1', status: 'PENDENTE' },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('OrderService', () => {
  let service: OrderService;
  let prisma: Record<string, any>;
  let capacityService: Record<string, any>;
  let notificationService: Record<string, any>;
  let auditService: Record<string, any>;
  let cupomService: Record<string, any>;
  let gatewayService: Record<string, any>;
  let ordersQueue: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      produto: { findMany: jest.fn() },
      pedido: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      pagamento: { update: jest.fn() },
      cupom: { update: jest.fn() },
      usuario: { findUnique: jest.fn() },
      insumo: { findMany: jest.fn(), update: jest.fn() },
      movimentacaoEstoque: { create: jest.fn() },
      $transaction: jest.fn((cb: any) => {
        if (typeof cb === 'function') return cb(prisma);
        // Support array-style $transaction
        return Promise.all(cb);
      }),
    };

    capacityService = {
      reservarSlot: jest.fn().mockResolvedValue({}),
      liberarSlot: jest.fn().mockResolvedValue(undefined),
    };

    notificationService = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    cupomService = {
      validate: jest.fn(),
    };

    gatewayService = {
      createPixCharge: jest.fn().mockResolvedValue({
        transacaoId: 'tx-1',
        pixCopiaCola: 'pix123',
        pixQrCodeUrl: 'https://qr.test/1',
        expiresAt: new Date(),
        raw: {},
      }),
    };

    ordersQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: prisma },
        { provide: CapacityService, useValue: capacityService },
        { provide: NotificationService, useValue: notificationService },
        { provide: AuditService, useValue: auditService },
        { provide: CupomService, useValue: cupomService },
        { provide: PaymentGatewayService, useValue: gatewayService },
        { provide: getQueueToken('orders'), useValue: ordersQueue },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    const baseData = {
      itens: [{ produtoId: 'prod-1', quantidade: 2 }],
      modalidadeEntrega: 'RETIRADA',
      slotId: 'slot-1',
    };

    it('should create an order with itens, slot reservation and queue job', async () => {
      const produto = makeProduto();
      const createdPedido = makePedido({
        itens: [{ produtoId: 'prod-1', quantidade: 2 }],
      });
      const finalPedido = { ...createdPedido, pagamento: { pixCopiaCola: 'pix123' } };

      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(createdPedido);
      prisma.usuario.findUnique.mockResolvedValue({ id: 'cliente-1', nome: 'Vann', email: 'vann@test.com' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(finalPedido);

      const result = await service.create('cliente-1', baseData);

      // Product lookup
      expect(prisma.produto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['prod-1'] }, status: 'ATIVO', ativo: true },
        }),
      );

      // Pedido created inside transaction
      expect(prisma.pedido.create).toHaveBeenCalled();

      // Capacity reserved (pontosEsforco=5, qty=2 => 10 pontos)
      expect(capacityService.reservarSlot).toHaveBeenCalledWith(
        createdPedido.id,
        'slot-1',
        10,
        prisma, // the tx mock
      );

      // Payment timeout job queued
      expect(ordersQueue.add).toHaveBeenCalledWith(
        'payment-timeout',
        { pedidoId: createdPedido.id },
        { delay: 30 * 60 * 1000 },
      );

      // Audit logged
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'ORDER.CREATED' }),
      );

      expect(result).toEqual(finalPedido);
    });

    it('should throw BadRequestException when a product is not available', async () => {
      prisma.produto.findMany.mockResolvedValue([]); // no products found

      await expect(service.create('cliente-1', baseData)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create('cliente-1', baseData)).rejects.toThrow(
        'Um ou mais produtos não estão disponíveis',
      );
    });

    it('should apply coupon discount correctly', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(100) });
      const createdPedido = makePedido({ valorTotal: 80 });

      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(createdPedido);
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'Vann', email: 'v@t.com' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(createdPedido);

      cupomService.validate.mockResolvedValue({
        desconto: 20,
        cupom: { id: 'cupom-1' },
      });

      await service.create('cliente-1', {
        ...baseData,
        cupomCodigo: 'VANN20',
      });

      // Cupom validated with correct subtotal (100 * 2 = 200)
      expect(cupomService.validate).toHaveBeenCalledWith('VANN20', 200);

      // Pedido created with discount values
      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(createCall.data.valorDesconto).toBe(20);
      expect(createCall.data.cupomId).toBe('cupom-1');
      expect(createCall.data.valorTotal).toBe(180); // 200 - 20

      // Cupom uso incremented
      expect(prisma.cupom.update).toHaveBeenCalledWith({
        where: { id: 'cupom-1' },
        data: { usoAtual: { increment: 1 } },
      });
    });

    it('should not call reservarSlot when slotId is not provided', async () => {
      const produto = makeProduto();
      const createdPedido = makePedido();

      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(createdPedido);
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'Vann', email: 'v@t.com' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(createdPedido);

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 2 }],
        modalidadeEntrega: 'DELIVERY',
      });

      expect(capacityService.reservarSlot).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // updateStatus
  // -------------------------------------------------------------------------
  describe('updateStatus', () => {
    it('should transition PAGO -> EM_PRODUCAO', async () => {
      const pedido = makePedido({
        status: 'PAGO',
        itens: [
          {
            produtoId: 'prod-1',
            quantidade: 1,
            produto: { fichasTecnicas: [] },
          },
        ],
        cliente: { nome: 'Test' },
      });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'EM_PRODUCAO' });

      const result = await service.updateStatus('pedido-1', 'EM_PRODUCAO', 'admin-1');

      expect(prisma.pedido.update).toHaveBeenCalledWith({
        where: { id: 'pedido-1' },
        data: { status: 'EM_PRODUCAO' },
      });
      expect(result.status).toBe('EM_PRODUCAO');
    });

    it('should transition EM_PRODUCAO -> PRONTO', async () => {
      const pedido = makePedido({ status: 'EM_PRODUCAO', cliente: {} });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'PRONTO' });

      const result = await service.updateStatus('pedido-1', 'PRONTO', 'admin-1');
      expect(result.status).toBe('PRONTO');
    });

    it('should transition PRONTO -> ENTREGUE and enqueue invoice + review', async () => {
      const pedido = makePedido({ status: 'PRONTO', cliente: {} });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'ENTREGUE' });

      await service.updateStatus('pedido-1', 'ENTREGUE', 'admin-1');

      const addCalls = ordersQueue.add.mock.calls.map((c: any) => c[0]);
      expect(addCalls).toContain('emit-invoice');
      expect(addCalls).toContain('request-review');
    });

    it('should call capacity.liberarSlot when cancelling', async () => {
      const pedido = makePedido({ status: 'PAGO', cliente: {} });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      await service.updateStatus('pedido-1', 'CANCELADO', 'admin-1', 'Teste');

      expect(capacityService.liberarSlot).toHaveBeenCalledWith('pedido-1');
    });

    it('should reject invalid transition (ENTREGUE -> EM_PRODUCAO)', async () => {
      const pedido = makePedido({ status: 'ENTREGUE', cliente: {} });
      prisma.pedido.findUnique.mockResolvedValue(pedido);

      await expect(
        service.updateStatus('pedido-1', 'EM_PRODUCAO', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateStatus('pedido-1', 'EM_PRODUCAO', 'admin-1'),
      ).rejects.toThrow('Transição inválida');
    });

    it('should reject invalid transition (CANCELADO -> PAGO)', async () => {
      const pedido = makePedido({ status: 'CANCELADO', cliente: {} });
      prisma.pedido.findUnique.mockResolvedValue(pedido);

      await expect(
        service.updateStatus('pedido-1', 'PAGO', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when pedido does not exist', async () => {
      prisma.pedido.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('missing', 'PAGO', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // cancelByCliente
  // -------------------------------------------------------------------------
  describe('cancelByCliente', () => {
    it('should cancel AGUARDANDO_PAGAMENTO order', async () => {
      const pedido = makePedido({
        status: 'AGUARDANDO_PAGAMENTO',
        clienteId: 'c1',
        cliente: {},
      });
      // First call: cancelByCliente's own findUnique
      // Second call: updateStatus's findUnique (with includes)
      prisma.pedido.findUnique
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      const result = await service.cancelByCliente('pedido-1', 'c1', 'Não quero mais');

      expect(result.status).toBe('CANCELADO');
    });

    it('should cancel PAGO order within 30 min window', async () => {
      const pedido = makePedido({
        status: 'PAGO',
        clienteId: 'c1',
        createdAt: new Date(), // just now => within 30 min
        cliente: {},
      });
      prisma.pedido.findUnique
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      const result = await service.cancelByCliente('pedido-1', 'c1', 'Mudei de ideia');
      expect(result.status).toBe('CANCELADO');
    });

    it('should throw ForbiddenException when cancellation window expired', async () => {
      const pedido = makePedido({
        status: 'PAGO',
        clienteId: 'c1',
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      });
      prisma.pedido.findUnique.mockResolvedValue(pedido);

      await expect(
        service.cancelByCliente('pedido-1', 'c1', 'Tarde demais'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when pedido belongs to another client', async () => {
      const pedido = makePedido({ clienteId: 'other-client' });
      prisma.pedido.findUnique.mockResolvedValue(pedido);

      await expect(
        service.cancelByCliente('pedido-1', 'c1', 'Hack attempt'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when pedido does not exist', async () => {
      prisma.pedido.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelByCliente('missing', 'c1', 'Motivo'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findByCliente
  // -------------------------------------------------------------------------
  describe('findByCliente', () => {
    it('should return orders for the given client', async () => {
      const pedidos = [
        makePedido({ id: 'p1', clienteId: 'c1' }),
        makePedido({ id: 'p2', clienteId: 'c1' }),
      ];
      prisma.pedido.findMany.mockResolvedValue(pedidos);

      const result = await service.findByCliente('c1');

      expect(prisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clienteId: 'c1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('should return empty array when client has no orders', async () => {
      prisma.pedido.findMany.mockResolvedValue([]);

      const result = await service.findByCliente('c-no-orders');
      expect(result).toEqual([]);
    });
  });
});
