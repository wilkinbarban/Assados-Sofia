drop policy if exists "Operadores e admins podem ver todos os comprovantes" on public.comprovantes;
create policy "Operadores e admins ativos podem ver todos os comprovantes"
on public.comprovantes for select to authenticated
using (
  exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.ativo
      and p.funcao in ('admin', 'supervisor', 'vendedor')
  )
);
