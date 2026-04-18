import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as argon2 from 'argon2';

jest.mock('argon2', () => ({
  verify: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto');
  return {
    ...actual,
    randomBytes: jest.fn(() => Buffer.from('a'.repeat(48))),
  };
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;

  const mockPrisma = {
    usuario: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('signed-jwt-token'),
  };

  const mockConfig = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwt = module.get<JwtService>(JwtService);
  });

  // ─── validateUser ─────────────────────────────────────────────────────

  describe('validateUser', () => {
    const fakeUser = {
      id: 'user-1',
      email: 'test@example.com',
      senhaHash: 'hashed-password',
      nome: 'Test User',
      role: 'CLIENTE',
      ativo: true,
      anonimizadoEm: null,
    };

    it('should return user without senhaHash when credentials are valid', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(fakeUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('test@example.com', 'password123');

      expect(mockPrisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(argon2.verify).toHaveBeenCalledWith('hashed-password', 'password123');
      expect(result).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        nome: 'Test User',
        role: 'CLIENTE',
        ativo: true,
        anonimizadoEm: null,
      });
      expect(result).not.toHaveProperty('senhaHash');
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.validateUser('nonexistent@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(fakeUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.validateUser('test@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).toHaveBeenCalledWith('hashed-password', 'wrong-password');
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ ...fakeUser, ativo: false });

      await expect(
        service.validateUser('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user is anonymized', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({
        ...fakeUser,
        anonimizadoEm: new Date(),
      });

      await expect(
        service.validateUser('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).not.toHaveBeenCalled();
    });
  });

  // ─── register ─────────────────────────────────────────────────────────

  describe('register', () => {
    const registerData = {
      nome: 'New User',
      email: 'new@example.com',
      senha: 'securePassword',
      telefone: '11999990000',
    };

    const createdUser = {
      id: 'user-2',
      nome: 'New User',
      email: 'new@example.com',
      telefone: '11999990000',
      senhaHash: 'argon2-hashed',
      role: 'CLIENTE',
      ativo: true,
    };

    it('should create a user and return result without senhaHash', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue('argon2-hashed');
      mockPrisma.usuario.create.mockResolvedValue(createdUser);

      const result = await service.register(registerData);

      expect(mockPrisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'new@example.com' },
      });
      expect(argon2.hash).toHaveBeenCalledWith('securePassword');
      expect(mockPrisma.usuario.create).toHaveBeenCalledWith({
        data: {
          nome: 'New User',
          email: 'new@example.com',
          telefone: '11999990000',
          senhaHash: 'argon2-hashed',
        },
      });
      expect(result).not.toHaveProperty('senhaHash');
      expect(result).toEqual({
        id: 'user-2',
        nome: 'New User',
        email: 'new@example.com',
        telefone: '11999990000',
        role: 'CLIENTE',
        ativo: true,
      });
    });

    it('should register without telefone when not provided', async () => {
      const dataWithoutPhone = { nome: 'No Phone', email: 'nophone@example.com', senha: 'pass' };
      mockPrisma.usuario.findUnique.mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue('argon2-hashed');
      mockPrisma.usuario.create.mockResolvedValue({
        id: 'user-3',
        nome: 'No Phone',
        email: 'nophone@example.com',
        senhaHash: 'argon2-hashed',
        role: 'CLIENTE',
        ativo: true,
      });

      await service.register(dataWithoutPhone);

      expect(mockPrisma.usuario.create).toHaveBeenCalledWith({
        data: {
          nome: 'No Phone',
          email: 'nophone@example.com',
          telefone: undefined,
          senhaHash: 'argon2-hashed',
        },
      });
    });

    it('should throw ForbiddenException when email already exists', async () => {
      mockPrisma.usuario.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.register(registerData)).rejects.toThrow(ForbiddenException);
      expect(argon2.hash).not.toHaveBeenCalled();
      expect(mockPrisma.usuario.create).not.toHaveBeenCalled();
    });
  });

  // ─── login ────────────────────────────────────────────────────────────

  describe('login', () => {
    const user = { id: 'user-1', email: 'test@example.com', role: 'CLIENTE' };

    it('should generate JWT access token and persist refresh token', async () => {
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-refresh');
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(user);

      expect(mockJwt.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        email: 'test@example.com',
        role: 'CLIENTE',
      });
      expect(result.accessToken).toBe('signed-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.refreshToken).toBe('string');
      expect(result.user).toEqual(user);
    });

    it('should store the refresh token with a 7-day expiry', async () => {
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-refresh');
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await service.login(user);

      const createCall = mockPrisma.refreshToken.create.mock.calls[0][0];
      expect(createCall.data.usuarioId).toBe('user-1');
      expect(createCall.data.tokenHash).toBe('hashed-refresh');
      expect(createCall.data.tokenLookup).toBeDefined();
      expect(createCall.data.expiresAt).toBeInstanceOf(Date);

      const now = new Date();
      const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
      const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
      expect(createCall.data.expiresAt.getTime()).toBeGreaterThan(sixDaysFromNow.getTime());
      expect(createCall.data.expiresAt.getTime()).toBeLessThan(eightDaysFromNow.getTime());
    });

    it('should hash the raw refresh token with argon2', async () => {
      (argon2.hash as jest.Mock).mockResolvedValue('hashed-refresh');
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login(user);

      expect(argon2.hash).toHaveBeenCalledWith(result.refreshToken);
    });
  });

  // ─── refreshTokens ───────────────────────────────────────────────────

  describe('refreshTokens', () => {
    const rawToken = 'raw-refresh-token';
    const storedToken = {
      id: 'token-1',
      tokenLookup: 'sha256-of-raw',
      tokenHash: 'argon2-hash-of-raw',
      revogado: false,
      expiresAt: new Date(Date.now() + 86400000), // 1 day in the future
      usuario: {
        id: 'user-1',
        email: 'test@example.com',
        nome: 'Test User',
        role: 'CLIENTE',
        senhaHash: 'user-senha-hash',
        ativo: true,
      },
    };

    it('should revoke old token, then login with the user to rotate tokens', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      mockPrisma.refreshToken.update.mockResolvedValue({});
      // login internals
      (argon2.hash as jest.Mock).mockResolvedValue('new-hashed');
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens(rawToken);

      expect(mockPrisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenLookup: expect.any(String) },
        include: { usuario: true },
      });
      expect(argon2.verify).toHaveBeenCalledWith('argon2-hash-of-raw', rawToken);
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { revogado: true },
      });
      expect(result.accessToken).toBe('signed-jwt-token');
      expect(result.refreshToken).toBeDefined();
      // The user returned should NOT include senhaHash
      expect(result.user).not.toHaveProperty('senhaHash');
    });

    it('should throw UnauthorizedException when token not found', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token is revoked', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...storedToken,
        revogado: true,
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...storedToken,
        expiresAt: new Date(Date.now() - 86400000), // 1 day in the past
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when argon2.verify fails', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logout ───────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should revoke all active refresh tokens for the user', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await service.logout('user-1');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: 'user-1', revogado: false },
        data: { revogado: true },
      });
    });

    it('should succeed even when user has no active tokens', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.logout('user-1')).resolves.toBeUndefined();
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
