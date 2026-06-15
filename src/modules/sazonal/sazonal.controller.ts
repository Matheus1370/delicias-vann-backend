import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SazonalService } from './sazonal.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('sazonal')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SazonalController {
  constructor(private sazonal: SazonalService) {}

  @Public()
  @Get('aviso')
  async aviso(@Query('data') data?: string) {
    const alvo = data ? new Date(data) : new Date();
    const janela = await this.sazonal.avaliarData(alvo);
    return janela
      ? {
          ativa: true,
          nome: janela.nome,
          aviso: janela.aviso,
          antecedenciaMinDias: janela.antecedenciaMinDias,
          bloquearCustomizacao: janela.bloquearCustomizacao,
        }
      : { ativa: false };
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Get()
  list() {
    return this.sazonal.list();
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post()
  create(@Body() body: any) {
    return this.sazonal.create(body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.sazonal.update(id, body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.sazonal.remove(id);
    return { ok: true };
  }
}
