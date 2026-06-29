import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

const CODE_LENGTH = 7;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOMPENSA_PERCENTUAL = 10;
const VALIDADE_CUPOM_DIAS = 90;

@Injectable()
export class IndicacaoService {
  private readonly logger = new Logger(IndicacaoService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  async gerar(indicadorId: string, indicadoEmail?: string) {
    const codigo = this.gerarCodigo();
    return this.prisma.indicacao.create({
      data: {
        indicadorId,
        indicadoEmail: indicadoEmail ?? null,
        codigo,
        status: 'PENDENTE',
      },
    });
  }

  async listMine(indicadorId: string) {
    return this.prisma.indicacao.findMany({
      where: { indicadorId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async consultar(codigo: string) {
    const indicacao = await this.prisma.indicacao.findUnique({
      where: { codigo: codigo.toUpperCase() },
      include: { indicador: { select: { id: true, nome: true } } },
    });
    if (!indicacao) throw new NotFoundException('Código de indicação não encontrado');
    return {
      codigo: indicacao.codigo,
      indicadorNome: (indicacao as any).indicador?.nome ?? null,
      valida: true,
    };
  }

  async registrarUsuario(codigo: string, novoUsuarioId: string) {
    const indicacao = await this.prisma.indicacao.findUnique({
      where: { codigo: codigo.toUpperCase() },
    });
    if (!indicacao) throw new NotFoundException('Código de indicação não encontrado');
    if (indicacao.indicadorId === novoUsuarioId) {
      throw new ConflictException('Você não pode usar sua própria indicação');
    }
    if (indicacao.indicadoUsuarioId && indicacao.indicadoUsuarioId !== novoUsuarioId) {
      return;
    }
    await this.prisma.indicacao.update({
      where: { id: indicacao.id },
      data: { indicadoUsuarioId: novoUsuarioId },
    });
  }

  async processarConversao(clienteId: string, pedidoId: string) {
    const indicacoes = await this.prisma.indicacao.findMany({
      where: { indicadoUsuarioId: clienteId, status: 'PENDENTE' },
      include: { indicador: { select: { id: true, nome: true, telefone: true } } },
    });
    if (indicacoes.length === 0) return;

    for (const indicacao of indicacoes) {
      try {
        const codigoCupom = `OBRIGADA-${this.gerarCodigo(5)}`;
        const validoAte = new Date();
        validoAte.setDate(validoAte.getDate() + VALIDADE_CUPOM_DIAS);

        const cupom = await this.prisma.cupom.create({
          data: {
            codigo: codigoCupom,
            tipo: 'PERCENTUAL',
            valor: RECOMPENSA_PERCENTUAL,
            minimoCompra: 0,
            usoMaximo: 1,
            validoAte,
            descricao: `Indicou um amigo (indicação ${indicacao.codigo})`,
            campanha: 'INDICACAO',
            clienteId: indicacao.indicadorId,
          },
        });

        await this.prisma.indicacao.update({
          where: { id: indicacao.id },
          data: {
            status: 'CONVERTIDA',
            pedidoConvertidoId: pedidoId,
            cupomRecompensaId: cupom.id,
            recompensaValor: RECOMPENSA_PERCENTUAL,
          },
        });

        const indicador = (indicacao as any).indicador;
        if (indicador?.telefone) {
          await this.notifications.send({
            pedidoId: null,
            usuarioId: indicador.id,
            telefone: indicador.telefone,
            templateId: 'indicacao_convertida',
            payload: {
              nome: indicador.nome,
              codigoCupom,
              desconto: `${RECOMPENSA_PERCENTUAL}%`,
              validoAte: validoAte.toLocaleDateString('pt-BR'),
            },
          });
        }
      } catch (err: any) {
        this.logger.warn(
          `Falha ao processar indicação ${indicacao.codigo}: ${err?.message ?? err}`,
        );
      }
    }
  }

  private gerarCodigo(length: number = CODE_LENGTH): string {
    const bytes = randomBytes(length);
    let codigo = '';
    for (let i = 0; i < length; i++) {
      codigo += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return codigo;
  }
}
