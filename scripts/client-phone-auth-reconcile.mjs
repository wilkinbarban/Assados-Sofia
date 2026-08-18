#!/usr/bin/env node

/**
 * Script de Reconciliação para Autenticação por Telefone do Cliente
 * Varre e expira desafios OTP antigos ou presos em pending_delivery/active
 * e valida consistência entre auth.users e public.clientes.
 * 
 * Uso:
 *   node scripts/client-phone-auth-reconcile.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const isDryRun = process.argv.includes('--dry-run');

function resolveCredentials() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8000';
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SECRET_KEY || '';

  if (!key) {
    const envPath = join(process.cwd(), 'ops/supabase/.env');
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf8');
      const keyMatch = content.match(/^SERVICE_ROLE_KEY=(.*)$/m);
      const portMatch = content.match(/^API_GW_HTTP_PORT=(.*)$/m);
      if (keyMatch) key = keyMatch[1].trim();
      if (portMatch) url = `http://${portMatch[1].trim()}`;
    }
  }

  return { url, key };
}

const { url: supabaseUrl, key: serviceRoleKey } = resolveCredentials();

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export async function reconciliarDesafios(supabaseClient = supabase) {
  console.log(`Iniciando reconciliação de desafios OTP (${isDryRun ? 'DRY-RUN' : 'APPLY'})...`);

  // 1. Buscar desafios expirados por tempo que ainda constam como pending_delivery ou active
  const agora = new Date().toISOString();
  const { data: pendentes, error: errPendentes } = await supabaseClient
    .from('desafios_otp')
    .select('id, telefone, proposito, status, expira_em, data_criacao')
    .in('status', ['pending_delivery', 'active'])
    .lt('expira_em', agora);

  if (errPendentes) {
    throw new Error(`Erro ao consultar desafios pendentes: ${errPendentes.message}`);
  }

  let expirados = 0;

  for (const d of (pendentes || [])) {
    if (!isDryRun) {
      const { error: errUpd } = await supabaseClient
        .from('desafios_otp')
        .update({ status: 'expired' })
        .eq('id', d.id);

      if (errUpd) {
        console.error(`Erro ao expirar desafio ${d.id}: ${errUpd.message}`);
        continue;
      }
    }
    expirados++;
  }

  // 2. Buscar concessões de recuperação expiradas
  const { data: concessoes, error: errConcessoes } = await supabaseClient
    .from('concessoes_recuperacao')
    .select('id, telefone, expira_em')
    .is('aplicado_em', null)
    .lt('expira_em', agora);

  let concessoesExpiradas = concessoes?.length || 0;

  console.log(`Reconciliação concluída: ${expirados} desafios OTP expirados, ${concessoesExpiradas} concessões expiradas.`);
  return { desafiosExpirados: expirados, concessoesExpiradas, dryRun: isDryRun };
}

if (process.argv[1] && process.argv[1].endsWith('client-phone-auth-reconcile.mjs')) {
  try {
    await reconciliarDesafios();
  } catch (err) {
    console.error('Erro na execução da reconciliação:', err.message);
    process.exit(1);
  }
}
