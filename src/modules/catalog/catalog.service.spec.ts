import { Test, TestingModule } from '@nestjs/testing';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: Record<string, any>;
  let auditService: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      produto: {
        findMany: jest.fn(),
      },
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  const makeAdicional = (overrides: Record<string, any> = {}) => ({
    id: 'prod_001',
    nome: 'Brigadeiro tradicional',
    slug: 'brigadeiro-tradicional',
    descricao: null,
    precoVenda: '2.50',
    pontosEsforco: 1,
    imagemUrl: null,
    tipo: 'ADICIONAL',
    ativo: true,
    status: 'ATIVO',
    ...overrides,
  });

  describe('findAdicionais', () => {
    it('queries only ATIVO ADICIONAL products', async () => {
      prisma.produto.findMany.mockResolvedValue([]);

      await service.findAdicionais(30);

      expect(prisma.produto.findMany).toHaveBeenCalledWith({
        where: { ativo: true, status: 'ATIVO', tipo: 'ADICIONAL' },
        orderBy: { nome: 'asc' },
      });
    });

    it('classifies a brigadeiro as PORCAO and suggests 5 per pessoa', async () => {
      prisma.produto.findMany.mockResolvedValue([makeAdicional({ nome: 'Brigadeiro' })]);

      const result = await service.findAdicionais(10);

      expect(result.itens[0].unidade).toBe('PORCAO');
      expect(result.itens[0].quantidadeSugerida).toBe(50);
    });

    it('classifies docinho, beijinho, casadinho, copinho as PORCAO', async () => {
      prisma.produto.findMany.mockResolvedValue([
        makeAdicional({ id: 'a', nome: 'Beijinho de coco' }),
        makeAdicional({ id: 'b', nome: 'Casadinho' }),
        makeAdicional({ id: 'c', nome: 'Copinho de morango' }),
        makeAdicional({ id: 'd', nome: 'Docinhos sortidos' }),
      ]);

      const result = await service.findAdicionais(6);

      expect(result.itens.every((it) => it.unidade === 'PORCAO')).toBe(true);
      expect(result.itens.every((it) => it.quantidadeSugerida === 30)).toBe(true);
    });

    it('classifies non-doce products as UNIDADE with quantidadeSugerida = 0', async () => {
      prisma.produto.findMany.mockResolvedValue([
        makeAdicional({ id: 'a', nome: 'Velas numéricas' }),
        makeAdicional({ id: 'b', nome: 'Plaquinha de feliz aniversário' }),
      ]);

      const result = await service.findAdicionais(20);

      expect(result.itens[0].unidade).toBe('UNIDADE');
      expect(result.itens[0].quantidadeSugerida).toBe(0);
      expect(result.itens[1].unidade).toBe('UNIDADE');
      expect(result.itens[1].quantidadeSugerida).toBe(0);
    });

    it('returns quantidadeSugerida = 0 for PORCAO when numeroPessoas is undefined', async () => {
      prisma.produto.findMany.mockResolvedValue([makeAdicional({ nome: 'Brigadeiro' })]);

      const result = await service.findAdicionais(undefined);

      expect(result.itens[0].unidade).toBe('PORCAO');
      expect(result.itens[0].quantidadeSugerida).toBe(0);
    });

    it('returns quantidadeSugerida = 0 for PORCAO when numeroPessoas is 0', async () => {
      prisma.produto.findMany.mockResolvedValue([makeAdicional({ nome: 'Brigadeiro' })]);

      const result = await service.findAdicionais(0);

      expect(result.itens[0].quantidadeSugerida).toBe(0);
    });

    it('returns meta with totalSugerido = numeroPessoas * 5', async () => {
      prisma.produto.findMany.mockResolvedValue([]);

      const result = await service.findAdicionais(8);

      expect(result.meta).toEqual({
        numeroPessoas: 8,
        docinhosPorPessoa: 5,
        totalSugerido: 40,
      });
    });

    it('returns meta with totalSugerido = 0 and numeroPessoas = null when undefined', async () => {
      prisma.produto.findMany.mockResolvedValue([]);

      const result = await service.findAdicionais(undefined);

      expect(result.meta).toEqual({
        numeroPessoas: null,
        docinhosPorPessoa: 5,
        totalSugerido: 0,
      });
    });

    it('is case-insensitive on classification (BRIGADEIRO matches)', async () => {
      prisma.produto.findMany.mockResolvedValue([
        makeAdicional({ nome: 'BRIGADEIRO PREMIUM' }),
      ]);

      const result = await service.findAdicionais(4);

      expect(result.itens[0].unidade).toBe('PORCAO');
      expect(result.itens[0].quantidadeSugerida).toBe(20);
    });
  });
});
