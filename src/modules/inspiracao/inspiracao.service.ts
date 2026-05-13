import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListarInspiracoesFiltro {
  tagsMassa?: string[];
  tagsRecheio?: string[];
  tagsCobertura?: string[];
  tagsTopo?: string[];
  ocasiao?: string;
}

@Injectable()
export class InspiracaoService {
  constructor(private prisma: PrismaService) {}

  async listarPublicas(filtro?: ListarInspiracoesFiltro) {
    const where: any = { publicado: true };
    if (filtro?.tagsMassa?.length) where.tagsMassa = { hasSome: filtro.tagsMassa };
    if (filtro?.tagsRecheio?.length) where.tagsRecheio = { hasSome: filtro.tagsRecheio };
    if (filtro?.tagsCobertura?.length) where.tagsCobertura = { hasSome: filtro.tagsCobertura };
    if (filtro?.tagsTopo?.length) where.tagsTopo = { hasSome: filtro.tagsTopo };
    if (filtro?.ocasiao) where.ocasiao = filtro.ocasiao;

    return this.prisma.boloInspiracao.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
  }

  async obter(id: string) {
    const item = await this.prisma.boloInspiracao.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Inspiração não encontrada');
    return item;
  }

  async listarAdmin() {
    return this.prisma.boloInspiracao.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async criar(data: {
    titulo: string;
    fotoUrl: string;
    tagsMassa?: string[];
    tagsRecheio?: string[];
    tagsCobertura?: string[];
    tagsTopo?: string[];
    ocasiao?: string | null;
    publicado?: boolean;
    pedidoOrigemId?: string | null;
  }) {
    return this.prisma.boloInspiracao.create({
      data: {
        titulo: data.titulo,
        fotoUrl: data.fotoUrl,
        tagsMassa: data.tagsMassa ?? [],
        tagsRecheio: data.tagsRecheio ?? [],
        tagsCobertura: data.tagsCobertura ?? [],
        tagsTopo: data.tagsTopo ?? [],
        ocasiao: data.ocasiao ?? null,
        publicado: data.publicado ?? true,
        pedidoOrigemId: data.pedidoOrigemId ?? null,
      },
    });
  }

  async atualizar(id: string, data: Partial<any>) {
    const existente = await this.prisma.boloInspiracao.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException('Inspiração não encontrada');
    return this.prisma.boloInspiracao.update({ where: { id }, data });
  }

  async remover(id: string) {
    const existente = await this.prisma.boloInspiracao.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException('Inspiração não encontrada');
    await this.prisma.boloInspiracao.delete({ where: { id } });
  }

  /**
   * Curadoria automática: cria inspiração a partir de avaliação NPS>=9 com fotoFesta e consentimento.
   * Idempotente via unique pedidoOrigemId.
   */
  async curarDeAvaliacao(input: {
    pedidoId: string;
    fotoUrl: string;
    titulo?: string;
    tagsMassa?: string[];
    tagsRecheio?: string[];
    tagsCobertura?: string[];
    tagsTopo?: string[];
    ocasiao?: string | null;
  }) {
    const existente = await this.prisma.boloInspiracao.findUnique({
      where: { pedidoOrigemId: input.pedidoId },
    });
    if (existente) return existente;

    return this.prisma.boloInspiracao.create({
      data: {
        titulo: input.titulo ?? 'Bolo de cliente real',
        fotoUrl: input.fotoUrl,
        tagsMassa: input.tagsMassa ?? [],
        tagsRecheio: input.tagsRecheio ?? [],
        tagsCobertura: input.tagsCobertura ?? [],
        tagsTopo: input.tagsTopo ?? [],
        ocasiao: input.ocasiao ?? null,
        publicado: false,
        pedidoOrigemId: input.pedidoId,
      },
    });
  }
}
