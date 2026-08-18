-- Allow session-authorized product metadata edits without exposing stock writes.
alter table public.produtos enable row level security;

revoke update on table public.produtos from public, anon, authenticated;
grant update (
  nome,
  descricao,
  preco_centavos,
  estoque_minimo,
  controlar_estoque,
  ativo,
  url_imagem,
  data_atualizacao
) on table public.produtos to authenticated;

drop policy if exists "Atualização de metadados de produtos por admin ou supervisor" on public.produtos;
create policy "Atualização de metadados de produtos por admin ou supervisor"
on public.produtos
for update
to authenticated
using (public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]))
with check (public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]));
