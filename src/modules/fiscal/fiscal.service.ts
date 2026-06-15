import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('FISCAL_ENABLED') === 'true';
  }

  async emit(pedidoId: string) {
    if (!this.isEnabled()) {
      this.logger.log(
        `[fiscal] desativado — pulando emissão de NFC-e para pedido ${pedidoId}`,
      );
      return { skipped: true };
    }

    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        cliente: true,
        itens: { include: { produto: true } },
        enderecoEntrega: true,
      },
    });
    if (!pedido) {
      this.logger.warn(`[fiscal] pedido ${pedidoId} não encontrado`);
      return { skipped: true };
    }

    try {
      const result = await this.emitirFocusNfe(pedido);
      await this.prisma.pedido.update({
        where: { id: pedidoId },
        data: {
          nfeNumero: result.numero,
          nfeUrl: result.url,
          nfeXmlUrl: result.xmlUrl,
        },
      });
      return { ok: true, numero: result.numero };
    } catch (err: any) {
      this.logger.error(`[fiscal] falhou para pedido ${pedidoId}: ${err?.message}`);
      return { ok: false, error: err?.message };
    }
  }

  private async emitirFocusNfe(pedido: any) {
    const apiKey = this.config.get<string>('NFE_API_KEY');
    const baseUrl =
      this.config.get<string>('NFE_BASE_URL') ?? 'https://api.focusnfe.com.br/v2';

    const payload = {
      natureza_operacao: 'Venda de mercadoria',
      data_emissao: new Date().toISOString(),
      tipo_documento: '1',
      presenca_comprador: '9',
      consumidor_final: '1',
      cliente: {
        nome: pedido.cliente.nome,
        email: pedido.cliente.email,
        cpf: pedido.cliente.cpf ?? undefined,
      },
      items: pedido.itens.map((it: any, idx: number) => ({
        numero_item: idx + 1,
        codigo_produto: it.produto.slug,
        descricao: it.produto.nome,
        cfop: '5102',
        unidade_comercial: 'UN',
        quantidade_comercial: it.quantidade,
        valor_unitario_comercial: Number(it.precoUnitario),
        valor_bruto: Number(it.precoUnitario) * it.quantidade,
      })),
    };

    const response = await axios.post(`${baseUrl}/nfce?ref=${pedido.id}`, payload, {
      auth: { username: apiKey ?? '', password: '' },
      timeout: 20_000,
    });

    return {
      numero: response.data?.numero ?? '',
      url: response.data?.url_danfce ?? '',
      xmlUrl: response.data?.caminho_xml_nota_fiscal ?? '',
    };
  }
}
