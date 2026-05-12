import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AvaliacaoService {
  constructor(private prisma: PrismaService) {}

  async criar(
    clienteId: string,
    data: { pedidoId: string; nota: number; comentario?: string },
  ) {
    if (data.nota < 1 || data.nota > 5) {
      throw new BadRequestException('Nota deve ser entre 1 e 5');
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: data.pedidoId },
      include: { itens: true, avaliacao: true },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');
    if (pedido.clienteId !== clienteId) throw new ForbiddenException('Sem permissão');
    if (pedido.status !== 'ENTREGUE') {
      throw new BadRequestException('Só é possível avaliar pedidos entregues');
    }
    if (pedido.avaliacao) {
      throw new BadRequestException('Pedido já avaliado');
    }

    const produtoId = pedido.itens[0]?.produtoId ?? null;

    return this.prisma.avaliacao.create({
      data: {
        pedidoId: data.pedidoId,
        clienteId,
        produtoId,
        nota: data.nota,
        comentario: data.comentario,
      },
    });
  }

  async listarPorProduto(produtoId: string) {
    const [avaliacoes, agg] = await this.prisma.$transaction([
      this.prisma.avaliacao.findMany({
        where: { produtoId, publicado: true },
        include: { cliente: { select: { nome: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.avaliacao.aggregate({
        where: { produtoId, publicado: true },
        _avg: { nota: true },
        _count: true,
      }),
    ]);

    return {
      notaMedia: Number(agg._avg.nota ?? 0),
      total: agg._count,
      avaliacoes,
    };
  }

  async moderar(id: string, publicado: boolean) {
    return this.prisma.avaliacao.update({
      where: { id },
      data: { publicado },
    });
  }

  /**
   * Mapeia NPS (0-10) pra escala estrelas (1-5) usando bandas:
   * 9-10 → 5 (promoter), 7-8 → 4 (passive), 4-6 → 3, 1-3 → 2, 0 → 1.
   */
  private npsParaEstrelas(nps: number): number {
    if (nps >= 9) return 5;
    if (nps >= 7) return 4;
    if (nps >= 4) return 3;
    if (nps >= 1) return 2;
    return 1;
  }

  /** Public endpoint: cliente clica no link do WhatsApp e cai aqui. */
  async obterPublica(token: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: token },
      include: {
        cliente: { select: { nome: true } },
        itens: {
          include: { produto: { select: { nome: true } } },
        },
        avaliacao: true,
      },
    });
    if (!pedido) throw new NotFoundException('Avaliação não encontrada');
    return {
      pedidoId: pedido.id,
      clienteNome: pedido.cliente?.nome ?? null,
      status: pedido.status,
      jaAvaliado: !!pedido.avaliacao,
      itens: pedido.itens.map((it: any) => ({
        quantidade: it.quantidade,
        nome: it.produto?.nome ?? null,
      })),
    };
  }

  async criarPublica(
    token: string,
    data: {
      notaNPS: number;
      comentario?: string;
      fotoFesta?: string;
      permiteUsoFoto?: boolean;
    },
  ) {
    if (typeof data.notaNPS !== 'number' || data.notaNPS < 0 || data.notaNPS > 10) {
      throw new BadRequestException('notaNPS deve estar entre 0 e 10');
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: token },
      include: { itens: true, avaliacao: true },
    });
    if (!pedido) throw new NotFoundException('Pedido não encontrado');
    if (pedido.status !== 'ENTREGUE') {
      throw new BadRequestException('Só é possível avaliar pedidos entregues');
    }
    if (pedido.avaliacao) {
      throw new BadRequestException('Pedido já avaliado');
    }

    const produtoId = pedido.itens[0]?.produtoId ?? null;
    const nota = this.npsParaEstrelas(data.notaNPS);

    return this.prisma.avaliacao.create({
      data: {
        pedidoId: pedido.id,
        clienteId: pedido.clienteId,
        produtoId,
        nota,
        notaNPS: data.notaNPS,
        comentario: data.comentario ?? null,
        fotoFesta: data.fotoFesta ?? null,
        permiteUsoFoto: data.permiteUsoFoto ?? false,
      },
    });
  }
}
