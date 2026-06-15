import { Module } from '@nestjs/common';
import { IndicacaoService } from './indicacao.service';
import { IndicacaoController } from './indicacao.controller';

@Module({
  controllers: [IndicacaoController],
  providers: [IndicacaoService],
  exports: [IndicacaoService],
})
export class IndicacaoModule {}
