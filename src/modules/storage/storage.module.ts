import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { S3ClientProvider } from './s3.provider';

@Module({
  controllers: [StorageController],
  providers: [StorageService, S3ClientProvider],
  exports: [StorageService],
})
export class StorageModule {}
