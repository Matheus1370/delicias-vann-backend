import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CupomService } from './cupom.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('cupons')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CupomController {
  constructor(private cupomService: CupomService) {}

  @Get('validar')
  validar(@Query('codigo') codigo: string, @Query('subtotal') subtotal: string) {
    return this.cupomService.validate(codigo, parseFloat(subtotal));
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Get()
  findAll() {
    return this.cupomService.findAll();
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.cupomService.create(body, req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch(':id/toggle')
  toggle(
    @Param('id') id: string,
    @Body() body: { ativo: boolean },
    @Request() req: any,
  ) {
    return this.cupomService.toggle(id, body.ativo, req.user.sub);
  }
}
