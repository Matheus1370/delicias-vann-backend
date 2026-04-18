import { Module } from '@nestjs/common';
import { CupomService } from './cupom.service';
import { CupomController } from './cupom.controller';

@Module({
  controllers: [CupomController],
  providers: [CupomService],
  exports: [CupomService],
})
export class CupomModule {}
