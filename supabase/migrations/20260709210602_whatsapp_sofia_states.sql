-- WhatsApp Sofia sleep/wake state
-- Change: whatsapp-sofia-sleep-wake-control

CREATE TABLE public.whatsapp_sofia_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    canal TEXT NOT NULL DEFAULT 'whatsapp',
    sofia_dormindo BOOLEAN NOT NULL DEFAULT TRUE,
    motivo TEXT,
    origem TEXT,
    alterado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    data_criacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT whatsapp_sofia_states_canal_check CHECK (canal = 'whatsapp'),
    CONSTRAINT whatsapp_sofia_states_motivo_check CHECK (motivo IS NULL OR motivo IN ('manual', 'handoff_phrase')),
    CONSTRAINT whatsapp_sofia_states_origem_check CHECK (origem IS NULL OR origem IN ('operator', 'meta_webhook', 'evolution_webhook')),
    CONSTRAINT whatsapp_sofia_states_cliente_canal_key UNIQUE (cliente_id, canal)
);

CREATE TRIGGER tr_whatsapp_sofia_states_atualizar_data
BEFORE UPDATE ON public.whatsapp_sofia_states
FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_atualizacao();

CREATE INDEX idx_whatsapp_sofia_states_cliente_id
    ON public.whatsapp_sofia_states (cliente_id);

CREATE INDEX idx_whatsapp_sofia_states_canal_sofia_dormindo
    ON public.whatsapp_sofia_states (canal, sofia_dormindo);

CREATE INDEX idx_whatsapp_sofia_states_alterado_por
    ON public.whatsapp_sofia_states (alterado_por)
    WHERE alterado_por IS NOT NULL;

ALTER TABLE public.whatsapp_sofia_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clientes leem próprio estado WhatsApp Sofia" ON public.whatsapp_sofia_states
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.clientes c
        WHERE c.id = whatsapp_sofia_states.cliente_id
          AND c.usuario_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Operadores leem estados WhatsApp Sofia" ON public.whatsapp_sofia_states
FOR SELECT TO authenticated
USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

CREATE POLICY "Operadores inserem estados WhatsApp Sofia" ON public.whatsapp_sofia_states
FOR INSERT TO authenticated
WITH CHECK (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

CREATE POLICY "Operadores atualizam estados WhatsApp Sofia" ON public.whatsapp_sofia_states
FOR UPDATE TO authenticated
USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
)
WITH CHECK (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

CREATE POLICY "Operadores excluem estados WhatsApp Sofia" ON public.whatsapp_sofia_states
FOR DELETE TO authenticated
USING (
    public.tem_funcoes(ARRAY['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao])
);

GRANT SELECT ON public.whatsapp_sofia_states TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.whatsapp_sofia_states TO authenticated;
GRANT ALL ON public.whatsapp_sofia_states TO service_role;
GRANT ALL ON public.whatsapp_sofia_states TO postgres;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'whatsapp_sofia_states'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_sofia_states;
    END IF;
END $$;
