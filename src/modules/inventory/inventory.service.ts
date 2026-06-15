import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll() {
    const insumos = await this.prisma.insumo.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
    });

    return insumos.map((i) => {
      const estoqueAtual = Number(i.estoqueAtual);
      const pontoReposicao = Number(i.pontoReposicao);
      const precisaReposicao = estoqueAtual <= pontoReposicao;
      return { ...i, precisaReposicao };
    });
  }

  async findOne(id: string) {
    const insumo = await this.prisma.insumo.findUnique({
      where: { id },
      include: {
        movimentacoes: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!insumo) throw new NotFoundException('Insumo não encontrado');
    return insumo;
  }

  async vendaBalcao(
    operadorId: string,
    data: {
      itens: Array<{ produtoId: string; quantidade: number }>;
      observacoes?: string;
    },
  ) {
    const produtos = await this.prisma.produto.findMany({
      where: { id: { in: data.itens.map((i) => i.produtoId) } },
    });
    if (produtos.length !== data.itens.length) {
      throw new NotFoundException('Um ou mais produtos não encontrados');
    }

    const valorTotal = data.itens.reduce((acc, it) => {
      const p = produtos.find((pp) => pp.id === it.produtoId)!;
      return acc + Number(p.precoVenda) * it.quantidade;
    }, 0);

    const venda = await this.prisma.$transaction(async (tx) => {
      const novaVenda = await tx.vendaBalcao.create({
        data: {
          operadorId,
          valorTotal,
          itens: data.itens,
          observacoes: data.observacoes,
        },
      });

      for (const it of data.itens) {
        const p = produtos.find((pp) => pp.id === it.produtoId)!;
        if (p.fulfillment === 'MAKE_TO_STOCK') {
          if (p.estoqueVitrine < it.quantidade) {
            throw new BadRequestException(`Sem estoque de vitrine: ${p.nome}`);
          }
          await tx.produto.update({
            where: { id: p.id },
            data: { estoqueVitrine: { decrement: it.quantidade } },
          });
          await tx.movimentacaoVitrine.create({
            data: {
              produtoId: p.id,
              tipo: 'SAIDA_VENDA',
              quantidade: it.quantidade,
              vendaId: novaVenda.id,
              operadorId,
            },
          });
        }
      }

      return novaVenda;
    });

    await this.audit.log({
      acao: 'BALCAO.VENDA',
      entidade: 'VendaBalcao',
      entidadeId: venda.id,
      payloadDepois: venda,
      usuarioId: operadorId,
    });

    return venda;
  }

  async alertasAbertos() {
    return this.prisma.alertaEstoque.findMany({
      where: { resolvido: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolverAlerta(id: string) {
    const alerta = await this.prisma.alertaEstoque.findUnique({ where: { id } });
    if (!alerta) throw new NotFoundException('Alerta não encontrado');
    return this.prisma.alertaEstoque.update({
      where: { id },
      data: { resolvido: true },
    });
  }

  async movimentar(
    insumoId: string,
    data: {
      tipo: 'ENTRADA' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'QUEBRA_DESPERDICIO';
      quantidade: number;
      custoUnitario?: number;
      motivo?: string;
    },
    operadorId: string,
  ) {
    const insumo = await this.prisma.insumo.findUnique({ where: { id: insumoId } });
    if (!insumo) throw new NotFoundException('Insumo não encontrado');

    const sinal =
      data.tipo === 'ENTRADA' || data.tipo === 'AJUSTE_POSITIVO' ? 1 : -1;
    const delta = sinal * data.quantidade;
    const novoEstoque = Number(insumo.estoqueAtual) + delta;

    if (novoEstoque < 0) {
      throw new BadRequestException('Estoque não pode ficar negativo');
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.insumo.update({
        where: { id: insumoId },
        data: { estoqueAtual: novoEstoque },
      });

      await tx.movimentacaoEstoque.create({
        data: {
          insumoId,
          tipo: data.tipo,
          quantidade: data.quantidade,
          custoUnitario: data.custoUnitario ?? insumo.precoUnitario,
          motivo: data.motivo,
          operadorId,
        },
      });

      await this.audit.log({
        acao: `INVENTORY.${data.tipo}`,
        entidade: 'Insumo',
        entidadeId: insumoId,
        payloadAntes: { estoqueAtual: Number(insumo.estoqueAtual) },
        payloadDepois: { estoqueAtual: novoEstoque },
        usuarioId: operadorId,
      });

      return atualizado;
    });
  }
}
