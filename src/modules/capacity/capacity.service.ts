import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CapacityService {
  constructor(private prisma: PrismaService) {}

  async findAvailableSlots(data: string, pontosNecessarios: number) {
    const date = new Date(data);

    // Verifica se há janela sazonal ativa para essa data com capacidade reduzida
    const janela = await this.prisma.janelaSazonal.findFirst({
      where: {
        ativa: true,
        inicio: { lte: date },
        fim: { gte: date },
        capacidadeReduzida: { not: null },
      },
    });
    const fatorReducao = janela?.capacidadeReduzida ? Number(janela.capacidadeReduzida) : 1;

    const slots = await this.prisma.slotProducao.findMany({
      where: {
        data: date,
        status: 'ABERTO',
      },
      orderBy: { horaInicio: 'asc' },
    });

    return slots
      .filter((s) => {
        const capacidadeEfetiva = Math.floor(s.capacidadeMaxima * fatorReducao);
        return capacidadeEfetiva - s.capacidadeOcupada >= pontosNecessarios;
      })
      .map((s) => {
        const capacidadeEfetiva = Math.floor(s.capacidadeMaxima * fatorReducao);
        return {
          ...s,
          capacidadeMaxima: capacidadeEfetiva, // reflete a redução sazonal
          capacidadeDisponivel: capacidadeEfetiva - s.capacidadeOcupada,
          percentualOcupado: Math.round((s.capacidadeOcupada / capacidadeEfetiva) * 100),
          janelasSazonal: janela ? { nome: janela.nome, fatorReducao } : null,
        };
      });
  }

  async findSlotsRange(dataInicio: string, dataFim: string) {
    const slots = await this.prisma.slotProducao.findMany({
      where: {
        data: { gte: new Date(dataInicio), lte: new Date(dataFim) },
      },
      include: {
        reservas: {
          include: {
            pedido: {
              select: {
                id: true,
                status: true,
                cliente: { select: { nome: true } },
              },
            },
          },
        },
      },
      orderBy: [{ data: 'asc' }, { horaInicio: 'asc' }],
    });

    return slots.map((s) => ({
      ...s,
      capacidadeDisponivel: s.capacidadeMaxima - s.capacidadeOcupada,
      percentualOcupado: Math.round((s.capacidadeOcupada / s.capacidadeMaxima) * 100),
    }));
  }

  async reservarSlot(pedidoId: string, slotId: string, pontosNecessarios: number, externalTx?: any) {
    const run = async (tx: any) => {
      const slot = await tx.$queryRaw<any[]>`
        SELECT * FROM slots_producao WHERE id = ${slotId} FOR UPDATE
      `;

      if (!slot[0]) throw new NotFoundException('Slot não encontrado');

      const slotData = slot[0];
      const disponivel = slotData.capacidadeMaxima - slotData.capacidadeOcupada;

      if (slotData.status !== 'ABERTO') throw new ConflictException('Slot não está disponível');
      if (disponivel < pontosNecessarios) {
        throw new ConflictException(
          'Capacidade insuficiente no slot selecionado. Por favor, escolha outro horário.',
        );
      }

      const novaOcupacao = slotData.capacidadeOcupada + pontosNecessarios;
      const novoStatus = novaOcupacao >= slotData.capacidadeMaxima ? 'CHEIO' : 'ABERTO';

      await tx.slotProducao.update({
        where: { id: slotId },
        data: { capacidadeOcupada: novaOcupacao, status: novoStatus },
      });

      const reserva = await tx.reservaProducao.create({
        data: { pedidoId, slotId, pontosConsumidos: pontosNecessarios },
      });

      return reserva;
    };

    return externalTx ? run(externalTx) : this.prisma.$transaction(run);
  }

  async liberarSlot(pedidoId: string, externalTx?: any) {
    const run = async (tx: any) => {
      const reserva = await tx.reservaProducao.findUnique({ where: { pedidoId } });
      if (!reserva) return;

      await tx.slotProducao.update({
        where: { id: reserva.slotId },
        data: {
          capacidadeOcupada: { decrement: reserva.pontosConsumidos },
          status: 'ABERTO',
        },
      });

      await tx.reservaProducao.delete({ where: { pedidoId } });
    };

    return externalTx ? run(externalTx) : this.prisma.$transaction(run);
  }

  async atualizarSlot(
    id: string,
    data: {
      horaInicio?: string;
      horaFim?: string;
      capacidadeMaxima?: number;
      status?: string;
      observacao?: string;
    },
  ) {
    const slot = await this.prisma.slotProducao.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Slot não encontrado');

    const dateStr = slot.data.toISOString().split('T')[0];
    return this.prisma.slotProducao.update({
      where: { id },
      data: {
        ...(data.horaInicio && { horaInicio: new Date(`${dateStr}T${data.horaInicio}`) }),
        ...(data.horaFim && { horaFim: new Date(`${dateStr}T${data.horaFim}`) }),
        ...(data.capacidadeMaxima !== undefined && { capacidadeMaxima: data.capacidadeMaxima }),
        ...(data.status && { status: data.status as any }),
        ...(data.observacao !== undefined && { observacao: data.observacao }),
      },
    });
  }

  async deletarSlot(id: string) {
    const slot = await this.prisma.slotProducao.findUnique({
      where: { id },
      include: { reservas: true },
    });
    if (!slot) throw new NotFoundException('Slot não encontrado');
    if (slot.reservas.length > 0) {
      throw new ConflictException('Slot possui pedidos reservados e não pode ser excluído');
    }
    return this.prisma.slotProducao.delete({ where: { id } });
  }

  async criarSlots(data: {
    data: string;
    horaInicio: string;
    horaFim: string;
    capacidadeMaxima: number;
    repeteAte?: string;
  }) {
    const slots = [];
    const inicio = new Date(data.data);
    const fim = data.repeteAte ? new Date(data.repeteAte) : inicio;

    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const slot = await this.prisma.slotProducao.upsert({
        where: {
          data_horaInicio: {
            data: new Date(d),
            horaInicio: new Date(`${dateStr}T${data.horaInicio}`),
          },
        },
        update: {},
        create: {
          data: new Date(d),
          horaInicio: new Date(`${dateStr}T${data.horaInicio}`),
          horaFim: new Date(`${dateStr}T${data.horaFim}`),
          capacidadeMaxima: data.capacidadeMaxima,
        },
      });
      slots.push(slot);
    }
    return slots;
  }
}
