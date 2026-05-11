import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.orderService.create(req.user.sub, body);
  }

  @Post('rascunho-whatsapp')
  createRascunhoWhatsApp(@Body() body: any, @Request() req: any) {
    return this.orderService.createRascunhoWhatsApp(req.user.sub, body);
  }

  @Get('mine')
  findMine(@Request() req: any) {
    return this.orderService.findByCliente(req.user.sub);
  }

  @Roles('OPERADOR', 'GERENTE', 'ADMINISTRADOR')
  @Get('rascunhos-whatsapp')
  findRascunhosWhatsApp() {
    return this.orderService.findRascunhosWhatsApp();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    const isAdmin = ['OPERADOR', 'GERENTE', 'ADMINISTRADOR'].includes(req.user.role);
    return this.orderService.findOne(id, req.user.sub, isAdmin);
  }

  @Post(':id/reorder')
  reorder(@Param('id') id: string, @Request() req: any) {
    return this.orderService.reorder(id, req.user.sub);
  }

  @Post(':id/cancelar')
  cancelarCliente(
    @Param('id') id: string,
    @Body() body: { motivo?: string },
    @Request() req: any,
  ) {
    return this.orderService.cancelByCliente(id, req.user.sub, body.motivo ?? '');
  }

  @Roles('OPERADOR', 'GERENTE', 'ADMINISTRADOR')
  @Get()
  findAll(@Query() query: { status?: string; page?: string; limit?: string }) {
    return this.orderService.findAllAdmin({
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
    });
  }

  @Roles('OPERADOR', 'GERENTE', 'ADMINISTRADOR')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; motivo?: string },
    @Request() req: any,
  ) {
    return this.orderService.updateStatus(id, body.status, req.user.sub, body.motivo);
  }

  @Roles('OPERADOR', 'GERENTE', 'ADMINISTRADOR')
  @Get(':id/ficha-producao')
  fichaProducao(@Param('id') id: string) {
    return this.orderService.fichaProducao(id);
  }
}
