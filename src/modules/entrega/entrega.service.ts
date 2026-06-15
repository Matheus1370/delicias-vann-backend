import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EntregaService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.configuracaoEntrega.findMany({ where: { ativa: true } });
  }

  async getByModalidade(modalidade: string) {
    return this.prisma.configuracaoEntrega.findUnique({
      where: { modalidade: modalidade as any },
    });
  }

  async computeFrete(modalidade: string, subtotal: number): Promise<number> {
    const cfg = await this.getByModalidade(modalidade);
    if (!cfg) return 0;
    const base = Number(cfg.valorFreteBase);
    const limiteGratis = cfg.valorFreteGratisAcimaDe
      ? Number(cfg.valorFreteGratisAcimaDe)
      : null;
    if (limiteGratis !== null && subtotal >= limiteGratis) return 0;
    return base;
  }
}
