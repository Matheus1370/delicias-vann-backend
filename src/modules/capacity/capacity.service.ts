import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CapacityService {
  constructor(private prisma: PrismaService) {}

  async findAvailableSlots(data: string, pontosNecessarios: number) {
    const date = new Date(data);
    const slots = await this.prisma.slotProducao.findMany({
      where: {
        data: date,
        status: 'ABERTO',
      },
      orderBy: { horaInicio: 'asc' },
    });

    return slots
      .filter((s) => s.capacidadeMaxima - s.capacidadeOcupada >= pontosNecessarios)
      .map((s) => ({
        ...s,
        capacidadeDisponivel: s.capacidadeMaxima - s.capacidadeOcupada,
        percentualOcupado: Math.round((s.capacidadeOcupada / s.capacidadeMaxima) * 100),
      }));
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
