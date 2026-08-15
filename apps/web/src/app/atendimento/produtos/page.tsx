import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProductCRUD from '@/components/operator/ProductCRUD'

export const dynamic = 'force-dynamic'

export default async function ProdutosPage() {
  const supabase = await createClient()

  // 1. Verificar sessão do usuário ativo
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login')
  }

  // 2. Buscar perfil e validar se está ativo e se possui papel de admin/supervisor
  const { data: perfil, error: perfilError } = await supabase
    .from('perfis')
    .select('funcao, ativo')
    .eq('id', user.id)
    .single()

  if (perfilError || !perfil || !perfil.ativo) {
    redirect('/login')
  }

  const funcoesAutorizadas = ['admin', 'supervisor']
  if (!funcoesAutorizadas.includes(perfil.funcao)) {
    redirect('/atendimento')
  }

  // 3. Carregar produtos cadastrados, ordenados pela ordem manual administrativa
  const { data: produtos, error: produtosError } = await supabase
    .from('produtos')
    .select('id, nome, descricao, preco_centavos, ativo, url_imagem, ordem_exibicao, data_criacao, data_atualizacao')
    .order('ordem_exibicao', { ascending: true, nullsFirst: false })
    .order('nome', { ascending: true })

  if (produtosError) {
    console.error('Erro ao buscar produtos do catálogo:', produtosError)
  }

  // Sanitização dos dados
  const produtosIniciais = (produtos || []).map((produto: any) => ({
    id: produto.id,
    nome: produto.nome || '',
    descricao: produto.descricao || '',
    preco_centavos: produto.preco_centavos || 0,
    ativo: !!produto.ativo,
    url_imagem: produto.url_imagem || '',
    ordem_exibicao: produto.ordem_exibicao ?? null,
    data_criacao: produto.data_criacao,
    data_atualizacao: produto.data_atualizacao
  }))

  return (
    <ProductCRUD produtosIniciais={produtosIniciais} perfilFuncao={perfil.funcao} />
  )
}
