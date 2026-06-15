import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { BastidorService } from './bastidor.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('bastidor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BastidorController {
  constructor(private bastidor: BastidorService) {}

  @Public()
  @Get()
  listarPublicos(@Query('limite') limite?: string) {
    const n = limite ? parseInt(limite, 10) : 6;
    return this.bastidor.listarPublicos(Number.isFinite(n) ? n : 6);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Get('admin')
  listarAdmin() {
    return this.bastidor.listarAdmin();
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post()
  criar(
    @Body() body: { imagemUrl: string; legenda?: string; linkInstagram?: string; ordem?: number },
    @Request() req: any,
  ) {
    return this.bastidor.criar(body, req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @Body() body: Partial<{ imagemUrl: string; legenda: string; linkInstagram: string; ordem: number; ativo: boolean }>,
    @Request() req: any,
  ) {
    return this.bastidor.atualizar(id, body, req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Delete(':id')
  async remover(@Param('id') id: string, @Request() req: any) {
    await this.bastidor.remover(id, req.user.sub);
    return { ok: true };
  }
}
