import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async me(usuarioId: string) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        cpf: true,
        dataNascimento: true,
        marketingOptIn: true,
        role: true,
        enderecos: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(
    usuarioId: string,
    data: {
      nome?: string;
      telefone?: string;
      cpf?: string;
      dataNascimento?: string;
      marketingOptIn?: boolean;
    },
  ) {
    const payload: any = {};
    if (data.nome !== undefined) payload.nome = data.nome;
    if (data.telefone !== undefined) payload.telefone = data.telefone;
    if (data.cpf !== undefined) payload.cpf = data.cpf;
    if (data.dataNascimento !== undefined)
      payload.dataNascimento = data.dataNascimento ? new Date(data.dataNascimento) : null;
    if (data.marketingOptIn !== undefined) payload.marketingOptIn = data.marketingOptIn;

    const updated = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: payload,
    });

    await this.audit.log({
      acao: 'USER.UPDATED',
      entidade: 'Usuario',
      entidadeId: usuarioId,
      payloadDepois: payload,
      usuarioId,
    });

    const { senhaHash, ...result } = updated;
    return result;
  }

  async anonimizar(usuarioId: string) {
    const ts = new Date();
    const hash = ts.getTime().toString(36);
    const anon = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        nome: `anon-${hash}`,
        email: `anon-${hash}@deliciasdavann.local`,
        telefone: null,
        cpf: null,
        dataNascimento: null,
        marketingOptIn: false,
        ativo: false,
        anonimizadoEm: ts,
      },
    });

    await this.prisma.refreshToken.updateMany({
      where: { usuarioId },
      data: { revogado: true },
    });

    await this.audit.log({
      acao: 'USER.ANONIMIZADO',
      entidade: 'Usuario',
      entidadeId: usuarioId,
      usuarioId,
    });

    return { ok: true, id: anon.id };
  }

  async addEndereco(usuarioId: string, data: any) {
    return this.prisma.endereco.create({
      data: { ...data, usuarioId },
    });
  }

  async removerEndereco(usuarioId: string, id: string) {
    const e = await this.prisma.endereco.findUnique({ where: { id } });
    if (!e || e.usuarioId !== usuarioId) throw new NotFoundException('Endereço não encontrado');
    return this.prisma.endereco.delete({ where: { id } });
  }
}
