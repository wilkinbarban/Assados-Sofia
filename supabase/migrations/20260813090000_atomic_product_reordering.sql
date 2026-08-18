create or replace function public.reordenar_produtos_atomico(p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_total integer;
  v_updated integer;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    raise exception using errcode = '22023', message = 'DADOS_INVALIDOS';
  end if;

  select count(*) into v_total from public.produtos;

  if jsonb_array_length(p_itens) <> v_total
    or (select count(distinct item.id) from jsonb_to_recordset(p_itens) as item(id uuid, ordem_exibicao integer)) <> v_total
    or (select count(distinct item.ordem_exibicao) from jsonb_to_recordset(p_itens) as item(id uuid, ordem_exibicao integer)) <> v_total
    or (select min(item.ordem_exibicao) from jsonb_to_recordset(p_itens) as item(id uuid, ordem_exibicao integer)) <> 1
    or (select max(item.ordem_exibicao) from jsonb_to_recordset(p_itens) as item(id uuid, ordem_exibicao integer)) <> v_total
  then
    raise exception using errcode = '22023', message = 'ORDEM_GLOBAL_INCOMPLETA';
  end if;

  update public.produtos as produto
  set ordem_exibicao = item.ordem_exibicao
  from jsonb_to_recordset(p_itens) as item(id uuid, ordem_exibicao integer)
  where produto.id = item.id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_total then
    raise exception using errcode = '22023', message = 'ORDEM_GLOBAL_INCOMPLETA';
  end if;
end;
$$;

revoke all on function public.reordenar_produtos_atomico(jsonb) from public, anon, authenticated;
grant execute on function public.reordenar_produtos_atomico(jsonb) to service_role;
