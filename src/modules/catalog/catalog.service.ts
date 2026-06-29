import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmpresaService } from '../empresa/empresa.service';

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private empresa: EmpresaService,
  ) {}

  private readonly CAMPOS_PRODUTO = [
    'nome',
    'slug',
    'descricao',
    'tipo',
    'fulfillment',
    'precoVenda',
    'precoPorKg',
    'pontosEsforco',
    'status',
    'leadTimeHoras',
    'categoriaId',
    'imagemUrl',
    'alergenicos',
    'destaqueUpsell',
    'modalidadesPermitidas',
    'visivelPJ',
    'ativo',
  ];

  private pickProdutoFields(data: any) {
    const out: any = {};
    for (const campo of this.CAMPOS_PRODUTO) {
      if (data[campo] !== undefined) out[campo] = data[campo];
    }
    return out;
  }

  private slugify(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async gerarSlugUnico(nome: string): Promise<string> {
    const base = this.slugify(nome);
    let slug = base;
    let n = 2;
    while (await this.prisma.produto.findFirst({ where: { slug } })) {
      slug = `${base}-${n}`;
      n += 1;
    }
    return slug;
  }

  async findAllPublic(query: { categoria?: string; tipo?: string; disponivel?: string }) {
    const where: any = { ativo: true, visivelPJ: false };
    if (query.categoria) where.categoria = { slug: query.categoria };
    if (query.tipo) where.tipo = query.tipo;

    const produtos = await this.prisma.produto.findMany({
      where,
      include: {
        categoria: true,
        opcoesMontagem: { where: { ativa: true }, orderBy: { ordem: 'asc' } },
        fotos: { orderBy: { ordem: 'asc' } },
      },
      orderBy: { nome: 'asc' },
    });

    return produtos.map((p) => ({
      ...p,
      disponivel: p.status === 'ATIVO' && (p.estoqueVitrine > 0 || p.fulfillment !== 'MAKE_TO_STOCK'),
    }));
  }

  async findBySlug(slug: string) {
    const produto = await this.prisma.produto.findUnique({
      where: { slug },
      include: {
        categoria: true,
        opcoesMontagem: { where: { ativa: true }, orderBy: [{ etapa: 'asc' }, { ordem: 'asc' }] },
        fotos: { orderBy: { ordem: 'asc' } },
      },
    });
    if (!produto || !produto.ativo) throw new NotFoundException('Produto não encontrado');
    return produto;
  }

  async listarFotos(produtoId: string) {
    return this.prisma.fotoProduto.findMany({
      where: { produtoId },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async adicionarFoto(
    produtoId: string,
    data: { url: string; tipo?: 'PRINCIPAL' | 'CORTADO' | 'DETALHE'; ordem?: number },
  ) {
    const produto = await this.prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto) throw new NotFoundException('Produto não encontrado');
    return this.prisma.fotoProduto.create({
      data: {
        produtoId,
        url: data.url,
        tipo: data.tipo ?? 'DETALHE',
        ordem: data.ordem ?? 0,
      },
    });
  }

  async atualizarFoto(
    fotoId: string,
    data: Partial<{ url: string; tipo: 'PRINCIPAL' | 'CORTADO' | 'DETALHE'; ordem: number }>,
  ) {
    const existente = await this.prisma.fotoProduto.findUnique({ where: { id: fotoId } });
    if (!existente) throw new NotFoundException('Foto não encontrada');
    return this.prisma.fotoProduto.update({ where: { id: fotoId }, data });
  }

  async removerFoto(fotoId: string) {
    const existente = await this.prisma.fotoProduto.findUnique({ where: { id: fotoId } });
    if (!existente) throw new NotFoundException('Foto não encontrada');
    await this.prisma.fotoProduto.delete({ where: { id: fotoId } });
  }

  async findKitsPJ(usuarioId: string) {
    const desconto = await this.empresa.getDescontoAtivo(usuarioId);
    if (!desconto) {
      throw new ForbiddenException('Acesso restrito a empresas aprovadas');
    }
    const produtos = await this.prisma.produto.findMany({
      where: { ativo: true, status: 'ATIVO', visivelPJ: true },
      include: {
        categoria: true,
        fotos: { orderBy: { ordem: 'asc' } },
      },
      orderBy: { nome: 'asc' },
    });
    return {
      empresa: { descontoPct: desconto.descontoPct },
      kits: produtos.map((p) => {
        const precoCheio = Number(p.precoVenda);
        const precoPj = +(precoCheio * (1 - desconto.descontoPct / 100)).toFixed(2);
        return {
          ...p,
          precoCheio,
          precoPj,
          economia: +(precoCheio - precoPj).toFixed(2),
        };
      }),
    };
  }

  async findUpsellItems() {
    const produtos = await this.prisma.produto.findMany({
      where: { ativo: true, destaqueUpsell: true, status: 'ATIVO' },
      orderBy: { nome: 'asc' },
    });
    return produtos;
  }

  async findAdicionais(numeroPessoas?: number) {
    const produtos = await this.prisma.produto.findMany({
      where: {
        ativo: true,
        status: 'ATIVO',
        tipo: 'ADICIONAL',
      },
      orderBy: { nome: 'asc' },
    });

    const itens = produtos.map((p) => ({
      ...p,
      unidade: 'UNIDADE',
      quantidadeSugerida: 0,
    }));

    return {
      itens,
      meta: {
        numeroPessoas: numeroPessoas ?? null,
        docinhosPorPessoa: 0,
        unidadesPorCento: 100,
        totalSugerido: 0,
      },
    };
  }

  async calcularLeadTime(
    produtoId: string,
    opcoesEscolhidas: Record<string, string>,
    pesoKg?: number,
  ): Promise<{ leadTimeHoras: number; leadTimeDias: number }> {
    const produto = await this.prisma.produto.findUnique({
      where: { id: produtoId },
      include: { opcoesMontagem: true },
    });
    if (!produto) return { leadTimeHoras: 0, leadTimeDias: 0 };

    const labelsEscolhidos = new Set(
      Object.values(opcoesEscolhidas)
        .filter(Boolean)
        .map((l) => l.toLowerCase()),
    );

    const extras = produto.opcoesMontagem
      .filter((op) => labelsEscolhidos.has(op.label.toLowerCase()))
      .reduce((acc, op) => acc + (op.leadTimeHorasExtra ?? 0), 0);

    const extraPeso = (pesoKg ?? 0) >= 3 ? 24 : 0;
    const leadTimeHoras = produto.leadTimeHoras + extras + extraPeso;
    return {
      leadTimeHoras,
      leadTimeDias: Math.ceil(leadTimeHoras / 24),
    };
  }

  async findCategories() {
    return this.prisma.categoria.findMany({
      where: { ativa: true },
      orderBy: { ordem: 'asc' },
    });
  }

  async create(data: any, usuarioId: string) {
    const nome = String(data.nome ?? '').trim();
    if (!nome) throw new BadRequestException('Informe o nome do produto');
    if (
      data.precoVenda === undefined ||
      data.precoVenda === null ||
      Number(data.precoVenda) < 0
    ) {
      throw new BadRequestException('Informe um preço de venda válido');
    }

    const slug = data.slug
      ? this.slugify(String(data.slug))
      : await this.gerarSlugUnico(nome);
    const payload = this.pickProdutoFields({ ...data, nome, slug });

    const produto = await this.prisma.produto.create({ data: payload });
    await this.audit.log({
      acao: 'PRODUCT.CREATED',
      entidade: 'Produto',
      entidadeId: produto.id,
      payloadDepois: produto,
      usuarioId,
    });

    const estoqueInicial = Number(data.estoqueInicial ?? 0);
    if (estoqueInicial > 0) {
      await this.movimentarVitrine(
        produto.id,
        { tipo: 'ENTRADA', quantidade: estoqueInicial, motivo: 'Estoque inicial' },
        usuarioId,
      );
    }

    return produto;
  }

  async update(id: string, data: any, usuarioId: string) {
    const antes = await this.prisma.produto.findUnique({
      where: { id },
      include: {
        categoria: true,
        fichasTecnicas: { where: { tipo: 'FINANCEIRA', ativa: true }, take: 1 },
      },
    });
    if (!antes) throw new NotFoundException('Produto não encontrado');

    const produto = await this.prisma.produto.update({
      where: { id },
      data: this.pickProdutoFields(data),
    });

    if (data.precoVenda !== undefined && antes.fichasTecnicas[0]) {
      const novoCusto = Number(antes.fichasTecnicas[0].custoCalculado);
      const novoPreco = Number(data.precoVenda);
      const novaMargem = novoPreco > 0 ? ((novoPreco - novoCusto) / novoPreco) * 100 : 0;
      const margemMinima = Number(antes.categoria?.margemMinima ?? 35);

      if (novaMargem < margemMinima) {
        await this.prisma.produto.update({
          where: { id },
          data: { status: 'REVISAO_MARGEM' },
        });
        await this.prisma.fichaTecnica.update({
          where: { id: antes.fichasTecnicas[0].id },
          data: { margemCalculada: novaMargem },
        });
      }
    }

    await this.audit.log({
      acao: 'PRODUCT.UPDATED',
      entidade: 'Produto',
      entidadeId: id,
      payloadAntes: antes,
      payloadDepois: produto,
      usuarioId,
    });
    return produto;
  }

  async approveMargin(id: string, justificativa: string, usuarioId: string) {
    const ficha = await this.prisma.fichaTecnica.findFirst({
      where: { produtoId: id, tipo: 'FINANCEIRA', ativa: true },
    });
    if (!ficha) throw new NotFoundException('Ficha técnica não encontrada');

    const [produto] = await this.prisma.$transaction([
      this.prisma.produto.update({ where: { id }, data: { status: 'ATIVO' } }),
      this.prisma.margemAprovacao.create({
        data: {
          fichaTecnicaId: ficha.id,
          aprovadoPorId: usuarioId,
          margemAnterior: ficha.margemCalculada,
          margemNova: ficha.margemCalculada,
          justificativa,
        },
      }),
      this.prisma.fichaTecnica.update({
        where: { id: ficha.id },
        data: { aprovadoPorId: usuarioId, aprovadoEm: new Date() },
      }),
    ]);

    await this.audit.log({
      acao: 'PRODUCT.MARGIN_APPROVED',
      entidade: 'Produto',
      entidadeId: id,
      usuarioId,
    });
    return produto;
  }

  async movimentarVitrine(
    produtoId: string,
    data: {
      tipo: 'ENTRADA' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'QUEBRA_DESPERDICIO';
      quantidade: number;
      motivo?: string;
    },
    operadorId: string,
  ) {
    const tiposPermitidos = ['ENTRADA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'QUEBRA_DESPERDICIO'];
    if (!tiposPermitidos.includes(data.tipo)) {
      throw new BadRequestException('Tipo de movimentação inválido');
    }
    const produto = await this.prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto) throw new NotFoundException('Produto não encontrado');
    if (!Number.isInteger(data.quantidade) || data.quantidade <= 0) {
      throw new BadRequestException('Quantidade deve ser um inteiro positivo');
    }

    const sinal = data.tipo === 'ENTRADA' || data.tipo === 'AJUSTE_POSITIVO' ? 1 : -1;
    const novoEstoque = produto.estoqueVitrine + sinal * data.quantidade;
    if (novoEstoque < 0) {
      throw new BadRequestException('Estoque de vitrine não pode ficar negativo');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.produto.update({
        where: { id: produtoId },
        data: { estoqueVitrine: novoEstoque },
      });
      await tx.movimentacaoVitrine.create({
        data: {
          produtoId,
          tipo: data.tipo,
          quantidade: data.quantidade,
          motivo: data.motivo,
          operadorId,
        },
      });
      await this.audit.log({
        acao: `VITRINE.${data.tipo}`,
        entidade: 'Produto',
        entidadeId: produtoId,
        payloadAntes: { estoqueVitrine: produto.estoqueVitrine },
        payloadDepois: { estoqueVitrine: novoEstoque },
        usuarioId: operadorId,
      });
      return atualizado;
    });
  }

  async listarProdutosAdmin(filtros: {
    tipo?: string;
    status?: string;
    categoriaId?: string;
    busca?: string;
  }) {
    const where: any = {};
    if (filtros.tipo) where.tipo = filtros.tipo;
    if (filtros.status) where.status = filtros.status;
    if (filtros.categoriaId) where.categoriaId = filtros.categoriaId;
    if (filtros.busca) where.nome = { contains: filtros.busca, mode: 'insensitive' };

    return this.prisma.produto.findMany({
      where,
      include: { categoria: true },
      orderBy: { nome: 'asc' },
    });
  }

  async listarMovimentacoesVitrine(produtoId: string) {
    return this.prisma.movimentacaoVitrine.findMany({
      where: { produtoId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  private readonly ETAPAS_VALIDAS = ['massa', 'recheio', 'cobertura', 'topo'];

  private validarEtapa(etapa?: string) {
    if (!etapa || !this.ETAPAS_VALIDAS.includes(etapa.toLowerCase())) {
      throw new BadRequestException(
        `Etapa inválida. Use uma de: ${this.ETAPAS_VALIDAS.join(', ')}.`,
      );
    }
  }

  async findMontaveis() {
    return this.prisma.produto.findMany({
      where: { tipo: 'MONTAVEL' },
      orderBy: { nome: 'asc' },
      include: {
        opcoesMontagem: { orderBy: [{ etapa: 'asc' }, { ordem: 'asc' }] },
      },
    });
  }

  async atualizarPrecoMontavel(
    id: string,
    data: { precoVenda?: number; precoPorKg?: number },
    usuarioId: string,
  ) {
    const produto = await this.prisma.produto.findUnique({ where: { id } });
    if (!produto) throw new NotFoundException('Produto não encontrado');

    const update: any = {};
    if (data.precoVenda !== undefined) update.precoVenda = data.precoVenda;
    if (data.precoPorKg !== undefined) update.precoPorKg = data.precoPorKg;

    const atualizado = await this.prisma.produto.update({ where: { id }, data: update });
    await this.audit.log({
      acao: 'PRODUCT.PRICE_UPDATED',
      entidade: 'Produto',
      entidadeId: id,
      payloadAntes: { precoVenda: produto.precoVenda, precoPorKg: produto.precoPorKg },
      payloadDepois: update,
      usuarioId,
    });
    return atualizado;
  }

  async criarOpcao(
    produtoId: string,
    data: {
      etapa: string;
      label: string;
      descricao?: string;
      precoExtra?: number;
      precoExtraPorKg?: number;
      pontosExtra?: number;
      leadTimeHorasExtra?: number;
      ordem?: number;
    },
    usuarioId: string,
  ) {
    const produto = await this.prisma.produto.findUnique({ where: { id: produtoId } });
    if (!produto) throw new NotFoundException('Produto não encontrado');
    this.validarEtapa(data.etapa);
    if (!data.label?.trim()) throw new BadRequestException('Informe o nome da opção');

    const opcao = await this.prisma.opcaoMontagem.create({
      data: {
        produtoId,
        etapa: data.etapa.toLowerCase(),
        label: data.label.trim(),
        descricao: data.descricao?.trim() || null,
        precoExtra: data.precoExtra ?? 0,
        precoExtraPorKg: data.precoExtraPorKg ?? 0,
        pontosExtra: data.pontosExtra ?? 0,
        leadTimeHorasExtra: data.leadTimeHorasExtra ?? 0,
        ordem: data.ordem ?? 0,
      },
    });
    await this.audit.log({
      acao: 'OPCAO_MONTAGEM.CREATED',
      entidade: 'OpcaoMontagem',
      entidadeId: opcao.id,
      payloadDepois: opcao,
      usuarioId,
    });
    return opcao;
  }

  async atualizarOpcao(
    opcaoId: string,
    data: {
      etapa?: string;
      label?: string;
      descricao?: string;
      precoExtra?: number;
      precoExtraPorKg?: number;
      pontosExtra?: number;
      leadTimeHorasExtra?: number;
      ordem?: number;
      ativa?: boolean;
    },
    usuarioId: string,
  ) {
    const antes = await this.prisma.opcaoMontagem.findUnique({ where: { id: opcaoId } });
    if (!antes) throw new NotFoundException('Opção não encontrada');
    if (data.etapa !== undefined) this.validarEtapa(data.etapa);

    const update: any = {};
    for (const campo of [
      'label',
      'descricao',
      'precoExtra',
      'precoExtraPorKg',
      'pontosExtra',
      'leadTimeHorasExtra',
      'ordem',
      'ativa',
    ] as const) {
      if (data[campo] !== undefined) update[campo] = data[campo];
    }
    if (data.etapa !== undefined) update.etapa = data.etapa.toLowerCase();
    if (typeof update.label === 'string') update.label = update.label.trim();

    const opcao = await this.prisma.opcaoMontagem.update({
      where: { id: opcaoId },
      data: update,
    });
    await this.audit.log({
      acao: 'OPCAO_MONTAGEM.UPDATED',
      entidade: 'OpcaoMontagem',
      entidadeId: opcaoId,
      payloadAntes: antes,
      payloadDepois: opcao,
      usuarioId,
    });
    return opcao;
  }

  async removerOpcao(opcaoId: string, usuarioId: string) {
    const antes = await this.prisma.opcaoMontagem.findUnique({ where: { id: opcaoId } });
    if (!antes) throw new NotFoundException('Opção não encontrada');
    await this.prisma.opcaoMontagem.delete({ where: { id: opcaoId } });
    await this.audit.log({
      acao: 'OPCAO_MONTAGEM.DELETED',
      entidade: 'OpcaoMontagem',
      entidadeId: opcaoId,
      payloadAntes: antes,
      usuarioId,
    });
    return { ok: true };
  }
}
