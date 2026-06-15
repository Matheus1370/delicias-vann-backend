import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TelemetriaService } from './telemetria.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelemetriaService', () => {
  let service: TelemetriaService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      eventoFunil: {
        create: jest.fn(),
        groupBy: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetriaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get<TelemetriaService>(TelemetriaService);
  });

  describe('registrar', () => {
    it('persists evento com sessaoId, usuarioId, etapa e payload', async () => {
      prisma.eventoFunil.create.mockResolvedValue({ id: 'e1' });

      await service.registrar({
        sessaoId: 'sess-1',
        usuarioId: 'u1',
        etapa: 'WIZARD_INICIADO',
        payload: { foo: 'bar' },
      });

      expect(prisma.eventoFunil.create).toHaveBeenCalledWith({
        data: {
          sessaoId: 'sess-1',
          usuarioId: 'u1',
          etapa: 'WIZARD_INICIADO',
          payload: { foo: 'bar' },
        },
      });
    });

    it('rejects etapa vazia', async () => {
      await expect(
        service.registrar({ sessaoId: 's', etapa: '' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects sessaoId vazio', async () => {
      await expect(
        service.registrar({ sessaoId: '', etapa: 'WIZARD_INICIADO' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('truncates payload muito grande (>10kb) silently', async () => {
      prisma.eventoFunil.create.mockResolvedValue({ id: 'e1' });
      const huge = 'a'.repeat(20000);

      await service.registrar({
        sessaoId: 's',
        etapa: 'X',
        payload: { texto: huge },
      });

      const call = prisma.eventoFunil.create.mock.calls[0][0].data.payload;
      expect(JSON.stringify(call).length).toBeLessThanOrEqual(11000);
    });
  });
});
