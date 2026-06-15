import { Module } from '@nestjs/common';
import { AvaliacaoService } from './avaliacao.service';
import { AvaliacaoController } from './avaliacao.controller';
import { InspiracaoModule } from '../inspiracao/inspiracao.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [InspiracaoModule, StorageModule],
  controllers: [AvaliacaoController],
  providers: [AvaliacaoService],
  exports: [AvaliacaoService],
})
export class AvaliacaoModule {}
