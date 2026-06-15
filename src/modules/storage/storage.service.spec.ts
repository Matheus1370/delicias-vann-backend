import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnprocessableEntityException } from '@nestjs/common';
import { StorageService } from './storage.service';
import { S3_CLIENT } from './types';

describe('StorageService', () => {
  let service: StorageService;
  const s3Mock = { send: jest.fn() };

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: S3_CLIENT, useValue: s3Mock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const map: Record<string, string> = {
                S3_BUCKET: 'uploads',
                CDN_BASE_URL: 'http://localhost/cdn',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();
    service = moduleRef.get<StorageService>(StorageService);
    s3Mock.send.mockReset();
  });

  describe('assertCdnUrl', () => {
    it('aceita URL com prefixo CDN_BASE_URL', () => {
      expect(() => service.assertCdnUrl('http://localhost/cdn/referencia/abc.jpg')).not.toThrow();
    });
    it('rejeita URL fora do CDN com 422', () => {
      expect(() => service.assertCdnUrl('https://evil.example/foto.jpg')).toThrow(UnprocessableEntityException);
    });
    it('rejeita string vazia', () => {
      expect(() => service.assertCdnUrl('')).toThrow(UnprocessableEntityException);
    });
    it('rejeita undefined / null como string', () => {
      expect(() => service.assertCdnUrl(undefined as any)).toThrow();
      expect(() => service.assertCdnUrl(null as any)).toThrow();
    });
  });

  describe('upload', () => {
    const makeJpegBuffer = async (width = 100, height = 100): Promise<Buffer> => {
      const sharp = require('sharp');
      return sharp({
        create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
      }).jpeg().toBuffer();
    };

    it('aceita JPEG válido e retorna URL com prefixo do kind', async () => {
      const buf = await makeJpegBuffer();
      s3Mock.send.mockResolvedValueOnce({});
      const out = await service.upload(buf, 'image/jpeg', 'referencia');
      expect(out.url).toMatch(/^http:\/\/localhost\/cdn\/referencia\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/);
      expect(s3Mock.send).toHaveBeenCalledTimes(1);
    });

    it('aceita PNG e devolve JPEG (Content-Type) na saída', async () => {
      const sharp = require('sharp');
      const png = await sharp({
        create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      }).png().toBuffer();
      s3Mock.send.mockResolvedValueOnce({});
      const out = await service.upload(png, 'image/png', 'produto');
      expect(out.url).toContain('/produto/');
      expect(out.url).toMatch(/\.jpg$/);
      const cmd = s3Mock.send.mock.calls[0][0];
      expect(cmd.input.ContentType).toBe('image/jpeg');
    });

    it('rejeita MIME não-imagem com 400', async () => {
      const buf = Buffer.from('not an image');
      await expect(service.upload(buf, 'application/pdf', 'referencia')).rejects.toMatchObject({ status: 400 });
    });

    it('rejeita buffer maior que 5 MB', async () => {
      const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
      await expect(service.upload(big, 'image/jpeg', 'referencia')).rejects.toMatchObject({ status: 400 });
    });

    it('rejeita buffer corrompido (sharp throw → 400)', async () => {
      const corrupted = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
      await expect(service.upload(corrupted, 'image/jpeg', 'referencia')).rejects.toMatchObject({ status: 400 });
    });

    it('faz resize: input 3000x2000 → output max 1600 no maior lado', async () => {
      const sharp = require('sharp');
      const big = await sharp({
        create: { width: 3000, height: 2000, channels: 3, background: { r: 100, g: 100, b: 100 } },
      }).jpeg().toBuffer();
      s3Mock.send.mockResolvedValueOnce({});
      await service.upload(big, 'image/jpeg', 'inspiracao');
      const cmd = s3Mock.send.mock.calls[0][0];
      const sentBuffer: Buffer = cmd.input.Body;
      const meta = await sharp(sentBuffer).metadata();
      expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);
    });

    it('strip EXIF: GPS some no buffer pós-processamento', async () => {
      const sharp = require('sharp');
      const withExif = await sharp({
        create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .withExif({
          IFD0: { Make: 'TestCam' },
          GPS: { GPSLatitude: '50/1 0/1 0/1', GPSLongitude: '10/1 0/1 0/1' },
        } as any)
        .jpeg()
        .toBuffer();
      s3Mock.send.mockResolvedValueOnce({});
      await service.upload(withExif, 'image/jpeg', 'festa');
      const sent: Buffer = s3Mock.send.mock.calls[0][0].input.Body;
      const meta = await sharp(sent).metadata();
      expect(meta.exif).toBeUndefined();
    });

    it('key sempre tem UUID v4 + extensão .jpg, ignora qualquer nome de cliente', async () => {
      const buf = await makeJpegBuffer();
      s3Mock.send.mockResolvedValueOnce({});
      await service.upload(buf, 'image/jpeg', 'bolo-pronto');
      const cmd = s3Mock.send.mock.calls[0][0];
      expect(cmd.input.Key).toMatch(/^bolo-pronto\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/);
    });
  });

  describe('onModuleInit', () => {
    const { HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand } = require('@aws-sdk/client-s3');

    it('não cria bucket quando já existe', async () => {
      s3Mock.send.mockResolvedValueOnce({});
      await service.onModuleInit();
      const commands = s3Mock.send.mock.calls.map((c: any[]) => c[0].constructor.name);
      expect(commands).toEqual(['HeadBucketCommand']);
    });

    it('cria bucket + policy pública quando HeadBucket falha', async () => {
      s3Mock.send.mockRejectedValueOnce(new Error('NoSuchBucket'));
      s3Mock.send.mockResolvedValueOnce({});
      s3Mock.send.mockResolvedValueOnce({});

      await service.onModuleInit();

      const commands = s3Mock.send.mock.calls.map((c: any[]) => c[0].constructor.name);
      expect(commands).toEqual(['HeadBucketCommand', 'CreateBucketCommand', 'PutBucketPolicyCommand']);
      const policyCmd = s3Mock.send.mock.calls[2][0];
      const policy = JSON.parse(policyCmd.input.Policy);
      expect(policy.Statement[0].Action).toBe('s3:GetObject');
      expect(policy.Statement[0].Principal).toBe('*');
    });
  });
});
