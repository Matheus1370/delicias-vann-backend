import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreditoService } from './credito.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CreditoService', () => {
  let service: CreditoService;
  let prisma: Record<string, any>;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      creditoCliente: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => {
        if (typeof cb === 'function') return cb(prisma);
        return Promise.all(cb);
      }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CreditoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get<CreditoService>(CreditoService);
  });

  const makeCredito = (overrides: Partial<any> = {}) => ({
    id: 'cred-1',
    clienteId: 'c1',
    valor: new Prisma.Decimal(50),
    valorUsado: new Prisma.Decimal(0),
    motivo: 'cancelamento véspera',
    pedidoOrigemId: null,
    expiraEm: null,
    ativo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('listAtivos', () => {
    it('queries creditos ativos com saldo and ordered by expiration ascending nulls last', async () => {
      prisma.creditoCliente.findMany.mockResolvedValue([]);
      await service.listAtivos('c1');
      const args = prisma.creditoCliente.findMany.mock.calls[0][0];
      expect(args.where.clienteId).toBe('c1');
      expect(args.where.ativo).toBe(true);
    });

    it('excludes creditos already expired', async () => {
      const passado = new Date(Date.now() - 24 * 3600 * 1000);
      prisma.creditoCliente.findMany.mockResolvedValue([
        makeCredito({ id: 'expirado', expiraEm: passado }),
        makeCredito({ id: 'futuro', expiraEm: new Date(Date.now() + 24 * 3600 * 1000) }),
        makeCredito({ id: 'sem-data', expiraEm: null }),
      ]);

      const result = await service.listAtivos('c1');

      expect(result.find((c) => c.id === 'expirado')).toBeUndefined();
      expect(result).toHaveLength(2);
    });
  });

  describe('saldoTotal', () => {
    it('returns sum of (valor - valorUsado) across ativos non-expired', async () => {
      prisma.creditoCliente.findMany.mockResolvedValue([
        makeCredito({ valor: new Prisma.Decimal(50), valorUsado: new Prisma.Decimal(10) }),
        makeCredito({ valor: new Prisma.Decimal(30), valorUsado: new Prisma.Decimal(0) }),
      ]);

      const saldo = await service.saldoTotal('c1');

      expect(saldo).toBe(70);
    });

    it('returns 0 when no creditos', async () => {
      prisma.creditoCliente.findMany.mockResolvedValue([]);
      const saldo = await service.saldoTotal('c1');
      expect(saldo).toBe(0);
    });
  });

  describe('gerar', () => {
    it('creates a credito with the given valor, motivo, pedidoOrigemId, expiraEm', async () => {
      const created = makeCredito({ id: 'novo', valor: new Prisma.Decimal(120) });
      prisma.creditoCliente.create.mockResolvedValue(created);

      const result = await service.gerar({
        clienteId: 'c1',
        valor: 120,
        motivo: 'cancelamento véspera',
        pedidoOrigemId: 'p1',
      });

      const callData = prisma.creditoCliente.create.mock.calls[0][0].data;
      expect(callData.clienteId).toBe('c1');
      expect(callData.valor).toBe(120);
      expect(callData.motivo).toBe('cancelamento véspera');
      expect(callData.pedidoOrigemId).toBe('p1');
      expect(callData.expiraEm).toBeNull();
      expect(result).toBe(created);
    });

    it('logs audit with CREDITO.GENERATED', async () => {
      prisma.creditoCliente.create.mockResolvedValue(makeCredito());

      await service.gerar({ clienteId: 'c1', valor: 50, motivo: 'cortesia' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'CREDITO.GENERATED', usuarioId: 'c1' }),
      );
    });

    it('rejects valor <= 0', async () => {
      await expect(
        service.gerar({ clienteId: 'c1', valor: 0, motivo: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('consumir', () => {
    it('consumes from oldest credito first when none expire', async () => {
      const c1 = makeCredito({ id: 'a', valor: new Prisma.Decimal(30), valorUsado: new Prisma.Decimal(0), createdAt: new Date('2026-01-01') });
      const c2 = makeCredito({ id: 'b', valor: new Prisma.Decimal(50), valorUsado: new Prisma.Decimal(0), createdAt: new Date('2026-02-01') });
      prisma.creditoCliente.findMany.mockResolvedValue([c1, c2]);
      prisma.creditoCliente.update.mockImplementation(({ data }: any) => Promise.resolve({ ...c1, ...data }));

      await service.consumir('c1', 40);

      const updateCalls = prisma.creditoCliente.update.mock.calls.map((c: any) => c[0]);
      // primeiro consome c1 inteiro (30)
      expect(updateCalls[0].where).toEqual({ id: 'a' });
      expect(Number(updateCalls[0].data.valorUsado)).toBe(30);
      // depois consome 10 de c2
      expect(updateCalls[1].where).toEqual({ id: 'b' });
      expect(Number(updateCalls[1].data.valorUsado)).toBe(10);
    });

    it('throws when subtotal exceeds available saldo', async () => {
      prisma.creditoCliente.findMany.mockResolvedValue([
        makeCredito({ valor: new Prisma.Decimal(10) }),
      ]);

      await expect(service.consumir('c1', 30)).rejects.toThrow(BadRequestException);
    });

    it('prefers credito expiring sooner over older one without expiration', async () => {
      const expiraEmBreve = makeCredito({
        id: 'urgente',
        valor: new Prisma.Decimal(20),
        expiraEm: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        createdAt: new Date('2026-04-01'),
      });
      const semExpira = makeCredito({
        id: 'eterno',
        valor: new Prisma.Decimal(50),
        expiraEm: null,
        createdAt: new Date('2026-01-01'),
      });
      prisma.creditoCliente.findMany.mockResolvedValue([expiraEmBreve, semExpira]);
      prisma.creditoCliente.update.mockResolvedValue({});

      await service.consumir('c1', 10);

      expect(prisma.creditoCliente.update.mock.calls[0][0].where.id).toBe('urgente');
    });

    it('does nothing when valor is 0', async () => {
      await service.consumir('c1', 0);
      expect(prisma.creditoCliente.update).not.toHaveBeenCalled();
    });
  });
});
