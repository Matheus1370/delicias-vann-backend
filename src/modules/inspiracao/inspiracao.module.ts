import { Module } from '@nestjs/common';
import { InspiracaoService } from './inspiracao.service';
import { InspiracaoController } from './inspiracao.controller';

@Module({
  controllers: [InspiracaoController],
  providers: [InspiracaoService],
  exports: [InspiracaoService],
})
export class InspiracaoModule {}
