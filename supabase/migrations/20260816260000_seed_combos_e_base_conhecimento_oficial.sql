-- =========================================================================
-- Migração: Catálogo Oficial dos 4 Combos e Base de Conhecimento RAG
-- ID: 20260816260000_seed_combos_e_base_conhecimento_oficial
-- =========================================================================

-- 1. Inserir ou Atualizar os 4 Combos e Produtos Oficiais em public.produtos
INSERT INTO public.produtos (
    id,
    nome,
    descricao,
    preco_centavos,
    quantidade_estoque,
    controlar_estoque,
    ativo,
    ordem_exibicao,
    url_imagem,
    url_imagem_thumb
) VALUES 
(
    'a1111111-1111-4111-8111-111111111111',
    'Combo 1 – O Clássico da Sofia',
    '1 Frango recheado inteiro (~1,4kg assado), farofa artesanal crocante com bacon (250g), maionese caseira tradicional de batata com cenoura (300g). Serve 3 a 4 pessoas.',
    6990,
    35,
    true,
    true,
    1,
    '/cardapio/combo_1_classico_sofia_1.png',
    '/cardapio/combo_1_classico_sofia_1.png'
),
(
    'a2222222-2222-4222-8222-222222222222',
    'Combo 2 – Costela Suprema no Bafo',
    '1,0kg de Costela bovina premium com osso assada no bafo por 6 horas, mandioca amarela cozida na manteiga de garrafa (300g), vinagrete fresco de tomate e cebola e farofa da casa (250g). Serve 4 pessoas.',
    11990,
    25,
    true,
    true,
    2,
    '/cardapio/combo_2_costela_suprema_1.png',
    '/cardapio/combo_2_costela_suprema_1.png'
),
(
    'a3333333-3333-4333-8333-333333333333',
    'Combo 3 – Dueto Sofia (Frango & Costelinha Suína)',
    'Meio frango assado dourado crocante com ervas + 500g de Costelinha suína marinada em ervas finas e glaceada, batatas rústicas douradas ao alecrim (300g) e farofa artesanal da casa (200g). Serve 3 a 4 pessoas.',
    9490,
    20,
    true,
    true,
    3,
    '/cardapio/combo_3_dueto_sofia_1.png',
    '/cardapio/combo_3_dueto_sofia_1.png'
),
(
    'a4444444-4444-4444-8444-444444444444',
    'Combo 4 – Kit Churrasco Família',
    '1 Frango recheado inteiro dourado + 700g de Costela bovina no bafo + 4 Linguiças toscanas artesanais grelhadas nas brasas + 4 Pães de alho especiais, acompanhados de maionese caseira grande (500g) e farofa grande da casa (400g). Serve 5 a 6 pessoas.',
    16990,
    15,
    true,
    true,
    4,
    '/cardapio/combo_4_kit_familia_1.png',
    '/cardapio/combo_4_kit_familia_1.png'
),
(
    'b1111111-1111-4111-8111-111111111111',
    'Frango Recheado Inteiro Assado (Avulso)',
    'Frango inteiro temperado com ervas e recheado com farofa úmida da casa (~1,4kg assado). Pele crocante e carne suculenta.',
    4990,
    40,
    true,
    true,
    5,
    '/cardapio/produto_frango_assado_1.png',
    '/cardapio/produto_frango_assado_1.png'
),
(
    'b2222222-2222-4222-8222-222222222222',
    'Costela Bovina no Bafo 1kg (Avulso)',
    '1kg de costela bovina janela com osso, assada lentamente no bafo por mais de 6 horas. Derrete na boca.',
    8990,
    30,
    true,
    true,
    6,
    '/cardapio/produto_costela_bafo_1.png',
    '/cardapio/produto_costela_bafo_1.png'
),
(
    'b3333333-3333-4333-8333-333333333333',
    'Costelinha Suína Especial 500g (Avulso)',
    'Costelinha suína macia marinada em ervas finas com crosta levemente caramelizada na brasa.',
    5490,
    25,
    true,
    true,
    7,
    '/cardapio/produto_costelinha_suina_1.png',
    '/cardapio/produto_costelinha_suina_1.png'
),
(
    'b4444444-4444-4444-8444-444444444444',
    'Linguiça Toscana Artesanal (4 unidades)',
    '4 gomos de linguiça toscana artesanal de pernil temperada com especiarias e grelhada na brasa viva.',
    2990,
    50,
    true,
    true,
    8,
    '/cardapio/produto_linguica_toscana_1.png',
    '/cardapio/produto_linguica_toscana_1.png'
),
(
    'c1111111-1111-4111-8111-111111111111',
    'Maionese Caseira Tradicional de Batata (300g)',
    'A clássica maionese de domingo curitibana, com batata macia, cenoura em cubos e tempero verde.',
    1490,
    60,
    true,
    true,
    9,
    '/cardapio/produto_maionese_caseira_1.png',
    '/cardapio/produto_maionese_caseira_1.png'
),
(
    'c2222222-2222-4222-8222-222222222222',
    'Mandioca na Manteiga de Garrafa (300g)',
    'Mandioca amarela cozida no ponto, macia por dentro e finalizada na manteiga de garrafa aromatizada.',
    1490,
    50,
    true,
    true,
    10,
    '/cardapio/produto_mandioca_garrafa_1.png',
    '/cardapio/produto_mandioca_garrafa_1.png'
),
(
    'c3333333-3333-4333-8333-333333333333',
    'Farofa Artesanal Crocante com Bacon (250g)',
    'Farofa tostada na manteiga com pedacinhos crocantes de bacon e cebola dourada.',
    1290,
    70,
    true,
    true,
    11,
    '/cardapio/produto_farofa_artesanal_1.png',
    '/cardapio/produto_farofa_artesanal_1.png'
),
(
    'c4444444-4444-4444-8444-444444444444',
    'Pão de Alho Especial na Brasa (4 unidades)',
    'Pão de alho cremoso recheado com pasta de alho suave e queijo, tostado na brasa.',
    1690,
    45,
    true,
    true,
    12,
    '/cardapio/produto_pao_alho_1.png',
    '/cardapio/produto_pao_alho_1.png'
),
(
    'd1111111-1111-4111-8111-111111111111',
    'Refrigerante 2L (Coca-Cola / Guaraná Antarctica)',
    'Refrigerante gelado garrafa 2 litros.',
    1200,
    80,
    true,
    true,
    13,
    '/cardapio/produto_refrigerante_1.png',
    '/cardapio/produto_refrigerante_1.png'
)
ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao,
    preco_centavos = EXCLUDED.preco_centavos,
    quantidade_estoque = EXCLUDED.quantidade_estoque,
    controlar_estoque = EXCLUDED.controlar_estoque,
    ativo = EXCLUDED.ativo,
    ordem_exibicao = EXCLUDED.ordem_exibicao,
    url_imagem = EXCLUDED.url_imagem,
    url_imagem_thumb = EXCLUDED.url_imagem_thumb;

