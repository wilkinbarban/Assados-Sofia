-- Migração para Habilitar Tabelas no Supabase Realtime
-- ID: 20260817010000_supabase_realtime_tables

DO $$
BEGIN
  -- 1. Definir REPLICA IDENTITY FULL para suportar filtros e broadcasting completo
  ALTER TABLE public.mensagens REPLICA IDENTITY FULL;
  ALTER TABLE public.conversas REPLICA IDENTITY FULL;
  ALTER TABLE public.carrinhos REPLICA IDENTITY FULL;
  ALTER TABLE public.itens_carrinho REPLICA IDENTITY FULL;
  ALTER TABLE public.pedidos REPLICA IDENTITY FULL;
  ALTER TABLE public.produtos REPLICA IDENTITY FULL;

  -- 2. Garantir que a publicação supabase_realtime exista
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- 3. Adicionar tabelas chave à publicação supabase_realtime
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE 
      public.mensagens, 
      public.conversas, 
      public.carrinhos, 
      public.itens_carrinho, 
      public.pedidos, 
      public.produtos;
  EXCEPTION
    WHEN duplicate_object THEN
      -- Tabelas já estavam na publicação
      NULL;
  END;
END $$;
