import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderProcessor } from './order.processor';
import { JobsScheduler } from './jobs.scheduler';
import { CapacityModule } from '../capacity/capacity.module';
import { CupomModule } from '../cupom/cupom.module';
import { PaymentModule } from '../payment/payment.module';
import { NotificationModule } from '../notification/notification.module';
import { AuditModule } from '../audit/audit.module';
import { EntregaModule } from '../entrega/entrega.module';
import { CreditoModule } from '../credito/credito.module';
import { IndicacaoModule } from '../indicacao/indicacao.module';
import { EmpresaModule } from '../empresa/empresa.module';
import { SazonalModule } from '../sazonal/sazonal.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'orders' }),
    CapacityModule,
    CupomModule,
    NotificationModule,
    AuditModule,
    EntregaModule,
    CreditoModule,
    IndicacaoModule,
    EmpresaModule,
    SazonalModule,
    forwardRef(() => PaymentModule),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderProcessor, JobsScheduler],
  exports: [OrderService, BullModule],
})
export class OrderModule {}
