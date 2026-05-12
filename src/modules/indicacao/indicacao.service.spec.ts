import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IndicacaoService } from './indicacao.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('IndicacaoService', () => {
  let service: IndicacaoService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      indicacao: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      cupom: {
        create: jest.fn().mockResolvedValue({ id: 'cup-1', codigo: 'OBRIGADA-XXXXXX' }),
      },
      usuario: { findUnique: jest.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IndicacaoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get<IndicacaoService>(IndicacaoService);
  });

  const makeIndicacao = (overrides: Partial<any> = {}) => ({
    id: 'ind-1',
    indicadorId: 'c1',
    indicadoEmail: null,
    indicadoUsuarioId: null,
    codigo: 'ABC1234',
    pedidoConvertidoId: null,
    cupomRecompensaId: null,
    recompensaValor: null,
    status: 'PENDENTE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('gerar', () => {
    it('creates indicacao with a unique 7+ char codigo', async () => {
      prisma.indicacao.create.mockResolvedValue(makeIndicacao());
      const result = await service.gerar('c1');
      const call = prisma.indicacao.create.mock.calls[0][0];
      expect(call.data.indicadorId).toBe('c1');
      expect(call.data.status).toBe('PENDENTE');
      expect(call.data.codigo).toHaveLength(7);
      expect(result.codigo).toBe('ABC1234');
    });

    it('accepts optional indicadoEmail', async () => {
      prisma.indicacao.create.mockResolvedValue(makeIndicacao());
      await service.gerar('c1', 'amigo@ex.com');
      expect(prisma.indicacao.create.mock.calls[0][0].data.indicadoEmail).toBe('amigo@ex.com');
    });
  });

  describe('listMine', () => {
    it('queries indicacoes do indicador', async () => {
      prisma.indicacao.findMany.mockResolvedValue([]);
      await service.listMine('c1');
      expect(prisma.indicacao.findMany).toHaveBeenCalledWith({
        where: { indicadorId: 'c1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('consultar', () => {
    it('returns nome do indicador when codigo is valid', async () => {
      prisma.indicacao.findUnique.mockResolvedValue({
        ...makeIndicacao(),
        indicador: { id: 'c1', nome: 'Maria Silva' },
      });
      const result = await service.consultar('ABC1234');
      expect(result).toEqual({
        codigo: 'ABC1234',
        indicadorNome: 'Maria Silva',
        valida: true,
      });
    });

    it('throws NotFound when codigo nao existe', async () => {
      prisma.indicacao.findUnique.mockResolvedValue(null);
      await expect(service.consultar('INVALIDO')).rejects.toThrow(NotFoundException);
    });
  });

  describe('registrarUsuario', () => {
    it('attaches indicadoUsuarioId to the indicacao', async () => {
      prisma.indicacao.findUnique.mockResolvedValue(makeIndicacao());
      prisma.indicacao.update.mockResolvedValue(makeIndicacao());
      await service.registrarUsuario('ABC1234', 'user-new');
      expect(prisma.indicacao.update).toHaveBeenCalledWith({
        where: { id: 'ind-1' },
        data: { indicadoUsuarioId: 'user-new' },
      });
    });

    it('throws Conflict when indicador eh o proprio usuario', async () => {
      prisma.indicacao.findUnique.mockResolvedValue(makeIndicacao({ indicadorId: 'me' }));
      await expect(service.registrarUsuario('ABC1234', 'me')).rejects.toThrow(ConflictException);
    });

    it('throws NotFound quando codigo nao existe', async () => {
      prisma.indicacao.findUnique.mockResolvedValue(null);
      await expect(service.registrarUsuario('INVAL', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('does nothing if indicacao ja foi vinculada a outro usuario', async () => {
      prisma.indicacao.findUnique.mockResolvedValue(
        makeIndicacao({ indicadoUsuarioId: 'outro' }),
      );
      await service.registrarUsuario('ABC1234', 'me');
      expect(prisma.indicacao.update).not.toHaveBeenCalled();
    });
  });

  describe('processarConversao', () => {
    it('does nothing when usuario nao tem indicacao vinculada', async () => {
      prisma.indicacao.findFirst.mockResolvedValue(null);
      await service.processarConversao('cliente-x', 'pedido-1');
      expect(prisma.cupom.create).not.toHaveBeenCalled();
    });

    it('marks indicacao CONVERTIDA, cria cupom de 10%, vincula tudo', async () => {
      prisma.indicacao.findFirst.mockResolvedValue(makeIndicacao({ status: 'PENDENTE' }));
      prisma.cupom.create.mockResolvedValue({
        id: 'cup-new',
        codigo: 'OBRIGADA-XYZAB',
        valor: new Prisma.Decimal(10),
      });

      await service.processarConversao('cliente-novo', 'pedido-1');

      const cupomCall = prisma.cupom.create.mock.calls[0][0];
      expect(cupomCall.data.tipo).toBe('PERCENTUAL');
      expect(Number(cupomCall.data.valor)).toBe(10);
      expect(cupomCall.data.usoMaximo).toBe(1);
      expect(cupomCall.data.codigo).toMatch(/^OBRIGADA-/);

      const updateCall = prisma.indicacao.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'ind-1' });
      expect(updateCall.data.status).toBe('CONVERTIDA');
      expect(updateCall.data.pedidoConvertidoId).toBe('pedido-1');
      expect(updateCall.data.cupomRecompensaId).toBe('cup-new');
      expect(Number(updateCall.data.recompensaValor)).toBe(10);
    });

    it('queries com filtro de status PENDENTE (ignora CONVERTIDA)', async () => {
      prisma.indicacao.findFirst.mockResolvedValue(null);
      await service.processarConversao('cliente-novo', 'pedido-2');
      expect(prisma.indicacao.findFirst).toHaveBeenCalledWith({
        where: { indicadoUsuarioId: 'cliente-novo', status: 'PENDENTE' },
      });
      expect(prisma.cupom.create).not.toHaveBeenCalled();
    });
  });
});
