import { Controller, Get, UseGuards } from '@nestjs/common';
import { EntregaService } from './entrega.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('entrega')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EntregaController {
  constructor(private entrega: EntregaService) {}

  @Public()
  @Get('configuracoes')
  list() {
    return this.entrega.list();
  }
}
