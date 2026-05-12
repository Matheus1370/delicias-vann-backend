import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OcasiaoService } from './ocasiao.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

describe('OcasiaoService', () => {
  let service: OcasiaoService;
  let prisma: Record<string, any>;
  let notifications: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      ocasiaoCliente: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      usuario: { findUnique: jest.fn() },
    };
    notifications = { send: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        OcasiaoService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get<OcasiaoService>(OcasiaoService);
  });

  const makeOcasiao = (overrides: Partial<any> = {}) => ({
    id: 'o1',
    clienteId: 'c1',
    titulo: 'aniversário do João',
    diaMes: '03-15',
    ano: 2026,
    pedidoOriginalId: null,
    ativa: true,
    ultimoLembreteAno: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('create', () => {
    it('persists titulo, diaMes (normalized) and pedidoOriginalId', async () => {
      const ocasiao = makeOcasiao();
      prisma.ocasiaoCliente.create.mockResolvedValue(ocasiao);

      await service.create('c1', {
        titulo: 'aniversário do João',
        diaMes: '3-15',
        pedidoOriginalId: 'p1',
      });

      const call = prisma.ocasiaoCliente.create.mock.calls[0][0];
      expect(call.data.clienteId).toBe('c1');
      expect(call.data.titulo).toBe('aniversário do João');
      expect(call.data.diaMes).toBe('03-15');
      expect(call.data.pedidoOriginalId).toBe('p1');
    });

    it('rejects invalid diaMes', async () => {
      await expect(
        service.create('c1', { titulo: 'x', diaMes: '13-40' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty titulo', async () => {
      await expect(
        service.create('c1', { titulo: '   ', diaMes: '03-15' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listMine', () => {
    it('returns only ocasioes do cliente, ativas, ordenadas por diaMes', async () => {
      prisma.ocasiaoCliente.findMany.mockResolvedValue([]);
      await service.listMine('c1');
      expect(prisma.ocasiaoCliente.findMany).toHaveBeenCalledWith({
        where: { clienteId: 'c1' },
        orderBy: { diaMes: 'asc' },
      });
    });
  });

  describe('update', () => {
    it('throws NotFound when ocasiao does not belong to cliente', async () => {
      prisma.ocasiaoCliente.findUnique.mockResolvedValue(makeOcasiao({ clienteId: 'outro' }));
      await expect(
        service.update('o1', 'c1', { titulo: 'novo' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates allowed fields', async () => {
      prisma.ocasiaoCliente.findUnique.mockResolvedValue(makeOcasiao());
      prisma.ocasiaoCliente.update.mockResolvedValue(makeOcasiao());
      await service.update('o1', 'c1', { titulo: 'editado', ativa: false });
      expect(prisma.ocasiaoCliente.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { titulo: 'editado', ativa: false },
      });
    });
  });

  describe('remove', () => {
    it('throws NotFound when ocasiao does not belong to cliente', async () => {
      prisma.ocasiaoCliente.findUnique.mockResolvedValue(makeOcasiao({ clienteId: 'outro' }));
      await expect(service.remove('o1', 'c1')).rejects.toThrow(NotFoundException);
    });

    it('deletes the ocasiao', async () => {
      prisma.ocasiaoCliente.findUnique.mockResolvedValue(makeOcasiao());
      await service.remove('o1', 'c1');
      expect(prisma.ocasiaoCliente.delete).toHaveBeenCalledWith({ where: { id: 'o1' } });
    });
  });

  describe('processarLembretes', () => {
    it('queries ocasioes ativas cujo diaMes bate em 60 dias a partir de hoje', async () => {
      prisma.ocasiaoCliente.findMany.mockResolvedValue([]);
      const hoje = new Date('2027-01-15T00:00:00Z');

      await service.processarLembretes(hoje);

      // 60 dias depois de 2027-01-15 = 2027-03-16 (UTC)
      const args = prisma.ocasiaoCliente.findMany.mock.calls[0][0];
      expect(args.where.ativa).toBe(true);
      expect(args.where.diaMes).toBe('03-16');
    });

    it('sends WhatsApp lembrete_ocasiao to cliente e marca ultimoLembreteAno', async () => {
      const ocasiao = makeOcasiao({
        clienteId: 'c1',
        titulo: 'aniversário do João',
        diaMes: '03-16',
        ano: 2026,
        ultimoLembreteAno: null,
      });
      prisma.ocasiaoCliente.findMany.mockResolvedValue([
        { ...ocasiao, cliente: { id: 'c1', nome: 'Vann', telefone: '11999999999' } },
      ]);
      prisma.ocasiaoCliente.update.mockResolvedValue(ocasiao);

      const hoje = new Date('2027-01-15T00:00:00Z');
      await service.processarLembretes(hoje);

      expect(notifications.send).toHaveBeenCalledWith({
        pedidoId: expect.any(String),
        telefone: '11999999999',
        templateId: 'lembrete_ocasiao',
        payload: expect.objectContaining({
          nome: 'Vann',
          titulo: 'aniversário do João',
          diaMes: '03-16',
        }),
      });
      expect(prisma.ocasiaoCliente.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { ultimoLembreteAno: 2027 },
      });
    });

    it('skips ocasioes que ja receberam lembrete neste ano', async () => {
      prisma.ocasiaoCliente.findMany.mockResolvedValue([
        {
          ...makeOcasiao({ ultimoLembreteAno: 2027 }),
          cliente: { id: 'c1', nome: 'Vann', telefone: '11999999999' },
        },
      ]);
      const hoje = new Date('2027-01-15T00:00:00Z');

      await service.processarLembretes(hoje);

      expect(notifications.send).not.toHaveBeenCalled();
      expect(prisma.ocasiaoCliente.update).not.toHaveBeenCalled();
    });

    it('skips ocasioes cujo cliente nao tem telefone', async () => {
      prisma.ocasiaoCliente.findMany.mockResolvedValue([
        { ...makeOcasiao(), cliente: { id: 'c1', nome: 'Vann', telefone: null } },
      ]);

      await service.processarLembretes(new Date('2027-01-15T00:00:00Z'));

      expect(notifications.send).not.toHaveBeenCalled();
    });
  });
});
