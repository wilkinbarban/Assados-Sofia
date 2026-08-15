create table if not exists public.produto_imagem_orfao_relatorios (
  id uuid primary key default gen_random_uuid(),
  object_path text not null check (object_path ~ '^produtos/.+'),
  reason text not null check (reason in ('INVALID_STORAGE_METADATA', 'INVALID_TIMESTAMP')),
  reported_by uuid not null references auth.users(id),
  first_reported_at timestamptz not null,
  last_reported_at timestamptz not null,
  occurrences integer not null default 1 check (occurrences > 0),
  unique (object_path, reason)
);

alter table public.produto_imagem_orfao_relatorios enable row level security;
revoke all on table public.produto_imagem_orfao_relatorios from public, anon, authenticated;

create or replace function public.registrar_relatorio_varredura_imagem_orfa(
  p_object_path text,
  p_reason text,
  p_scan_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_actor_id is null or not public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]) then
    raise exception using errcode = '42501', message = 'USUARIO_NAO_AUTORIZADO';
  end if;

  if p_object_path !~ '^produtos/.+' or p_reason not in ('INVALID_STORAGE_METADATA', 'INVALID_TIMESTAMP') then
    raise exception using errcode = '22023', message = 'RELATORIO_VARREDURA_INVALIDO';
  end if;

  insert into public.produto_imagem_orfao_relatorios (
    object_path, reason, reported_by, first_reported_at, last_reported_at
  ) values (
    p_object_path, p_reason, v_actor_id, p_scan_at, p_scan_at
  )
  on conflict (object_path, reason) do update
  set reported_by = excluded.reported_by,
      last_reported_at = excluded.last_reported_at,
      occurrences = public.produto_imagem_orfao_relatorios.occurrences + 1
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.registrar_relatorio_varredura_imagem_orfa(text, text, timestamptz) from public, anon, service_role;
grant execute on function public.registrar_relatorio_varredura_imagem_orfa(text, text, timestamptz) to authenticated;
