import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditLogData {
  acao: string;
  entidade: string;
  entidadeId: string;
  usuarioId?: string;
  payloadAntes?: any;
  payloadDepois?: any;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(data: AuditLogData) {
    try {
      await this.prisma.auditLog.create({
        data: {
          acao: data.acao,
          entidade: data.entidade,
          entidadeId: data.entidadeId,
          usuarioId: data.usuarioId ?? null,
          payloadAntes: data.payloadAntes ?? undefined,
          payloadDepois: data.payloadDepois ?? undefined,
          ip: data.ip ?? null,
          userAgent: data.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Falha ao gravar auditoria (${data.acao})`, err as Error);
    }
  }

  async findByEntity(entidade: string, entidadeId: string) {
    return this.prisma.auditLog.findMany({
      where: { entidade, entidadeId },
      include: { usuario: { select: { nome: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async list(filtros: {
    entidade?: string;
    acao?: string;
    usuarioBusca?: string;
    entidadeId?: string;
    dataInicio?: string;
    dataFim?: string;
    page?: number | string;
    pageSize?: number | string;
  }) {
    const page = Math.max(1, Number(filtros.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filtros.pageSize) || 25));

    const where: any = {};
    if (filtros.entidade) where.entidade = filtros.entidade;
    if (filtros.acao) where.acao = { contains: filtros.acao, mode: 'insensitive' };
    if (filtros.entidadeId) where.entidadeId = filtros.entidadeId;
    if (filtros.usuarioBusca) {
      where.usuario = {
        is: {
          OR: [
            { nome: { contains: filtros.usuarioBusca, mode: 'insensitive' } },
            { email: { contains: filtros.usuarioBusca, mode: 'insensitive' } },
          ],
        },
      };
    }

    const createdAt: any = {};
    if (filtros.dataInicio) {
      const d = new Date(filtros.dataInicio);
      if (!Number.isNaN(d.getTime())) createdAt.gte = d;
    }
    if (filtros.dataFim) {
      const d = new Date(filtros.dataFim);
      if (!Number.isNaN(d.getTime())) createdAt.lte = d;
    }
    if (Object.keys(createdAt).length) where.createdAt = createdAt;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { usuario: { select: { nome: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async facets() {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['entidade'],
      select: { entidade: true },
      orderBy: { entidade: 'asc' },
    });
    return { entidades: rows.map((r) => r.entidade) };
  }
}
