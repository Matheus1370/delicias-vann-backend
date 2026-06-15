import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BastidorService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async listarPublicos(limite = 6) {
    return this.prisma.bastidorPost.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: 'asc' }, { createdAt: 'desc' }],
      take: limite,
    });
  }

  async listarAdmin() {
    return this.prisma.bastidorPost.findMany({
      orderBy: [{ ordem: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async criar(
    data: { imagemUrl: string; legenda?: string; linkInstagram?: string; ordem?: number },
    usuarioId: string,
  ) {
    const post = await this.prisma.bastidorPost.create({
      data: {
        imagemUrl: data.imagemUrl,
        legenda: data.legenda ?? null,
        linkInstagram: data.linkInstagram ?? null,
        ordem: data.ordem ?? 0,
      },
    });
    await this.audit.log({
      acao: 'BASTIDOR.CREATED',
      entidade: 'BastidorPost',
      entidadeId: post.id,
      payloadDepois: post,
      usuarioId,
    });
    return post;
  }

  async atualizar(
    id: string,
    data: Partial<{ imagemUrl: string; legenda: string; linkInstagram: string; ordem: number; ativo: boolean }>,
    usuarioId: string,
  ) {
    const antes = await this.prisma.bastidorPost.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('Post não encontrado');

    const post = await this.prisma.bastidorPost.update({
      where: { id },
      data: {
        ...(data.imagemUrl !== undefined && { imagemUrl: data.imagemUrl }),
        ...(data.legenda !== undefined && { legenda: data.legenda }),
        ...(data.linkInstagram !== undefined && { linkInstagram: data.linkInstagram }),
        ...(data.ordem !== undefined && { ordem: data.ordem }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
      },
    });
    await this.audit.log({
      acao: 'BASTIDOR.UPDATED',
      entidade: 'BastidorPost',
      entidadeId: id,
      payloadAntes: antes,
      payloadDepois: post,
      usuarioId,
    });
    return post;
  }

  async remover(id: string, usuarioId: string) {
    const antes = await this.prisma.bastidorPost.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('Post não encontrado');
    await this.prisma.bastidorPost.delete({ where: { id } });
    await this.audit.log({
      acao: 'BASTIDOR.DELETED',
      entidade: 'BastidorPost',
      entidadeId: id,
      payloadAntes: antes,
      usuarioId,
    });
  }
}
