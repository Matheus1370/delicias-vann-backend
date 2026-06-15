import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { OcasiaoService } from './ocasiao.service';

@Processor('orders')
export class OcasiaoProcessor {
  private readonly logger = new Logger(OcasiaoProcessor.name);

  constructor(private ocasiao: OcasiaoService) {}

  @Process('lembrete-ocasiao')
  async handleLembreteOcasiao(_job: Job<{}>) {
    this.logger.log('Processando lembretes de ocasião...');
    await this.ocasiao.processarLembretes();
  }
}
