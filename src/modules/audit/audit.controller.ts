import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Roles('ADMINISTRADOR')
  @Get()
  list(
    @Query()
    query: {
      entidade?: string;
      acao?: string;
      usuarioBusca?: string;
      entidadeId?: string;
      dataInicio?: string;
      dataFim?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    return this.auditService.list(query);
  }

  @Roles('ADMINISTRADOR')
  @Get('facets')
  facets() {
    return this.auditService.facets();
  }
}
