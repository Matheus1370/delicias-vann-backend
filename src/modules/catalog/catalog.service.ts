import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CatalogService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAllPublic(query: { categoria?: string; tipo?: string; disponivel?: string }) {
    const where: any = { ativo: true };
    if (query.categoria) where.categoria = { slug: query.categoria };
    if (query.tipo) where.tipo = query.tipo;

    const produtos = await this.prisma.produto.findMany({
      where,
      include: {
        categoria: true,
        opcoesMontagem: { where: { ativa: true }, orderBy: { ordem: 'asc' } },
        fichasTecnicas: {
          where: { tipo: 'FINANCEIRA', ativa: true },
          select: { custoCalculado: true, margemCalculada: true },
          take: 1,
        },
      },
      orderBy: { nome: 'asc' },
    });

    return produtos.map(({ fichasTecnicas, ...p }) => ({
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
      },
    });
    if (!produto || !produto.ativo) throw new NotFoundException('Produto não encontrado');
    return produto;
  }

  async findUpsellItems() {
    const produtos = await this.prisma.produto.findMany({
      where: { ativo: true, destaqueUpsell: true, status: 'ATIVO' },
      orderBy: { nome: 'asc' },
    });
    return produtos;
  }

  /**
   * Lista produtos do tipo ADICIONAL ativos, com sugestão de quantidade
   * baseada no número de pessoas (passo 0 do wizard).
   *
   * Heurística de classificação:
   * - "porção" (sugere DOCINHOS_POR_PESSOA × pessoas): nome contém "doce",
   *   "docinho", "brigadeiro", "beijinho", "casadinho", "copinho".
   * - "unidade" (default 0, cliente decide se quer): demais (velas, cartão, foto).
   */
  async findAdicionais(numeroPessoas?: number) {
    const DOCINHOS_POR_PESSOA = 5;
    const REGEX_PORCAO = /\b(doce|docinho|brigadeiro|beijinho|casadinho|copinho)/i;

    const produtos = await this.prisma.produto.findMany({
      where: {
        ativo: true,
        status: 'ATIVO',
        tipo: 'ADICIONAL',
      },
      orderBy: { nome: 'asc' },
    });

    const itens = produtos.map((p) => {
      const ehPorcao = REGEX_PORCAO.test(p.nome);
      const quantidadeSugerida =
        ehPorcao && numeroPessoas && numeroPessoas > 0
          ? numeroPessoas * DOCINHOS_POR_PESSOA
          : 0;
      return {
        ...p,
        unidade: ehPorcao ? 'PORCAO' : 'UNIDADE',
        quantidadeSugerida,
      };
    });

    return {
      itens,
      meta: {
        numeroPessoas: numeroPessoas ?? null,
        docinhosPorPessoa: DOCINHOS_POR_PESSOA,
        totalSugerido:
          numeroPessoas && numeroPessoas > 0 ? numeroPessoas * DOCINHOS_POR_PESSOA : 0,
      },
    };
  }

  async findCategories() {
    return this.prisma.categoria.findMany({
      where: { ativa: true },
      orderBy: { ordem: 'asc' },
    });
  }

  async create(data: any, usuarioId: string) {
    const produto = await this.prisma.produto.create({ data });
    await this.audit.log({
      acao: 'PRODUCT.CREATED',
      entidade: 'Produto',
      entidadeId: produto.id,
      payloadDepois: produto,
      usuarioId,
    });
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

    const produto = await this.prisma.produto.update({ where: { id }, data });

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
}
