import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CapacityModule } from './modules/capacity/capacity.module';
import { OrderModule } from './modules/order/order.module';
import { NotificationModule } from './modules/notification/notification.module';
import { AuditModule } from './modules/audit/audit.module';
import { PaymentModule } from './modules/payment/payment.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ReportModule } from './modules/report/report.module';
import { FiscalModule } from './modules/fiscal/fiscal.module';
import { CupomModule } from './modules/cupom/cupom.module';
import { AssinaturaModule } from './modules/assinatura/assinatura.module';
import { AvaliacaoModule } from './modules/avaliacao/avaliacao.module';
import { UserModule } from './modules/user/user.module';
import { RegrasModule } from './modules/regras/regras.module';
import { EntregaModule } from './modules/entrega/entrega.module';
import { CreditoModule } from './modules/credito/credito.module';
import { OcasiaoModule } from './modules/ocasiao/ocasiao.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60000, limit: 20 },
      { name: 'medium', ttl: 600000, limit: 100 },
    ]),

    BullModule.forRootAsync({
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const url = new URL(redisUrl);
        return {
          redis: { host: url.hostname, port: Number(url.port) || 6379 },
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 200,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        };
      },
    }),

    PrismaModule,
    AuditModule,
    FiscalModule,
    NotificationModule,
    AuthModule,
    UserModule,
    CatalogModule,
    CapacityModule,
    CupomModule,
    OrderModule,
    PaymentModule,
    InventoryModule,
    AssinaturaModule,
    AvaliacaoModule,
    ReportModule,
    RegrasModule,
    EntregaModule,
    CreditoModule,
    OcasiaoModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
