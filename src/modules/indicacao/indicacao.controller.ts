import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IndicacaoService } from './indicacao.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('indicacoes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IndicacaoController {
  constructor(private indicacao: IndicacaoService) {}

  @Post()
  gerar(@Body() body: { indicadoEmail?: string }, @Request() req: any) {
    return this.indicacao.gerar(req.user.sub, body?.indicadoEmail);
  }

  @Get('mine')
  listMine(@Request() req: any) {
    return this.indicacao.listMine(req.user.sub);
  }

  @Public()
  @Get('codigo/:codigo')
  consultar(@Param('codigo') codigo: string) {
    return this.indicacao.consultar(codigo);
  }
}
