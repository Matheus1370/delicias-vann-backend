import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderProcessor } from './order.processor';
import { JobsScheduler } from './jobs.scheduler';
import { CapacityModule } from '../capacity/capacity.module';
import { CupomModule } from '../cupom/cupom.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'orders' }),
    CapacityModule,
    CupomModule,
    forwardRef(() => PaymentModule),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderProcessor, JobsScheduler],
  exports: [OrderService, BullModule],
})
export class OrderModule {}
