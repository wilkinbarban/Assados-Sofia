import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260712164546_admin_products_authenticated_inventory_rpc.sql'
)
const runtimeHarnessPath = join(process.cwd(), 'supabase/tests/admin_products_inventory_hardening.sql')
const contractionPath = join(
  process.cwd(),
  'supabase/contractions/20260712_admin_products_inventory_rpc_bridge.sql'
)

function migrationSql() {
  return readFileSync(migrationPath, 'utf8')
}

function runtimeHarnessSql() {
  return readFileSync(runtimeHarnessPath, 'utf8')
}

function contractionSql() {
  return readFileSync(contractionPath, 'utf8')
}

describe('admin products authenticated inventory RPC migration', () => {
  it('replaces the RPC with exactly four business arguments and session-derived actor identity', () => {
    const sql = migrationSql()
    const legacyBridge = sql.indexOf('p_usuario_id')
    const officialRpc = sql.slice(0, legacyBridge)

    expect(officialRpc).toContain('create function public.ajustar_estoque_atomico(')
    expect(officialRpc).toContain('p_produto_id uuid,')
    expect(officialRpc).toContain('p_quantidade integer,')
    expect(officialRpc).toContain('p_tipo public.tipo_movimentacao,')
    expect(officialRpc).toContain('p_motivo text default null')
    expect(officialRpc).not.toContain('p_usuario_id')
    expect(officialRpc).toContain('v_usuario_id := auth.uid()')
    expect(officialRpc).toContain("message = 'USUARIO_NAO_AUTENTICADO'")
  })

  it('permits only active admins or supervisors before locking and writing inventory', () => {
    const sql = migrationSql()

    expect(sql).toContain("public.tem_funcoes(array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao])")
    expect(sql).toContain("message = 'USUARIO_NAO_AUTORIZADO'")
    expect(sql).toContain('security definer')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('for update')
    expect(sql).toContain('update public.produtos')
    expect(sql).toContain('insert into public.movimentacoes_estoque')
    expect(sql).toContain('v_usuario_id')
    expect(sql).toContain('returning id into v_movimentacao_id')
  })

  it('guards insufficient stock before writing product or movement rows', () => {
    const sql = migrationSql()
    const insufficientStockGuard = sql.indexOf("if v_qtd_nova < 0 then")
    const productUpdate = sql.indexOf('update public.produtos')
    const movementInsert = sql.indexOf('insert into public.movimentacoes_estoque')

    expect(insufficientStockGuard).toBeGreaterThan(-1)
    expect(productUpdate).toBeGreaterThan(insufficientStockGuard)
    expect(movementInsert).toBeGreaterThan(productUpdate)
    expect(sql).toContain("message = 'ESTOQUE_INSUFICIENTE'")
  })

  it('keeps the deprecated five-argument RPC as a service-role-only rollback bridge', () => {
    const sql = migrationSql()

    const legacySignature = 'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)'
    const replacementSignature = 'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text)'

    expect(sql).toMatch(new RegExp(`revoke all on function ${legacySignature.replace(/[()]/g, '\\$&')}\\s+from public, anon, authenticated, service_role`))
    expect(sql).toMatch(new RegExp(`grant execute on function ${legacySignature.replace(/[()]/g, '\\$&')}\\s+to service_role`))
    expect(sql).toContain("'Temporary service_role-only rollback bridge")
    expect(sql).toContain('set_config(\'request.jwt.claim.sub\', p_usuario_id::text, true)')
    expect(sql).toContain('select * from public.ajustar_estoque_atomico(')
    expect(sql).toContain('Remove this bridge in the mandatory post-rollout contraction')
    expect(sql).toMatch(new RegExp(`revoke all on function ${replacementSignature.replace(/[()]/g, '\\$&')}\\s+from public, anon, service_role`))
    expect(sql).toMatch(new RegExp(`grant execute on function ${replacementSignature.replace(/[()]/g, '\\$&')}\\s+to authenticated`))
    expect(sql).not.toContain(`grant execute on function ${replacementSignature} to authenticated, service_role`)
  })

  it('verifies the five-argument bridge as service_role-only while retaining the session-bound official path', () => {
    const sql = runtimeHarnessSql()
    const bridgeCall = sql.indexOf("'rollback bridge verification'")
    const authenticatedProbe = sql.indexOf('set local role authenticated')

    expect(bridgeCall).toBeGreaterThan(-1)
    expect(sql.lastIndexOf('set local role service_role', bridgeCall)).toBeGreaterThan(-1)
    expect(authenticatedProbe).toBeGreaterThan(bridgeCall)
    expect(sql).toContain('acl.grantee = 0')
    expect(sql).toContain("'PUBLIC must not be able to execute the legacy rollback bridge'")
    expect(sql).toContain("'authenticated',\n    'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)'")
    expect(sql).toContain("'service_role',\n    'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)'")
    expect(sql).toContain("'service_role bridge verification requires no caller JWT'")
  })

  it('ships a deferred contraction that removes only the legacy bridge after caller rollout verification', () => {
    const sql = contractionSql()
    const legacySignature = 'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)'
    const officialSignature = 'public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text)'

    expect(contractionPath).toContain('supabase/contractions/')
    expect(sql).toContain(`revoke all on function ${legacySignature}`)
    expect(sql).toContain(`drop function public.ajustar_estoque_atomico(uuid, integer, public.tipo_movimentacao, text, uuid)`)
    expect(sql).not.toContain(`drop function ${officialSignature}`)
    expect(sql).toContain('promotion procedure')
    expect(sql).toContain('four-argument caller rollout is verified')
  })

  it('keeps product and movement tables read-only to API callers so inventory writes use the RPC', () => {
    const sql = migrationSql()

    expect(sql).toContain('revoke all on table public.produtos from public, anon, authenticated')
    expect(sql).toContain('revoke all on table public.movimentacoes_estoque from public, anon, authenticated')
    expect(sql).toContain('grant select on table public.produtos to anon, authenticated')
    expect(sql).toContain('grant select on table public.movimentacoes_estoque to authenticated')
    expect(sql).toContain('drop policy if exists "Escrita de movimentações por operadores" on public.movimentacoes_estoque')
    expect(sql).toContain('drop policy if exists "Escrita de produtos por admin ou supervisor" on public.produtos')
  })

  it('uses the same authorized inspector identity before and after direct-DML probes', () => {
    const sql = runtimeHarnessSql()
    const directDmlSection = sql.slice(
      sql.indexOf('-- Direct table DML must not forge movements'),
      sql.indexOf('-- Storage is public-readable')
    )
    const inspector = "perform set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);"

    expect(directDmlSection).toContain(inspector)
    expect(directDmlSection.indexOf(inspector)).toBeLessThan(
      directDmlSection.indexOf('select count(*) into v_movements_before')
    )
    expect(directDmlSection.lastIndexOf(inspector)).toBeGreaterThan(
      directDmlSection.indexOf('end loop;')
    )
    expect(directDmlSection.lastIndexOf(inspector)).toBeLessThan(
      directDmlSection.indexOf('select count(*) into v_movements_after')
    )
  })

  it('restricts produto-imagens mutations to active admins and supervisors while retaining public reads', () => {
    const sql = migrationSql()

    expect(sql).toContain('drop policy if exists "Upload de imagens por operadores" on storage.objects')
    expect(sql).toContain('drop policy if exists "Exclusão de imagens por operadores" on storage.objects')
    expect(sql).toContain('create policy "Upload de imagens de produtos por admin ou supervisor"')
    expect(sql).toContain('create policy "Atualização de imagens de produtos por admin ou supervisor"')
    expect(sql).toContain('create policy "Exclusão de imagens de produtos por admin ou supervisor"')
    expect(sql).toContain("bucket_id = 'produto-imagens'")
    expect(sql).toContain("array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao]")
    expect(sql).not.toContain("array['admin'::public.tipo_funcao, 'supervisor'::public.tipo_funcao, 'vendedor'::public.tipo_funcao]")
    expect(sql).not.toContain('drop policy if exists "Leitura pública de imagens de produtos" on storage.objects')
  })
})