-- 2. Inserir Artigos RAG da Base de Conhecimento para os 4 Combos e Pré-venda
DELETE FROM public.base_conhecimento WHERE titulo ILIKE '%Combo 1%' OR titulo ILIKE '%Combo 2%' OR titulo ILIKE '%Combo 3%' OR titulo ILIKE '%Combo 4%' OR titulo ILIKE '%Janelas de Retirada%';

INSERT INTO public.base_conhecimento (titulo, conteudo, tags, ativo) VALUES
(
    'Combo 1 – O Clássico da Sofia: Ficha Técnica e Detalhes',
    'O Combo 1 (O Clássico da Sofia) custa R$ 69,90 e serve de 3 a 4 pessoas com muita fartura. É composto por 1 Frango recheado inteiro (~1,4kg assado) com pele dourada e crocante, recheio generoso de farofa temperada da casa aparente na cavidade, acompanhado por uma tigela de maionese caseira tradicional de batata com cenoura (300g) e cumbuca rústica de farofa artesanal crocante com bacon (250g). Nosso frango é marinado por 12 horas em infusão de ervas frescas e assado em máquina giratória a gás com fogo calibrado, garantindo suculência interna incomparável e pele bem douradinha.',
    ARRAY['combo 1', 'frango recheado', 'cardápio', 'almoço', 'maionese', 'farofa', 'preço', 'família'],
    true
),
(
    'Combo 2 – Costela Suprema no Bafo: Ficha Técnica e Preparo',
    'O Combo 2 (Costela Suprema no Bafo) custa R$ 119,90 e serve perfeitamente 4 pessoas. É composto por um corte generoso de 1,0kg de costela bovina premium janela com osso, assada lentamente no bafo por mais de 6 horas em fogo indireto de carvão e lenha selecionada. A carne derrete na boca e solta do osso com facilidade. Acompanha mandioca amarela cozida na manteiga de garrafa aromatizada (300g), vinagrete fresco de tomate, cebola e cheiro-verde e farofa artesanal crocante da casa (250g). É a verdadeira especialidade da casa para quem ama churrasco tradicional.',
    ARRAY['combo 2', 'costela', 'costela no bafo', 'churrasco', 'mandioca', 'vinagrete', 'preço', 'especialidade'],
    true
),
(
    'Combo 3 – Dueto Sofia (Frango & Costelinha Suína): Ficha Técnica',
    'O Combo 3 (Dueto Sofia) custa R$ 94,90 e serve 3 a 4 pessoas. É a combinação perfeita de duas carnes consagradas: exatamente meio frango assado dourado crocante com ervas frescas + 500g de costelinha suína macia marinada em ervas finas e glaceada lentamente na brasa. Acompanha batatas rústicas douradas ao alecrim (300g) e farofa artesanal crocante da casa (200g). É ideal para famílias que apreciam variedade de sabores no mesmo almoço.',
    ARRAY['combo 3', 'dueto sofia', 'frango', 'costelinha', 'porco', 'batata rustica', 'preço'],
    true
),
(
    'Combo 4 – Kit Churrasco Família: O Grande Banquete',
    'O Combo 4 (Kit Churrasco Família) custa R$ 169,90 e serve com fartura de 5 a 6 pessoas. É um grande banquete de domingo que reúne todos os sucessos da nossa brasa: 1 frango recheado inteiro dourado + 700g de costela bovina assada no bafo + 4 linguiças toscanas artesanais grelhadas + 4 fatias de pão de alho tostadas na brasa, acompanhados de uma tigela grande de maionese caseira tradicional (500g) e farofa grande artesanal com bacon (400g). Perfeito para celebrações em família com o melhor custo-benefício de Curitiba.',
    ARRAY['combo 4', 'kit família', 'churrasco completo', 'costela', 'frango', 'linguiça', 'pão de alho', 'preço'],
    true
),
(
    'Janelas de Retirada (Takeaway) e Delivery Próprio em Curitiba',
    'A Casa de Assados Sofia opera com o modelo inovador de Pré-Venda com Janelas de Retirada de 15 minutos (ex.: 11h30, 11h45, 12h00, 12h15, 12h30, 12h45, 13h00, 13h15, 13h30). Ao agendar pelo WhatsApp, seu pedido fica reservado e sai da estufa quente direto para sua mão no balcão no Umbará em menos de 90 segundos, sem filas! Também realizamos Delivery próprio com caixas térmicas vedadas em um raio de até 5 km no Umbará, Ganchinho, Sítio Cercado e Pinheirinho, chegando quentinho a mais de 65°C.',
    ARRAY['horários', 'retirada', 'balcão', 'delivery', 'entrega', 'umbara', 'curitiba', 'agendamento', 'sem fila'],
    true
);
