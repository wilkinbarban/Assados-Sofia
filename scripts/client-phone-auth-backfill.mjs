#!/usr/bin/env node

/**
 * Script de Backfill para Autenticação por Telefone do Cliente
 * Rellena `telefone_verificado_em` e `telefone_verificado_origem` apenas
 * para registros legados que possuam evidência confiável (histórico de OTP verificado ou Telegram).
 * 
 * Uso:
 *   node scripts/client-phone-auth-backfill.mjs [--dry-run]
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

const CURITIBA_PHONE_REGEX = /^55419[0-9]{8}$/;

export async function executarBackfill(supabaseClient = supabase) {
  console.log(`Iniciando backfill de verificação explícita (${isDryRun ? 'DRY-RUN' : 'APPLY'})...`);

  // 1. Obter clientes sem telefone_verificado_em mas com telefone válido
  const { data: clientes, error: clienteErr } = await supabaseClient
    .from('clientes')
    .select('id, telefone, usuario_id, telegram_chat_id, telefone_verificado_em')
    .is('telefone_verificado_em', null)
    .not('telefone', 'is', null);

  if (clienteErr) {
    throw new Error(`Erro ao buscar clientes: ${clienteErr.message}`);
  }

  let atualizados = 0;
  let ignorados = 0;

  for (const c of (clientes || [])) {
    if (!CURITIBA_PHONE_REGEX.test(c.telefone)) {
      ignorados++;
      continue;
    }

    // Verificar se possui evidência confiável no histórico de OTP legada
    const { data: otps } = await supabaseClient
      .from('codigos_verificacao')
      .select('id, data_criacao')
      .eq('telefone', c.telefone)
      .eq('verificado', true)
      .order('data_criacao', { ascending: false })
      .limit(1);

    const temOtpVerificado = otps && otps.length > 0;
    const temTelegram = Boolean(c.telegram_chat_id);

    if (temOtpVerificado || temTelegram) {
      const origem = temTelegram ? 'telegram_backfill' : 'whatsapp_otp_backfill';
      const verificadoEm = temOtpVerificado && otps[0].data_criacao ? otps[0].data_criacao : new Date().toISOString();

      if (!isDryRun) {
        const { error: updErr } = await supabaseClient
          .from('clientes')
          .update({
            telefone_verificado_em: verificadoEm,
            telefone_verificado_origem: origem
          })
          .eq('id', c.id);

        if (updErr) {
          console.error(`Erro ao atualizar cliente ${c.id}: ${updErr.message}`);
          continue;
        }
      }
      atualizados++;
    } else {
      ignorados++;
    }
  }

  console.log(`Backfill concluído: ${atualizados} clientes atualizados, ${ignorados} ignorados (sem evidência confiável).`);
  return { atualizados, ignorados, dryRun: isDryRun };
}

if (process.argv[1] && process.argv[1].endsWith('client-phone-auth-backfill.mjs')) {
  try {
    await executarBackfill();
  } catch (err) {
    console.error('Erro na execução do backfill:', err.message);
    process.exit(1);
  }
}
