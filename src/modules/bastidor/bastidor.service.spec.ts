import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BastidorService } from './bastidor.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('BastidorService', () => {
  let service: BastidorService;
  let prisma: Record<string, any>;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      bastidorPost: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        BastidorService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get<BastidorService>(BastidorService);
  });

  const makePost = (overrides: Partial<any> = {}) => ({
    id: 'b1',
    imagemUrl: 'https://cdn.test/post.jpg',
    legenda: 'Bolo saindo do forno',
    linkInstagram: null,
    ordem: 0,
    ativo: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('listarPublicos', () => {
    it('busca só ativos ordenados por ordem ASC depois createdAt DESC, take 6 default', async () => {
      prisma.bastidorPost.findMany.mockResolvedValue([makePost()]);

      await service.listarPublicos();

      expect(prisma.bastidorPost.findMany).toHaveBeenCalledWith({
        where: { ativo: true },
        orderBy: [{ ordem: 'asc' }, { createdAt: 'desc' }],
        take: 6,
      });
    });

    it('respeita limite customizado', async () => {
      prisma.bastidorPost.findMany.mockResolvedValue([]);
      await service.listarPublicos(3);
      expect(prisma.bastidorPost.findMany.mock.calls[0][0].take).toBe(3);
    });
  });

  describe('listarAdmin', () => {
    it('lista todos sem filtro ativo', async () => {
      prisma.bastidorPost.findMany.mockResolvedValue([]);
      await service.listarAdmin();
      const call = prisma.bastidorPost.findMany.mock.calls[0][0];
      expect(call.where).toBeUndefined();
    });
  });

  describe('criar', () => {
    it('cria post com defaults e registra audit', async () => {
      const post = makePost();
      prisma.bastidorPost.create.mockResolvedValue(post);

      const result = await service.criar(
        { imagemUrl: 'https://cdn.test/x.jpg', legenda: 'Cremoso' },
        'admin-1',
      );

      expect(prisma.bastidorPost.create).toHaveBeenCalledWith({
        data: {
          imagemUrl: 'https://cdn.test/x.jpg',
          legenda: 'Cremoso',
          linkInstagram: null,
          ordem: 0,
        },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'BASTIDOR.CREATED', usuarioId: 'admin-1' }),
      );
      expect(result).toBe(post);
    });
  });

  describe('atualizar', () => {
    it('atualiza apenas campos fornecidos', async () => {
      prisma.bastidorPost.findUnique.mockResolvedValue(makePost());
      prisma.bastidorPost.update.mockResolvedValue(makePost({ ativo: false }));

      await service.atualizar('b1', { ativo: false }, 'admin-1');

      expect(prisma.bastidorPost.update).toHaveBeenCalledWith({
        where: { id: 'b1' },
        data: { ativo: false },
      });
    });

    it('lança NotFoundException quando id não existe', async () => {
      prisma.bastidorPost.findUnique.mockResolvedValue(null);
      await expect(service.atualizar('xxx', {}, 'a')).rejects.toThrow(NotFoundException);
      expect(prisma.bastidorPost.update).not.toHaveBeenCalled();
    });
  });

  describe('remover', () => {
    it('deleta + audit log', async () => {
      prisma.bastidorPost.findUnique.mockResolvedValue(makePost());
      prisma.bastidorPost.delete.mockResolvedValue({});

      await service.remover('b1', 'admin-1');

      expect(prisma.bastidorPost.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ acao: 'BASTIDOR.DELETED' }),
      );
    });

    it('lança NotFoundException quando id não existe', async () => {
      prisma.bastidorPost.findUnique.mockResolvedValue(null);
      await expect(service.remover('xxx', 'a')).rejects.toThrow(NotFoundException);
      expect(prisma.bastidorPost.delete).not.toHaveBeenCalled();
    });
  });
});
