import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import axios from 'axios';

export interface PixChargeInput {
  pedidoId: string;
  valorCentavos: number;
  clienteNome: string;
  clienteEmail: string;
  clienteTelefone?: string;
  expiresInMinutes: number;
}

export interface PixChargeOutput {
  transacaoId: string;
  pixCopiaCola: string;
  pixQrCodeUrl: string;
  expiresAt: Date;
  raw: any;
}

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(private config: ConfigService) {}

  async createPixCharge(input: PixChargeInput): Promise<PixChargeOutput> {
    const apiKey = this.config.get<string>('ABACATE_PAY_API_KEY');
    if (!apiKey || apiKey.startsWith('sua_chave')) {
      this.logger.warn(`[MOCK] Gerando cobrança Pix fake para pedido ${input.pedidoId}`);
      return this.mockPix(input);
    }
    try {
      return await this.abacatePayPix(input, apiKey);
    } catch (err: any) {
      this.logger.error(`Falha ao criar cobrança no ABACATE_PAY: ${err?.message}`);
      this.logger.warn(`Fallback para mock em pedido ${input.pedidoId}`);
      return this.mockPix(input);
    }
  }

  private mockPix(input: PixChargeInput): PixChargeOutput {
    const transacaoId = `mock_${input.pedidoId.slice(0, 8)}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60 * 1000);

    const brcode =
      `00020126580014BR.GOV.BCB.PIX0136${randomBytes(18).toString('hex')}` +
      `5204000053039865405${(input.valorCentavos / 100).toFixed(2)}` +
      `5802BR5913${input.clienteNome.slice(0, 13)}6009SAO PAULO62070503***6304` +
      createHash('md5').update(transacaoId).digest('hex').slice(0, 4).toUpperCase();

    const qr =
      `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=` +
      encodeURIComponent(brcode);

    return {
      transacaoId,
      pixCopiaCola: brcode,
      pixQrCodeUrl: qr,
      expiresAt,
      raw: { mock: true, pedidoId: input.pedidoId, valorCentavos: input.valorCentavos },
    };
  }

  private async abacatePayPix(
    input: PixChargeInput,
    apiKey: string,
  ): Promise<PixChargeOutput> {
    const baseUrl = this.config.get<string>('ABACATE_PAY_BASE_URL') ?? 'https://api.abacatepay.com';
    const response = await axios.post(
      `${baseUrl}/v1/pixQrCode/create`,
      {
        amount: input.valorCentavos,
        expiresIn: input.expiresInMinutes * 60,
        description: `Pedido ${input.pedidoId}`,
        customer: {
          name: input.clienteNome,
          email: input.clienteEmail,
          cellphone: input.clienteTelefone,
        },
        metadata: { pedidoId: input.pedidoId },
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10_000,
      },
    );

    const data = response.data?.data ?? response.data;
    return {
      transacaoId: data.id,
      pixCopiaCola: data.brCode ?? data.pixCode,
      pixQrCodeUrl: data.brCodeBase64
        ? `data:image/png;base64,${data.brCodeBase64}`
        : data.qrCodeUrl,
      expiresAt: new Date(data.expiresAt ?? Date.now() + input.expiresInMinutes * 60_000),
      raw: response.data,
    };
  }

  async refund(transacaoId: string): Promise<boolean> {
    const apiKey = this.config.get<string>('ABACATE_PAY_API_KEY');
    if (!apiKey || apiKey.startsWith('sua_chave')) {
      this.logger.warn(`[MOCK] Reembolsando ${transacaoId}`);
      return true;
    }
    try {
      await axios.post(
        `${this.config.get('ABACATE_PAY_BASE_URL')}/v1/refund`,
        { id: transacaoId },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      return true;
    } catch (err: any) {
      this.logger.error(`Falha ao reembolsar: ${err?.message}`);
      return false;
    }
  }
}
