import { PrismaClient, Prisma } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const IMG = {
  bolo: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600',
  brigadeiro: 'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=600',
  bolopote: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600',
  torta: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600',
  vela: 'https://images.unsplash.com/photo-1557979619-445218f326f9?w=600',
  cartao: 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=600',
};

async function main() {
  console.log('🌱 Iniciando seed...');

  const adminHash = await argon2.hash('admin123');
  await prisma.usuario.upsert({
    where: { email: 'admin@deliciasdavann.com.br' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@deliciasdavann.com.br',
      senhaHash: adminHash,
      role: 'ADMINISTRADOR',
      telefone: '11982813152',
    },
  });

  const gerenteHash = await argon2.hash('gerente123');
  await prisma.usuario.upsert({
    where: { email: 'van@deliciasdavann.com.br' },
    update: {},
    create: {
      nome: 'Vanessa',
      email: 'van@deliciasdavann.com.br',
      senhaHash: gerenteHash,
      role: 'GERENTE',
      telefone: '11982813152',
      marketingOptIn: true,
    },
  });

  const cats = await Promise.all([
    prisma.categoria.upsert({
      where: { slug: 'bolos' },
      update: {},
      create: { nome: 'Bolos', slug: 'bolos', ordem: 1, margemMinima: 35 },
    }),
    prisma.categoria.upsert({
      where: { slug: 'docinhos' },
      update: {},
      create: { nome: 'Docinhos', slug: 'docinhos', ordem: 2, margemMinima: 40 },
    }),
    prisma.categoria.upsert({
      where: { slug: 'tortas' },
      update: {},
      create: { nome: 'Tortas', slug: 'tortas', ordem: 3, margemMinima: 35 },
    }),
    prisma.categoria.upsert({
      where: { slug: 'kits' },
      update: {},
      create: { nome: 'Kits Festa', slug: 'kits', ordem: 4, margemMinima: 30 },
    }),
    prisma.categoria.upsert({
      where: { slug: 'adicionais' },
      update: {},
      create: { nome: 'Adicionais', slug: 'adicionais', ordem: 5, margemMinima: 60 },
    }),
  ]);

  const boloPersonalizado = await prisma.produto.upsert({
    where: { slug: 'bolo-personalizado' },
    update: {
      modalidadesPermitidas: ['RETIRADA_BALCAO', 'MOTOBOY_LOCAL'],
    },
    create: {
      nome: 'Bolo Personalizado',
      slug: 'bolo-personalizado',
      descricao: 'Criado sob medida. Massa, recheio e decoração à sua escolha.',
      tipo: 'MONTAVEL',
      fulfillment: 'MAKE_TO_ORDER',
      precoVenda: 120,
      pontosEsforco: 12,
      leadTimeHoras: 48,
      categoriaId: cats[0].id,
      imagemUrl: IMG.bolo,
      alergenicos: ['glúten', 'ovo', 'leite'],
      modalidadesPermitidas: ['RETIRADA_BALCAO', 'MOTOBOY_LOCAL'],
    },
  });

  const caixaBrigadeiros = await prisma.produto.upsert({
    where: { slug: 'caixa-brigadeiros' },
    update: {},
    create: {
      nome: 'Caixa de Brigadeiros (25un)',
      slug: 'caixa-brigadeiros',
      descricao: 'Brigadeiros gourmet em embalagem especial.',
      tipo: 'PADRAO',
      fulfillment: 'MAKE_TO_STOCK',
      precoVenda: 65,
      estoqueVitrine: 10,
      pontosEsforco: 2,
      leadTimeHoras: 24,
      categoriaId: cats[1].id,
      imagemUrl: IMG.brigadeiro,
      alergenicos: ['leite'],
    },
  });

  const boloPote = await prisma.produto.upsert({
    where: { slug: 'bolo-de-pote' },
    update: {},
    create: {
      nome: 'Bolo de Pote',
      slug: 'bolo-de-pote',
      descricao: 'Camadas de bolo e recheio em potinho irresistível.',
      tipo: 'PADRAO',
      fulfillment: 'MAKE_TO_STOCK',
      precoVenda: 18,
      estoqueVitrine: 20,
      pontosEsforco: 1,
      leadTimeHoras: 24,
      categoriaId: cats[1].id,
      imagemUrl: IMG.bolopote,
      alergenicos: ['glúten', 'ovo', 'leite'],
    },
  });

  await prisma.produto.upsert({
    where: { slug: 'adicional-velas' },
    update: {},
    create: {
      nome: 'Velas de aniversário (10un)',
      slug: 'adicional-velas',
      descricao: 'Velas coloridas para colocar no bolo',
      tipo: 'ADICIONAL',
      fulfillment: 'MAKE_TO_STOCK',
      precoVenda: 8,
      estoqueVitrine: 50,
      pontosEsforco: 0,
      leadTimeHoras: 0,
      categoriaId: cats[4].id,
      imagemUrl: IMG.vela,
      destaqueUpsell: true,
    },
  });

  await prisma.produto.upsert({
    where: { slug: 'adicional-cartao' },
    update: {},
    create: {
      nome: 'Cartão personalizado',
      slug: 'adicional-cartao',
      descricao: 'Cartão escrito à mão com mensagem sua',
      tipo: 'ADICIONAL',
      fulfillment: 'MAKE_TO_ORDER',
      precoVenda: 12,
      pontosEsforco: 0,
      leadTimeHoras: 24,
      categoriaId: cats[4].id,
      imagemUrl: IMG.cartao,
      destaqueUpsell: true,
    },
  });

  await prisma.produto.upsert({
    where: { slug: 'adicional-topo-foto' },
    update: {},
    create: {
      nome: 'Topo de bolo com foto',
      slug: 'adicional-topo-foto',
      descricao: 'Foto comestível impressa no seu bolo',
      tipo: 'ADICIONAL',
      fulfillment: 'MAKE_TO_ORDER',
      precoVenda: 35,
      pontosEsforco: 1,
      leadTimeHoras: 48,
      categoriaId: cats[4].id,
      alergenicos: ['glúten', 'ovo'],
      destaqueUpsell: true,
    },
  });

  const opcoes: Array<Prisma.OpcaoMontagemCreateInput> = [
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'tamanho', label: 'Pequeno', descricao: 'até 10 fatias', precoExtra: 0, pontosExtra: 0, ordem: 1 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'tamanho', label: 'Médio', descricao: 'até 20 fatias', precoExtra: 40, pontosExtra: 4, ordem: 2 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'tamanho', label: 'Grande', descricao: 'até 40 fatias · andar duplo', precoExtra: 80, pontosExtra: 8, leadTimeHorasExtra: 24, ordem: 3 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'massa', label: 'Baunilha', descricao: 'clássico irresistível', precoExtra: 0, pontosExtra: 0, ordem: 1 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'massa', label: 'Chocolate', descricao: 'intenso & cremoso', precoExtra: 0, pontosExtra: 0, ordem: 2 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'massa', label: 'Red Velvet', descricao: 'edição especial · descansa 24h', precoExtra: 20, pontosExtra: 1, leadTimeHorasExtra: 24, ordem: 3 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'recheio', label: 'Brigadeiro', descricao: 'o favorito', precoExtra: 0, pontosExtra: 0, ordem: 1 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'recheio', label: 'Morango c/ Chantilly', descricao: 'fresquinho!', precoExtra: 0, pontosExtra: 0, ordem: 2 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'recheio', label: 'Doce de Leite', descricao: 'puro aconchego', precoExtra: 10, pontosExtra: 0, ordem: 3 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'cobertura', label: 'Chantilly', descricao: 'suave e delicado', precoExtra: 0, pontosExtra: 0, ordem: 1 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'cobertura', label: 'Ganache', descricao: 'chocolate puro', precoExtra: 0, pontosExtra: 0, ordem: 2 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'cobertura', label: 'Pasta Americana', descricao: 'decoração impecável · +12h', precoExtra: 30, pontosExtra: 2, leadTimeHorasExtra: 12, ordem: 3 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'topo', label: 'Simples', descricao: 'sem topo decorativo', precoExtra: 0, pontosExtra: 0, ordem: 1 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'topo', label: 'Biscuit', descricao: 'modelagem em biscuit · seca 72h', precoExtra: 45, pontosExtra: 3, leadTimeHorasExtra: 72, ordem: 2 },
    { produto: { connect: { id: boloPersonalizado.id } }, etapa: 'topo', label: 'Personalizado', descricao: 'decoração sob medida · +48h', precoExtra: 60, pontosExtra: 4, leadTimeHorasExtra: 48, ordem: 3 },
  ];

  for (const op of opcoes) {
    const existente = await prisma.opcaoMontagem.findFirst({
      where: {
        produtoId: boloPersonalizado.id,
        etapa: op.etapa,
        label: op.label,
      },
    });
    if (existente) {
      await prisma.opcaoMontagem.update({
        where: { id: existente.id },
        data: {
          descricao: op.descricao,
          precoExtra: op.precoExtra,
          pontosExtra: op.pontosExtra,
          leadTimeHorasExtra: op.leadTimeHorasExtra ?? 0,
          ordem: op.ordem,
        },
      });
    } else {
      await prisma.opcaoMontagem.create({ data: op });
    }
  }

  const insumos = await Promise.all([
    prisma.insumo.upsert({
      where: { codigoInterno: 'FAR001' },
      update: {},
      create: { nome: 'Farinha de Trigo', unidadeMedida: 'kg', precoUnitario: 5.5, estoqueAtual: 15, pontoReposicao: 5, codigoInterno: 'FAR001' },
    }),
    prisma.insumo.upsert({
      where: { codigoInterno: 'AUC001' },
      update: {},
      create: { nome: 'Açúcar Refinado', unidadeMedida: 'kg', precoUnitario: 4.2, estoqueAtual: 8, pontoReposicao: 3, codigoInterno: 'AUC001' },
    }),
    prisma.insumo.upsert({
      where: { codigoInterno: 'MAN001' },
      update: {},
      create: { nome: 'Manteiga sem sal', unidadeMedida: 'kg', precoUnitario: 38, estoqueAtual: 3, pontoReposicao: 2, codigoInterno: 'MAN001' },
    }),
    prisma.insumo.upsert({
      where: { codigoInterno: 'OVO001' },
      update: {},
      create: { nome: 'Ovos Caipira', unidadeMedida: 'un', precoUnitario: 1.2, estoqueAtual: 48, pontoReposicao: 12, codigoInterno: 'OVO001' },
    }),
    prisma.insumo.upsert({
      where: { codigoInterno: 'CHO001' },
      update: {},
      create: { nome: 'Chocolate 70%', unidadeMedida: 'kg', precoUnitario: 85, estoqueAtual: 4, pontoReposicao: 3, codigoInterno: 'CHO001' },
    }),
    prisma.insumo.upsert({
      where: { codigoInterno: 'CRE001' },
      update: {},
      create: { nome: 'Creme de Leite', unidadeMedida: 'L', precoUnitario: 12, estoqueAtual: 2, pontoReposicao: 2, codigoInterno: 'CRE001' },
    }),
    prisma.insumo.upsert({
      where: { codigoInterno: 'LEICON001' },
      update: {},
      create: { nome: 'Leite Condensado', unidadeMedida: 'L', precoUnitario: 14, estoqueAtual: 6, pontoReposicao: 3, codigoInterno: 'LEICON001' },
    }),
  ]);

  const insByCodigo = Object.fromEntries(insumos.map((i) => [i.codigoInterno!, i]));

  const fichas: Array<{
    produtoId: string;
    custo: number;
    itens: Array<{ codigo: string; quantidade: number }>;
  }> = [
    {
      produtoId: boloPersonalizado.id,
      custo: 42,
      itens: [
        { codigo: 'FAR001', quantidade: 0.5 },
        { codigo: 'AUC001', quantidade: 0.4 },
        { codigo: 'MAN001', quantidade: 0.25 },
        { codigo: 'OVO001', quantidade: 6 },
        { codigo: 'CHO001', quantidade: 0.1 },
        { codigo: 'CRE001', quantidade: 0.2 },
      ],
    },
    {
      produtoId: caixaBrigadeiros.id,
      custo: 18,
      itens: [
        { codigo: 'LEICON001', quantidade: 0.395 },
        { codigo: 'MAN001', quantidade: 0.03 },
        { codigo: 'CHO001', quantidade: 0.12 },
      ],
    },
    {
      produtoId: boloPote.id,
      custo: 5,
      itens: [
        { codigo: 'FAR001', quantidade: 0.08 },
        { codigo: 'AUC001', quantidade: 0.05 },
        { codigo: 'OVO001', quantidade: 1 },
        { codigo: 'CRE001', quantidade: 0.04 },
      ],
    },
  ];

  for (const f of fichas) {
    const existenteFin = await prisma.fichaTecnica.findFirst({
      where: { produtoId: f.produtoId, tipo: 'FINANCEIRA', ativa: true },
    });
    if (!existenteFin) {
      await prisma.fichaTecnica.create({
        data: {
          produtoId: f.produtoId,
          tipo: 'FINANCEIRA',
          ativa: true,
          custoCalculado: f.custo,
          margemCalculada: 50,
        },
      });
    }

    const existenteOp = await prisma.fichaTecnica.findFirst({
      where: { produtoId: f.produtoId, tipo: 'OPERACIONAL', ativa: true },
      include: { itens: true },
    });
    if (!existenteOp) {
      await prisma.fichaTecnica.create({
        data: {
          produtoId: f.produtoId,
          tipo: 'OPERACIONAL',
          ativa: true,
          custoCalculado: f.custo,
          margemCalculada: 0,
          itens: {
            create: f.itens.map((it) => ({
              insumoId: insByCodigo[it.codigo].id,
              quantidade: it.quantidade,
              unidadeMedida: insByCodigo[it.codigo].unidadeMedida,
              custoUnitario: insByCodigo[it.codigo].precoUnitario,
            })),
          },
        },
      });
    }
  }

  const hoje = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);
    if (d.getDay() === 0) continue;
    for (const [hi, hf, cap] of [
      ['08:00', '12:00', 24],
      ['13:00', '18:00', 32],
    ]) {
      const dataStr = d.toISOString().split('T')[0];
      try {
        await prisma.slotProducao.create({
          data: {
            data: d,
            horaInicio: new Date(`${dataStr}T${hi}:00`),
            horaFim: new Date(`${dataStr}T${hf}:00`),
            capacidadeMaxima: cap as number,
          },
        });
      } catch {}
    }
  }

  const validoAte = new Date();
  validoAte.setMonth(validoAte.getMonth() + 2);
  await prisma.cupom.upsert({
    where: { codigo: 'VANN10' },
    update: {},
    create: {
      codigo: 'VANN10',
      tipo: 'PERCENTUAL',
      valor: 10,
      minimoCompra: 60,
      validoAte,
      descricao: 'Primeira compra com 10% de desconto',
      campanha: 'ONBOARDING',
    },
  });

  // Regras de combinação inviável (proteção da cozinha)
  const regras: Array<{
    nome: string;
    nivel: 'BLOQUEAR' | 'AVISAR';
    mensagem: string;
    condicao: { todos: any[] };
  }> = [
    {
      nome: 'Chantilly em entrega motorizada com calor',
      nivel: 'AVISAR',
      mensagem:
        'Chantilly derrete acima de 28°C. Em moto/Uber pode chegar comprometido. Considere retirada no balcão ou outra cobertura.',
      condicao: {
        todos: [
          { tipo: 'OPCAO_CONTEM', etapa: 'cobertura', valor: 'chantilly' },
          { tipo: 'TEMPERATURA_GTE', valor: 28 },
          { tipo: 'MODALIDADE_IN', valores: ['UBER_DIRECT', 'NOVENTA_NOVE_ENTREGAS'] },
        ],
      },
    },
    {
      nome: 'Chantilly em calor extremo',
      nivel: 'BLOQUEAR',
      mensagem:
        'Acima de 32°C nem retirada com chantilly fica garantido. Vamos sugerir buttercream ou ganache?',
      condicao: {
        todos: [
          { tipo: 'OPCAO_CONTEM', etapa: 'cobertura', valor: 'chantilly' },
          { tipo: 'TEMPERATURA_GTE', valor: 32 },
        ],
      },
    },
    {
      nome: 'Biscuit com prazo curto',
      nivel: 'BLOQUEAR',
      mensagem:
        'Topo de biscuit precisa de pelo menos 72h pra secar. Escolha outra data ou outro topo.',
      condicao: {
        todos: [
          { tipo: 'OPCAO_CONTEM', etapa: 'topo', valor: 'biscuit' },
          { tipo: 'PRAZO_HORAS_LTE', valor: 72 },
        ],
      },
    },
    {
      nome: 'Pasta americana em dia quente',
      nivel: 'AVISAR',
      mensagem:
        'Pasta americana pode suar acima de 30°C. Comunicamos o cliente de não deixar exposta antes da festa.',
      condicao: {
        todos: [
          { tipo: 'OPCAO_CONTEM', etapa: 'cobertura', valor: 'pasta americana' },
          { tipo: 'TEMPERATURA_GTE', valor: 30 },
        ],
      },
    },
    {
      nome: 'Recheio cremoso com prazo curto',
      nivel: 'AVISAR',
      mensagem:
        'Recheios cremosos (mousse, brigadeiro mole) precisam de tempo de geladeira. Idealmente pedir com 48h de antecedência.',
      condicao: {
        todos: [
          { tipo: 'OPCAO_CONTEM', etapa: 'recheio', valor: 'mousse' },
          { tipo: 'PRAZO_HORAS_LTE', valor: 48 },
        ],
      },
    },
    {
      nome: 'Bolo montável em moto',
      nivel: 'AVISAR',
      mensagem:
        'Bolo de andar não viaja bem em moto. Recomendamos retirada no balcão ou motoboy local com cuidado.',
      condicao: {
        todos: [
          { tipo: 'PRODUTO_TIPO', valor: 'MONTAVEL' },
          { tipo: 'MODALIDADE_IN', valores: ['UBER_DIRECT', 'NOVENTA_NOVE_ENTREGAS'] },
        ],
      },
    },
    {
      nome: 'Personalização sem prazo',
      nivel: 'BLOQUEAR',
      mensagem:
        'Topo ou decoração personalizada precisa de pelo menos 48h. Selecione uma data mais à frente.',
      condicao: {
        todos: [
          { tipo: 'OPCAO_CONTEM', etapa: 'topo', valor: 'personalizado' },
          { tipo: 'PRAZO_HORAS_LTE', valor: 48 },
        ],
      },
    },
    {
      nome: 'Red Velvet em retirada urgente',
      nivel: 'AVISAR',
      mensagem:
        'Red Velvet sai melhor com 24h de descanso. Em prazo apertado, a massa pode ficar menos macia.',
      condicao: {
        todos: [
          { tipo: 'OPCAO_CONTEM', etapa: 'massa', valor: 'red velvet' },
          { tipo: 'PRAZO_HORAS_LTE', valor: 30 },
        ],
      },
    },
    {
      nome: 'Morango com chantilly em moto',
      nivel: 'AVISAR',
      mensagem:
        'Morango + chantilly + moto = risco alto de chegada comprometida. Sugerimos retirada ou motoboy local.',
      condicao: {
        todos: [
          { tipo: 'OPCAO_CONTEM', etapa: 'recheio', valor: 'morango' },
          { tipo: 'MODALIDADE_IN', valores: ['UBER_DIRECT', 'NOVENTA_NOVE_ENTREGAS'] },
        ],
      },
    },
  ];

  for (const r of regras) {
    const existente = await prisma.regraCombinacao.findFirst({ where: { nome: r.nome } });
    if (existente) continue;
    await prisma.regraCombinacao.create({ data: r });
  }

  console.log('Seed concluído!');
  console.log('   admin@deliciasdavann.com.br / admin123');
  console.log('   van@deliciasdavann.com.br   / gerente123');
  console.log('   cupom de teste: VANN10');
  console.log(`   ${regras.length} regras de combinação seedadas`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
