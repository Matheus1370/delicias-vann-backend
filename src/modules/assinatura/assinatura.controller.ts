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
import { AssinaturaService } from './assinatura.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('assinaturas')
@UseGuards(JwtAuthGuard)
export class AssinaturaController {
  constructor(private service: AssinaturaService) {}

  @Get('mine')
  findMine(@Request() req: any) {
    return this.service.listarMinhas(req.user.sub);
  }

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.service.criar(req.user.sub, body);
  }

  @Patch(':id/pausar')
  pausar(@Param('id') id: string, @Request() req: any) {
    return this.service.pausar(id, req.user.sub);
  }

  @Patch(':id/retomar')
  retomar(@Param('id') id: string, @Request() req: any) {
    return this.service.retomar(id, req.user.sub);
  }

  @Patch(':id/cancelar')
  cancelar(@Param('id') id: string, @Request() req: any) {
    return this.service.cancelar(id, req.user.sub);
  }
}
