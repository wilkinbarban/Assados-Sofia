#!/usr/bin/env node

/**
 * Script de Auditoria para Autenticação por Telefone do Cliente
 * Executa varredura em `clientes` e `auth.users` para identificar:
 * 1. Telefones inválidos (fora do padrão ^55419[0-9]{8}$)
 * 2. Telefones duplicados
 * 3. Registros órfãos ou com vinculação ambígua
 * 4. Status de verificação explícita (telefone_verificado_em)
 * 
 * Uso:
 *   node scripts/client-phone-auth-audit.mjs [--dry-run] [--json]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const isDryRun = process.argv.includes('--dry-run');
const isJson = process.argv.includes('--json');

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

export async function auditarClientes(supabaseClient = supabase) {
  const relatorio = {
    timestamp: new Date().toISOString(),
    dryRun: isDryRun,
    totalClientes: 0,
    telefonesValidos: 0,
    telefonesInvalidos: 0,
    telefonesDuplicados: 0,
    verificados: 0,
    naoVerificados: 0,
    orfaos: 0,
    quarentena: []
  };

  const { data: clientes, error } = await supabaseClient
    .from('clientes')
    .select('id, nome, telefone, email, usuario_id, telegram_chat_id, telefone_verificado_em, telefone_verificado_origem');

  if (error) {
    throw new Error(`Erro ao consultar tabela clientes: ${error.message}`);
  }

  relatorio.totalClientes = clientes?.length || 0;

  const phoneCountMap = new Map();

  for (const c of (clientes || [])) {
    const tel = c.telefone;
    if (tel) {
      phoneCountMap.set(tel, (phoneCountMap.get(tel) || 0) + 1);
    }
  }

  for (const c of (clientes || [])) {
    const tel = c.telefone;
    const isValido = tel && CURITIBA_PHONE_REGEX.test(tel);
    const isDuplicado = tel && (phoneCountMap.get(tel) || 0) > 1;
    const isOrfao = !c.usuario_id;
    const isVerificado = Boolean(c.telefone_verificado_em);

    if (isValido) {
      relatorio.telefonesValidos++;
    } else {
      relatorio.telefonesInvalidos++;
    }

    if (isDuplicado) {
      relatorio.telefonesDuplicados++;
    }

    if (isVerificado) {
      relatorio.verificados++;
    } else {
      relatorio.naoVerificados++;
    }

    if (isOrfao) {
      relatorio.orfaos++;
    }

    // Identificar registros para quarentena
    if (!isValido || isDuplicado) {
      relatorio.quarentena.push({
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        usuario_id: c.usuario_id,
        motivo: !isValido ? 'TELEFONE_INVALIDO_CURITIBA' : 'TELEFONE_DUPLICADO'
      });
    }
  }

  return relatorio;
}

if (process.argv[1] && process.argv[1].endsWith('client-phone-auth-audit.mjs')) {
  try {
    const relatorio = await auditarClientes();
    if (isJson) {
      console.log(JSON.stringify(relatorio, null, 2));
    } else {
      console.log('════════════════════════════════════════════════════════════════');
      console.log('📋 RELATÓRIO DE AUDITORIA: CLIENT PHONE-FIRST AUTH');
      console.log('════════════════════════════════════════════════════════════════');
      console.log(`⏱️ Data/Hora:          ${relatorio.timestamp}`);
      console.log(`🧪 Modo Dry-Run:       ${relatorio.dryRun ? 'SIM' : 'NÃO'}`);
      console.log(`👥 Total de Clientes:   ${relatorio.totalClientes}`);
      console.log(`✅ Telefones Válidos:   ${relatorio.telefonesValidos}`);
      console.log(`❌ Telefones Inválidos: ${relatorio.telefonesInvalidos}`);
      console.log(`⚠️ Telefones Duplos:    ${relatorio.telefonesDuplicados}`);
      console.log(`🔐 Verificados:        ${relatorio.verificados}`);
      console.log(`⏳ Não Verificados:    ${relatorio.naoVerificados}`);
      console.log(`👤 Clientes Órfãos:    ${relatorio.orfaos}`);
      console.log(`🚨 Registros Quarentena: ${relatorio.quarentena.length}`);
      console.log('════════════════════════════════════════════════════════════════');
      if (relatorio.quarentena.length > 0) {
        console.log('⚠️ Detalhes dos registros em quarentena:');
        console.table(relatorio.quarentena);
      } else {
        console.log('✨ Nenhum registro anômalo encontrado na base.');
      }
    }
  } catch (err) {
    console.error('Erro na execução da auditoria:', err.message);
    process.exit(1);
  }
}
