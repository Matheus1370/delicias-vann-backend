import { Module } from '@nestjs/common';
import { SazonalService } from './sazonal.service';
import { SazonalController } from './sazonal.controller';

@Module({
  controllers: [SazonalController],
  providers: [SazonalService],
  exports: [SazonalService],
})
export class SazonalModule {}
