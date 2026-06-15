import { Module } from '@nestjs/common';
import { TelemetriaService } from './telemetria.service';
import { TelemetriaController } from './telemetria.controller';

@Module({
  controllers: [TelemetriaController],
  providers: [TelemetriaService],
  exports: [TelemetriaService],
})
export class TelemetriaModule {}
