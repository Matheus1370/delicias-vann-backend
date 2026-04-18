import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewayService, PixChargeInput } from './payment-gateway.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PaymentGatewayService', () => {
  let service: PaymentGatewayService;
  let configService: { get: jest.Mock };

  const defaultInput: PixChargeInput = {
    pedidoId: 'ped_12345678-abcd',
    valorCentavos: 5000,
    clienteNome: 'Maria Silva',
    clienteEmail: 'maria@example.com',
    clienteTelefone: '11999990000',
    expiresInMinutes: 30,
  };

  beforeEach(async () => {
    configService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentGatewayService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<PaymentGatewayService>(PaymentGatewayService);
    jest.clearAllMocks();
  });

  describe('createPixCharge — mock mode', () => {
    it('should return mock pix data when API key is not set', async () => {
      configService.get.mockReturnValue(undefined);

      const result = await service.createPixCharge(defaultInput);

      expect(result.transacaoId).toContain('mock_');
      expect(result.pixCopiaCola).toBeDefined();
      expect(result.pixCopiaCola.length).toBeGreaterThan(0);
      expect(result.pixQrCodeUrl).toContain('qrserver.com');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(result.raw).toEqual(
        expect.objectContaining({
          mock: true,
          pedidoId: defaultInput.pedidoId,
          valorCentavos: defaultInput.valorCentavos,
        }),
      );
    });

    it('should return mock pix data when API key starts with "sua_chave"', async () => {
      configService.get.mockReturnValue('sua_chave_aqui_placeholder');

      const result = await service.createPixCharge(defaultInput);

      expect(result.transacaoId).toContain('mock_');
      expect(result.raw.mock).toBe(true);
    });

    it('should embed valor in mock brcode string', async () => {
      configService.get.mockReturnValue(undefined);

      const result = await service.createPixCharge(defaultInput);

      // 5000 centavos = 50.00
      expect(result.pixCopiaCola).toContain('50.00');
    });

    it('should set expiresAt based on expiresInMinutes', async () => {
      configService.get.mockReturnValue(undefined);
      const before = Date.now();

      const result = await service.createPixCharge(defaultInput);

      const expectedMinMs = before + 30 * 60 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMinMs - 1000);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMinMs + 5000);
    });
  });

  describe('createPixCharge — real mode', () => {
    const realApiKey = 'real_api_key_abc123';

    it('should call AbacatePay API and return mapped pix data', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ABACATE_PAY_API_KEY') return realApiKey;
        if (key === 'ABACATE_PAY_BASE_URL') return 'https://api.abacatepay.com';
        return undefined;
      });

      const apiResponse = {
        data: {
          data: {
            id: 'txn_real_001',
            brCode: 'pix-copia-cola-code-real',
            qrCodeUrl: 'https://api.abacatepay.com/qr/txn_real_001.png',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
      };
      mockedAxios.post.mockResolvedValue(apiResponse);

      const result = await service.createPixCharge(defaultInput);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.abacatepay.com/v1/pixQrCode/create',
        {
          amount: 5000,
          expiresIn: 1800,
          description: `Pedido ${defaultInput.pedidoId}`,
          customer: {
            name: defaultInput.clienteNome,
            email: defaultInput.clienteEmail,
            cellphone: defaultInput.clienteTelefone,
          },
          metadata: { pedidoId: defaultInput.pedidoId },
        },
        {
          headers: { Authorization: `Bearer ${realApiKey}` },
          timeout: 10_000,
        },
      );

      expect(result.transacaoId).toBe('txn_real_001');
      expect(result.pixCopiaCola).toBe('pix-copia-cola-code-real');
      expect(result.pixQrCodeUrl).toBe(
        'https://api.abacatepay.com/qr/txn_real_001.png',
      );
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.raw).toBe(apiResponse.data);
    });

    it('should return base64 QR code URL when brCodeBase64 is present', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ABACATE_PAY_API_KEY') return realApiKey;
        if (key === 'ABACATE_PAY_BASE_URL') return 'https://api.abacatepay.com';
        return undefined;
      });

      mockedAxios.post.mockResolvedValue({
        data: {
          data: {
            id: 'txn_002',
            brCode: 'brcode-value',
            brCodeBase64: 'iVBORw0KGgoAAAA...',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
      });

      const result = await service.createPixCharge(defaultInput);

      expect(result.pixQrCodeUrl).toBe(
        'data:image/png;base64,iVBORw0KGgoAAAA...',
      );
    });

    it('should fall back to mock when API call fails', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ABACATE_PAY_API_KEY') return realApiKey;
        if (key === 'ABACATE_PAY_BASE_URL') return 'https://api.abacatepay.com';
        return undefined;
      });

      mockedAxios.post.mockRejectedValue(new Error('Network timeout'));

      const result = await service.createPixCharge(defaultInput);

      expect(result.transacaoId).toContain('mock_');
      expect(result.raw.mock).toBe(true);
    });

    it('should use default base URL when ABACATE_PAY_BASE_URL is not set', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ABACATE_PAY_API_KEY') return realApiKey;
        return undefined;
      });

      mockedAxios.post.mockResolvedValue({
        data: {
          data: {
            id: 'txn_003',
            brCode: 'code',
            qrCodeUrl: 'https://example.com/qr.png',
            expiresAt: new Date().toISOString(),
          },
        },
      });

      await service.createPixCharge(defaultInput);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.abacatepay.com/v1/pixQrCode/create',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('refund', () => {
    it('should return true in mock mode', async () => {
      configService.get.mockReturnValue('sua_chave_test');

      const result = await service.refund('txn_mock');

      expect(result).toBe(true);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should call API and return true on success', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ABACATE_PAY_API_KEY') return 'real_key';
        if (key === 'ABACATE_PAY_BASE_URL') return 'https://api.abacatepay.com';
        return undefined;
      });

      mockedAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await service.refund('txn_real');

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.abacatepay.com/v1/refund',
        { id: 'txn_real' },
        { headers: { Authorization: 'Bearer real_key' } },
      );
    });

    it('should return false when refund API fails', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'ABACATE_PAY_API_KEY') return 'real_key';
        if (key === 'ABACATE_PAY_BASE_URL') return 'https://api.abacatepay.com';
        return undefined;
      });

      mockedAxios.post.mockRejectedValue(new Error('Server error'));

      const result = await service.refund('txn_fail');

      expect(result).toBe(false);
    });
  });
});
