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
}
