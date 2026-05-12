import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ClimaService } from './clima.service';

jest.mock('axios');
const axiosMock = axios as jest.Mocked<typeof axios>;

describe('ClimaService', () => {
  let service: ClimaService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = { get: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClimaService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get<ClimaService>(ClimaService);
    axiosMock.get.mockReset();
  });

  const mockForecast = (entries: Array<{ dt_txt: string; tempMax: number }>) => {
    axiosMock.get.mockResolvedValue({
      data: {
        list: entries.map((e) => ({
          dt_txt: e.dt_txt,
          main: { temp_max: e.tempMax },
        })),
      },
    });
  };

  describe('prever', () => {
    it('returns null when OPENWEATHER_API_KEY is not configured', async () => {
      config.get.mockReturnValue(undefined);

      const result = await service.prever(new Date('2026-05-15T15:00:00Z'));

      expect(result).toBeNull();
      expect(axiosMock.get).not.toHaveBeenCalled();
    });

    it('returns tempMaxC for the forecast entry closest to target date', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'OPENWEATHER_API_KEY' ? 'fake-key' : undefined,
      );
      mockForecast([
        { dt_txt: '2026-05-15 09:00:00', tempMax: 22 },
        { dt_txt: '2026-05-15 15:00:00', tempMax: 30 }, // closest
        { dt_txt: '2026-05-15 21:00:00', tempMax: 24 },
      ]);

      const result = await service.prever(new Date('2026-05-15T15:00:00Z'));

      expect(result).toEqual({ tempMaxC: 30, fonte: 'openweather' });
    });

    it('caches a forecast and avoids a second API call within TTL', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'OPENWEATHER_API_KEY' ? 'fake-key' : undefined,
      );
      mockForecast([{ dt_txt: '2026-05-15 15:00:00', tempMax: 28 }]);

      const target = new Date('2026-05-15T15:00:00Z');
      await service.prever(target);
      await service.prever(target);

      expect(axiosMock.get).toHaveBeenCalledTimes(1);
    });

    it('returns null when forecast call fails', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'OPENWEATHER_API_KEY' ? 'fake-key' : undefined,
      );
      axiosMock.get.mockRejectedValue(new Error('network down'));

      const result = await service.prever(new Date('2026-05-15T15:00:00Z'));

      expect(result).toBeNull();
    });

    it('returns null when forecast list is empty', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'OPENWEATHER_API_KEY' ? 'fake-key' : undefined,
      );
      axiosMock.get.mockResolvedValue({ data: { list: [] } });

      const result = await service.prever(new Date('2026-05-15T15:00:00Z'));

      expect(result).toBeNull();
    });
  });
});
