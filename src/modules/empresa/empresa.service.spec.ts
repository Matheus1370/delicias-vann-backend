import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EmpresaService } from './empresa.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('EmpresaService', () => {
  let service: EmpresaService;
  let prisma: Record<string, any>;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      empresa: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      usuario: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresaService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get<EmpresaService>(EmpresaService);
  });

  const makeEmpresa = (overrides: Partial<any> = {}) => ({
    id: 'e1',
    razaoSocial: 'Acme LTDA',
    cnpj: '12.345.678/0001-90',
    nomeFantasia: 'Acme',
    contatoPadraoId: 'u1',
    condicaoPagamento: null,
    descontoPadrao: new Prisma.Decimal(0),
    status: 'PENDENTE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('solicitar', () => {
    it('creates empresa PENDENTE com cnpj normalizado', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      prisma.empresa.create.mockResolvedValue(makeEmpresa());

      await service.solicitar('u1', {
        razaoSocial: 'Acme LTDA',
        cnpj: '12345678000190',
        nomeFantasia: 'Acme',
      });

      const call = prisma.empresa.create.mock.calls[0][0];
      expect(call.data.cnpj).toBe('12.345.678/0001-90');
      expect(call.data.razaoSocial).toBe('Acme LTDA');
      expect(call.data.contatoPadraoId).toBe('u1');
      expect(call.data.status).toBe('PENDENTE');
    });

    it('rejects when cnpj is invalid (less than 14 digits)', async () => {
      await expect(
        service.solicitar('u1', { razaoSocial: 'X', cnpj: '123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws Conflict when cnpj already exists', async () => {
      prisma.empresa.findUnique.mockResolvedValue(makeEmpresa());

      await expect(
        service.solicitar('u1', { razaoSocial: 'X', cnpj: '12345678000190' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('mine', () => {
    it('returns empresa where user is contatoPadrao', async () => {
      const empresa = makeEmpresa({ status: 'APROVADA' });
      prisma.empresa.findFirst.mockResolvedValue(empresa);

      const result = await service.mine('u1');

      expect(prisma.empresa.findFirst).toHaveBeenCalledWith({
        where: { contatoPadraoId: 'u1' },
      });
      expect(result).toBe(empresa);
    });

    it('returns null when user nao tem empresa', async () => {
      prisma.empresa.findFirst.mockResolvedValue(null);
      const result = await service.mine('u1');
      expect(result).toBeNull();
    });
  });

  describe('aprovar', () => {
    it('marks empresa as APROVADA and promotes user to CLIENTE_EMPRESA', async () => {
      const empresa = makeEmpresa({ status: 'PENDENTE' });
      prisma.empresa.findUnique.mockResolvedValue(empresa);
      prisma.empresa.update.mockResolvedValue({ ...empresa, status: 'APROVADA', descontoPadrao: new Prisma.Decimal(5) });

      await service.aprovar('e1', { descontoPadrao: 5 }, 'admin-1');

      expect(prisma.empresa.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { status: 'APROVADA', descontoPadrao: 5 },
      });
      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: 'CLIENTE_EMPRESA' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'EMPRESA.APROVADA', usuarioId: 'admin-1' }),
      );
    });

    it('throws NotFound when empresa does not exist', async () => {
      prisma.empresa.findUnique.mockResolvedValue(null);
      await expect(service.aprovar('e404', { descontoPadrao: 0 }, 'admin')).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejeitar', () => {
    it('marks empresa as REJEITADA com motivo no audit', async () => {
      const empresa = makeEmpresa({ status: 'PENDENTE' });
      prisma.empresa.findUnique.mockResolvedValue(empresa);
      prisma.empresa.update.mockResolvedValue({ ...empresa, status: 'REJEITADA' });

      await service.rejeitar('e1', 'cnpj invalido', 'admin-1');

      expect(prisma.empresa.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { status: 'REJEITADA' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          acao: 'EMPRESA.REJEITADA',
          payloadDepois: expect.objectContaining({ motivo: 'cnpj invalido' }),
        }),
      );
    });
  });

  describe('getDescontoAtivo', () => {
    it('returns descontoPadrao when user has APROVADA empresa', async () => {
      prisma.empresa.findFirst.mockResolvedValue(
        makeEmpresa({ status: 'APROVADA', descontoPadrao: new Prisma.Decimal(7.5) }),
      );

      const r = await service.getDescontoAtivo('u1');

      expect(r).toEqual({ empresaId: 'e1', descontoPct: 7.5 });
    });

    it('returns null when empresa is not APROVADA', async () => {
      prisma.empresa.findFirst.mockResolvedValue(makeEmpresa({ status: 'PENDENTE' }));
      const r = await service.getDescontoAtivo('u1');
      expect(r).toBeNull();
    });

    it('returns null when user has no empresa', async () => {
      prisma.empresa.findFirst.mockResolvedValue(null);
      const r = await service.getDescontoAtivo('u1');
      expect(r).toBeNull();
    });
  });
});
