import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RegrasService, AvaliarInput, NivelRegra } from './regras.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('regras')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegrasController {
  constructor(private regras: RegrasService) {}

  @Public()
  @Post('avaliar')
  avaliar(@Body() body: AvaliarInput) {
    return this.regras.avaliar(body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Get()
  list() {
    return this.regras.list();
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post()
  create(
    @Body()
    body: {
      nome: string;
      nivel: NivelRegra;
      condicao: { todos: any[] };
      mensagem: string;
      ativa?: boolean;
    },
    @Request() req: any,
  ) {
    return this.regras.create(body, req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.regras.update(id, body, req.user.sub);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.regras.remove(id, req.user.sub);
    return { ok: true };
  }
}
