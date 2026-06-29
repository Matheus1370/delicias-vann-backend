import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { CapacityService } from './capacity.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('capacity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CapacityController {
  constructor(private capacityService: CapacityService) {}

  @Public()
  @Get('slots')
  findAvailable(@Query('date') date: string, @Query('points') points: string) {
    return this.capacityService.findAvailableSlots(date, parseInt(points, 10));
  }

  @Roles('OPERADOR', 'GERENTE', 'ADMINISTRADOR')
  @Get('slots/range')
  findRange(@Query('from') from: string, @Query('to') to: string) {
    return this.capacityService.findSlotsRange(from, to);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Post('slots')
  create(@Body() body: any) {
    return this.capacityService.criarSlots(body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Patch('slots/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.capacityService.atualizarSlot(id, body);
  }

  @Roles('GERENTE', 'ADMINISTRADOR')
  @Delete('slots/:id')
  remove(@Param('id') id: string) {
    return this.capacityService.deletarSlot(id);
  }
}
