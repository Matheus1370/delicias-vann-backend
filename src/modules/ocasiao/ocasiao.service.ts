import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

const DIA_MES_REGEX = /^(\d{1,2})-(\d{1,2})$/;
const DIAS_ANTECEDENCIA_LEMBRETE = 60;

@Injectable()
export class OcasiaoService {
  private readonly logger = new Logger(OcasiaoService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  async create(
    clienteId: string,
    data: { titulo: string; diaMes: string; pedidoOriginalId?: string; ano?: number },
  ) {
    if (!data.titulo || !data.titulo.trim()) {
      throw new BadRequestException('Título obrigatório');
    }
    const diaMesNorm = this.normalizarDiaMes(data.diaMes);
    return this.prisma.ocasiaoCliente.create({
      data: {
        clienteId,
        titulo: data.titulo.trim(),
        diaMes: diaMesNorm,
        pedidoOriginalId: data.pedidoOriginalId ?? null,
        ano: data.ano ?? null,
      },
    });
  }

  async listMine(clienteId: string) {
    return this.prisma.ocasiaoCliente.findMany({
      where: { clienteId },
      orderBy: { diaMes: 'asc' },
    });
  }

  async update(
    id: string,
    clienteId: string,
    data: Partial<{ titulo: string; diaMes: string; ativa: boolean }>,
  ) {
    const existente = await this.prisma.ocasiaoCliente.findUnique({ where: { id } });
    if (!existente || existente.clienteId !== clienteId) {
      throw new NotFoundException('Ocasião não encontrada');
    }
    const dataAtualizada: Record<string, any> = {};
    if (data.titulo !== undefined) {
      if (!data.titulo.trim()) throw new BadRequestException('Título inválido');
      dataAtualizada.titulo = data.titulo.trim();
    }
    if (data.diaMes !== undefined) {
      dataAtualizada.diaMes = this.normalizarDiaMes(data.diaMes);
    }
    if (data.ativa !== undefined) dataAtualizada.ativa = data.ativa;

    return this.prisma.ocasiaoCliente.update({
      where: { id },
      data: dataAtualizada,
    });
  }

  async remove(id: string, clienteId: string) {
    const existente = await this.prisma.ocasiaoCliente.findUnique({ where: { id } });
    if (!existente || existente.clienteId !== clienteId) {
      throw new NotFoundException('Ocasião não encontrada');
    }
    await this.prisma.ocasiaoCliente.delete({ where: { id } });
  }

  /**
   * Job diário: dispara lembrete pra ocasiões cujo diaMes bate exatamente
   * DIAS_ANTECEDENCIA_LEMBRETE (60) dias a partir da data de referência.
   */
  async processarLembretes(referencia: Date = new Date()) {
    const alvo = new Date(referencia.getTime());
    alvo.setUTCDate(alvo.getUTCDate() + DIAS_ANTECEDENCIA_LEMBRETE);
    const diaMesAlvo = this.formatarDiaMes(alvo);
    const anoCorrente = referencia.getUTCFullYear();

    const ocasioes = await this.prisma.ocasiaoCliente.findMany({
      where: { ativa: true, diaMes: diaMesAlvo },
      include: { cliente: { select: { id: true, nome: true, telefone: true } } },
    });

    for (const oc of ocasioes as any[]) {
      if (oc.ultimoLembreteAno === anoCorrente) continue;
      if (!oc.cliente?.telefone) continue;
      try {
        await this.notifications.send({
          pedidoId: oc.id,
          telefone: oc.cliente.telefone,
          templateId: 'lembrete_ocasiao',
          payload: {
            nome: oc.cliente.nome,
            titulo: oc.titulo,
            diaMes: oc.diaMes,
          },
        });
        await this.prisma.ocasiaoCliente.update({
          where: { id: oc.id },
          data: { ultimoLembreteAno: anoCorrente },
        });
      } catch (err: any) {
        this.logger.warn(`Falha ao mandar lembrete da ocasião ${oc.id}: ${err?.message ?? err}`);
      }
    }
  }

  private normalizarDiaMes(value: string): string {
    const m = DIA_MES_REGEX.exec((value ?? '').trim());
    if (!m) throw new BadRequestException('diaMes deve ser MM-DD');
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      throw new BadRequestException('diaMes inválido');
    }
    return `${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  private formatarDiaMes(data: Date): string {
    const mm = String(data.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(data.getUTCDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  }
}
