import { readFileSync } from 'node:fs'; import { join } from 'node:path'; import { describe,expect,it } from 'vitest'
const root=process.cwd(); const sql=readFileSync(join(root,'supabase/migrations/20260826130000_payment_proof_dedupe_quarantine_outbox.sql'),'utf8')
describe('payment proof dedupe quarantine outbox',()=>{
 it('owns global hashes, tombstones and transactional outbox',()=>{expect(sql).toContain('create table public.payment_proof_hash_tombstones');expect(sql).toContain('sha256 text primary key');expect(sql).toContain('create table public.payment_proof_outbox');expect(sql).toContain('unique (proof_id, event_type)');expect(sql).toContain('public.register_payment_proof_hash')})
 it('uses server quarantine clock and admin-only restore',()=>{expect(sql).toContain("now() + interval '10 days'");expect(sql).toContain('public.quarantine_payment_proof');expect(sql).toContain('public.restore_payment_proof');expect(sql).toContain("p.funcao='admin'");expect(sql).toContain("'payment_proof_restored'")})
})
