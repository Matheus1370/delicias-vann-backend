import { Module } from '@nestjs/common';
import { EntregaService } from './entrega.service';
import { EntregaController } from './entrega.controller';

@Module({
  controllers: [EntregaController],
  providers: [EntregaService],
  exports: [EntregaService],
})
export class EntregaModule {}
