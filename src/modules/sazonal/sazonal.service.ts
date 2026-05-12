import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface CheckPedidoResp {
  ok: boolean;
  janela?: any | null;
  motivo?: string;
  antecedenciaMinDias?: number;
}

@Injectable()
export class SazonalService {
  constructor(private prisma: PrismaService) {}

  /** Busca janela ativa que cobre a data alvo. Retorna null se nenhuma. */
  async avaliarData(data: Date) {
    const janelas = await this.prisma.janelaSazonal.findMany({
      where: {
        ativa: true,
        inicio: { lte: data },
        fim: { gte: data },
      },
      orderBy: { inicio: 'asc' },
    });
    return janelas[0] ?? null;
  }

  async checarPedido(input: { dataAlvo: Date; temCustomizacao: boolean }): Promise<CheckPedidoResp> {
    const janela = await this.avaliarData(input.dataAlvo);
    if (!janela) return { ok: true };

    const horasAteData =
      (input.dataAlvo.getTime() - Date.now()) / (60 * 60 * 1000);
    const diasAteData = Math.floor(horasAteData / 24);

    if (diasAteData < janela.antecedenciaMinDias) {
      return {
        ok: false,
        janela,
        motivo: `Antecedencia mínima de ${janela.antecedenciaMinDias} dias para "${janela.nome}".`,
        antecedenciaMinDias: janela.antecedenciaMinDias,
      };
    }

    if (janela.bloquearCustomizacao && input.temCustomizacao) {
      return {
        ok: false,
        janela,
        motivo: `Customizações extras suspensas durante "${janela.nome}".`,
      };
    }

    return { ok: true, janela };
  }

  async list(filtro?: { ativa?: boolean }) {
    return this.prisma.janelaSazonal.findMany({
      where: filtro?.ativa !== undefined ? { ativa: filtro.ativa } : undefined,
      orderBy: { inicio: 'asc' },
    });
  }

  async create(data: {
    nome: string;
    inicio: Date | string;
    fim: Date | string;
    antecedenciaMinDias?: number;
    bloquearCustomizacao?: boolean;
    capacidadeReduzida?: number | null;
    aviso?: string;
  }) {
    return this.prisma.janelaSazonal.create({
      data: {
        nome: data.nome,
        inicio: new Date(data.inicio),
        fim: new Date(data.fim),
        antecedenciaMinDias: data.antecedenciaMinDias ?? 0,
        bloquearCustomizacao: data.bloquearCustomizacao ?? false,
        capacidadeReduzida:
          data.capacidadeReduzida != null ? data.capacidadeReduzida : null,
        aviso: data.aviso ?? null,
      },
    });
  }

  async update(id: string, data: Partial<any>) {
    const existente = await this.prisma.janelaSazonal.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException('Janela não encontrada');
    const sanitized: Record<string, any> = {};
    for (const k of Object.keys(data)) {
      if (k === 'inicio' || k === 'fim') sanitized[k] = new Date(data[k]);
      else sanitized[k] = data[k];
    }
    return this.prisma.janelaSazonal.update({ where: { id }, data: sanitized });
  }

  async remove(id: string) {
    const existente = await this.prisma.janelaSazonal.findUnique({ where: { id } });
    if (!existente) throw new NotFoundException('Janela não encontrada');
    await this.prisma.janelaSazonal.delete({ where: { id } });
  }
}
