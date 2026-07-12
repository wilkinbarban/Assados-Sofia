-- Migração para adicionar a coluna whatsapp_mensagem_id (Épica 3)
-- ID: 20260704150000_epica3_whatsapp_webhook

ALTER TABLE public.mensagens
ADD COLUMN whatsapp_mensagem_id VARCHAR(100) UNIQUE;
