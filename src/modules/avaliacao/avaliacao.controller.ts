import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AvaliacaoService } from './avaliacao.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('avaliacoes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AvaliacaoController {
  constructor(private service: AvaliacaoService) {}

  @Post()
  criar(
    @Body() body: { pedidoId: string; nota: number; comentario?: string },
    @Request() req: any,
  ) {
    return this.service.criar(req.user.sub, body);
  }

  @Public()
  @Get('produto/:produtoId')
  listarPorProduto(@Param('produtoId') produtoId: string) {
    return this.service.listarPorProduto(produtoId);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch(':id/moderar')
  moderar(@Param('id') id: string, @Body() body: { publicado: boolean }) {
    return this.service.moderar(id, body.publicado);
  }
}
