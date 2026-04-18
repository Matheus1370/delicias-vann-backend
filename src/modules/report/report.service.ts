import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  async overview(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const whereFat = {
      createdAt: { gte: since },
      status: { notIn: ['CANCELADO' as const, 'AGUARDANDO_PAGAMENTO' as const] },
    };

    const [
      totalPedidos,
      statusCounts,
      faturamento,
      topProdutos,
      insumosAll,
      produtosRevisao,
      ticketAgg,
      custoAgg,
      cancelamentos,
    ] = await Promise.all([
      this.prisma.pedido.count({ where: { createdAt: { gte: since } } }),
      this.prisma.pedido.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: true,
      }),
      this.prisma.pedido.aggregate({
        where: whereFat,
        _sum: { valorTotal: true, valorDesconto: true },
      }),
      this.prisma.itemPedido.groupBy({
        by: ['produtoId'],
        where: {
          pedido: {
            createdAt: { gte: since },
            status: { notIn: ['CANCELADO'] },
          },
        },
        _sum: { quantidade: true },
        orderBy: { _sum: { quantidade: 'desc' } },
        take: 5,
      }),
      this.prisma.insumo.findMany({ where: { ativo: true } }),
      this.prisma.produto.count({ where: { status: 'REVISAO_MARGEM' } }),
      this.prisma.pedido.aggregate({
        where: whereFat,
        _avg: { valorTotal: true },
      }),
      this.prisma.itemPedido.aggregate({
        where: { pedido: whereFat },
        _sum: { snapshotCustoProducao: true },
      }),
      this.prisma.pedido.groupBy({
        by: ['canceladoMotivo'],
        where: {
          createdAt: { gte: since },
          status: 'CANCELADO',
          canceladoMotivo: { not: null },
        },
        _count: true,
      }),
    ]);

    const produtoIds = topProdutos.map((t) => t.produtoId);
    const produtosMap = produtoIds.length
      ? await this.prisma.produto
          .findMany({
            where: { id: { in: produtoIds } },
            select: { id: true, nome: true, slug: true },
          })
          .then((ps) => new Map(ps.map((p) => [p.id, p])))
      : new Map();

    const faturamentoTotal = Number(faturamento._sum.valorTotal ?? 0);
    const custoTotal = Number(custoAgg._sum.snapshotCustoProducao ?? 0);
    const margemBrutaPct =
      faturamentoTotal > 0 ? ((faturamentoTotal - custoTotal) / faturamentoTotal) * 100 : 0;

    return {
      periodoDias: days,
      totalPedidos,
      faturamento: faturamentoTotal,
      descontoConcedido: Number(faturamento._sum.valorDesconto ?? 0),
      custoTotalInsumos: custoTotal,
      margemBrutaPct: +margemBrutaPct.toFixed(1),
      ticketMedio: +Number(ticketAgg._avg.valorTotal ?? 0).toFixed(2),
      porStatus: statusCounts.map((s) => ({ status: s.status, total: s._count })),
      topProdutos: topProdutos.map((t) => ({
        produtoId: t.produtoId,
        nome: produtosMap.get(t.produtoId)?.nome ?? '—',
        slug: produtosMap.get(t.produtoId)?.slug,
        quantidade: t._sum.quantidade ?? 0,
      })),
      insumosAbaixoDoMinimo: insumosAll.filter(
        (i) => Number(i.estoqueAtual) <= Number(i.pontoReposicao),
      ).length,
      produtosRevisaoMargem: produtosRevisao,
      cancelamentosPorMotivo: cancelamentos.map((c) => ({
        motivo: c.canceladoMotivo,
        total: c._count,
      })),
    };
  }

  async vendasDiarias(days = 14) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - days + 1);

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        createdAt: { gte: since },
        status: { notIn: ['CANCELADO', 'AGUARDANDO_PAGAMENTO'] },
      },
      select: { createdAt: true, valorTotal: true },
    });

    const buckets = new Map<string, { pedidos: number; faturamento: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(d.toISOString().split('T')[0], { pedidos: 0, faturamento: 0 });
    }

    for (const p of pedidos) {
      const key = p.createdAt.toISOString().split('T')[0];
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.pedidos += 1;
        bucket.faturamento += Number(p.valorTotal);
      }
    }

    return Array.from(buckets.entries()).map(([data, v]) => ({ data, ...v }));
  }

  async margemPorProduto(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const itens = await this.prisma.itemPedido.groupBy({
      by: ['produtoId'],
      where: {
        pedido: {
          createdAt: { gte: since },
          status: { notIn: ['CANCELADO'] },
        },
      },
      _sum: {
        quantidade: true,
      },
      _avg: {
        precoUnitario: true,
        snapshotCustoProducao: true,
      },
    });

    const produtos = await this.prisma.produto.findMany({
      where: { id: { in: itens.map((i) => i.produtoId) } },
      select: { id: true, nome: true, slug: true },
    });
    const mapa = new Map(produtos.map((p) => [p.id, p]));

    return itens
      .map((i) => {
        const preco = Number(i._avg.precoUnitario ?? 0);
        const custo = Number(i._avg.snapshotCustoProducao ?? 0);
        const margemPct = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
        return {
          produtoId: i.produtoId,
          nome: mapa.get(i.produtoId)?.nome ?? '—',
          slug: mapa.get(i.produtoId)?.slug,
          quantidadeVendida: i._sum.quantidade ?? 0,
          precoMedio: preco,
          custoMedio: custo,
          margemPct: +margemPct.toFixed(1),
          receitaTotal: preco * (i._sum.quantidade ?? 0),
        };
      })
      .sort((a, b) => b.receitaTotal - a.receitaTotal);
  }

  async cohortRetencao(days = 90) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const clientes = await this.prisma.pedido.groupBy({
      by: ['clienteId'],
      where: { createdAt: { gte: since }, status: { notIn: ['CANCELADO'] } },
      _count: true,
    });

    const totalClientes = clientes.length;
    const recorrentes = clientes.filter((c) => c._count > 1).length;

    return {
      periodoDias: days,
      totalClientesDistintos: totalClientes,
      recorrentes,
      taxaRetencaoPct:
        totalClientes > 0 ? +((recorrentes / totalClientes) * 100).toFixed(1) : 0,
    };
  }

  async ocupacaoSlots(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const slots = await this.prisma.slotProducao.findMany({
      where: { data: { gte: since } },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
    });

    const porDiaSemana = new Map<number, { total: number; usado: number }>();
    for (const s of slots) {
      const dow = s.data.getDay();
      const bucket = porDiaSemana.get(dow) ?? { total: 0, usado: 0 };
      bucket.total += s.capacidadeMaxima;
      bucket.usado += s.capacidadeOcupada;
      porDiaSemana.set(dow, bucket);
    }

    const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const resultado = [];
    for (let i = 0; i < 7; i++) {
      const b = porDiaSemana.get(i) ?? { total: 0, usado: 0 };
      resultado.push({
        diaSemana: nomes[i],
        capacidadeTotal: b.total,
        capacidadeUsada: b.usado,
        ocupacaoPct: b.total > 0 ? +((b.usado / b.total) * 100).toFixed(1) : 0,
      });
    }
    return resultado;
  }

  async gastoPorInsumo(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const movs = await this.prisma.movimentacaoEstoque.groupBy({
      by: ['insumoId', 'tipo'],
      where: { createdAt: { gte: since } },
      _sum: { quantidade: true },
    });

    const insumos = await this.prisma.insumo.findMany({
      where: { id: { in: movs.map((m) => m.insumoId) } },
    });
    const mapa = new Map(insumos.map((i) => [i.id, i]));

    const acc = new Map<
      string,
      { consumido: number; quebra: number; entrada: number; insumo: any }
    >();
    for (const m of movs) {
      const cur =
        acc.get(m.insumoId) ?? { consumido: 0, quebra: 0, entrada: 0, insumo: mapa.get(m.insumoId) };
      const qtd = Number(m._sum.quantidade ?? 0);
      if (m.tipo === 'SAIDA_PRODUCAO') cur.consumido += qtd;
      else if (m.tipo === 'QUEBRA_DESPERDICIO') cur.quebra += qtd;
      else if (m.tipo === 'ENTRADA') cur.entrada += qtd;
      acc.set(m.insumoId, cur);
    }

    return Array.from(acc.values())
      .filter((v) => v.insumo)
      .map((v) => {
        const preco = Number(v.insumo.precoUnitario);
        return {
          insumoId: v.insumo.id,
          nome: v.insumo.nome,
          unidade: v.insumo.unidadeMedida,
          consumido: v.consumido,
          quebra: v.quebra,
          entrada: v.entrada,
          percentualQuebra:
            v.consumido + v.quebra > 0
              ? +((v.quebra / (v.consumido + v.quebra)) * 100).toFixed(1)
              : 0,
          gastoConsumo: +(v.consumido * preco).toFixed(2),
          gastoQuebra: +(v.quebra * preco).toFixed(2),
        };
      })
      .sort((a, b) => b.gastoConsumo - a.gastoConsumo);
  }
}
