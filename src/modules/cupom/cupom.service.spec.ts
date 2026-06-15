import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CupomService } from './cupom.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CupomService', () => {
  let service: CupomService;
  let prisma: Record<string, any>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      cupom: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CupomService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CupomService>(CupomService);
  });

  const makeCupom = (overrides: Record<string, any> = {}) => ({
    id: 'cup_001',
    codigo: 'PROMO10',
    tipo: 'PERCENTUAL',
    valor: 10,
    ativo: true,
    minimoCompra: 0,
    usoMaximo: 100,
    usoAtual: 5,
    validoDe: new Date('2026-01-01'),
    validoAte: new Date('2026-12-31'),
    clienteId: null,
    createdAt: new Date(),
    ...overrides,
  });

  describe('validate', () => {
    it('should validate a valid percentage coupon and return correct discount', async () => {
      const cupom = makeCupom();
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      const result = await service.validate('promo10', 200);

      expect(prisma.cupom.findUnique).toHaveBeenCalledWith({
        where: { codigo: 'PROMO10' },
      });
      expect(result.cupom).toBe(cupom);
      expect(result.desconto).toBe(20);
    });

    it('should validate a valid fixed coupon and return correct discount', async () => {
      const cupom = makeCupom({ tipo: 'FIXO', valor: 30 });
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      const result = await service.validate('PROMO10', 200);

      expect(result.desconto).toBe(30);
    });

    it('should cap fixed discount at subtotal when valor > subtotal', async () => {
      const cupom = makeCupom({ tipo: 'FIXO', valor: 300 });
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      const result = await service.validate('PROMO10', 50);

      expect(result.desconto).toBe(50);
    });

    it('should throw NotFoundException when coupon does not exist', async () => {
      prisma.cupom.findUnique.mockResolvedValue(null);

      await expect(service.validate('INVALID', 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when coupon is inactive', async () => {
      const cupom = makeCupom({ ativo: false });
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      await expect(service.validate('PROMO10', 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when coupon is expired (past validoAte)', async () => {
      const cupom = makeCupom({
        validoDe: new Date('2024-01-01'),
        validoAte: new Date('2024-12-31'),
      });
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      await expect(service.validate('PROMO10', 100)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.validate('PROMO10', 100)).rejects.toThrow(
        'Cupom fora do período de validade',
      );
    });

    it('should throw BadRequestException when coupon has not started yet (before validoDe)', async () => {
      const cupom = makeCupom({
        validoDe: new Date('2027-06-01'),
        validoAte: new Date('2027-12-31'),
      });
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      await expect(service.validate('PROMO10', 100)).rejects.toThrow(
        'Cupom fora do período de validade',
      );
    });

    it('should throw BadRequestException when usage limit is exceeded', async () => {
      const cupom = makeCupom({ usoMaximo: 10, usoAtual: 10 });
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      await expect(service.validate('PROMO10', 100)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.validate('PROMO10', 100)).rejects.toThrow(
        'Cupom esgotado',
      );
    });

    it('should throw BadRequestException when minimum purchase is not met', async () => {
      const cupom = makeCupom({ minimoCompra: 100 });
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      await expect(service.validate('PROMO10', 50)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.validate('PROMO10', 50)).rejects.toThrow(
        'Mínimo de compra: R$ 100.00',
      );
    });

    it('should allow coupon when usoMaximo is null (unlimited usage)', async () => {
      const cupom = makeCupom({ usoMaximo: null, usoAtual: 9999 });
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      const result = await service.validate('PROMO10', 200);

      expect(result.desconto).toBe(20);
    });

    it('should trim and uppercase the codigo before lookup', async () => {
      const cupom = makeCupom();
      prisma.cupom.findUnique.mockResolvedValue(cupom);

      await service.validate('  promo10  ', 200);

      expect(prisma.cupom.findUnique).toHaveBeenCalledWith({
        where: { codigo: 'PROMO10' },
      });
    });

    describe('restricao por clienteId', () => {
      it('aceita cupom restrito quando clienteId bate', async () => {
        const cupom = makeCupom({ clienteId: 'cliente-A' });
        prisma.cupom.findUnique.mockResolvedValue(cupom);

        const result = await service.validate('PROMO10', 200, 'cliente-A');

        expect(result.desconto).toBe(20);
      });

      it('rejeita cupom restrito quando clienteId diferente', async () => {
        const cupom = makeCupom({ clienteId: 'cliente-A' });
        prisma.cupom.findUnique.mockResolvedValue(cupom);

        await expect(
          service.validate('PROMO10', 200, 'cliente-B'),
        ).rejects.toThrow(NotFoundException);
      });

      it('rejeita cupom restrito quando clienteId nao informado', async () => {
        const cupom = makeCupom({ clienteId: 'cliente-A' });
        prisma.cupom.findUnique.mockResolvedValue(cupom);

        await expect(service.validate('PROMO10', 200)).rejects.toThrow(
          NotFoundException,
        );
      });

      it('cupom nao-restrito (clienteId null) funciona com qualquer cliente', async () => {
        const cupom = makeCupom({ clienteId: null });
        prisma.cupom.findUnique.mockResolvedValue(cupom);

        const result = await service.validate('PROMO10', 200, 'cliente-qualquer');

        expect(result.desconto).toBe(20);
      });
    });
  });

  describe('registrarUso', () => {
    it('should increment usoAtual by 1', async () => {
      prisma.cupom.update.mockResolvedValue({});

      await service.registrarUso('cup_001');

      expect(prisma.cupom.update).toHaveBeenCalledWith({
        where: { id: 'cup_001' },
        data: { usoAtual: { increment: 1 } },
      });
    });
  });
});
