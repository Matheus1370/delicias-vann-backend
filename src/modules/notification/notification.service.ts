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
        this.logger.warn(`SMS falhou para ${data.pedidoId}, tentando e-mail...`);
        try {
          const email = await this.emailDoPedido(data.pedidoId);
          await this.sendEmail(email, this.buildMessage(data.templateId, data.payload));
          await this.prisma.notificacao.update({
            where: { id: notificacao.id },
            data: { status: 'ENVIADO', canal: 'EMAIL', enviadoEm: new Date(), tentativas: 2 },
          });
        } catch (mailErr: any) {
          await this.prisma.notificacao.update({
            where: { id: notificacao.id },
            data: {
              status: 'FALHOU',
              tentativas: 3,
              erroMensagem: mailErr?.message ?? smsErr?.message ?? 'unknown',
            },
          });
          this.logger.error(`Notificação falhou completamente para pedido ${data.pedidoId}`);
        }
      }
    }
  }

  private async emailDoPedido(pedidoId: string): Promise<string> {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: { cliente: { select: { email: true } } },
    });
    const email = pedido?.cliente?.email;
    if (!email) throw new Error('Pedido sem e-mail de cliente');
    return email;
  }

  private async sendEmail(destinatario: string, mensagem: string) {
    const host = this.config.get<string>('MAIL_HOST');
    if (!host) throw new Error('MAIL_HOST não configurado');
    const port = parseInt(this.config.get<string>('MAIL_PORT', '1025'), 10);

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ host, port, secure: false });
    await transporter.sendMail({
      from: this.config.get('MAIL_FROM', '"Delicias da Vann" <vann@deliciasdavann.com.br>'),
      to: destinatario,
      subject: 'Delicias da Vann 💖',
      text: mensagem,
    });
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
      confirmacao_pedido: `Oi ${params.nome}! Recebi seu pedido aqui (#${params.pedidoId}) — já tô separando tudo. Qualquer coisa, me chama no whats. Beijos, Vann 💖`,
      pedido_pronto: `Oi ${params.nome}! Seu pedido #${params.pedidoId} acabou de sair do forno e tá te esperando 🎂`,
      pedido_enviado: `Boa, ${params.nome}! Seu pedido #${params.pedidoId} saiu pra entrega — já já tá aí 💖`,
      foto_bolo_pronto: `${params.nome}, olha como ficou! 🎂 ${params.fotoUrl} — em 30min sai daqui pra te encontrar.`,
      lembrete_ocasiao: `Oi ${params.nome}! Lembra que ${params.titulo} tá vindo aí (${params.diaMes})? Já posso ir separando uma data pro bolo do ano que vem — só me avisar 💖`,
      solicitar_avaliacao: `Oi ${params.nome}! E aí, como foi a festa? Queria muito saber 💖 Conta pra mim aqui: ${params.linkAvaliacao ?? `https://app/avaliar/${params.pedidoId}`}`,
      cross_sell_docinho: `Oi ${params.nome}! Tô lembrando aqui da última festa 💖 que tal um café da tarde com docinhos pra alegrar o time? Te guardei esse cupom: ${params.codigoCupom} (15% off, 30 dias): ${params.link}`,
      cross_sell_encomenda: `Oi ${params.nome}! Saudades por aqui 💖 vem aí alguma ocasião especial? Te guardei cupom de 15%: ${params.codigoCupom} (válido 30 dias): ${params.link}`,
      avaliacao_complexidade_aprovada: `Oi ${params.cliente}! Olhei sua referência com calma — fica R$ ${params.valorTotal} no total. Quando puder, finaliza por aqui: ${params.linkPedido}. Beijos, Vann 💖`,
    };
    return templates[templateId] ?? `Atualização do seu pedido #${params.pedidoId} — Vann 💖`;
  }
}
