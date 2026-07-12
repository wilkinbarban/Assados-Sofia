-- Seed global Sofia channel status flags with safe enabled defaults.

INSERT INTO public.configuracoes_sistema (chave, valor, eh_segredo)
VALUES
  ('SOFIA_GLOBAL_WHATSAPP_ENABLED', 'true', false),
  ('SOFIA_GLOBAL_TELEGRAM_ENABLED', 'true', false)
ON CONFLICT (chave) DO NOTHING;
