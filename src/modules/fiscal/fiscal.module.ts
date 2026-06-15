import { Global, Module } from '@nestjs/common';
import { FiscalService } from './fiscal.service';

@Global()
@Module({
  providers: [FiscalService],
  exports: [FiscalService],
})
export class FiscalModule {}
