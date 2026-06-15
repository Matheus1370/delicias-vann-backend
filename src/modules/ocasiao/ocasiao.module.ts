import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OcasiaoService } from './ocasiao.service';
import { OcasiaoController } from './ocasiao.controller';
import { OcasiaoProcessor } from './ocasiao.processor';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'orders' }),
    NotificationModule,
  ],
  controllers: [OcasiaoController],
  providers: [OcasiaoService, OcasiaoProcessor],
  exports: [OcasiaoService],
})
export class OcasiaoModule {}
