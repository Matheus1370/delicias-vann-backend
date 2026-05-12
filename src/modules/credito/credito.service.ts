import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CreditoService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Lista créditos ativos do cliente (não expirados, com saldo > 0). */
  async listAtivos(clienteId: string) {
    const todos = await this.prisma.creditoCliente.findMany({
      where: { clienteId, ativo: true },
    });
    const agora = Date.now();
    return todos.filter((c) => {
      if (c.expiraEm && c.expiraEm.getTime() < agora) return false;
      return Number(c.valor) - Number(c.valorUsado) > 0;
    });
  }

  async saldoTotal(clienteId: string): Promise<number> {
    const ativos = await this.listAtivos(clienteId);
    return ativos.reduce(
      (acc, c) => acc + (Number(c.valor) - Number(c.valorUsado)),
      0,
    );
  }

  async gerar(input: {
    clienteId: string;
    valor: number;
    motivo: string;
    pedidoOrigemId?: string;
    expiraEm?: Date | null;
  }) {
    if (input.valor <= 0) {
      throw new BadRequestException('Valor do crédito deve ser positivo');
    }

    const credito = await this.prisma.creditoCliente.create({
      data: {
        clienteId: input.clienteId,
        valor: input.valor,
        valorUsado: 0,
        motivo: input.motivo,
        pedidoOrigemId: input.pedidoOrigemId ?? null,
        expiraEm: input.expiraEm ?? null,
      },
    });

    await this.audit.log({
      acao: 'CREDITO.GENERATED',
      entidade: 'CreditoCliente',
      entidadeId: credito.id,
      payloadDepois: { valor: input.valor, motivo: input.motivo },
      usuarioId: input.clienteId,
    });

    return credito;
  }

  /**
   * Consome `valor` do saldo do cliente, preferindo créditos que vão expirar primeiro
   * (e mais antigos como desempate). Lança BadRequest se saldo insuficiente.
   */
  async consumir(clienteId: string, valor: number, tx?: Prisma.TransactionClient) {
    if (valor <= 0) return;

    const db = tx ?? this.prisma;
    const ativos = await this.listAtivos(clienteId);

    // Ordena: créditos com expiraEm primeiro (mais próximos primeiro), depois sem expiraEm pelo createdAt
    ativos.sort((a, b) => {
      if (a.expiraEm && b.expiraEm) {
        return a.expiraEm.getTime() - b.expiraEm.getTime();
      }
      if (a.expiraEm && !b.expiraEm) return -1;
      if (!a.expiraEm && b.expiraEm) return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const saldoTotal = ativos.reduce(
      (acc, c) => acc + (Number(c.valor) - Number(c.valorUsado)),
      0,
    );
    if (saldoTotal < valor) {
      throw new BadRequestException(
        `Saldo de crédito insuficiente (saldo: R$ ${saldoTotal.toFixed(2)}, requerido: R$ ${valor.toFixed(2)})`,
      );
    }

    let restante = valor;
    for (const credito of ativos) {
      if (restante <= 0) break;
      const disponivel = Number(credito.valor) - Number(credito.valorUsado);
      const aplicar = Math.min(disponivel, restante);
      await db.creditoCliente.update({
        where: { id: credito.id },
        data: { valorUsado: Number(credito.valorUsado) + aplicar },
      });
      restante -= aplicar;
    }
  }
}
