-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENTE', 'OPERADOR', 'GERENTE', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "ProdutoStatus" AS ENUM ('ATIVO', 'REVISAO_MARGEM', 'INATIVO');

-- CreateEnum
CREATE TYPE "ProdutoTipo" AS ENUM ('PADRAO', 'MONTAVEL', 'ASSINATURA', 'ADICIONAL');

-- CreateEnum
CREATE TYPE "FulfillmentTipo" AS ENUM ('MAKE_TO_STOCK', 'MAKE_TO_ORDER', 'HIBRIDO');

-- CreateEnum
CREATE TYPE "FichaTipo" AS ENUM ('FINANCEIRA', 'OPERACIONAL');

-- CreateEnum
CREATE TYPE "MovimentacaoTipo" AS ENUM ('ENTRADA', 'SAIDA_PRODUCAO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'QUEBRA_DESPERDICIO');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('ABERTO', 'CHEIO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "PedidoStatus" AS ENUM ('AGUARDANDO_PAGAMENTO', 'PAGO', 'EM_PRODUCAO', 'PRONTO', 'EM_ENTREGA', 'ENTREGUE', 'CANCELADO', 'FALHA_ENTREGA', 'ATRASADO');

-- CreateEnum
CREATE TYPE "CupomTipo" AS ENUM ('PERCENTUAL', 'FIXO');

-- CreateEnum
CREATE TYPE "AssinaturaStatus" AS ENUM ('ATIVA', 'PAUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigemPedido" AS ENUM ('ONLINE', 'BALCAO', 'WHATSAPP', 'ASSINATURA');

-- CreateEnum
CREATE TYPE "EntregaModalidade" AS ENUM ('RETIRADA_BALCAO', 'UBER_DIRECT', 'NOVENTA_NOVE_ENTREGAS', 'MOTOBOY_LOCAL');

-- CreateEnum
CREATE TYPE "EntregaStatus" AS ENUM ('AGUARDANDO_DESPACHO', 'DESPACHADO', 'EM_TRANSITO', 'ENTREGUE', 'FALHA');

-- CreateEnum
CREATE TYPE "PagamentoStatus" AS ENUM ('PENDENTE', 'CONFIRMADO', 'ESTORNADO', 'FALHA');

-- CreateEnum
CREATE TYPE "PagamentoGateway" AS ENUM ('ABACATE_PAY');

-- CreateEnum
CREATE TYPE "NotificacaoCanal" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificacaoStatus" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "cpf" VARCHAR(14),
    "dataNascimento" DATE,
    "senhaHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CLIENTE',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "emailVerificado" BOOLEAN NOT NULL DEFAULT false,
    "anonimizadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenLookup" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revogado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enderecos" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" CHAR(2) NOT NULL,
    "cep" CHAR(9) NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enderecos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "margemMinima" DECIMAL(5,2) NOT NULL DEFAULT 35,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "ProdutoTipo" NOT NULL DEFAULT 'PADRAO',
    "fulfillment" "FulfillmentTipo" NOT NULL DEFAULT 'MAKE_TO_ORDER',
    "precoVenda" DECIMAL(10,2) NOT NULL,
    "estoqueVitrine" INTEGER NOT NULL DEFAULT 0,
    "pontosEsforco" INTEGER NOT NULL DEFAULT 1,
    "status" "ProdutoStatus" NOT NULL DEFAULT 'ATIVO',
    "leadTimeHoras" INTEGER NOT NULL DEFAULT 48,
    "categoriaId" TEXT,
    "imagemUrl" TEXT,
    "alergenicos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "destaqueUpsell" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opcoes_montagem" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "descricao" TEXT,
    "precoExtra" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pontosExtra" INTEGER NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "opcoes_montagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "precoUnitario" DECIMAL(10,4) NOT NULL,
    "estoqueAtual" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "pontoReposicao" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "fornecedor" TEXT,
    "codigoInterno" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichas_tecnicas" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "tipo" "FichaTipo" NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "custoCalculado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "margemCalculada" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "aprovadoPorId" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "observacoes" TEXT,
    "passosPreparo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fichas_tecnicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_ficha" (
    "id" TEXT NOT NULL,
    "fichaTecnicaId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "custoUnitario" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "itens_ficha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "margem_aprovacoes" (
    "id" TEXT NOT NULL,
    "fichaTecnicaId" TEXT NOT NULL,
    "aprovadoPorId" TEXT NOT NULL,
    "margemAnterior" DECIMAL(5,2) NOT NULL,
    "margemNova" DECIMAL(5,2) NOT NULL,
    "justificativa" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "margem_aprovacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_estoque" (
    "id" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "tipo" "MovimentacaoTipo" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "custoUnitario" DECIMAL(10,4),
    "pedidoId" TEXT,
    "loteId" TEXT,
    "motivo" TEXT,
    "operadorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentacoes_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_estoque" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT,
    "insumoId" TEXT,
    "tipo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "resolvido" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slots_producao" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "horaInicio" TIME NOT NULL,
    "horaFim" TIME NOT NULL,
    "capacidadeMaxima" INTEGER NOT NULL,
    "capacidadeOcupada" INTEGER NOT NULL DEFAULT 0,
    "status" "SlotStatus" NOT NULL DEFAULT 'ABERTO',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slots_producao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas_producao" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "pontosConsumidos" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservas_producao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotes_producao" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "observacao" TEXT,
    "iniciadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_producao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_lote" (
    "id" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,

    CONSTRAINT "itens_lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "status" "PedidoStatus" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
    "modalidadeEntrega" "EntregaModalidade" NOT NULL,
    "origem" "OrigemPedido" NOT NULL DEFAULT 'ONLINE',
    "dataAgendamento" TIMESTAMP(3),
    "enderecoEntregaId" TEXT,
    "cupomId" TEXT,
    "assinaturaId" TEXT,
    "valorSubtotal" DECIMAL(10,2) NOT NULL,
    "valorFrete" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "valorDesconto" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "observacoes" TEXT,
    "canceladoMotivo" TEXT,
    "canceladoPor" TEXT,
    "slaDeadline" TIMESTAMP(3),
    "slaAlertado" BOOLEAN NOT NULL DEFAULT false,
    "nfeNumero" TEXT,
    "nfeUrl" TEXT,
    "nfeXmlUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_pedido" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(10,2) NOT NULL,
    "snapshotCustoProducao" DECIMAL(10,2) NOT NULL,
    "snapshotPontosEsforco" INTEGER NOT NULL,
    "opcoesEscolhidas" JSONB,
    "personalizacao" TEXT,

    CONSTRAINT "itens_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "gateway" "PagamentoGateway" NOT NULL DEFAULT 'ABACATE_PAY',
    "status" "PagamentoStatus" NOT NULL DEFAULT 'PENDENTE',
    "metodo" TEXT,
    "valorPago" DECIMAL(10,2),
    "gatewayTransacaoId" TEXT,
    "gatewayPayloadRaw" JSONB,
    "pixCopiaCola" TEXT,
    "pixQrCodeUrl" TEXT,
    "expiresAt" TIMESTAMP(3),
    "confirmadoEm" TIMESTAMP(3),
    "estornadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregas" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "modalidade" "EntregaModalidade" NOT NULL,
    "status" "EntregaStatus" NOT NULL DEFAULT 'AGUARDANDO_DESPACHO',
    "trackingCode" TEXT,
    "provedorJobId" TEXT,
    "enderecoDestinoSnapshot" JSONB,
    "previsaoEntrega" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "falhaMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entregas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupons" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "CupomTipo" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "minimoCompra" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "usoMaximo" INTEGER,
    "usoAtual" INTEGER NOT NULL DEFAULT 0,
    "validoDe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validoAte" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "descricao" TEXT,
    "campanha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "status" "AssinaturaStatus" NOT NULL DEFAULT 'ATIVA',
    "frequenciaDias" INTEGER NOT NULL DEFAULT 30,
    "proximaGeracao" TIMESTAMP(3) NOT NULL,
    "ultimaGeracaoEm" TIMESTAMP(3),
    "diaPreferido" INTEGER,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "produtoId" TEXT,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "processadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_balcao" (
    "id" TEXT NOT NULL,
    "operadorId" TEXT NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "itens" JSONB NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_balcao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT,
    "usuarioId" TEXT,
    "canal" "NotificacaoCanal" NOT NULL,
    "status" "NotificacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "templateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erroMensagem" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "payloadAntes" JSONB,
    "payloadDepois" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_email_idx" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_role_idx" ON "usuarios"("role");

-- CreateIndex
CREATE INDEX "usuarios_dataNascimento_idx" ON "usuarios"("dataNascimento");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenLookup_key" ON "refresh_tokens"("tokenLookup");

-- CreateIndex
CREATE INDEX "refresh_tokens_usuarioId_idx" ON "refresh_tokens"("usuarioId");

-- CreateIndex
CREATE INDEX "enderecos_usuarioId_idx" ON "enderecos"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_slug_key" ON "categorias"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_slug_key" ON "produtos"("slug");

-- CreateIndex
CREATE INDEX "produtos_status_ativo_idx" ON "produtos"("status", "ativo");

-- CreateIndex
CREATE INDEX "produtos_categoriaId_idx" ON "produtos"("categoriaId");

-- CreateIndex
CREATE INDEX "produtos_tipo_destaqueUpsell_idx" ON "produtos"("tipo", "destaqueUpsell");

-- CreateIndex
CREATE INDEX "opcoes_montagem_produtoId_etapa_idx" ON "opcoes_montagem"("produtoId", "etapa");

-- CreateIndex
CREATE UNIQUE INDEX "insumos_codigoInterno_key" ON "insumos"("codigoInterno");

-- CreateIndex
CREATE INDEX "insumos_estoqueAtual_idx" ON "insumos"("estoqueAtual");

-- CreateIndex
CREATE INDEX "fichas_tecnicas_produtoId_ativa_idx" ON "fichas_tecnicas"("produtoId", "ativa");

-- CreateIndex
CREATE UNIQUE INDEX "fichas_tecnicas_produtoId_versao_tipo_key" ON "fichas_tecnicas"("produtoId", "versao", "tipo");

-- CreateIndex
CREATE INDEX "itens_ficha_fichaTecnicaId_idx" ON "itens_ficha"("fichaTecnicaId");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_insumoId_createdAt_idx" ON "movimentacoes_estoque"("insumoId", "createdAt");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_pedidoId_idx" ON "movimentacoes_estoque"("pedidoId");

-- CreateIndex
CREATE INDEX "slots_producao_data_status_idx" ON "slots_producao"("data", "status");

-- CreateIndex
CREATE UNIQUE INDEX "slots_producao_data_horaInicio_key" ON "slots_producao"("data", "horaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_producao_pedidoId_key" ON "reservas_producao"("pedidoId");

-- CreateIndex
CREATE INDEX "pedidos_clienteId_status_createdAt_idx" ON "pedidos"("clienteId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "pedidos_status_dataAgendamento_idx" ON "pedidos"("status", "dataAgendamento");

-- CreateIndex
CREATE INDEX "pedidos_status_slaDeadline_idx" ON "pedidos"("status", "slaDeadline");

-- CreateIndex
CREATE INDEX "pedidos_canceladoMotivo_idx" ON "pedidos"("canceladoMotivo");

-- CreateIndex
CREATE INDEX "itens_pedido_pedidoId_idx" ON "itens_pedido"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_pedidoId_key" ON "pagamentos"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_gatewayTransacaoId_key" ON "pagamentos"("gatewayTransacaoId");

-- CreateIndex
CREATE INDEX "pagamentos_gatewayTransacaoId_idx" ON "pagamentos"("gatewayTransacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "entregas_pedidoId_key" ON "entregas"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "cupons_codigo_key" ON "cupons"("codigo");

-- CreateIndex
CREATE INDEX "cupons_codigo_ativo_idx" ON "cupons"("codigo", "ativo");

-- CreateIndex
CREATE INDEX "cupons_validoAte_ativo_idx" ON "cupons"("validoAte", "ativo");

-- CreateIndex
CREATE INDEX "assinaturas_status_proximaGeracao_idx" ON "assinaturas"("status", "proximaGeracao");

-- CreateIndex
CREATE INDEX "assinaturas_clienteId_idx" ON "assinaturas"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_pedidoId_key" ON "avaliacoes"("pedidoId");

-- CreateIndex
CREATE INDEX "avaliacoes_produtoId_publicado_idx" ON "avaliacoes"("produtoId", "publicado");

-- CreateIndex
CREATE INDEX "avaliacoes_clienteId_idx" ON "avaliacoes"("clienteId");

-- CreateIndex
CREATE INDEX "webhook_events_gateway_processadoEm_idx" ON "webhook_events"("gateway", "processadoEm");

-- CreateIndex
CREATE INDEX "vendas_balcao_createdAt_idx" ON "vendas_balcao"("createdAt");

-- CreateIndex
CREATE INDEX "notificacoes_pedidoId_idx" ON "notificacoes"("pedidoId");

-- CreateIndex
CREATE INDEX "notificacoes_status_createdAt_idx" ON "notificacoes"("status", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entidade_entidadeId_createdAt_idx" ON "audit_logs"("entidade", "entidadeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_usuarioId_createdAt_idx" ON "audit_logs"("usuarioId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enderecos" ADD CONSTRAINT "enderecos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opcoes_montagem" ADD CONSTRAINT "opcoes_montagem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_tecnicas" ADD CONSTRAINT "fichas_tecnicas_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_ficha" ADD CONSTRAINT "itens_ficha_fichaTecnicaId_fkey" FOREIGN KEY ("fichaTecnicaId") REFERENCES "fichas_tecnicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_ficha" ADD CONSTRAINT "itens_ficha_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margem_aprovacoes" ADD CONSTRAINT "margem_aprovacoes_fichaTecnicaId_fkey" FOREIGN KEY ("fichaTecnicaId") REFERENCES "fichas_tecnicas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "margem_aprovacoes" ADD CONSTRAINT "margem_aprovacoes_aprovadoPorId_fkey" FOREIGN KEY ("aprovadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_estoque" ADD CONSTRAINT "alertas_estoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_producao" ADD CONSTRAINT "reservas_producao_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_producao" ADD CONSTRAINT "reservas_producao_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "slots_producao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_lote" ADD CONSTRAINT "itens_lote_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_producao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_enderecoEntregaId_fkey" FOREIGN KEY ("enderecoEntregaId") REFERENCES "enderecos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_cupomId_fkey" FOREIGN KEY ("cupomId") REFERENCES "cupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_assinaturaId_fkey" FOREIGN KEY ("assinaturaId") REFERENCES "assinaturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_pedido" ADD CONSTRAINT "itens_pedido_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
