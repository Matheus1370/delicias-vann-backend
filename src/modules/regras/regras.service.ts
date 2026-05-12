import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClimaService } from './clima.service';

export type NivelRegra = 'BLOQUEAR' | 'AVISAR';

type Predicado =
  | { tipo: 'OPCAO_CONTEM'; etapa: string; valor: string }
  | { tipo: 'MODALIDADE_IN'; valores: string[] }
  | { tipo: 'TEMPERATURA_GTE'; valor: number }
  | { tipo: 'PRAZO_HORAS_LTE'; valor: number }
  | { tipo: 'PRODUTO_TIPO'; valor: string };

interface CondicaoRegra {
  todos: Predicado[];
}

export interface AvaliarInput {
  produtoId: string;
  opcoesEscolhidas: Record<string, string>;
  modalidade?: string;
  dataAgendamento?: string;
  temperaturaC?: number;
  numeroPessoas?: number;
}

export interface Violacao {
  regraId: string;
  nome: string;
  nivel: NivelRegra;
  mensagem: string;
}

const NIVEIS_VALIDOS: NivelRegra[] = ['BLOQUEAR', 'AVISAR'];
const TIPOS_PREDICADO = new Set([
  'OPCAO_CONTEM',
  'MODALIDADE_IN',
  'TEMPERATURA_GTE',
  'PRAZO_HORAS_LTE',
  'PRODUTO_TIPO',
]);

@Injectable()
export class RegrasService {
  constructor(
    private prisma: PrismaService,
    private clima: ClimaService,
    private audit: AuditService,
  ) {}

  async avaliar(input: AvaliarInput): Promise<{ violacoes: Violacao[] }> {
    const regras = await this.prisma.regraCombinacao.findMany({ where: { ativa: true } });
    if (regras.length === 0) return { violacoes: [] };

    // Resolver dependências externas só se alguma regra precisar
    const precisaTemperatura = regras.some((r) =>
      this.predicados(r).some((p) => p.tipo === 'TEMPERATURA_GTE'),
    );
    const precisaProdutoTipo = regras.some((r) =>
      this.predicados(r).some((p) => p.tipo === 'PRODUTO_TIPO'),
    );

    let temperaturaC = input.temperaturaC;
    if (precisaTemperatura && temperaturaC === undefined && input.dataAgendamento) {
      const previsao = await this.clima.prever(new Date(input.dataAgendamento));
      if (previsao) temperaturaC = previsao.tempMaxC;
    }

    let produtoTipo: string | undefined;
    if (precisaProdutoTipo) {
      const produto = await this.prisma.produto.findUnique({ where: { id: input.produtoId } });
      produtoTipo = produto?.tipo;
    }

    const violacoes: Violacao[] = [];
    for (const regra of regras) {
      const predicados = this.predicados(regra);
      if (predicados.length === 0) continue;

      const todasBatem = predicados.every((p) =>
        this.predicadoBate(p, input, { temperaturaC, produtoTipo }),
      );
      if (todasBatem) {
        violacoes.push({
          regraId: regra.id,
          nome: regra.nome,
          nivel: regra.nivel as NivelRegra,
          mensagem: regra.mensagem,
        });
      }
    }

    return { violacoes };
  }

  private predicados(regra: { condicao: any }): Predicado[] {
    const cond = regra.condicao as CondicaoRegra;
    return Array.isArray(cond?.todos) ? (cond.todos as Predicado[]) : [];
  }

  private predicadoBate(
    p: Predicado,
    input: AvaliarInput,
    derived: { temperaturaC?: number; produtoTipo?: string },
  ): boolean {
    switch (p.tipo) {
      case 'OPCAO_CONTEM': {
        const escolha = input.opcoesEscolhidas[p.etapa];
        if (!escolha) return false;
        return escolha.toLowerCase().includes(p.valor.toLowerCase());
      }
      case 'MODALIDADE_IN':
        return !!input.modalidade && p.valores.includes(input.modalidade);
      case 'TEMPERATURA_GTE':
        if (derived.temperaturaC === undefined) return false;
        return derived.temperaturaC >= p.valor;
      case 'PRAZO_HORAS_LTE': {
        if (!input.dataAgendamento) return false;
        const diffMs = new Date(input.dataAgendamento).getTime() - Date.now();
        const diffH = diffMs / (60 * 60 * 1000);
        return diffH <= p.valor;
      }
      case 'PRODUTO_TIPO':
        return derived.produtoTipo === p.valor;
      default:
        return false;
    }
  }

  async list() {
    return this.prisma.regraCombinacao.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(
    data: {
      nome: string;
      nivel: NivelRegra;
      condicao: CondicaoRegra;
      mensagem: string;
      ativa?: boolean;
    },
    usuarioId: string,
  ) {
    this.validarPayload(data);

    const regra = await this.prisma.regraCombinacao.create({
      data: {
        nome: data.nome,
        nivel: data.nivel,
        condicao: data.condicao as any,
        mensagem: data.mensagem,
        ativa: data.ativa ?? true,
      },
    });

    await this.audit.log({
      acao: 'REGRA.CREATED',
      entidade: 'RegraCombinacao',
      entidadeId: regra.id,
      payloadDepois: regra,
      usuarioId,
    });

    return regra;
  }

  async update(
    id: string,
    data: Partial<{
      nome: string;
      nivel: NivelRegra;
      condicao: CondicaoRegra;
      mensagem: string;
      ativa: boolean;
    }>,
    usuarioId: string,
  ) {
    const antes = await this.prisma.regraCombinacao.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('Regra não encontrada');

    this.validarPayload(data, { partial: true });

    const regra = await this.prisma.regraCombinacao.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.nivel !== undefined && { nivel: data.nivel }),
        ...(data.condicao !== undefined && { condicao: data.condicao as any }),
        ...(data.mensagem !== undefined && { mensagem: data.mensagem }),
        ...(data.ativa !== undefined && { ativa: data.ativa }),
      },
    });

    await this.audit.log({
      acao: 'REGRA.UPDATED',
      entidade: 'RegraCombinacao',
      entidadeId: id,
      payloadAntes: antes,
      payloadDepois: regra,
      usuarioId,
    });

    return regra;
  }

  async remove(id: string, usuarioId: string) {
    const antes = await this.prisma.regraCombinacao.findUnique({ where: { id } });
    if (!antes) throw new NotFoundException('Regra não encontrada');

    await this.prisma.regraCombinacao.delete({ where: { id } });

    await this.audit.log({
      acao: 'REGRA.DELETED',
      entidade: 'RegraCombinacao',
      entidadeId: id,
      payloadAntes: antes,
      usuarioId,
    });
  }

  private validarPayload(
    data: Partial<{
      nivel: NivelRegra;
      condicao: CondicaoRegra;
    }>,
    opts: { partial?: boolean } = {},
  ) {
    if (data.nivel !== undefined && !NIVEIS_VALIDOS.includes(data.nivel)) {
      throw new BadRequestException(`Nível inválido: ${data.nivel}`);
    }
    if (data.condicao !== undefined) {
      if (!data.condicao || !Array.isArray((data.condicao as any).todos)) {
        throw new BadRequestException('condicao.todos deve ser um array');
      }
      for (const p of (data.condicao as any).todos) {
        if (!p?.tipo || !TIPOS_PREDICADO.has(p.tipo)) {
          throw new BadRequestException(`Predicado desconhecido: ${p?.tipo}`);
        }
      }
    }
    if (!opts.partial) {
      // Required fields covered by TypeScript signature in create(); nothing extra here.
    }
  }
}
