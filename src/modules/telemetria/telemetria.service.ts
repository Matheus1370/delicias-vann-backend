import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const PAYLOAD_MAX_BYTES = 10 * 1024;

@Injectable()
export class TelemetriaService {
  constructor(private prisma: PrismaService) {}

  async registrar(input: {
    sessaoId: string;
    usuarioId?: string | null;
    etapa: string;
    payload?: Record<string, any> | null;
  }) {
    if (!input.sessaoId || !input.sessaoId.trim()) {
      throw new BadRequestException('sessaoId obrigatório');
    }
    if (!input.etapa || !input.etapa.trim()) {
      throw new BadRequestException('etapa obrigatória');
    }

    let payload = input.payload ?? null;
    if (payload) {
      const serialized = JSON.stringify(payload);
      if (serialized.length > PAYLOAD_MAX_BYTES) {
        payload = { truncated: true, original_size: serialized.length };
      }
    }

    return this.prisma.eventoFunil.create({
      data: {
        sessaoId: input.sessaoId.trim(),
        usuarioId: input.usuarioId ?? null,
        etapa: input.etapa.trim(),
        payload: payload as any,
      },
    });
  }
}
