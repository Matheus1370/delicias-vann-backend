import { Module } from '@nestjs/common';
import { IndicacaoService } from './indicacao.service';
import { IndicacaoController } from './indicacao.controller';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [IndicacaoController],
  providers: [IndicacaoService],
  exports: [IndicacaoService],
})
export class IndicacaoModule {}
