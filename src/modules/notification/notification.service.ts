import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async sendOrderConfirmation(pedidoId: string, telefone: string, nome: string) {
    await this.send({
      pedidoId,
      telefone,
      templateId: 'confirmacao_pedido',
      payload: { nome, pedidoId },
    });
  }

  async sendOrderReady(pedidoId: string, telefone: string, nome: string) {
    await this.send({
      pedidoId,
      telefone,
      templateId: 'pedido_pronto',
      payload: { nome, pedidoId },
    });
  }

  async send(data: {
    pedidoId: string;
    telefone: string;
    templateId: string;
    payload: Record<string, any>;
  }) {
    const notificacao = await this.prisma.notificacao.create({
      data: {
        pedidoId: data.pedidoId,
        canal: 'WHATSAPP',
        templateId: data.templateId,
        payload: data.payload,
      },
    });

    try {
      await this.sendWhatsApp(data.telefone, data.templateId, data.payload);
      await this.prisma.notificacao.update({
        where: { id: notificacao.id },
        data: { status: 'ENVIADO', enviadoEm: new Date() },
      });
    } catch (err) {
      this.logger.warn(`WhatsApp falhou para ${data.pedidoId}, tentando SMS...`);
      try {
        await this.sendSMS(data.telefone, this.buildMessage(data.templateId, data.payload));
        await this.prisma.notificacao.update({
          where: { id: notificacao.id },
          data: { status: 'ENVIADO', canal: 'SMS', enviadoEm: new Date(), tentativas: 1 },
        });
      } catch (smsErr: any) {
        await this.prisma.notificacao.update({
          where: { id: notificacao.id },
          data: { status: 'FALHOU', tentativas: 2, erroMensagem: smsErr?.message ?? 'unknown' },
        });
        this.logger.error(`Notificação falhou completamente para pedido ${data.pedidoId}`);
      }
    }
  }

  private async sendWhatsApp(telefone: string, templateId: string, params: Record<string, any>) {
    const token = this.config.get('WHATSAPP_TOKEN');
    const phoneNumberId = this.config.get('WHATSAPP_PHONE_NUMBER_ID');

    await axios.post(
      `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: telefone.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: templateId,
          language: { code: 'pt_BR' },
          components: [
            {
              type: 'body',
              parameters: Object.values(params).map((v) => ({ type: 'text', text: String(v) })),
            },
          ],
        },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
  }

  private async sendSMS(telefone: string, mensagem: string) {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.config.get<string>('TWILIO_FROM_NUMBER');

    const twilio = require('twilio');
    const client = twilio(sid, token);
    await client.messages.create({
      body: mensagem,
      from,
      to: `+55${telefone.replace(/\D/g, '')}`,
    });
  }

  private buildMessage(templateId: string, params: Record<string, any>): string {
    const templates: Record<string, string> = {
      confirmacao_pedido: `Olá ${params.nome}! Seu pedido #${params.pedidoId} foi confirmado. Delicias da Vann`,
      pedido_pronto: `Olá ${params.nome}! Seu pedido #${params.pedidoId} está pronto! Delicias da Vann`,
      pedido_enviado: `Seu pedido #${params.pedidoId} está a caminho! Delicias da Vann`,
    };
    return templates[templateId] ?? `Atualização do pedido #${params.pedidoId} - Delicias da Vann`;
  }
}
