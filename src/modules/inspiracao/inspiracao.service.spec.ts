import { Test, TestingModule } from '@nestjs/testing';
import { InspiracaoService } from './inspiracao.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('InspiracaoService', () => {
  let service: InspiracaoService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      boloInspiracao: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        InspiracaoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get<InspiracaoService>(InspiracaoService);
  });

  const makeInsp = (overrides: Partial<any> = {}) => ({
    id: 'i1',
    titulo: 'Bolo de chocolate com frutas vermelhas',
    fotoUrl: 'https://cdn.example/bolo.jpg',
    tagsMassa: ['chocolate'],
    tagsRecheio: ['frutas-vermelhas'],
    tagsCobertura: ['ganache'],
    tagsTopo: [],
    ocasiao: 'aniversario',
    publicado: true,
    pedidoOrigemId: null,
    createdAt: new Date(),
    ...overrides,
  });

  describe('listarPublicas', () => {
    it('retorna apenas publicadas, ordenadas por createdAt desc', async () => {
      prisma.boloInspiracao.findMany.mockResolvedValue([makeInsp()]);

      await service.listarPublicas();

      expect(prisma.boloInspiracao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { publicado: true },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('aplica filtro por tagsMassa com hasSome', async () => {
      prisma.boloInspiracao.findMany.mockResolvedValue([]);

      await service.listarPublicas({ tagsMassa: ['chocolate', 'red-velvet'] });

      expect(prisma.boloInspiracao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tagsMassa: { hasSome: ['chocolate', 'red-velvet'] },
          }),
        }),
      );
    });

    it('combina múltiplos filtros de tag', async () => {
      prisma.boloInspiracao.findMany.mockResolvedValue([]);

      await service.listarPublicas({
        tagsMassa: ['chocolate'],
        tagsRecheio: ['brigadeiro'],
        ocasiao: 'casamento',
      });

      expect(prisma.boloInspiracao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            publicado: true,
            tagsMassa: { hasSome: ['chocolate'] },
            tagsRecheio: { hasSome: ['brigadeiro'] },
            ocasiao: 'casamento',
          },
        }),
      );
    });
  });

  describe('obter', () => {
    it('retorna a inspiração quando existe', async () => {
      prisma.boloInspiracao.findUnique.mockResolvedValue(makeInsp());

      const r = await service.obter('i1');

      expect(r.id).toBe('i1');
    });

    it('lança NotFoundException quando não existe', async () => {
      prisma.boloInspiracao.findUnique.mockResolvedValue(null);

      await expect(service.obter('inexistente')).rejects.toThrow('Inspiração não encontrada');
    });
  });

  describe('criar', () => {
    it('cria com defaults seguros', async () => {
      prisma.boloInspiracao.create.mockResolvedValue(makeInsp());

      await service.criar({
        titulo: 'Novo bolo',
        fotoUrl: 'https://cdn.example/novo.jpg',
      });

      expect(prisma.boloInspiracao.create).toHaveBeenCalledWith({
        data: {
          titulo: 'Novo bolo',
          fotoUrl: 'https://cdn.example/novo.jpg',
          tagsMassa: [],
          tagsRecheio: [],
          tagsCobertura: [],
          tagsTopo: [],
          ocasiao: null,
          publicado: true,
          pedidoOrigemId: null,
        },
      });
    });
  });

  describe('curarDeAvaliacao', () => {
    it('cria inspiração nova rascunho (publicado=false) quando pedidoOrigemId é único', async () => {
      prisma.boloInspiracao.findUnique.mockResolvedValue(null);
      prisma.boloInspiracao.create.mockResolvedValue(makeInsp({ publicado: false }));

      await service.curarDeAvaliacao({
        pedidoId: 'p1',
        fotoUrl: 'https://cdn.example/festa.jpg',
        titulo: 'Bolo de aniversário da Júlia',
        tagsMassa: ['chocolate'],
        ocasiao: 'aniversario',
      });

      expect(prisma.boloInspiracao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          publicado: false,
          pedidoOrigemId: 'p1',
          tagsMassa: ['chocolate'],
          ocasiao: 'aniversario',
        }),
      });
    });

    it('é idempotente — não cria se já existe pra esse pedidoOrigemId', async () => {
      const existente = makeInsp({ pedidoOrigemId: 'p1' });
      prisma.boloInspiracao.findUnique.mockResolvedValue(existente);

      const r = await service.curarDeAvaliacao({
        pedidoId: 'p1',
        fotoUrl: 'https://cdn.example/outra.jpg',
      });

      expect(prisma.boloInspiracao.create).not.toHaveBeenCalled();
      expect(r).toBe(existente);
    });
  });

  describe('remover', () => {
    it('lança NotFoundException quando id inválido', async () => {
      prisma.boloInspiracao.findUnique.mockResolvedValue(null);

      await expect(service.remover('xx')).rejects.toThrow('Inspiração não encontrada');
      expect(prisma.boloInspiracao.delete).not.toHaveBeenCalled();
    });

    it('deleta quando existe', async () => {
      prisma.boloInspiracao.findUnique.mockResolvedValue(makeInsp());
      prisma.boloInspiracao.delete.mockResolvedValue(makeInsp());

      await service.remover('i1');

      expect(prisma.boloInspiracao.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });
  });
});
