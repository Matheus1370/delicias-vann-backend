import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
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
}
