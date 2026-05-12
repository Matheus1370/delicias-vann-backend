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
import { OcasiaoService } from './ocasiao.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('ocasioes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OcasiaoController {
  constructor(private ocasiao: OcasiaoService) {}

  @Get('mine')
  listMine(@Request() req: any) {
    return this.ocasiao.listMine(req.user.sub);
  }

  @Post()
  create(
    @Body() body: { titulo: string; diaMes: string; pedidoOriginalId?: string; ano?: number },
    @Request() req: any,
  ) {
    return this.ocasiao.create(req.user.sub, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { titulo?: string; diaMes?: string; ativa?: boolean },
    @Request() req: any,
  ) {
    return this.ocasiao.update(id, req.user.sub, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req: any) {
    await this.ocasiao.remove(id, req.user.sub);
    return { ok: true };
  }
}
