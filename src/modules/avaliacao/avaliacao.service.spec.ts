import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AvaliacaoService } from './avaliacao.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AvaliacaoService', () => {
  let service: AvaliacaoService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      pedido: {
        findUnique: jest.fn(),
      },
      avaliacao: {
        create: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AvaliacaoService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get<AvaliacaoService>(AvaliacaoService);
  });

  const makePedido = (overrides: Partial<any> = {}) => ({
    id: 'pedido-1',
    clienteId: 'c1',
    status: 'ENTREGUE',
    avaliacao: null,
    itens: [{ produtoId: 'prod-1' }],
    cliente: { nome: 'Vann' },
    ...overrides,
  });

  describe('criarPublica', () => {
    it('throws NotFound when token (pedidoId) does not match a pedido', async () => {
      prisma.pedido.findUnique.mockResolvedValue(null);

      await expect(
        service.criarPublica('token-x', { notaNPS: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest when pedido is not ENTREGUE', async () => {
      prisma.pedido.findUnique.mockResolvedValue(makePedido({ status: 'EM_PRODUCAO' }));

      await expect(
        service.criarPublica('pedido-1', { notaNPS: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest when pedido already has avaliacao', async () => {
      prisma.pedido.findUnique.mockResolvedValue(
        makePedido({ avaliacao: { id: 'av1' } }),
      );

      await expect(
        service.criarPublica('pedido-1', { notaNPS: 10 }),
      ).rejects.toThrow(/já avaliado/i);
    });

    it('rejects notaNPS outside 0-10', async () => {
      prisma.pedido.findUnique.mockResolvedValue(makePedido());

      await expect(
        service.criarPublica('pedido-1', { notaNPS: 11 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.criarPublica('pedido-1', { notaNPS: -1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps notaNPS 9-10 to nota 5 stars', async () => {
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      prisma.avaliacao.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      await service.criarPublica('pedido-1', { notaNPS: 9 });
      expect(prisma.avaliacao.create.mock.calls[0][0].data.nota).toBe(5);

      await service.criarPublica('pedido-1', { notaNPS: 10 });
      expect(prisma.avaliacao.create.mock.calls[1][0].data.nota).toBe(5);
    });

    it('maps notaNPS 7-8 to nota 4 stars', async () => {
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      prisma.avaliacao.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      await service.criarPublica('pedido-1', { notaNPS: 7 });
      expect(prisma.avaliacao.create.mock.calls[0][0].data.nota).toBe(4);

      await service.criarPublica('pedido-1', { notaNPS: 8 });
      expect(prisma.avaliacao.create.mock.calls[1][0].data.nota).toBe(4);
    });

    it('maps notaNPS 0-6 to lower nota stars', async () => {
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      prisma.avaliacao.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      const casos: Array<[number, number]> = [
        [6, 3],
        [5, 3],
        [4, 3],
        [3, 2],
        [2, 2],
        [1, 2],
        [0, 1],
      ];
      for (const [nps, esperado] of casos) {
        prisma.avaliacao.create.mockClear();
        await service.criarPublica('pedido-1', { notaNPS: nps });
        expect(prisma.avaliacao.create.mock.calls[0][0].data.nota).toBe(esperado);
      }
    });

    it('persists notaNPS, fotoFesta, permiteUsoFoto and comentario', async () => {
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      prisma.avaliacao.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      await service.criarPublica('pedido-1', {
        notaNPS: 10,
        comentario: 'maravilhoso',
        fotoFesta: 'data:image/jpeg;base64,xxx',
        permiteUsoFoto: true,
      });

      const data = prisma.avaliacao.create.mock.calls[0][0].data;
      expect(data.notaNPS).toBe(10);
      expect(data.comentario).toBe('maravilhoso');
      expect(data.fotoFesta).toBe('data:image/jpeg;base64,xxx');
      expect(data.permiteUsoFoto).toBe(true);
      expect(data.pedidoId).toBe('pedido-1');
      expect(data.clienteId).toBe('c1');
      expect(data.produtoId).toBe('prod-1');
    });

    it('defaults permiteUsoFoto to false when omitted', async () => {
      prisma.pedido.findUnique.mockResolvedValue(makePedido());
      prisma.avaliacao.create.mockImplementation(({ data }: any) => Promise.resolve(data));

      await service.criarPublica('pedido-1', { notaNPS: 9 });

      expect(prisma.avaliacao.create.mock.calls[0][0].data.permiteUsoFoto).toBe(false);
    });
  });

  describe('obterPublica', () => {
    it('returns minimal pedido info for the token', async () => {
      prisma.pedido.findUnique.mockResolvedValue(makePedido({
        cliente: { nome: 'Vann' },
        itens: [
          { quantidade: 1, produto: { nome: 'Bolo Personalizado' } },
        ],
      }));

      const resp = await service.obterPublica('pedido-1');

      expect(resp).toEqual(
        expect.objectContaining({
          pedidoId: 'pedido-1',
          clienteNome: 'Vann',
          status: 'ENTREGUE',
          jaAvaliado: false,
        }),
      );
      expect(resp.itens).toEqual([
        { quantidade: 1, nome: 'Bolo Personalizado' },
      ]);
    });

    it('throws NotFound when token does not match', async () => {
      prisma.pedido.findUnique.mockResolvedValue(null);
      await expect(service.obterPublica('inex')).rejects.toThrow(NotFoundException);
    });
  });
});
