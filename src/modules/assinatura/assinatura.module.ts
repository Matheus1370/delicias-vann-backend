import { Module } from '@nestjs/common';
import { AssinaturaService } from './assinatura.service';
import { AssinaturaController } from './assinatura.controller';

@Module({
  controllers: [AssinaturaController],
  providers: [AssinaturaService],
  exports: [AssinaturaService],
})
export class AssinaturaModule {}
