import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('log', () => {
    it('aguarda a escrita da auditoria com os campos certos', async () => {
      await service.log({ acao: 'TESTE.ACAO', entidade: 'Teste', entidadeId: 't1', usuarioId: 'u1' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          acao: 'TESTE.ACAO',
          entidade: 'Teste',
          entidadeId: 't1',
          usuarioId: 'u1',
        }),
      });
    });

    it('não propaga erro se a escrita falhar', async () => {
      prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.log({ acao: 'X', entidade: 'Y', entidadeId: 'z' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('filtra por entidade (igualdade)', async () => {
      await service.list({ entidade: 'Produto' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entidade: 'Produto' } }),
      );
    });

    it('filtra por ação com contains insensitive', async () => {
      await service.list({ acao: 'VITRINE' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { acao: { contains: 'VITRINE', mode: 'insensitive' } },
        }),
      );
    });

    it('filtra por entidadeId (igualdade)', async () => {
      await service.list({ entidadeId: 'p1' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entidadeId: 'p1' } }),
      );
    });

    it('filtra por usuário via relação (nome ou email)', async () => {
      await service.list({ usuarioBusca: 'maria' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            usuario: {
              is: {
                OR: [
                  { nome: { contains: 'maria', mode: 'insensitive' } },
                  { email: { contains: 'maria', mode: 'insensitive' } },
                ],
              },
            },
          },
        }),
      );
    });

    it('filtra por intervalo de datas', async () => {
      await service.list({ dataInicio: '2026-06-01', dataFim: '2026-06-13' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: { gte: new Date('2026-06-01'), lte: new Date('2026-06-13') },
          },
        }),
      );
    });

    it('ignora datas inválidas', async () => {
      await service.list({ dataInicio: 'nao-e-data' });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('aplica paginação (page 3, pageSize 10 → skip 20, take 10)', async () => {
      await service.list({ page: 3, pageSize: 10 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('default page 1 e pageSize 25', async () => {
      await service.list({});
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 25 }),
      );
    });

    it('clampa pageSize ao máximo de 100', async () => {
      await service.list({ pageSize: 999 });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('inclui usuario e ordena por createdAt desc', async () => {
      await service.list({});
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { usuario: { select: { nome: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('retorna items, total, page e pageSize', async () => {
      prisma.auditLog.findMany.mockResolvedValue([{ id: 'a1' }]);
      prisma.auditLog.count.mockResolvedValue(1);
      const r = await service.list({ page: 2, pageSize: 5 });
      expect(r).toEqual({ items: [{ id: 'a1' }], total: 1, page: 2, pageSize: 5 });
    });
  });

  describe('facets', () => {
    it('retorna entidades distintas', async () => {
      prisma.auditLog.findMany.mockResolvedValue([
        { entidade: 'Pedido' },
        { entidade: 'Produto' },
      ]);
      const r = await service.facets();
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        distinct: ['entidade'],
        select: { entidade: true },
        orderBy: { entidade: 'asc' },
      });
      expect(r).toEqual({ entidades: ['Pedido', 'Produto'] });
    });
  });
});
