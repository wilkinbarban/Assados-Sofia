-- =========================================================================
-- Migração: Permissões e Políticas RLS para Reconciliações de Imagens Órfãs
-- ID: 20260817020000_storage_orphan_reconciliation_rls
-- =========================================================================

-- 1. Conceder SELECT para o papel authenticated
GRANT SELECT ON public.produto_imagem_orfao_reconciliacoes TO authenticated;
GRANT SELECT ON public.produto_imagem_orfao_eventos TO authenticated;
GRANT SELECT ON public.produto_imagem_orfao_relatorios TO authenticated;

-- 2. Garantir que RLS está habilitado
ALTER TABLE public.produto_imagem_orfao_reconciliacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_imagem_orfao_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_imagem_orfao_relatorios ENABLE ROW LEVEL SECURITY;

-- 3. Criar Políticas RLS de Leitura para Administradores e Supervisores
DROP POLICY IF EXISTS "Admins e supervisores podem visualizar reconciliacoes de imagens" ON public.produto_imagem_orfao_reconciliacoes;
CREATE POLICY "Admins e supervisores podem visualizar reconciliacoes de imagens"
    ON public.produto_imagem_orfao_reconciliacoes
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis 
            WHERE id = auth.uid() AND funcao IN ('admin', 'supervisor') AND ativo = true
        )
    );

DROP POLICY IF EXISTS "Admins e supervisores podem visualizar eventos de reconciliacoes" ON public.produto_imagem_orfao_eventos;
CREATE POLICY "Admins e supervisores podem visualizar eventos de reconciliacoes"
    ON public.produto_imagem_orfao_eventos
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis 
            WHERE id = auth.uid() AND funcao IN ('admin', 'supervisor') AND ativo = true
        )
    );

DROP POLICY IF EXISTS "Admins e supervisores podem visualizar relatorios de reconciliacoes" ON public.produto_imagem_orfao_relatorios;
CREATE POLICY "Admins e supervisores podem visualizar relatorios de reconciliacoes"
    ON public.produto_imagem_orfao_relatorios
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.perfis 
            WHERE id = auth.uid() AND funcao IN ('admin', 'supervisor') AND ativo = true
        )
    );
