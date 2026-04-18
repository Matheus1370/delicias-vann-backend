import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CapacityService } from './capacity.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CapacityService', () => {
  let service: CapacityService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      slotProducao: {
        findMany: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      reservaProducao: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapacityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CapacityService>(CapacityService);
  });

  // ---------------------------------------------------------------------------
  // findAvailableSlots
  // ---------------------------------------------------------------------------
  describe('findAvailableSlots', () => {
    it('should return only slots with enough available capacity', async () => {
      const slots = [
        { id: 's1', data: new Date('2026-05-01'), horaInicio: '08:00', horaFim: '12:00', status: 'ABERTO', capacidadeMaxima: 100, capacidadeOcupada: 20 },
        { id: 's2', data: new Date('2026-05-01'), horaInicio: '12:00', horaFim: '16:00', status: 'ABERTO', capacidadeMaxima: 50, capacidadeOcupada: 48 },
        { id: 's3', data: new Date('2026-05-01'), horaInicio: '16:00', horaFim: '20:00', status: 'ABERTO', capacidadeMaxima: 80, capacidadeOcupada: 0 },
      ];

      prisma.slotProducao.findMany.mockResolvedValue(slots);

      const result = await service.findAvailableSlots('2026-05-01', 10);

      expect(prisma.slotProducao.findMany).toHaveBeenCalledWith({
        where: { data: new Date('2026-05-01'), status: 'ABERTO' },
        orderBy: { horaInicio: 'asc' },
      });

      // s1 has 80 available (>= 10) -> included
      // s2 has 2 available (< 10) -> excluded
      // s3 has 80 available (>= 10) -> included
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('s1');
      expect(result[0].capacidadeDisponivel).toBe(80);
      expect(result[0].percentualOcupado).toBe(20);
      expect(result[1].id).toBe('s3');
      expect(result[1].capacidadeDisponivel).toBe(80);
      expect(result[1].percentualOcupado).toBe(0);
    });

    it('should return empty array when no slots have enough capacity', async () => {
      prisma.slotProducao.findMany.mockResolvedValue([
        { id: 's1', status: 'ABERTO', capacidadeMaxima: 10, capacidadeOcupada: 5 },
      ]);

      const result = await service.findAvailableSlots('2026-05-01', 20);
      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // reservarSlot
  // ---------------------------------------------------------------------------
  describe('reservarSlot', () => {
    it('should reserve slot successfully and create reserva', async () => {
      const slotData = {
        id: 's1',
        capacidadeMaxima: 100,
        capacidadeOcupada: 30,
        status: 'ABERTO',
      };
      const reserva = { id: 'r1', pedidoId: 'p1', slotId: 's1', pontosConsumidos: 20 };

      prisma.$queryRaw.mockResolvedValue([slotData]);
      prisma.slotProducao.update.mockResolvedValue({});
      prisma.reservaProducao.create.mockResolvedValue(reserva);

      const result = await service.reservarSlot('p1', 's1', 20);

      expect(prisma.slotProducao.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { capacidadeOcupada: 50, status: 'ABERTO' },
      });
      expect(prisma.reservaProducao.create).toHaveBeenCalledWith({
        data: { pedidoId: 'p1', slotId: 's1', pontosConsumidos: 20 },
      });
      expect(result).toEqual(reserva);
    });

    it('should set status to CHEIO when capacity is fully used', async () => {
      const slotData = {
        id: 's1',
        capacidadeMaxima: 50,
        capacidadeOcupada: 30,
        status: 'ABERTO',
      };

      prisma.$queryRaw.mockResolvedValue([slotData]);
      prisma.slotProducao.update.mockResolvedValue({});
      prisma.reservaProducao.create.mockResolvedValue({ id: 'r1' });

      await service.reservarSlot('p1', 's1', 20);

      expect(prisma.slotProducao.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CHEIO' }),
        }),
      );
    });

    it('should throw NotFoundException when slot is not found', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.reservarSlot('p1', 'missing', 10)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when slot is not ABERTO (blocked)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 's1', capacidadeMaxima: 100, capacidadeOcupada: 0, status: 'BLOQUEADO' },
      ]);

      await expect(service.reservarSlot('p1', 's1', 10)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.reservarSlot('p1', 's1', 10)).rejects.toThrow(
        'Slot não está disponível',
      );
    });

    it('should throw ConflictException when slot is full (not enough capacity)', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { id: 's1', capacidadeMaxima: 50, capacidadeOcupada: 45, status: 'ABERTO' },
      ]);

      await expect(service.reservarSlot('p1', 's1', 10)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.reservarSlot('p1', 's1', 10)).rejects.toThrow(
        'Capacidade insuficiente',
      );
    });

    it('should use externalTx when provided', async () => {
      const externalTx: any = {
        $queryRaw: jest.fn().mockResolvedValue([
          { id: 's1', capacidadeMaxima: 100, capacidadeOcupada: 0, status: 'ABERTO' },
        ]),
        slotProducao: { update: jest.fn().mockResolvedValue({}) },
        reservaProducao: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
      };

      await service.reservarSlot('p1', 's1', 10, externalTx);

      expect(externalTx.$queryRaw).toHaveBeenCalled();
      expect(externalTx.slotProducao.update).toHaveBeenCalled();
      expect(externalTx.reservaProducao.create).toHaveBeenCalled();
      // prisma.$transaction should NOT have been called
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // liberarSlot
  // ---------------------------------------------------------------------------
  describe('liberarSlot', () => {
    it('should release capacity and delete reserva', async () => {
      const reserva = { pedidoId: 'p1', slotId: 's1', pontosConsumidos: 25 };
      prisma.reservaProducao.findUnique.mockResolvedValue(reserva);
      prisma.slotProducao.update.mockResolvedValue({});
      prisma.reservaProducao.delete.mockResolvedValue({});

      await service.liberarSlot('p1');

      expect(prisma.reservaProducao.findUnique).toHaveBeenCalledWith({
        where: { pedidoId: 'p1' },
      });
      expect(prisma.slotProducao.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          capacidadeOcupada: { decrement: 25 },
          status: 'ABERTO',
        },
      });
      expect(prisma.reservaProducao.delete).toHaveBeenCalledWith({
        where: { pedidoId: 'p1' },
      });
    });

    it('should do nothing when no reserva exists for the pedido', async () => {
      prisma.reservaProducao.findUnique.mockResolvedValue(null);

      await service.liberarSlot('p1');

      expect(prisma.slotProducao.update).not.toHaveBeenCalled();
      expect(prisma.reservaProducao.delete).not.toHaveBeenCalled();
    });

    it('should use externalTx when provided', async () => {
      const reserva = { pedidoId: 'p1', slotId: 's1', pontosConsumidos: 10 };
      const externalTx: any = {
        reservaProducao: {
          findUnique: jest.fn().mockResolvedValue(reserva),
          delete: jest.fn().mockResolvedValue({}),
        },
        slotProducao: { update: jest.fn().mockResolvedValue({}) },
      };

      await service.liberarSlot('p1', externalTx);

      expect(externalTx.reservaProducao.findUnique).toHaveBeenCalled();
      expect(externalTx.slotProducao.update).toHaveBeenCalled();
      expect(externalTx.reservaProducao.delete).toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
