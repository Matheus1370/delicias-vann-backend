import { Module } from '@nestjs/common';
import { BastidorService } from './bastidor.service';
import { BastidorController } from './bastidor.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [BastidorController],
  providers: [BastidorService],
  exports: [BastidorService],
})
export class BastidorModule {}
