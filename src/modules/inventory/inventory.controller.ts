import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OPERADOR', 'GERENTE', 'ADMINISTRADOR')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get()
  findAll() {
    return this.inventoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Get('alertas/abertos')
  alertas() {
    return this.inventoryService.alertasAbertos();
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch('alertas/:id/resolver')
  resolverAlerta(@Param('id') id: string) {
    return this.inventoryService.resolverAlerta(id);
  }

  @Post('venda-balcao')
  vendaBalcao(
    @Body()
    body: {
      itens: Array<{ produtoId: string; quantidade: number }>;
      observacoes?: string;
    },
    @Request() req: any,
  ) {
    return this.inventoryService.vendaBalcao(req.user.sub, body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post(':id/movimentacao')
  movimentar(
    @Param('id') id: string,
    @Body()
    body: {
      tipo: 'ENTRADA' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'QUEBRA_DESPERDICIO';
      quantidade: number;
      custoUnitario?: number;
      motivo?: string;
    },
    @Request() req: any,
  ) {
    return this.inventoryService.movimentar(id, body, req.user.sub);
  }
}
