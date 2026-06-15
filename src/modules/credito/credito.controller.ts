import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { CreditoService } from './credito.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('creditos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CreditoController {
  constructor(private credito: CreditoService) {}

  @Get('saldo')
  async saldo(@Request() req: any) {
    const clienteId = req.user.sub;
    const [saldoTotal, itens] = await Promise.all([
      this.credito.saldoTotal(clienteId),
      this.credito.listAtivos(clienteId),
    ]);
    return { saldoTotal, itens };
  }
}
