-- Migration: 20260711155000_comprovantes_pdf.sql
-- Create comprovantes table for client payment receipt PDF uploads

CREATE TABLE IF NOT EXISTS public.comprovantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
    url_arquivo TEXT NOT NULL,
    nome_arquivo TEXT NOT NULL,
    tamanho_bytes BIGINT NOT NULL,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.comprovantes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Clientes podem ver e enviar seus próprios comprovantes"
    ON public.comprovantes
    FOR ALL
    TO authenticated
    USING (
        cliente_id IN (
            SELECT id FROM public.clientes WHERE usuario_id = auth.uid()
        )
    )
    WITH CHECK (
        cliente_id IN (
            SELECT id FROM public.clientes WHERE usuario_id = auth.uid()
        )
    );

CREATE POLICY "Operadores e admins podem ver todos os comprovantes"
    ON public.comprovantes
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis 
            WHERE id = auth.uid() AND funcao IN ('admin', 'supervisor', 'vendedor')
        )
    );
