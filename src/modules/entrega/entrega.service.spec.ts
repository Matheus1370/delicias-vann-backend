import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { EntregaService } from './entrega.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('EntregaService', () => {
  let service: EntregaService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      configuracaoEntrega: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EntregaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get<EntregaService>(EntregaService);
  });

  const makeConfig = (overrides: Partial<any> = {}) => ({
    id: 'cfg-1',
    modalidade: 'MOTOBOY_LOCAL',
    valorFreteBase: new Prisma.Decimal(15),
    valorMinimoPedido: new Prisma.Decimal(0),
    valorFreteGratisAcimaDe: new Prisma.Decimal(200),
    raioKm: 10,
    ativa: true,
    ...overrides,
  });

  describe('list', () => {
    it('returns all active configs', async () => {
      prisma.configuracaoEntrega.findMany.mockResolvedValue([]);
      await service.list();
      expect(prisma.configuracaoEntrega.findMany).toHaveBeenCalledWith({
        where: { ativa: true },
      });
    });
  });

  describe('getByModalidade', () => {
    it('returns the config for the given modalidade', async () => {
      const cfg = makeConfig({ modalidade: 'UBER_DIRECT' });
      prisma.configuracaoEntrega.findUnique.mockResolvedValue(cfg);

      const result = await service.getByModalidade('UBER_DIRECT');

      expect(prisma.configuracaoEntrega.findUnique).toHaveBeenCalledWith({
        where: { modalidade: 'UBER_DIRECT' },
      });
      expect(result).toBe(cfg);
    });

    it('returns null when modalidade has no config', async () => {
      prisma.configuracaoEntrega.findUnique.mockResolvedValue(null);

      const result = await service.getByModalidade('UBER_DIRECT');

      expect(result).toBeNull();
    });
  });

  describe('computeFrete', () => {
    it('returns 0 when subtotal reaches the free shipping threshold', async () => {
      prisma.configuracaoEntrega.findUnique.mockResolvedValue(
        makeConfig({ valorFreteBase: new Prisma.Decimal(15), valorFreteGratisAcimaDe: new Prisma.Decimal(200) }),
      );

      const frete = await service.computeFrete('MOTOBOY_LOCAL', 250);

      expect(frete).toBe(0);
    });

    it('returns valorFreteBase when subtotal is below the threshold', async () => {
      prisma.configuracaoEntrega.findUnique.mockResolvedValue(
        makeConfig({ valorFreteBase: new Prisma.Decimal(15), valorFreteGratisAcimaDe: new Prisma.Decimal(200) }),
      );

      const frete = await service.computeFrete('MOTOBOY_LOCAL', 150);

      expect(frete).toBe(15);
    });

    it('returns valorFreteBase when threshold is null (no free shipping)', async () => {
      prisma.configuracaoEntrega.findUnique.mockResolvedValue(
        makeConfig({ valorFreteBase: new Prisma.Decimal(22), valorFreteGratisAcimaDe: null }),
      );

      const frete = await service.computeFrete('UBER_DIRECT', 500);

      expect(frete).toBe(22);
    });

    it('returns 0 when modalidade has no config (defensive)', async () => {
      prisma.configuracaoEntrega.findUnique.mockResolvedValue(null);

      const frete = await service.computeFrete('UBER_DIRECT', 100);

      expect(frete).toBe(0);
    });

    it('treats subtotal equal to threshold as eligible for free shipping', async () => {
      prisma.configuracaoEntrega.findUnique.mockResolvedValue(
        makeConfig({ valorFreteBase: new Prisma.Decimal(15), valorFreteGratisAcimaDe: new Prisma.Decimal(200) }),
      );

      const frete = await service.computeFrete('MOTOBOY_LOCAL', 200);

      expect(frete).toBe(0);
    });
  });
});
