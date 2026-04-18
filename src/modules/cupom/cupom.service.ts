import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CupomService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.cupom.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    data: {
      codigo: string;
      tipo: 'PERCENTUAL' | 'FIXO';
      valor: number;
      minimoCompra?: number;
      usoMaximo?: number;
      validoDe?: string;
      validoAte: string;
      descricao?: string;
      campanha?: string;
    },
    usuarioId: string,
  ) {
    const cupom = await this.prisma.cupom.create({
      data: {
        codigo: data.codigo.trim().toUpperCase(),
        tipo: data.tipo,
        valor: data.valor,
        minimoCompra: data.minimoCompra ?? 0,
        usoMaximo: data.usoMaximo,
        validoDe: data.validoDe ? new Date(data.validoDe) : new Date(),
        validoAte: new Date(data.validoAte),
        descricao: data.descricao,
        campanha: data.campanha,
      },
    });
    await this.audit.log({
      acao: 'CUPOM.CREATED',
      entidade: 'Cupom',
      entidadeId: cupom.id,
      payloadDepois: cupom,
      usuarioId,
    });
    return cupom;
  }

  async toggle(id: string, ativo: boolean, usuarioId: string) {
    const cupom = await this.prisma.cupom.update({
      where: { id },
      data: { ativo },
    });
    await this.audit.log({
      acao: ativo ? 'CUPOM.ENABLED' : 'CUPOM.DISABLED',
      entidade: 'Cupom',
      entidadeId: id,
      usuarioId,
    });
    return cupom;
  }

  async validate(codigo: string, valorSubtotal: number) {
    const cupom = await this.prisma.cupom.findUnique({
      where: { codigo: codigo.trim().toUpperCase() },
    });
    if (!cupom || !cupom.ativo) {
      throw new NotFoundException('Cupom inválido');
    }

    const agora = new Date();
    if (agora < cupom.validoDe || agora > cupom.validoAte) {
      throw new BadRequestException('Cupom fora do período de validade');
    }
    if (cupom.usoMaximo != null && cupom.usoAtual >= cupom.usoMaximo) {
      throw new BadRequestException('Cupom esgotado');
    }
    if (valorSubtotal < Number(cupom.minimoCompra)) {
      throw new BadRequestException(
        `Mínimo de compra: R$ ${Number(cupom.minimoCompra).toFixed(2)}`,
      );
    }

    const desconto =
      cupom.tipo === 'PERCENTUAL'
        ? +(valorSubtotal * (Number(cupom.valor) / 100)).toFixed(2)
        : Math.min(Number(cupom.valor), valorSubtotal);

    return { cupom, desconto };
  }

  async registrarUso(cupomId: string) {
    await this.prisma.cupom.update({
      where: { id: cupomId },
      data: { usoAtual: { increment: 1 } },
    });
  }
}
