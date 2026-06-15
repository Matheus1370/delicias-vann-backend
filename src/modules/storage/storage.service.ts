import {
  Inject,
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { S3_CLIENT, UploadKind } from './types';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 1600;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly cdnBaseUrl: string;

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('S3_BUCKET', 'uploads');
    this.cdnBaseUrl = config.get<string>('CDN_BASE_URL', '').replace(/\/$/, '');
  }

  async onModuleInit(): Promise<void> {
    const exists = await this.s3
      .send(new HeadBucketCommand({ Bucket: this.bucket }))
      .then(() => true)
      .catch(() => false);

    if (exists) {
      this.logger.log(`bucket "${this.bucket}" já existe`);
      return;
    }

    await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    await this.s3.send(
      new PutBucketPolicyCommand({
        Bucket: this.bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: '*',
              Action: 's3:GetObject',
              Resource: `arn:aws:s3:::${this.bucket}/*`,
            },
          ],
        }),
      }),
    );
    this.logger.log(`bucket "${this.bucket}" criado com policy de leitura pública`);
  }

  assertCdnUrl(url: string): void {
    if (!url || typeof url !== 'string' || !url.startsWith(this.cdnBaseUrl + '/')) {
      throw new UnprocessableEntityException('url fora do CDN configurado');
    }
  }

  async upload(buffer: Buffer, mime: string, kind: UploadKind): Promise<{ url: string }> {
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException('tipo de arquivo não suportado');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('arquivo excede 5 MB');
    }

    let processed: Buffer;
    try {
      processed = await sharp(buffer)
        .rotate()
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new BadRequestException('imagem inválida');
    }

    const key = `${kind}/${randomUUID()}.jpg`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: processed,
        ContentType: 'image/jpeg',
      }),
    );

    return { url: `${this.cdnBaseUrl}/${key}` };
  }
}
