import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { TelemetriaService } from './telemetria.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('telemetria')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TelemetriaController {
  constructor(private telemetria: TelemetriaService) {}

  @Public()
  @Post('evento')
  async registrar(
    @Body() body: { sessaoId: string; etapa: string; payload?: Record<string, any> },
    @Request() req: any,
  ) {
    const usuarioId = req.user?.sub ?? null;
    await this.telemetria.registrar({
      sessaoId: body.sessaoId,
      usuarioId,
      etapa: body.etapa,
      payload: body.payload ?? null,
    });
    return { ok: true };
  }
}
