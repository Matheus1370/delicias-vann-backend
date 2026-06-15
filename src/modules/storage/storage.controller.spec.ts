import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('StorageController', () => {
  let controller: StorageController;
  const storage = { upload: jest.fn() };
  const prisma = { pedido: { findUnique: jest.fn() } };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: StorageService, useValue: storage },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    controller = moduleRef.get(StorageController);
    storage.upload.mockReset();
    prisma.pedido.findUnique.mockReset();
  });

  const makeFile = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
    ({
      fieldname: 'file',
      originalname: 'foto.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 100,
      buffer: Buffer.from('fake'),
      destination: '',
      filename: '',
      path: '',
      stream: undefined as any,
    }) as Express.Multer.File;

  describe('POST /uploads (autenticado)', () => {
    it('happy path: chama StorageService.upload com kind e retorna { url }', async () => {
      storage.upload.mockResolvedValueOnce({ url: 'http://localhost/cdn/referencia/abc.jpg' });
      const res = await controller.upload(makeFile(), { kind: 'referencia' });
      expect(storage.upload).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'referencia');
      expect(res).toEqual({ url: 'http://localhost/cdn/referencia/abc.jpg' });
    });

    it('rejeita kind=festa no endpoint autenticado com 400', async () => {
      await expect(controller.upload(makeFile(), { kind: 'festa' as any })).rejects.toThrow(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('rejeita kind desconhecido com 400', async () => {
      await expect(controller.upload(makeFile(), { kind: 'qualquer' as any })).rejects.toThrow(BadRequestException);
    });

    it('rejeita ausência de arquivo com 400', async () => {
      await expect(controller.upload(undefined as any, { kind: 'referencia' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('POST /uploads/publico/festa', () => {
    it('exige token no body', async () => {
      await expect(controller.uploadFestaPublico(makeFile(), { token: '' as any })).rejects.toThrow(BadRequestException);
    });

    it('rejeita token de pedido inexistente com 404', async () => {
      prisma.pedido.findUnique.mockResolvedValueOnce(null);
      await expect(controller.uploadFestaPublico(makeFile(), { token: 'inexistente' })).rejects.toMatchObject({ status: 404 });
    });

    it('rejeita pedido em status PENDENTE com 422', async () => {
      prisma.pedido.findUnique.mockResolvedValueOnce({ id: 'p1', status: 'PENDENTE' });
      await expect(controller.uploadFestaPublico(makeFile(), { token: 'p1' })).rejects.toThrow(UnprocessableEntityException);
    });

    it('aceita pedido ENTREGUE: chama upload e retorna URL', async () => {
      prisma.pedido.findUnique.mockResolvedValueOnce({ id: 'p2', status: 'ENTREGUE' });
      storage.upload.mockResolvedValueOnce({ url: 'http://localhost/cdn/festa/xyz.jpg' });
      const res = await controller.uploadFestaPublico(makeFile(), { token: 'p2' });
      expect(storage.upload).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'festa');
      expect(res).toEqual({ url: 'http://localhost/cdn/festa/xyz.jpg' });
    });
  });
});
