import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('empresas')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmpresaController {
  constructor(private empresa: EmpresaService) {}

  @Post('solicitar')
  solicitar(
    @Body() body: { razaoSocial: string; cnpj: string; nomeFantasia?: string; condicaoPagamento?: string },
    @Request() req: any,
  ) {
    return this.empresa.solicitar(req.user.sub, body);
  }

  @Get('mine')
  mine(@Request() req: any) {
    return this.empresa.mine(req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Get()
  list(@Query('status') status?: string) {
    return this.empresa.list({ status });
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch(':id/aprovar')
  aprovar(
    @Param('id') id: string,
    @Body() body: { descontoPadrao?: number; condicaoPagamento?: string },
    @Request() req: any,
  ) {
    return this.empresa.aprovar(id, body, req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch(':id/rejeitar')
  rejeitar(
    @Param('id') id: string,
    @Body() body: { motivo: string },
    @Request() req: any,
  ) {
    return this.empresa.rejeitar(id, body.motivo, req.user.sub);
  }
}
