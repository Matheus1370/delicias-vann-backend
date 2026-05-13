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
        findUnique: jest.fn(),
      },
      fotoProduto: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
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

  describe('calcularLeadTime', () => {
    const makeProduto = (overrides: Partial<any> = {}) => ({
      id: 'p1',
      leadTimeHoras: 48,
      opcoesMontagem: [],
      ...overrides,
    });

    it('returns produto.leadTimeHoras when no opcoesEscolhidas', async () => {
      prisma.produto.findUnique.mockResolvedValue(makeProduto({ leadTimeHoras: 36 }));

      const result = await service.calcularLeadTime('p1', {});

      expect(result.leadTimeHoras).toBe(36);
      expect(result.leadTimeDias).toBe(2);
    });

    it('sums leadTimeHorasExtra of matched opcoes (by label)', async () => {
      prisma.produto.findUnique.mockResolvedValue(
        makeProduto({
          leadTimeHoras: 48,
          opcoesMontagem: [
            { etapa: 'topo', label: 'Biscuit', leadTimeHorasExtra: 72, ativa: true },
            { etapa: 'tamanho', label: 'Grande', leadTimeHorasExtra: 24, ativa: true },
            { etapa: 'massa', label: 'Chocolate', leadTimeHorasExtra: 0, ativa: true },
          ],
        }),
      );

      const result = await service.calcularLeadTime('p1', {
        topo: 'Biscuit',
        tamanho: 'Grande',
        massa: 'Chocolate',
      });

      expect(result.leadTimeHoras).toBe(48 + 72 + 24);
      expect(result.leadTimeDias).toBe(6);
    });

    it('ignores options that are not selected', async () => {
      prisma.produto.findUnique.mockResolvedValue(
        makeProduto({
          leadTimeHoras: 48,
          opcoesMontagem: [
            { etapa: 'topo', label: 'Biscuit', leadTimeHorasExtra: 72, ativa: true },
            { etapa: 'topo', label: 'Simples', leadTimeHorasExtra: 0, ativa: true },
          ],
        }),
      );

      const result = await service.calcularLeadTime('p1', { topo: 'Simples' });

      expect(result.leadTimeHoras).toBe(48);
    });

    it('matches label case-insensitively', async () => {
      prisma.produto.findUnique.mockResolvedValue(
        makeProduto({
          leadTimeHoras: 48,
          opcoesMontagem: [
            { etapa: 'topo', label: 'Biscuit', leadTimeHorasExtra: 72, ativa: true },
          ],
        }),
      );

      const result = await service.calcularLeadTime('p1', { topo: 'biscuit' });

      expect(result.leadTimeHoras).toBe(120);
    });

    it('returns 0 hours when produto does not exist', async () => {
      prisma.produto.findUnique.mockResolvedValue(null);

      const result = await service.calcularLeadTime('does-not-exist', {});

      expect(result.leadTimeHoras).toBe(0);
      expect(result.leadTimeDias).toBe(0);
    });

    it('rounds leadTimeDias up (ceil) when not exact multiple of 24', async () => {
      prisma.produto.findUnique.mockResolvedValue(
        makeProduto({
          leadTimeHoras: 30,
          opcoesMontagem: [],
        }),
      );

      const result = await service.calcularLeadTime('p1', {});

      expect(result.leadTimeHoras).toBe(30);
      expect(result.leadTimeDias).toBe(2);
    });
  });

  describe('fotos de produto', () => {
    it('lista fotos ordenadas por ordem', async () => {
      prisma.fotoProduto.findMany.mockResolvedValue([]);

      await service.listarFotos('p1');

      expect(prisma.fotoProduto.findMany).toHaveBeenCalledWith({
        where: { produtoId: 'p1' },
        orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
      });
    });

    it('adicionarFoto exige produto existente (404 se não)', async () => {
      prisma.produto.findUnique.mockResolvedValue(null);

      await expect(
        service.adicionarFoto('inexistente', { url: 'https://x' }),
      ).rejects.toThrow('Produto não encontrado');
    });

    it('adicionarFoto cria com defaults (tipo DETALHE, ordem 0)', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.fotoProduto.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      await service.adicionarFoto('p1', { url: 'https://cdn/x.jpg' });

      expect(prisma.fotoProduto.create).toHaveBeenCalledWith({
        data: { produtoId: 'p1', url: 'https://cdn/x.jpg', tipo: 'DETALHE', ordem: 0 },
      });
    });

    it('adicionarFoto respeita tipo e ordem informados', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.fotoProduto.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      await service.adicionarFoto('p1', {
        url: 'https://cdn/cortado.jpg',
        tipo: 'CORTADO',
        ordem: 2,
      });

      expect(prisma.fotoProduto.create.mock.calls[0][0].data).toEqual({
        produtoId: 'p1',
        url: 'https://cdn/cortado.jpg',
        tipo: 'CORTADO',
        ordem: 2,
      });
    });

    it('atualizarFoto 404 quando id inexistente', async () => {
      prisma.fotoProduto.findUnique.mockResolvedValue(null);

      await expect(service.atualizarFoto('xx', { ordem: 5 })).rejects.toThrow(
        'Foto não encontrada',
      );
    });

    it('removerFoto 404 quando id inexistente', async () => {
      prisma.fotoProduto.findUnique.mockResolvedValue(null);

      await expect(service.removerFoto('xx')).rejects.toThrow('Foto não encontrada');
      expect(prisma.fotoProduto.delete).not.toHaveBeenCalled();
    });

    it('removerFoto deleta quando id existe', async () => {
      prisma.fotoProduto.findUnique.mockResolvedValue({ id: 'f1' });
      prisma.fotoProduto.delete.mockResolvedValue({ id: 'f1' });

      await service.removerFoto('f1');

      expect(prisma.fotoProduto.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    });
  });
});
