import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('InventoryService.vendaBalcao', () => {
  let service: InventoryService;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    tx = {
      produto: { update: jest.fn().mockResolvedValue({}) },
      vendaBalcao: { create: jest.fn().mockResolvedValue({ id: 'v1' }) },
      movimentacaoVitrine: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      produto: { findMany: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('registra SAIDA_VENDA e baixa o estoque para item MAKE_TO_STOCK', async () => {
    prisma.produto.findMany.mockResolvedValue([
      {
        id: 'p1',
        nome: 'Bolo de Pote',
        precoVenda: '18.00',
        fulfillment: 'MAKE_TO_STOCK',
        estoqueVitrine: 5,
      },
    ]);

    await service.vendaBalcao('op1', { itens: [{ produtoId: 'p1', quantidade: 2 }] });

    expect(tx.produto.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { estoqueVitrine: { decrement: 2 } },
    });
    expect(tx.movimentacaoVitrine.create).toHaveBeenCalledWith({
      data: {
        produtoId: 'p1',
        tipo: 'SAIDA_VENDA',
        quantidade: 2,
        vendaId: 'v1',
        operadorId: 'op1',
      },
    });
  });

  it('rejeita venda sem estoque suficiente', async () => {
    prisma.produto.findMany.mockResolvedValue([
      {
        id: 'p1',
        nome: 'Bolo',
        precoVenda: '18.00',
        fulfillment: 'MAKE_TO_STOCK',
        estoqueVitrine: 1,
      },
    ]);

    await expect(
      service.vendaBalcao('op1', { itens: [{ produtoId: 'p1', quantidade: 2 }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('não mexe na vitrine para item MAKE_TO_ORDER', async () => {
    prisma.produto.findMany.mockResolvedValue([
      {
        id: 'p2',
        nome: 'Bolo sob encomenda',
        precoVenda: '120.00',
        fulfillment: 'MAKE_TO_ORDER',
        estoqueVitrine: 0,
      },
    ]);

    await service.vendaBalcao('op1', { itens: [{ produtoId: 'p2', quantidade: 1 }] });

    expect(tx.produto.update).not.toHaveBeenCalled();
    expect(tx.movimentacaoVitrine.create).not.toHaveBeenCalled();
  });
});
