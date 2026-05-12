import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RegrasService } from './regras.service';
import { ClimaService } from './clima.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('RegrasService', () => {
  let service: RegrasService;
  let prisma: Record<string, any>;
  let clima: { prever: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      regraCombinacao: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      produto: { findUnique: jest.fn() },
    };
    clima = { prever: jest.fn().mockResolvedValue(null) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        RegrasService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClimaService, useValue: clima },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get<RegrasService>(RegrasService);
  });

  const makeRegra = (overrides: Partial<any> = {}) => ({
    id: 'r1',
    nome: 'Regra de teste',
    nivel: 'AVISAR',
    condicao: { todos: [] },
    mensagem: 'mensagem default',
    ativa: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('avaliar', () => {
    it('queries only active regras', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([]);
      await service.avaliar({ produtoId: 'p1', opcoesEscolhidas: {} });
      expect(prisma.regraCombinacao.findMany).toHaveBeenCalledWith({
        where: { ativa: true },
      });
    });

    it('returns empty violacoes when no rule matches', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          condicao: { todos: [{ tipo: 'OPCAO_CONTEM', etapa: 'cobertura', valor: 'chantilly' }] },
        }),
      ]);

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: { cobertura: 'Buttercream' },
      });

      expect(result.violacoes).toEqual([]);
    });

    it('fires OPCAO_CONTEM when escolha matches case-insensitive', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          id: 'r-chantilly',
          nome: 'Chantilly + calor',
          nivel: 'AVISAR',
          mensagem: 'derrete',
          condicao: { todos: [{ tipo: 'OPCAO_CONTEM', etapa: 'cobertura', valor: 'Chantilly' }] },
        }),
      ]);

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: { cobertura: 'chantilly' },
      });

      expect(result.violacoes).toHaveLength(1);
      expect(result.violacoes[0]).toMatchObject({
        regraId: 'r-chantilly',
        nivel: 'AVISAR',
        mensagem: 'derrete',
      });
    });

    it('fires MODALIDADE_IN when current modalidade is in the list', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          nivel: 'BLOQUEAR',
          condicao: {
            todos: [{ tipo: 'MODALIDADE_IN', valores: ['UBER_DIRECT', 'NOVENTA_NOVE_ENTREGAS'] }],
          },
        }),
      ]);

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: {},
        modalidade: 'UBER_DIRECT',
      });

      expect(result.violacoes).toHaveLength(1);
    });

    it('does NOT fire TEMPERATURA_GTE when temperatura is unknown', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          condicao: { todos: [{ tipo: 'TEMPERATURA_GTE', valor: 28 }] },
        }),
      ]);

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: {},
        // sem temperaturaC e clima.prever retorna null
      });

      expect(result.violacoes).toEqual([]);
    });

    it('fires TEMPERATURA_GTE using clima service when no temp provided but data given', async () => {
      clima.prever.mockResolvedValue({ tempMaxC: 32, fonte: 'openweather' });
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          condicao: { todos: [{ tipo: 'TEMPERATURA_GTE', valor: 30 }] },
        }),
      ]);

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: {},
        dataAgendamento: '2026-05-15T15:00:00Z',
      });

      expect(result.violacoes).toHaveLength(1);
    });

    it('respects explicit temperaturaC override and skips clima call', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          condicao: { todos: [{ tipo: 'TEMPERATURA_GTE', valor: 30 }] },
        }),
      ]);

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: {},
        dataAgendamento: '2026-05-15T15:00:00Z',
        temperaturaC: 26,
      });

      expect(result.violacoes).toEqual([]);
      expect(clima.prever).not.toHaveBeenCalled();
    });

    it('fires PRAZO_HORAS_LTE when delivery is too soon', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          nivel: 'BLOQUEAR',
          condicao: { todos: [{ tipo: 'PRAZO_HORAS_LTE', valor: 48 }] },
        }),
      ]);
      const proxima = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: {},
        dataAgendamento: proxima,
      });

      expect(result.violacoes).toHaveLength(1);
    });

    it('does NOT fire PRAZO_HORAS_LTE when no dataAgendamento', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          condicao: { todos: [{ tipo: 'PRAZO_HORAS_LTE', valor: 48 }] },
        }),
      ]);

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: {},
      });

      expect(result.violacoes).toEqual([]);
    });

    it('fires PRODUTO_TIPO using produto.tipo from db', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 'p1', tipo: 'MONTAVEL' });
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          condicao: { todos: [{ tipo: 'PRODUTO_TIPO', valor: 'MONTAVEL' }] },
        }),
      ]);

      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: {},
      });

      expect(result.violacoes).toHaveLength(1);
    });

    it('requires ALL predicados in condicao.todos to fire (AND semantics)', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([
        makeRegra({
          condicao: {
            todos: [
              { tipo: 'OPCAO_CONTEM', etapa: 'cobertura', valor: 'chantilly' },
              { tipo: 'MODALIDADE_IN', valores: ['UBER_DIRECT'] },
            ],
          },
        }),
      ]);

      // só uma condição satisfeita
      const result = await service.avaliar({
        produtoId: 'p1',
        opcoesEscolhidas: { cobertura: 'chantilly' },
        modalidade: 'RETIRADA_BALCAO',
      });

      expect(result.violacoes).toEqual([]);
    });
  });

  describe('CRUD', () => {
    it('list returns all regras ordered by createdAt desc', async () => {
      prisma.regraCombinacao.findMany.mockResolvedValue([]);
      await service.list();
      expect(prisma.regraCombinacao.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('create persists with audit log', async () => {
      const created = makeRegra({ id: 'novo' });
      prisma.regraCombinacao.create.mockResolvedValue(created);

      const result = await service.create(
        {
          nome: 'X',
          nivel: 'AVISAR',
          mensagem: 'msg',
          condicao: { todos: [] },
        },
        'admin-1',
      );

      expect(result).toBe(created);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'REGRA.CREATED', usuarioId: 'admin-1' }),
      );
    });

    it('create rejects invalid nivel', async () => {
      await expect(
        service.create(
          { nome: 'X', nivel: 'INVALIDO' as any, mensagem: 'm', condicao: { todos: [] } },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('create rejects when condicao.todos has unknown predicate type', async () => {
      await expect(
        service.create(
          {
            nome: 'X',
            nivel: 'AVISAR',
            mensagem: 'm',
            condicao: { todos: [{ tipo: 'NAOEXISTE', valor: 1 } as any] },
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('update throws NotFoundException when regra does not exist', async () => {
      prisma.regraCombinacao.findUnique.mockResolvedValue(null);

      await expect(
        service.update('inex', { ativa: false }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('update persists changes and logs audit', async () => {
      const before = makeRegra({ id: 'r1', ativa: true });
      const after = { ...before, ativa: false };
      prisma.regraCombinacao.findUnique.mockResolvedValue(before);
      prisma.regraCombinacao.update.mockResolvedValue(after);

      const result = await service.update('r1', { ativa: false }, 'admin-1');

      expect(result).toBe(after);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'REGRA.UPDATED' }),
      );
    });

    it('remove deletes the regra and logs audit', async () => {
      prisma.regraCombinacao.findUnique.mockResolvedValue(makeRegra({ id: 'r1' }));
      prisma.regraCombinacao.delete.mockResolvedValue(makeRegra({ id: 'r1' }));

      await service.remove('r1', 'admin-1');

      expect(prisma.regraCombinacao.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'REGRA.DELETED' }),
      );
    });
  });
});
