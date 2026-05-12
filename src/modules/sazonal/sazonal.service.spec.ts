import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { SazonalService } from './sazonal.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SazonalService', () => {
  let service: SazonalService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      janelaSazonal: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SazonalService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get<SazonalService>(SazonalService);
  });

  const makeJanela = (overrides: Partial<any> = {}) => ({
    id: 'j1',
    nome: 'Dia das Mães 2027',
    inicio: new Date('2027-05-01'),
    fim: new Date('2027-05-14'),
    antecedenciaMinDias: 7,
    bloquearCustomizacao: false,
    capacidadeReduzida: null,
    aviso: 'Pedidos pra Dia das Mães precisam de 7 dias de antecedência.',
    ativa: true,
    ...overrides,
  });

  describe('avaliarData', () => {
    it('returns null when no active janela covers data', async () => {
      prisma.janelaSazonal.findMany.mockResolvedValue([]);

      const r = await service.avaliarData(new Date('2027-08-15'));

      expect(r).toBeNull();
    });

    it('returns janela ativa when data falls within inicio-fim', async () => {
      const janela = makeJanela();
      prisma.janelaSazonal.findMany.mockResolvedValue([janela]);

      const r = await service.avaliarData(new Date('2027-05-07'));

      expect(r).toEqual(
        expect.objectContaining({ id: 'j1', nome: 'Dia das Mães 2027' }),
      );
    });

    it('ignores janelas inativas', async () => {
      const inativa = makeJanela({ ativa: false });
      prisma.janelaSazonal.findMany.mockResolvedValue([]);
      // o findMany filtra ativa true; testa a config da query
      await service.avaliarData(new Date('2027-05-07'));
      const call = prisma.janelaSazonal.findMany.mock.calls[0][0];
      expect(call.where.ativa).toBe(true);
    });
  });

  describe('checarPedido', () => {
    const HOJE = new Date('2027-04-20T00:00:00Z');
    const realDate = Date;

    beforeAll(() => {
      jest.useFakeTimers();
      jest.setSystemTime(HOJE);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('returns ok=true quando nao ha janela na data alvo', async () => {
      prisma.janelaSazonal.findMany.mockResolvedValue([]);
      const r = await service.checarPedido({
        dataAlvo: new Date('2027-08-15'),
        temCustomizacao: false,
      });
      expect(r.ok).toBe(true);
    });

    it('returns ok=false quando antecedencia insuficiente em janela ativa', async () => {
      const janela = makeJanela({
        inicio: new Date('2027-05-01'),
        fim: new Date('2027-05-14'),
        antecedenciaMinDias: 30,
      });
      prisma.janelaSazonal.findMany.mockResolvedValue([janela]);

      // dataAlvo a 11 dias a frente (2027-05-01) com janela exigindo 30
      const r = await service.checarPedido({
        dataAlvo: new Date('2027-05-01T00:00:00Z'),
        temCustomizacao: false,
      });

      expect(r.ok).toBe(false);
      expect(r.motivo).toMatch(/antecedencia/i);
    });

    it('returns ok=false quando janela bloqueia customizacao e pedido tem', async () => {
      const janela = makeJanela({
        bloquearCustomizacao: true,
        antecedenciaMinDias: 0,
      });
      prisma.janelaSazonal.findMany.mockResolvedValue([janela]);

      const r = await service.checarPedido({
        dataAlvo: new Date('2027-05-10T00:00:00Z'),
        temCustomizacao: true,
      });

      expect(r.ok).toBe(false);
      expect(r.motivo).toMatch(/customiza/i);
    });

    it('returns ok=true quando customizacao bloqueada mas pedido nao tem', async () => {
      const janela = makeJanela({
        bloquearCustomizacao: true,
        antecedenciaMinDias: 0,
      });
      prisma.janelaSazonal.findMany.mockResolvedValue([janela]);

      const r = await service.checarPedido({
        dataAlvo: new Date('2027-05-10T00:00:00Z'),
        temCustomizacao: false,
      });

      expect(r.ok).toBe(true);
      expect(r.janela?.id).toBe('j1');
    });
  });
});
