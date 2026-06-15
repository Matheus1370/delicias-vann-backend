import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmpresaService } from '../empresa/empresa.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: Record<string, any>;
  let auditService: { log: jest.Mock };
  let empresaService: { getDescontoAtivo: jest.Mock };

  beforeEach(async () => {
    prisma = {
      produto: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      fotoProduto: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      opcaoMontagem: {
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      movimentacaoVitrine: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    empresaService = { getDescontoAtivo: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: EmpresaService, useValue: empresaService },
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

    it('retorna todos os adicionais como UNIDADE', async () => {
      prisma.produto.findMany.mockResolvedValue([
        makeAdicional({ id: 'a', nome: 'Brigadeiro' }),
        makeAdicional({ id: 'b', nome: 'Beijinho de coco' }),
        makeAdicional({ id: 'c', nome: 'Velas numéricas' }),
      ]);

      const result = await service.findAdicionais(10);

      expect(result.itens.every((it) => it.unidade === 'UNIDADE')).toBe(true);
    });

    it('não sugere quantidade (quantidadeSugerida sempre 0)', async () => {
      prisma.produto.findMany.mockResolvedValue([
        makeAdicional({ nome: 'Brigadeiro' }),
        makeAdicional({ id: 'b', nome: 'Velas numéricas' }),
      ]);

      const result = await service.findAdicionais(20);

      expect(result.itens.every((it) => it.quantidadeSugerida === 0)).toBe(true);
    });

    it('retorna meta neutra com numeroPessoas informado', async () => {
      prisma.produto.findMany.mockResolvedValue([]);

      const result = await service.findAdicionais(8);

      expect(result.meta).toEqual({
        numeroPessoas: 8,
        docinhosPorPessoa: 0,
        unidadesPorCento: 100,
        totalSugerido: 0,
      });
    });

    it('meta com numeroPessoas = null quando undefined', async () => {
      prisma.produto.findMany.mockResolvedValue([]);

      const result = await service.findAdicionais(undefined);

      expect(result.meta).toEqual({
        numeroPessoas: null,
        docinhosPorPessoa: 0,
        unidadesPorCento: 100,
        totalSugerido: 0,
      });
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

    it('adiciona 24h quando o peso é 3kg ou mais', async () => {
      prisma.produto.findUnique.mockResolvedValue(
        makeProduto({ leadTimeHoras: 48, opcoesMontagem: [] }),
      );

      const result = await service.calcularLeadTime('p1', {}, 3);

      expect(result.leadTimeHoras).toBe(72);
    });

    it('não adiciona horas extras para peso abaixo de 3kg', async () => {
      prisma.produto.findUnique.mockResolvedValue(
        makeProduto({ leadTimeHoras: 48, opcoesMontagem: [] }),
      );

      const result = await service.calcularLeadTime('p1', {}, 2);

      expect(result.leadTimeHoras).toBe(48);
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

  describe('findKitsPJ (3.5)', () => {
    it('rejeita usuário sem empresa aprovada', async () => {
      empresaService.getDescontoAtivo.mockResolvedValue(null);

      await expect(service.findKitsPJ('user-1')).rejects.toThrow(ForbiddenException);
      expect(prisma.produto.findMany).not.toHaveBeenCalled();
    });

    it('retorna kits filtrados por visivelPJ com preço com desconto aplicado', async () => {
      empresaService.getDescontoAtivo.mockResolvedValue({ empresaId: 'e1', descontoPct: 15 });
      prisma.produto.findMany.mockResolvedValue([
        { id: 'p1', nome: 'Kit café 50 pessoas', precoVenda: '500.00', ativo: true, status: 'ATIVO', visivelPJ: true },
        { id: 'p2', nome: 'Caixa 100 docinhos', precoVenda: '300.00', ativo: true, status: 'ATIVO', visivelPJ: true },
      ]);

      const result = await service.findKitsPJ('user-1');

      expect(prisma.produto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ativo: true, status: 'ATIVO', visivelPJ: true },
        }),
      );
      expect(result.empresa.descontoPct).toBe(15);
      expect(result.kits[0].precoCheio).toBe(500);
      expect(result.kits[0].precoPj).toBe(425);
      expect(result.kits[0].economia).toBe(75);
      expect(result.kits[1].precoCheio).toBe(300);
      expect(result.kits[1].precoPj).toBe(255);
    });

    it('arredonda preços a 2 casas', async () => {
      empresaService.getDescontoAtivo.mockResolvedValue({ empresaId: 'e1', descontoPct: 7 });
      prisma.produto.findMany.mockResolvedValue([
        { id: 'p1', nome: 'X', precoVenda: '99.99', ativo: true, status: 'ATIVO', visivelPJ: true },
      ]);

      const result = await service.findKitsPJ('user-1');

      expect(result.kits[0].precoPj).toBe(92.99);
    });
  });

  describe('findAllPublic (3.5) filtra visivelPJ', () => {
    it('inclui visivelPJ=false implicitamente', async () => {
      prisma.produto.findMany.mockResolvedValue([]);
      await service.findAllPublic({});
      expect(prisma.produto.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ativo: true, visivelPJ: false }),
        }),
      );
    });
  });

  describe('create (cadastro de produto)', () => {
    it('gera slug a partir do nome quando não informado', async () => {
      prisma.produto.findFirst.mockResolvedValue(null);
      prisma.produto.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'p1', ...data }),
      );

      await service.create({ nome: 'Bolo de Cenoura', precoVenda: 50 }, 'admin');

      expect(prisma.produto.create.mock.calls[0][0].data.slug).toBe('bolo-de-cenoura');
    });

    it('remove acentos e caracteres especiais no slug', async () => {
      prisma.produto.findFirst.mockResolvedValue(null);
      prisma.produto.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'p1', ...data }),
      );

      await service.create({ nome: 'Pão de Mel & Cia!', precoVenda: 10 }, 'admin');

      expect(prisma.produto.create.mock.calls[0][0].data.slug).toBe('pao-de-mel-cia');
    });

    it('adiciona sufixo numérico quando o slug já existe', async () => {
      prisma.produto.findFirst
        .mockResolvedValueOnce({ id: 'existente' })
        .mockResolvedValueOnce(null);
      prisma.produto.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'p1', ...data }),
      );

      await service.create({ nome: 'Brigadeiro', precoVenda: 3 }, 'admin');

      expect(prisma.produto.create.mock.calls[0][0].data.slug).toBe('brigadeiro-2');
    });

    it('rejeita quando falta nome', async () => {
      await expect(service.create({ precoVenda: 10 }, 'admin')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejeita quando preço é inválido', async () => {
      await expect(service.create({ nome: 'X', precoVenda: -1 }, 'admin')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ignora campos fora da whitelist (estoqueVitrine, campo desconhecido)', async () => {
      prisma.produto.findFirst.mockResolvedValue(null);
      prisma.produto.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'p1', ...data }),
      );

      await service.create(
        { nome: 'X', precoVenda: 10, estoqueVitrine: 99, campoQualquer: 'hack' },
        'admin',
      );

      const data = prisma.produto.create.mock.calls[0][0].data;
      expect(data.estoqueVitrine).toBeUndefined();
      expect(data.campoQualquer).toBeUndefined();
    });

    it('cria movimentação ENTRADA quando estoqueInicial > 0', async () => {
      prisma.produto.findFirst.mockResolvedValue(null);
      prisma.produto.create.mockResolvedValue({ id: 'p1', estoqueVitrine: 0 });
      prisma.produto.findUnique.mockResolvedValue({ id: 'p1', estoqueVitrine: 0 });
      prisma.produto.update.mockResolvedValue({ id: 'p1', estoqueVitrine: 8 });
      prisma.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prisma));

      await service.create({ nome: 'Bolo', precoVenda: 50, estoqueInicial: 8 }, 'admin');

      expect(prisma.movimentacaoVitrine.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tipo: 'ENTRADA', quantidade: 8 }),
        }),
      );
    });

    it('não cria movimentação quando estoqueInicial é 0', async () => {
      prisma.produto.findFirst.mockResolvedValue(null);
      prisma.produto.create.mockResolvedValue({ id: 'p1', estoqueVitrine: 0 });

      await service.create({ nome: 'Bolo', precoVenda: 50 }, 'admin');

      expect(prisma.movimentacaoVitrine.create).not.toHaveBeenCalled();
    });
  });

  describe('update (whitelist)', () => {
    it('descarta estoqueVitrine e campos desconhecidos', async () => {
      prisma.produto.findUnique.mockResolvedValue({
        id: 'p1',
        categoria: null,
        fichasTecnicas: [],
      });
      prisma.produto.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'p1', ...data }),
      );

      await service.update('p1', { nome: 'Novo', estoqueVitrine: 50, hack: 1 }, 'admin');

      const data = prisma.produto.update.mock.calls[0][0].data;
      expect(data.nome).toBe('Novo');
      expect(data.estoqueVitrine).toBeUndefined();
      expect(data.hack).toBeUndefined();
    });
  });

  describe('movimentarVitrine', () => {
    beforeEach(() => {
      prisma.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prisma));
    });

    it('404 quando produto não existe', async () => {
      prisma.produto.findUnique.mockResolvedValue(null);
      await expect(
        service.movimentarVitrine('x', { tipo: 'ENTRADA', quantidade: 5 }, 'admin'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejeita tipo de movimentação inválido (ex: SAIDA_VENDA manual)', async () => {
      await expect(
        service.movimentarVitrine('p1', { tipo: 'SAIDA_VENDA' as any, quantidade: 5 }, 'admin'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.produto.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita quantidade não positiva', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 'p1', estoqueVitrine: 10 });
      await expect(
        service.movimentarVitrine('p1', { tipo: 'ENTRADA', quantidade: 0 }, 'admin'),
      ).rejects.toThrow(BadRequestException);
    });

    it('ENTRADA incrementa estoque e registra movimentação', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 'p1', estoqueVitrine: 10 });
      prisma.produto.update.mockResolvedValue({ id: 'p1', estoqueVitrine: 15 });

      await service.movimentarVitrine(
        'p1',
        { tipo: 'ENTRADA', quantidade: 5, motivo: 'reposição' },
        'admin',
      );

      expect(prisma.produto.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { estoqueVitrine: 15 },
      });
      expect(prisma.movimentacaoVitrine.create).toHaveBeenCalledWith({
        data: {
          produtoId: 'p1',
          tipo: 'ENTRADA',
          quantidade: 5,
          motivo: 'reposição',
          operadorId: 'admin',
        },
      });
    });

    it('QUEBRA_DESPERDICIO decrementa estoque', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 'p1', estoqueVitrine: 10 });
      prisma.produto.update.mockResolvedValue({ id: 'p1', estoqueVitrine: 7 });

      await service.movimentarVitrine(
        'p1',
        { tipo: 'QUEBRA_DESPERDICIO', quantidade: 3 },
        'admin',
      );

      expect(prisma.produto.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { estoqueVitrine: 7 },
      });
    });

    it('rejeita estoque negativo', async () => {
      prisma.produto.findUnique.mockResolvedValue({ id: 'p1', estoqueVitrine: 2 });
      await expect(
        service.movimentarVitrine('p1', { tipo: 'AJUSTE_NEGATIVO', quantidade: 5 }, 'admin'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listarProdutosAdmin', () => {
    it('monta where com filtros e inclui categoria', async () => {
      prisma.produto.findMany.mockResolvedValue([]);
      await service.listarProdutosAdmin({
        tipo: 'PADRAO',
        status: 'ATIVO',
        categoriaId: 'c1',
        busca: 'bolo',
      });
      expect(prisma.produto.findMany).toHaveBeenCalledWith({
        where: {
          tipo: 'PADRAO',
          status: 'ATIVO',
          categoriaId: 'c1',
          nome: { contains: 'bolo', mode: 'insensitive' },
        },
        include: { categoria: true },
        orderBy: { nome: 'asc' },
      });
    });

    it('sem filtros retorna todos', async () => {
      prisma.produto.findMany.mockResolvedValue([]);
      await service.listarProdutosAdmin({});
      expect(prisma.produto.findMany).toHaveBeenCalledWith({
        where: {},
        include: { categoria: true },
        orderBy: { nome: 'asc' },
      });
    });
  });

  describe('listarMovimentacoesVitrine', () => {
    it('busca últimas 20 do produto', async () => {
      prisma.movimentacaoVitrine.findMany.mockResolvedValue([]);
      await service.listarMovimentacoesVitrine('p1');
      expect(prisma.movimentacaoVitrine.findMany).toHaveBeenCalledWith({
        where: { produtoId: 'p1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    });
  });

  describe('admin do montar bolo', () => {
    describe('findMontaveis', () => {
      it('busca produtos MONTAVEL com opções (inclusive inativas)', async () => {
        prisma.produto.findMany.mockResolvedValue([]);
        await service.findMontaveis();
        expect(prisma.produto.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { tipo: 'MONTAVEL' },
            include: expect.objectContaining({
              opcoesMontagem: expect.objectContaining({
                orderBy: [{ etapa: 'asc' }, { ordem: 'asc' }],
              }),
            }),
          }),
        );
      });
    });

    describe('atualizarPrecoMontavel', () => {
      it('atualiza precoVenda e precoPorKg', async () => {
        prisma.produto.findUnique.mockResolvedValue({ id: 'p1', precoVenda: 80, precoPorKg: 80 });
        prisma.produto.update.mockResolvedValue({ id: 'p1', precoVenda: 90, precoPorKg: 95 });

        await service.atualizarPrecoMontavel('p1', { precoVenda: 90, precoPorKg: 95 }, 'admin');

        expect(prisma.produto.update).toHaveBeenCalledWith({
          where: { id: 'p1' },
          data: { precoVenda: 90, precoPorKg: 95 },
        });
        expect(auditService.log).toHaveBeenCalled();
      });

      it('404 quando produto não existe', async () => {
        prisma.produto.findUnique.mockResolvedValue(null);
        await expect(
          service.atualizarPrecoMontavel('x', { precoPorKg: 90 }, 'admin'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('criarOpcao', () => {
      it('cria opção válida com extras default 0', async () => {
        prisma.produto.findUnique.mockResolvedValue({ id: 'p1', tipo: 'MONTAVEL' });
        prisma.opcaoMontagem.create.mockResolvedValue({ id: 'op1' });

        await service.criarOpcao('p1', { etapa: 'recheio', label: 'Ninho' }, 'admin');

        expect(prisma.opcaoMontagem.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            produtoId: 'p1',
            etapa: 'recheio',
            label: 'Ninho',
            precoExtra: 0,
            precoExtraPorKg: 0,
          }),
        });
      });

      it('normaliza etapa para minúsculas', async () => {
        prisma.produto.findUnique.mockResolvedValue({ id: 'p1' });
        prisma.opcaoMontagem.create.mockResolvedValue({ id: 'op1' });
        await service.criarOpcao('p1', { etapa: 'Massa', label: 'Cenoura' }, 'admin');
        expect(prisma.opcaoMontagem.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ etapa: 'massa' }),
        });
      });

      it('rejeita etapa inválida (ex.: tamanho, que é o seletor de kg)', async () => {
        prisma.produto.findUnique.mockResolvedValue({ id: 'p1' });
        await expect(
          service.criarOpcao('p1', { etapa: 'tamanho', label: '2kg' }, 'admin'),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.opcaoMontagem.create).not.toHaveBeenCalled();
      });

      it('rejeita label vazio', async () => {
        prisma.produto.findUnique.mockResolvedValue({ id: 'p1' });
        await expect(
          service.criarOpcao('p1', { etapa: 'recheio', label: '   ' }, 'admin'),
        ).rejects.toThrow(BadRequestException);
      });

      it('404 quando produto não existe', async () => {
        prisma.produto.findUnique.mockResolvedValue(null);
        await expect(
          service.criarOpcao('x', { etapa: 'recheio', label: 'Ninho' }, 'admin'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('atualizarOpcao', () => {
      it('atualiza apenas os campos enviados', async () => {
        prisma.opcaoMontagem.findUnique.mockResolvedValue({ id: 'op1', etapa: 'recheio' });
        prisma.opcaoMontagem.update.mockResolvedValue({ id: 'op1' });

        await service.atualizarOpcao('op1', { precoExtraPorKg: 12, ativa: false }, 'admin');

        expect(prisma.opcaoMontagem.update).toHaveBeenCalledWith({
          where: { id: 'op1' },
          data: { precoExtraPorKg: 12, ativa: false },
        });
      });

      it('404 quando opção não existe', async () => {
        prisma.opcaoMontagem.findUnique.mockResolvedValue(null);
        await expect(
          service.atualizarOpcao('x', { ativa: false }, 'admin'),
        ).rejects.toThrow(NotFoundException);
      });

      it('rejeita troca para etapa inválida', async () => {
        prisma.opcaoMontagem.findUnique.mockResolvedValue({ id: 'op1' });
        await expect(
          service.atualizarOpcao('op1', { etapa: 'tamanho' }, 'admin'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('removerOpcao', () => {
      it('remove opção existente', async () => {
        prisma.opcaoMontagem.findUnique.mockResolvedValue({ id: 'op1' });
        prisma.opcaoMontagem.delete.mockResolvedValue({});
        const r = await service.removerOpcao('op1', 'admin');
        expect(r).toEqual({ ok: true });
        expect(prisma.opcaoMontagem.delete).toHaveBeenCalledWith({ where: { id: 'op1' } });
      });

      it('404 quando opção não existe', async () => {
        prisma.opcaoMontagem.findUnique.mockResolvedValue(null);
        await expect(service.removerOpcao('x', 'admin')).rejects.toThrow(NotFoundException);
      });
    });
  });
});
