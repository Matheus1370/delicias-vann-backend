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
import { InspiracaoService } from './inspiracao.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('inspiracoes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InspiracaoController {
  constructor(private inspiracao: InspiracaoService) {}

  @Public()
  @Get()
  list(
    @Query('massa') tagsMassa?: string,
    @Query('recheio') tagsRecheio?: string,
    @Query('cobertura') tagsCobertura?: string,
    @Query('topo') tagsTopo?: string,
    @Query('ocasiao') ocasiao?: string,
  ) {
    const split = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);
    return this.inspiracao.listarPublicas({
      tagsMassa: split(tagsMassa),
      tagsRecheio: split(tagsRecheio),
      tagsCobertura: split(tagsCobertura),
      tagsTopo: split(tagsTopo),
      ocasiao,
    });
  }

  @Public()
  @Get(':id')
  obter(@Param('id') id: string) {
    return this.inspiracao.obter(id);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Get('admin/list')
  listAdmin() {
    return this.inspiracao.listarAdmin();
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post()
  criar(@Body() body: any) {
    return this.inspiracao.criar(body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() body: any) {
    return this.inspiracao.atualizar(id, body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Delete(':id')
  async remover(@Param('id') id: string) {
    await this.inspiracao.remover(id);
    return { ok: true };
  }
}
