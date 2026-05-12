import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function formatarCnpj(cnpj: string): string {
  const digitos = (cnpj ?? '').replace(/\D/g, '');
  if (digitos.length !== 14) {
    throw new BadRequestException('CNPJ inválido');
  }
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

@Injectable()
export class EmpresaService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async solicitar(
    contatoPadraoId: string,
    data: {
      razaoSocial: string;
      cnpj: string;
      nomeFantasia?: string;
      condicaoPagamento?: string;
    },
  ) {
    const cnpjFmt = formatarCnpj(data.cnpj);
    const existente = await this.prisma.empresa.findUnique({ where: { cnpj: cnpjFmt } });
    if (existente) {
      throw new ConflictException('Já existe um cadastro com esse CNPJ');
    }

    const empresa = await this.prisma.empresa.create({
      data: {
        razaoSocial: data.razaoSocial.trim(),
        cnpj: cnpjFmt,
        nomeFantasia: data.nomeFantasia?.trim() || null,
        condicaoPagamento: data.condicaoPagamento?.trim() || null,
        contatoPadraoId,
        status: 'PENDENTE',
      },
    });

    await this.audit.log({
      acao: 'EMPRESA.SOLICITADA',
      entidade: 'Empresa',
      entidadeId: empresa.id,
      payloadDepois: { razaoSocial: empresa.razaoSocial, cnpj: empresa.cnpj },
      usuarioId: contatoPadraoId,
    });

    return empresa;
  }

  async mine(usuarioId: string) {
    return this.prisma.empresa.findFirst({ where: { contatoPadraoId: usuarioId } });
  }

  async list(filtro?: { status?: string }) {
    return this.prisma.empresa.findMany({
      where: filtro?.status ? { status: filtro.status } : undefined,
      include: {
        contatoPadrao: { select: { id: true, nome: true, email: true, telefone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async aprovar(
    id: string,
    data: { descontoPadrao?: number; condicaoPagamento?: string },
    adminId: string,
  ) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');

    const desconto = data.descontoPadrao ?? Number(empresa.descontoPadrao);
    const atualizada = await this.prisma.empresa.update({
      where: { id },
      data: {
        status: 'APROVADA',
        descontoPadrao: desconto,
        ...(data.condicaoPagamento !== undefined && { condicaoPagamento: data.condicaoPagamento }),
      },
    });

    await this.prisma.usuario.update({
      where: { id: empresa.contatoPadraoId },
      data: { role: 'CLIENTE_EMPRESA' },
    });

    await this.audit.log({
      acao: 'EMPRESA.APROVADA',
      entidade: 'Empresa',
      entidadeId: id,
      payloadAntes: empresa,
      payloadDepois: atualizada,
      usuarioId: adminId,
    });

    return atualizada;
  }

  async rejeitar(id: string, motivo: string, adminId: string) {
    const empresa = await this.prisma.empresa.findUnique({ where: { id } });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');

    const atualizada = await this.prisma.empresa.update({
      where: { id },
      data: { status: 'REJEITADA' },
    });

    await this.audit.log({
      acao: 'EMPRESA.REJEITADA',
      entidade: 'Empresa',
      entidadeId: id,
      payloadAntes: empresa,
      payloadDepois: { motivo },
      usuarioId: adminId,
    });

    return atualizada;
  }

  /** Retorna o desconto ativo do cliente, se houver empresa APROVADA. */
  async getDescontoAtivo(
    usuarioId: string,
  ): Promise<{ empresaId: string; descontoPct: number } | null> {
    const empresa = await this.prisma.empresa.findFirst({
      where: { contatoPadraoId: usuarioId },
    });
    if (!empresa || empresa.status !== 'APROVADA') return null;
    const pct = Number(empresa.descontoPadrao);
    if (pct <= 0) return null;
    return { empresaId: empresa.id, descontoPct: pct };
  }
}
