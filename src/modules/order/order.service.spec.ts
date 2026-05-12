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
import { EntregaService } from '../entrega/entrega.service';
import { CreditoService } from '../credito/credito.service';
import { IndicacaoService } from '../indicacao/indicacao.service';
import { EmpresaService } from '../empresa/empresa.service';

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
  modalidadesPermitidas: [
    'RETIRADA_BALCAO',
    'MOTOBOY_LOCAL',
    'UBER_DIRECT',
    'NOVENTA_NOVE_ENTREGAS',
  ],
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
  let entregaService: Record<string, any>;
  let creditoService: Record<string, any>;
  let indicacaoService: Record<string, any>;
  let empresaService: Record<string, any>;
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
      fotoEntrega: { create: jest.fn() },
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

    entregaService = {
      getByModalidade: jest.fn().mockResolvedValue(null),
      computeFrete: jest.fn().mockResolvedValue(0),
    };

    creditoService = {
      saldoTotal: jest.fn().mockResolvedValue(0),
      consumir: jest.fn().mockResolvedValue(undefined),
      gerar: jest.fn().mockResolvedValue(undefined),
    };

    indicacaoService = {
      processarConversao: jest.fn().mockResolvedValue(undefined),
    };

    empresaService = {
      getDescontoAtivo: jest.fn().mockResolvedValue(null),
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
        { provide: EntregaService, useValue: entregaService },
        { provide: CreditoService, useValue: creditoService },
        { provide: IndicacaoService, useValue: indicacaoService },
        { provide: EmpresaService, useValue: empresaService },
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
      modalidadeEntrega: 'RETIRADA_BALCAO',
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

    it('rejects creation when modalidade is not in product modalidadesPermitidas', async () => {
      const produto = makeProduto({
        modalidadesPermitidas: ['RETIRADA_BALCAO', 'MOTOBOY_LOCAL'],
      });
      prisma.produto.findMany.mockResolvedValue([produto]);

      await expect(
        service.create('cliente-1', {
          itens: [{ produtoId: 'prod-1', quantidade: 1 }],
          modalidadeEntrega: 'UBER_DIRECT',
        }),
      ).rejects.toThrow(/modalidade.*não permitida/i);

      expect(prisma.pedido.create).not.toHaveBeenCalled();
    });

    it('rejects creation when modalidade is allowed for some items but not all', async () => {
      const bolo = makeProduto({
        id: 'p-bolo',
        modalidadesPermitidas: ['RETIRADA_BALCAO', 'MOTOBOY_LOCAL'],
      });
      const docinho = makeProduto({
        id: 'p-doce',
        modalidadesPermitidas: [
          'RETIRADA_BALCAO',
          'MOTOBOY_LOCAL',
          'UBER_DIRECT',
          'NOVENTA_NOVE_ENTREGAS',
        ],
      });
      prisma.produto.findMany.mockResolvedValue([bolo, docinho]);

      await expect(
        service.create('cliente-1', {
          itens: [
            { produtoId: 'p-bolo', quantidade: 1 },
            { produtoId: 'p-doce', quantidade: 5 },
          ],
          modalidadeEntrega: 'UBER_DIRECT',
        }),
      ).rejects.toThrow();
    });

    it('accepts creation when modalidade is in the intersection of all items', async () => {
      const bolo = makeProduto({
        id: 'p-bolo',
        modalidadesPermitidas: ['RETIRADA_BALCAO', 'MOTOBOY_LOCAL'],
      });
      const docinho = makeProduto({
        id: 'p-doce',
        modalidadesPermitidas: ['RETIRADA_BALCAO', 'MOTOBOY_LOCAL', 'UBER_DIRECT'],
      });
      prisma.produto.findMany.mockResolvedValue([bolo, docinho]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());

      await expect(
        service.create('cliente-1', {
          itens: [
            { produtoId: 'p-bolo', quantidade: 1 },
            { produtoId: 'p-doce', quantidade: 5 },
          ],
          modalidadeEntrega: 'MOTOBOY_LOCAL',
        }),
      ).resolves.toBeTruthy();
    });

    it('rejects creation when dataAgendamento is sooner than computed lead time', async () => {
      const produto = makeProduto({
        leadTimeHoras: 48,
        opcoesMontagem: [
          { etapa: 'topo', label: 'Biscuit', leadTimeHorasExtra: 72, ativa: true },
        ],
      });
      prisma.produto.findMany.mockResolvedValue([produto]);

      // só 24h no futuro, lead time exige 48 + 72 = 120h
      const dataAgendamento = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await expect(
        service.create('cliente-1', {
          itens: [{ produtoId: 'prod-1', quantidade: 1, opcoesEscolhidas: { topo: 'Biscuit' } }],
          modalidadeEntrega: 'RETIRADA_BALCAO',
          dataAgendamento,
        }),
      ).rejects.toThrow(/prazo m[ií]nimo|antecedência/i);

      expect(prisma.pedido.create).not.toHaveBeenCalled();
    });

    it('accepts creation when dataAgendamento is at or after computed lead time', async () => {
      const produto = makeProduto({
        leadTimeHoras: 48,
        opcoesMontagem: [
          { etapa: 'topo', label: 'Biscuit', leadTimeHorasExtra: 72, ativa: true },
        ],
      });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());

      // 6 dias no futuro > 5 dias (120h) necessários
      const dataAgendamento = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

      await expect(
        service.create('cliente-1', {
          itens: [{ produtoId: 'prod-1', quantidade: 1, opcoesEscolhidas: { topo: 'Biscuit' } }],
          modalidadeEntrega: 'RETIRADA_BALCAO',
          dataAgendamento,
        }),
      ).resolves.toBeTruthy();
    });

    it('derives dataAgendamento from horaFestaPrevista - bufferHorasAntes when provided', async () => {
      const produto = makeProduto({ leadTimeHoras: 24 });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());

      // Festa 6 dias no futuro às 16h, buffer 2h
      const festa = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
      festa.setHours(16, 0, 0, 0);

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 1 }],
        modalidadeEntrega: 'MOTOBOY_LOCAL',
        horaFestaPrevista: festa.toISOString(),
        bufferHorasAntes: 2,
      } as any);

      const createCall = prisma.pedido.create.mock.calls[0][0];
      const despachoEsperado = new Date(festa.getTime() - 2 * 60 * 60 * 1000);
      expect(new Date(createCall.data.dataAgendamento).getTime()).toBe(despachoEsperado.getTime());
      expect(new Date(createCall.data.horaFestaPrevista).getTime()).toBe(festa.getTime());
      expect(createCall.data.bufferHorasAntes).toBe(2);
    });

    it('rejects MOTOBOY_LOCAL with buffer < 2h', async () => {
      const produto = makeProduto({ leadTimeHoras: 24 });
      prisma.produto.findMany.mockResolvedValue([produto]);

      const festa = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

      await expect(
        service.create('cliente-1', {
          itens: [{ produtoId: 'prod-1', quantidade: 1 }],
          modalidadeEntrega: 'MOTOBOY_LOCAL',
          horaFestaPrevista: festa,
          bufferHorasAntes: 1,
        } as any),
      ).rejects.toThrow(/buffer/i);

      expect(prisma.pedido.create).not.toHaveBeenCalled();
    });

    it('accepts UBER_DIRECT with buffer = 1h (minimum allowed)', async () => {
      const produto = makeProduto({ leadTimeHoras: 24 });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());

      const festa = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

      await expect(
        service.create('cliente-1', {
          itens: [{ produtoId: 'prod-1', quantidade: 1 }],
          modalidadeEntrega: 'UBER_DIRECT',
          horaFestaPrevista: festa,
          bufferHorasAntes: 1,
        } as any),
      ).resolves.toBeTruthy();
    });

    it('accepts RETIRADA_BALCAO with buffer = 0', async () => {
      const produto = makeProduto({ leadTimeHoras: 24 });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());

      const festa = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();

      await expect(
        service.create('cliente-1', {
          itens: [{ produtoId: 'prod-1', quantidade: 1 }],
          modalidadeEntrega: 'RETIRADA_BALCAO',
          horaFestaPrevista: festa,
          bufferHorasAntes: 0,
        } as any),
      ).resolves.toBeTruthy();
    });

    it('falls back to provided dataAgendamento when horaFestaPrevista is absent', async () => {
      const produto = makeProduto({ leadTimeHoras: 24 });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());

      const data = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 1 }],
        modalidadeEntrega: 'RETIRADA_BALCAO',
        dataAgendamento: data,
      });

      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(new Date(createCall.data.dataAgendamento).getTime()).toBe(new Date(data).getTime());
      expect(createCall.data.horaFestaPrevista).toBeNull();
    });

    it('rejects creation when subtotal is below the modalidade minimum', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(30) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      entregaService.getByModalidade.mockResolvedValue({
        modalidade: 'UBER_DIRECT',
        valorMinimoPedido: new Prisma.Decimal(80),
        valorFreteBase: new Prisma.Decimal(22),
        valorFreteGratisAcimaDe: null,
      });

      // 30 * 2 = 60 < 80
      await expect(
        service.create('cliente-1', {
          itens: [{ produtoId: 'prod-1', quantidade: 2 }],
          modalidadeEntrega: 'UBER_DIRECT',
        }),
      ).rejects.toThrow(/m[ií]nimo/i);

      expect(prisma.pedido.create).not.toHaveBeenCalled();
    });

    it('persists valorFrete from EntregaService.computeFrete', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(50) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      entregaService.getByModalidade.mockResolvedValue({
        modalidade: 'MOTOBOY_LOCAL',
        valorMinimoPedido: new Prisma.Decimal(0),
        valorFreteBase: new Prisma.Decimal(15),
        valorFreteGratisAcimaDe: new Prisma.Decimal(200),
      });
      entregaService.computeFrete.mockResolvedValue(15);

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 2 }],
        modalidadeEntrega: 'MOTOBOY_LOCAL',
      });

      expect(entregaService.computeFrete).toHaveBeenCalledWith('MOTOBOY_LOCAL', 100);
      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(Number(createCall.data.valorFrete)).toBe(15);
      expect(Number(createCall.data.valorTotal)).toBe(115); // 100 subtotal + 15 frete
    });

    it('zeroes valorFrete when computeFrete returns 0 (free shipping reached)', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(100) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      entregaService.getByModalidade.mockResolvedValue({
        modalidade: 'MOTOBOY_LOCAL',
        valorMinimoPedido: new Prisma.Decimal(0),
        valorFreteBase: new Prisma.Decimal(15),
        valorFreteGratisAcimaDe: new Prisma.Decimal(200),
      });
      entregaService.computeFrete.mockResolvedValue(0);

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 3 }],
        modalidadeEntrega: 'MOTOBOY_LOCAL',
      });

      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(Number(createCall.data.valorFrete)).toBe(0);
      expect(Number(createCall.data.valorTotal)).toBe(300);
    });

    it('applies credito do cliente when usarCredito is true', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(100) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      creditoService.saldoTotal.mockResolvedValue(80);

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 2 }],
        modalidadeEntrega: 'RETIRADA_BALCAO',
        usarCredito: true,
      } as any);

      const createCall = prisma.pedido.create.mock.calls[0][0];
      // subtotal 200, credito 80, total = 200 - 80 = 120
      expect(Number(createCall.data.valorCreditoUsado)).toBe(80);
      expect(Number(createCall.data.valorTotal)).toBe(120);
      expect(creditoService.consumir).toHaveBeenCalledWith('cliente-1', 80, expect.anything());
    });

    it('caps credito usage to keep valorTotal non-negative', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(40) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      creditoService.saldoTotal.mockResolvedValue(500); // saldo grande

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 1 }],
        modalidadeEntrega: 'RETIRADA_BALCAO',
        usarCredito: true,
      } as any);

      const createCall = prisma.pedido.create.mock.calls[0][0];
      // subtotal 40, credito 40 (não pode passar de 40), total = 0
      expect(Number(createCall.data.valorCreditoUsado)).toBe(40);
      expect(Number(createCall.data.valorTotal)).toBe(0);
      expect(creditoService.consumir).toHaveBeenCalledWith('cliente-1', 40, expect.anything());
    });

    it('does not consume credito when usarCredito is false', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(50) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      creditoService.saldoTotal.mockResolvedValue(80);

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 1 }],
        modalidadeEntrega: 'RETIRADA_BALCAO',
      });

      expect(creditoService.consumir).not.toHaveBeenCalled();
      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(Number(createCall.data.valorCreditoUsado)).toBe(0);
    });

    it('applies desconto da empresa e persiste empresaId quando cliente eh PJ aprovado', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(100) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      empresaService.getDescontoAtivo.mockResolvedValue({ empresaId: 'emp-1', descontoPct: 10 });

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 2 }],
        modalidadeEntrega: 'RETIRADA_BALCAO',
      });

      const createCall = prisma.pedido.create.mock.calls[0][0];
      // subtotal 200, desconto 10% = 20, total = 200 - 20 = 180
      expect(Number(createCall.data.valorDesconto)).toBe(20);
      expect(Number(createCall.data.valorTotal)).toBe(180);
      expect(createCall.data.empresaId).toBe('emp-1');
    });

    it('soma desconto da empresa ao desconto do cupom', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(200) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());
      prisma.usuario.findUnique.mockResolvedValue({ id: 'c1', nome: 'V', email: 'v@t' });
      prisma.pagamento.update.mockResolvedValue({});
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      cupomService.validate.mockResolvedValue({
        desconto: 30,
        cupom: { id: 'cup-x' },
      });
      empresaService.getDescontoAtivo.mockResolvedValue({ empresaId: 'emp-1', descontoPct: 5 });

      await service.create('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 1 }],
        modalidadeEntrega: 'RETIRADA_BALCAO',
        cupomCodigo: 'ABC',
      });

      const createCall = prisma.pedido.create.mock.calls[0][0];
      // cupom 30 + empresa 200 * 5% = 10 = 40 total desconto; total = 200 - 40 = 160
      expect(Number(createCall.data.valorDesconto)).toBe(40);
      expect(Number(createCall.data.valorTotal)).toBe(160);
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
        modalidadeEntrega: 'MOTOBOY_LOCAL',
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

    it('should cancel PAGO order with 100% refund when despacho > janelaReembolsoHoras', async () => {
      const dataAgendamento = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h
      const pedido = makePedido({
        status: 'PAGO',
        clienteId: 'c1',
        valorTotal: 100,
        dataAgendamento,
        janelaReembolsoHoras: 48,
        cliente: {},
      });
      prisma.pedido.findUnique
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      await service.cancelByCliente('pedido-1', 'c1', 'Mudei de ideia');

      // updateStatus.update foi chamado uma vez (transição), reembolso atualizado em outra chamada
      const updateCalls = prisma.pedido.update.mock.calls;
      const reembolsoCall = updateCalls.find(
        (c: any[]) => c[0].data?.valorReembolso !== undefined,
      );
      expect(reembolsoCall).toBeDefined();
      expect(Number(reembolsoCall[0].data.valorReembolso)).toBe(100);
      expect(reembolsoCall[0].data.valorCreditoFuturo == null ||
        Number(reembolsoCall[0].data.valorCreditoFuturo) === 0).toBe(true);
    });

    it('should split 50% refund + 50% credito futuro when despacho is in middle tier', async () => {
      const dataAgendamento = new Date(Date.now() + 36 * 60 * 60 * 1000); // 36h
      const pedido = makePedido({
        status: 'PAGO',
        clienteId: 'c1',
        valorTotal: 200,
        dataAgendamento,
        janelaReembolsoHoras: 48,
        cliente: {},
      });
      prisma.pedido.findUnique
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      await service.cancelByCliente('pedido-1', 'c1', 'Festa adiada');

      const updateCalls = prisma.pedido.update.mock.calls;
      const reembolsoCall = updateCalls.find(
        (c: any[]) => c[0].data?.valorReembolso !== undefined,
      );
      expect(reembolsoCall).toBeDefined();
      expect(Number(reembolsoCall[0].data.valorReembolso)).toBe(100);
      expect(Number(reembolsoCall[0].data.valorCreditoFuturo)).toBe(100);
    });

    it('should cancel with 0% refund when despacho is closer than half janelaReembolsoHoras', async () => {
      const dataAgendamento = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h
      const pedido = makePedido({
        status: 'PAGO',
        clienteId: 'c1',
        valorTotal: 150,
        dataAgendamento,
        janelaReembolsoHoras: 48,
        cliente: {},
      });
      prisma.pedido.findUnique
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      await service.cancelByCliente('pedido-1', 'c1', 'Em cima da hora');

      const updateCalls = prisma.pedido.update.mock.calls;
      const reembolsoCall = updateCalls.find(
        (c: any[]) => c[0].data?.valorReembolso !== undefined,
      );
      expect(reembolsoCall).toBeDefined();
      expect(Number(reembolsoCall[0].data.valorReembolso)).toBe(0);
      expect(reembolsoCall[0].data.valorCreditoFuturo == null ||
        Number(reembolsoCall[0].data.valorCreditoFuturo) === 0).toBe(true);
    });

    it('honors a custom janelaReembolsoHoras on the pedido', async () => {
      // janela 24h: meio é 12h. Despacho a 18h => 100%
      const dataAgendamento = new Date(Date.now() + 30 * 60 * 60 * 1000); // 30h
      const pedido = makePedido({
        status: 'PAGO',
        clienteId: 'c1',
        valorTotal: 100,
        dataAgendamento,
        janelaReembolsoHoras: 24,
        cliente: {},
      });
      prisma.pedido.findUnique
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      await service.cancelByCliente('pedido-1', 'c1', '?');

      const reembolsoCall = prisma.pedido.update.mock.calls.find(
        (c: any[]) => c[0].data?.valorReembolso !== undefined,
      );
      expect(Number(reembolsoCall[0].data.valorReembolso)).toBe(100);
    });

    it('generates a CreditoCliente when middle tier cancellation produces valorCreditoFuturo > 0', async () => {
      const dataAgendamento = new Date(Date.now() + 36 * 60 * 60 * 1000); // 36h
      const pedido = makePedido({
        status: 'PAGO',
        clienteId: 'c1',
        valorTotal: 200,
        dataAgendamento,
        janelaReembolsoHoras: 48,
        cliente: {},
      });
      prisma.pedido.findUnique
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      await service.cancelByCliente('pedido-1', 'c1', 'Festa adiada');

      expect(creditoService.gerar).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: 'c1',
          valor: 100,
          motivo: expect.stringMatching(/cancelamento/i),
          pedidoOrigemId: 'pedido-1',
          expiraEm: null,
        }),
      );
    });

    it('does not generate CreditoCliente when full refund', async () => {
      const dataAgendamento = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const pedido = makePedido({
        status: 'PAGO',
        clienteId: 'c1',
        valorTotal: 100,
        dataAgendamento,
        janelaReembolsoHoras: 48,
        cliente: {},
      });
      prisma.pedido.findUnique
        .mockResolvedValueOnce(pedido)
        .mockResolvedValueOnce(pedido);
      prisma.pedido.update.mockResolvedValue({ ...pedido, status: 'CANCELADO' });

      await service.cancelByCliente('pedido-1', 'c1', '?');

      expect(creditoService.gerar).not.toHaveBeenCalled();
    });

    it('rejects cancellation when status is EM_PRODUCAO or later', async () => {
      const pedido = makePedido({
        status: 'EM_PRODUCAO',
        clienteId: 'c1',
        valorTotal: 100,
        dataAgendamento: new Date(Date.now() + 72 * 60 * 60 * 1000),
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

  // -------------------------------------------------------------------------
  // createRascunhoWhatsApp
  // -------------------------------------------------------------------------
  describe('createRascunhoWhatsApp', () => {
    const baseData = {
      itens: [{ produtoId: 'prod-1', quantidade: 2 }],
    };

    it('creates a pedido with status RASCUNHO_WHATSAPP and origem WHATSAPP', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(50) });
      const draft = makePedido({
        id: 'draft-1',
        status: 'RASCUNHO_WHATSAPP',
        valorTotal: 100,
      });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(draft);

      await service.createRascunhoWhatsApp('cliente-1', baseData);

      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(createCall.data.status).toBe('RASCUNHO_WHATSAPP');
      expect(createCall.data.origem).toBe('WHATSAPP');
      expect(createCall.data.clienteId).toBe('cliente-1');
    });

    it('computes valorSubtotal and valorTotal from itens, ignoring frete and desconto', async () => {
      const produto = makeProduto({ precoVenda: new Prisma.Decimal(50) });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());

      await service.createRascunhoWhatsApp('cliente-1', {
        itens: [{ produtoId: 'prod-1', quantidade: 3 }],
      });

      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(createCall.data.valorSubtotal).toBe(150);
      expect(createCall.data.valorTotal).toBe(150);
      expect(createCall.data.valorDesconto).toBe(0);
      expect(createCall.data.valorFrete).toBe(0);
    });

    it('does NOT create a Pagamento (rascunho is not chargeable)', async () => {
      const produto = makeProduto();
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());

      await service.createRascunhoWhatsApp('cliente-1', baseData);

      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(createCall.data.pagamento).toBeUndefined();
    });

    it('does NOT reserve a slot, does NOT enqueue payment-timeout, does NOT call gateway', async () => {
      const produto = makeProduto();
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());

      await service.createRascunhoWhatsApp('cliente-1', baseData);

      expect(capacityService.reservarSlot).not.toHaveBeenCalled();
      expect(ordersQueue.add).not.toHaveBeenCalled();
      expect(gatewayService.createPixCharge).not.toHaveBeenCalled();
    });

    it('defaults modalidadeEntrega to RETIRADA_BALCAO when not provided', async () => {
      const produto = makeProduto();
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());

      await service.createRascunhoWhatsApp('cliente-1', baseData);

      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(createCall.data.modalidadeEntrega).toBe('RETIRADA_BALCAO');
    });

    it('persists numeroPessoas, ocasiao and observacoes when provided', async () => {
      const produto = makeProduto();
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(makePedido());

      await service.createRascunhoWhatsApp('cliente-1', {
        ...baseData,
        numeroPessoas: 20,
        ocasiao: 'infantil',
        observacoes: 'sem nozes',
      });

      const createCall = prisma.pedido.create.mock.calls[0][0];
      expect(createCall.data.numeroPessoas).toBe(20);
      expect(createCall.data.ocasiao).toBe('infantil');
      expect(createCall.data.observacoes).toBe('sem nozes');
    });

    it('throws BadRequestException when any produto is unavailable', async () => {
      prisma.produto.findMany.mockResolvedValue([]);

      await expect(
        service.createRascunhoWhatsApp('cliente-1', baseData),
      ).rejects.toThrow(BadRequestException);
    });

    it('logs audit with WHATSAPP_DRAFT_CREATED action', async () => {
      const produto = makeProduto();
      const draft = makePedido({ id: 'draft-x', status: 'RASCUNHO_WHATSAPP' });
      prisma.produto.findMany.mockResolvedValue([produto]);
      prisma.pedido.create.mockResolvedValue(draft);

      await service.createRascunhoWhatsApp('cliente-1', baseData);

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'ORDER.WHATSAPP_DRAFT_CREATED',
          entidade: 'Pedido',
          entidadeId: 'draft-x',
          usuarioId: 'cliente-1',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // adicionarFotoPronto
  // -------------------------------------------------------------------------
  describe('adicionarFotoPronto', () => {
    const makeFoto = (overrides: Partial<any> = {}) => ({
      id: 'foto-1',
      pedidoId: 'pedido-1',
      url: 'https://example.com/bolo.jpg',
      legenda: null,
      enviadaEm: new Date(),
      ...overrides,
    });

    it('throws NotFoundException when pedido does not exist', async () => {
      prisma.pedido.findUnique.mockResolvedValue(null);

      await expect(
        service.adicionarFotoPronto('pedido-x', 'https://img.com/a.jpg', undefined, 'op-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when pedido status is not PRONTO', async () => {
      prisma.pedido.findUnique.mockResolvedValue(
        makePedido({ status: 'EM_PRODUCAO', cliente: { nome: 'Vann', telefone: '11999' } }),
      );

      await expect(
        service.adicionarFotoPronto('pedido-1', 'https://img.com/a.jpg', undefined, 'op-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when url is empty', async () => {
      prisma.pedido.findUnique.mockResolvedValue(
        makePedido({ status: 'PRONTO', cliente: { nome: 'Vann', telefone: '11999' } }),
      );

      await expect(
        service.adicionarFotoPronto('pedido-1', '', undefined, 'op-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a FotoEntrega with url and legenda when status is PRONTO', async () => {
      const pedido = makePedido({
        status: 'PRONTO',
        cliente: { id: 'c1', nome: 'Vann', telefone: '11999' },
      });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.fotoEntrega.create.mockResolvedValue(
        makeFoto({ url: 'https://img.com/a.jpg', legenda: 'sai em 30min' }),
      );

      await service.adicionarFotoPronto(
        'pedido-1',
        'https://img.com/a.jpg',
        'sai em 30min',
        'op-1',
      );

      expect(prisma.fotoEntrega.create).toHaveBeenCalledWith({
        data: {
          pedidoId: 'pedido-1',
          url: 'https://img.com/a.jpg',
          legenda: 'sai em 30min',
        },
      });
    });

    it('accepts legenda as optional and stores null', async () => {
      const pedido = makePedido({
        status: 'PRONTO',
        cliente: { id: 'c1', nome: 'Vann', telefone: '11999' },
      });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.fotoEntrega.create.mockResolvedValue(makeFoto());

      await service.adicionarFotoPronto('pedido-1', 'https://img.com/a.jpg', undefined, 'op-1');

      const call = prisma.fotoEntrega.create.mock.calls[0][0];
      expect(call.data.legenda).toBeNull();
    });

    it('sends notification to client with foto_bolo_pronto template', async () => {
      const pedido = makePedido({
        status: 'PRONTO',
        cliente: { id: 'c1', nome: 'Vann', telefone: '11999999999' },
      });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.fotoEntrega.create.mockResolvedValue(makeFoto());

      await service.adicionarFotoPronto('pedido-1', 'https://img.com/a.jpg', undefined, 'op-1');

      expect(notificationService.send).toHaveBeenCalledWith({
        pedidoId: 'pedido-1',
        telefone: '11999999999',
        templateId: 'foto_bolo_pronto',
        payload: expect.objectContaining({
          nome: 'Vann',
          pedidoId: 'pedido-1',
          fotoUrl: 'https://img.com/a.jpg',
        }),
      });
    });

    it('does NOT send notification when client has no telefone', async () => {
      const pedido = makePedido({
        status: 'PRONTO',
        cliente: { id: 'c1', nome: 'Vann', telefone: null },
      });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.fotoEntrega.create.mockResolvedValue(makeFoto());

      await service.adicionarFotoPronto('pedido-1', 'https://img.com/a.jpg', undefined, 'op-1');

      expect(notificationService.send).not.toHaveBeenCalled();
    });

    it('logs audit with FOTO_PRONTO_ADDED action', async () => {
      const pedido = makePedido({
        status: 'PRONTO',
        cliente: { id: 'c1', nome: 'Vann', telefone: '11999' },
      });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.fotoEntrega.create.mockResolvedValue(makeFoto({ id: 'foto-x' }));

      await service.adicionarFotoPronto('pedido-1', 'https://img.com/a.jpg', 'oi', 'op-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'ORDER.FOTO_PRONTO_ADDED',
          entidade: 'Pedido',
          entidadeId: 'pedido-1',
          usuarioId: 'op-1',
        }),
      );
    });

    it('returns the created foto', async () => {
      const pedido = makePedido({
        status: 'PRONTO',
        cliente: { id: 'c1', nome: 'Vann', telefone: '11999' },
      });
      const foto = makeFoto({ id: 'foto-x', url: 'https://img.com/a.jpg' });
      prisma.pedido.findUnique.mockResolvedValue(pedido);
      prisma.fotoEntrega.create.mockResolvedValue(foto);

      const result = await service.adicionarFotoPronto(
        'pedido-1',
        'https://img.com/a.jpg',
        undefined,
        'op-1',
      );

      expect(result).toBe(foto);
    });
  });

  // -------------------------------------------------------------------------
  // findRascunhosWhatsApp
  // -------------------------------------------------------------------------
  describe('findRascunhosWhatsApp', () => {
    it('queries only pedidos with status RASCUNHO_WHATSAPP, newest first', async () => {
      prisma.pedido.findMany.mockResolvedValue([]);

      await service.findRascunhosWhatsApp();

      expect(prisma.pedido.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'RASCUNHO_WHATSAPP' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('includes cliente (nome, telefone) and itens with produto nome', async () => {
      prisma.pedido.findMany.mockResolvedValue([]);

      await service.findRascunhosWhatsApp();

      const call = prisma.pedido.findMany.mock.calls[0][0];
      expect(call.include.cliente).toEqual({
        select: { id: true, nome: true, telefone: true, email: true },
      });
      expect(call.include.itens.include.produto).toEqual({
        select: { id: true, nome: true, slug: true },
      });
    });
  });
});
