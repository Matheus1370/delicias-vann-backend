import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface CachedForecast {
  tempMaxC: number;
  fonte: string;
  expiresAt: number;
}

interface PrevisaoClima {
  tempMaxC: number;
  fonte: string;
}

const TTL_MS = 6 * 60 * 60 * 1000;
// São Paulo defaults — confeitaria de bairro
const LAT_DEFAULT = -23.55;
const LON_DEFAULT = -46.63;

@Injectable()
export class ClimaService {
  private readonly logger = new Logger(ClimaService.name);
  private cache = new Map<string, CachedForecast>();

  constructor(private config: ConfigService) {}

  async prever(data: Date): Promise<PrevisaoClima | null> {
    const apiKey = this.config.get<string>('OPENWEATHER_API_KEY');
    if (!apiKey) return null;

    const lat = this.config.get<number>('OPENWEATHER_LAT') ?? LAT_DEFAULT;
    const lon = this.config.get<number>('OPENWEATHER_LON') ?? LON_DEFAULT;
    const targetTs = data.getTime();
    const cacheKey = `${lat},${lon},${data.toISOString().slice(0, 10)}`;

    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return { tempMaxC: hit.tempMaxC, fonte: hit.fonte };
    }

    try {
      const resp = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
        params: { lat, lon, appid: apiKey, units: 'metric', lang: 'pt_br' },
        timeout: 5000,
      });
      const list: Array<{ dt_txt: string; main: { temp_max: number } }> =
        resp.data?.list ?? [];
      if (list.length === 0) return null;

      let melhor: { item: typeof list[number]; diff: number } | null = null;
      for (const item of list) {
        // dt_txt vem em UTC "YYYY-MM-DD HH:mm:ss"
        const ts = new Date(item.dt_txt.replace(' ', 'T') + 'Z').getTime();
        const diff = Math.abs(ts - targetTs);
        if (!melhor || diff < melhor.diff) melhor = { item, diff };
      }

      if (!melhor) return null;

      const tempMaxC = melhor.item.main.temp_max;
      this.cache.set(cacheKey, {
        tempMaxC,
        fonte: 'openweather',
        expiresAt: Date.now() + TTL_MS,
      });
      return { tempMaxC, fonte: 'openweather' };
    } catch (err: any) {
      this.logger.warn(`Falha ao buscar previsão clima: ${err?.message ?? 'unknown'}`);
      return null;
    }
  }
}
