import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class JobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(JobsScheduler.name);

  constructor(@InjectQueue('orders') private ordersQueue: Queue) {}

  async onModuleInit() {
    await this.registrarRepeatable('watchdog-sla', {}, '*/30 * * * *');
    await this.registrarRepeatable('check-low-stock', {}, '0 * * * *');
    await this.registrarRepeatable('gerar-assinaturas', {}, '0 6 * * *');
    await this.registrarRepeatable('cupom-aniversario', {}, '0 7 * * *');
    await this.registrarRepeatable('lembrete-ocasiao', {}, '0 9 * * *');
    this.logger.log('Jobs recorrentes registrados');
  }

  private async registrarRepeatable(name: string, data: any, cron: string) {
    const existentes = await this.ordersQueue.getRepeatableJobs();
    for (const job of existentes) {
      if (job.name === name) {
        await this.ordersQueue.removeRepeatableByKey(job.key);
      }
    }
    await this.ordersQueue.add(name, data, {
      repeat: { cron },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
