import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';

function lookupHash(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, senha: string) {
    const user = await this.prisma.usuario.findUnique({ where: { email } });
    if (!user || !user.ativo || user.anonimizadoEm) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const valid = await argon2.verify(user.senhaHash, senha);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');
    const { senhaHash, ...result } = user;
    return result;
  }

  async login(user: any, _ip?: string) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwt.sign(payload);

    const refreshRaw = randomBytes(48).toString('hex');
    const tokenLookup = lookupHash(refreshRaw);
    const tokenHash = await argon2.hash(refreshRaw);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { usuarioId: user.id, tokenLookup, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken: refreshRaw, user };
  }

  async refreshTokens(rawToken: string) {
    const tokenLookup = lookupHash(rawToken);
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenLookup },
      include: { usuario: true },
    });

    if (!token || token.revogado || token.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const valid = await argon2.verify(token.tokenHash, rawToken);
    if (!valid) throw new UnauthorizedException('Refresh token inválido');

    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { revogado: true },
    });

    const { senhaHash, ...user } = token.usuario;
    return this.login(user);
  }

  async register(data: { nome: string; email: string; senha: string; telefone?: string; refCodigo?: string }) {
    const exists = await this.prisma.usuario.findUnique({ where: { email: data.email } });
    if (exists) throw new ForbiddenException('E-mail já cadastrado');
    const senhaHash = await argon2.hash(data.senha);
    const user = await this.prisma.usuario.create({
      data: { nome: data.nome, email: data.email, telefone: data.telefone, senhaHash },
    });

    if (data.refCodigo) {
      try {
        const indicacao = await this.prisma.indicacao.findUnique({
          where: { codigo: data.refCodigo.toUpperCase() },
        });
        if (indicacao && !indicacao.indicadoUsuarioId && indicacao.indicadorId !== user.id) {
          await this.prisma.indicacao.update({
            where: { id: indicacao.id },
            data: { indicadoUsuarioId: user.id },
          });
        }
      } catch {
        // não bloqueia o cadastro se a indicacao falhar
      }
    }

    const { senhaHash: _, ...result } = user;
    return result;
  }

  async loginGoogle(googleUser: { email: string; nome: string; googleId: string; foto?: string }) {
    let user = await this.prisma.usuario.findUnique({ where: { email: googleUser.email } });

    if (!user) {
      // Cria conta automaticamente com senha aleatória (login só via Google)
      const senhaHash = await argon2.hash(randomBytes(32).toString('hex'));
      user = await this.prisma.usuario.create({
        data: {
          nome: googleUser.nome,
          email: googleUser.email,
          senhaHash,
          emailVerificado: true,
        },
      });
    }

    if (!user.ativo || user.anonimizadoEm) {
      throw new UnauthorizedException('Conta desativada');
    }

    const { senhaHash: _, ...safeUser } = user;
    return this.login(safeUser);
  }

  async logout(usuarioId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revogado: false },
      data: { revogado: true },
    });
  }
}
