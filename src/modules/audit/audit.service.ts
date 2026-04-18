import { Injectable } from '@nestjs/common';
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
  constructor(private prisma: PrismaService) {}

  async log(data: AuditLogData) {
    this.prisma.auditLog
      .create({
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
      })
      .catch((err) => console.error('[AuditService]', err));
  }

  async findByEntity(entidade: string, entidadeId: string) {
    return this.prisma.auditLog.findMany({
      where: { entidade, entidadeId },
      include: { usuario: { select: { nome: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
