import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RegrasService } from './regras.service';
import { RegrasController } from './regras.controller';
import { ClimaService } from './clima.service';

@Module({
  imports: [ConfigModule],
  controllers: [RegrasController],
  providers: [RegrasService, ClimaService],
  exports: [RegrasService],
})
export class RegrasModule {}
