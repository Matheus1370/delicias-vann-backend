import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AssinaturaService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async listarMinhas(clienteId: string) {
    return this.prisma.assinatura.findMany({
      where: { clienteId },
      include: { produto: { select: { nome: true, slug: true, imagemUrl: true, precoVenda: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async criar(
    clienteId: string,
    data: {
      produtoId: string;
      frequenciaDias?: number;
      diaPreferido?: number;
      observacoes?: string;
    },
  ) {
    const produto = await this.prisma.produto.findUnique({
      where: { id: data.produtoId },
    });
    if (!produto || !produto.ativo) {
      throw new NotFoundException('Produto não encontrado');
    }

    const frequencia = data.frequenciaDias ?? 30;
    const proxima = new Date();
    proxima.setDate(proxima.getDate() + frequencia);

    const assinatura = await this.prisma.assinatura.create({
      data: {
        clienteId,
        produtoId: data.produtoId,
        frequenciaDias: frequencia,
        proximaGeracao: proxima,
        diaPreferido: data.diaPreferido,
        observacoes: data.observacoes,
      },
    });

    await this.audit.log({
      acao: 'ASSINATURA.CREATED',
      entidade: 'Assinatura',
      entidadeId: assinatura.id,
      payloadDepois: assinatura,
      usuarioId: clienteId,
    });

    return assinatura;
  }

  async pausar(id: string, clienteId: string) {
    return this.mudarStatus(id, clienteId, 'PAUSADA');
  }

  async retomar(id: string, clienteId: string) {
    return this.mudarStatus(id, clienteId, 'ATIVA');
  }

  async cancelar(id: string, clienteId: string) {
    return this.mudarStatus(id, clienteId, 'CANCELADA');
  }

  private async mudarStatus(
    id: string,
    clienteId: string,
    status: 'ATIVA' | 'PAUSADA' | 'CANCELADA',
  ) {
    const assinatura = await this.prisma.assinatura.findUnique({ where: { id } });
    if (!assinatura) throw new NotFoundException('Assinatura não encontrada');
    if (assinatura.clienteId !== clienteId) {
      throw new ForbiddenException('Sem permissão');
    }
    const atualizada = await this.prisma.assinatura.update({
      where: { id },
      data: { status },
    });
    await this.audit.log({
      acao: `ASSINATURA.${status}`,
      entidade: 'Assinatura',
      entidadeId: id,
      usuarioId: clienteId,
    });
    return atualizada;
  }
}
