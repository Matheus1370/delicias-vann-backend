import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('GERENTE', 'ADMINISTRADOR')
export class ReportController {
  constructor(private reportService: ReportService) {}

  @Get('overview')
  overview(@Query('days') days?: string) {
    return this.reportService.overview(days ? parseInt(days, 10) : 30);
  }

  @Get('vendas-diarias')
  vendasDiarias(@Query('days') days?: string) {
    return this.reportService.vendasDiarias(days ? parseInt(days, 10) : 14);
  }

  @Get('margem-produto')
  margemProduto(@Query('days') days?: string) {
    return this.reportService.margemPorProduto(days ? parseInt(days, 10) : 30);
  }

  @Get('cohort')
  cohort(@Query('days') days?: string) {
    return this.reportService.cohortRetencao(days ? parseInt(days, 10) : 90);
  }

  @Get('ocupacao-slots')
  ocupacaoSlots(@Query('days') days?: string) {
    return this.reportService.ocupacaoSlots(days ? parseInt(days, 10) : 30);
  }

  @Get('gasto-insumo')
  gastoInsumo(@Query('days') days?: string) {
    return this.reportService.gastoPorInsumo(days ? parseInt(days, 10) : 30);
  }
}
