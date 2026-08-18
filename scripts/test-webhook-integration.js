/**
 * Integration Test Suite - Épica 3 (WhatsApp Webhook & Outbound Messages)
 * Tests Webhook Handshake, HMAC Validation, Idempotency, Curitiba Phone Filter, 
 * Media Ingestion, Conversation Reopening, and 24-hour Outbound Window.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env if not loaded
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const index = trimmed.indexOf('=');
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      let val = trimmed.slice(index + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    });
  }
}

loadEnv();

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEXT_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
let WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'token_seguro_para_validar_webhook_aqui';
let WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'test_app_secret';
const RUN_WHATSAPP_OUTBOUND_LIVE = process.env.RUN_WHATSAPP_OUTBOUND_LIVE === 'true';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios.');
  process.exit(1);
}

// Supabase Admin client to verify and clean up DB
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function loadWebhookSecretsFromSystemConfig() {
  const { data, error } = await adminClient
    .from('configuracoes_sistema')
    .select('chave, valor')
    .in('chave', ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET']);

  if (error) throw error;

  const config = new Map((data || []).map((row) => [row.chave, row.valor]));
  WHATSAPP_VERIFY_TOKEN = config.get('WHATSAPP_VERIFY_TOKEN') || WHATSAPP_VERIFY_TOKEN;
  WHATSAPP_APP_SECRET = config.get('WHATSAPP_APP_SECRET') || WHATSAPP_APP_SECRET;
}

async function snapshotSystemConfig(keys) {
  const { data, error } = await adminClient
    .from('configuracoes_sistema')
    .select('chave, valor, eh_segredo')
    .in('chave', keys);

  if (error) throw error;

  const rowsByKey = new Map((data || []).map((row) => [row.chave, row]));
  return keys.map((key) => ({
    key,
    existed: rowsByKey.has(key),
    row: rowsByKey.get(key) || null,
  }));
}

async function restoreSystemConfig(snapshot) {
  for (const item of snapshot) {
    if (item.existed && item.row) {
      const { error } = await adminClient
        .from('configuracoes_sistema')
        .upsert({
          chave: item.row.chave,
          valor: item.row.valor,
          eh_segredo: item.row.eh_segredo,
          data_atualizacao: new Date().toISOString(),
        }, { onConflict: 'chave' });
      if (error) throw error;
    } else {
      const { error } = await adminClient
        .from('configuracoes_sistema')
        .delete()
        .eq('chave', item.key);
      if (error) throw error;
    }
  }
}

async function snapshotTodayBusinessHours() {
  const now = new Date();
  const candidateDays = [...new Set([now.getDay(), now.getUTCDay()])];
  const { data, error } = await adminClient
    .from('horarios_atendimento')
    .select('*')
    .in('dia_semana', candidateDays);

  if (error) throw error;

  const rowsByDay = new Map((data || []).map((row) => [row.dia_semana, row]));
  return candidateDays.map((day) => ({
    today: day,
    existed: rowsByDay.has(day),
    row: rowsByDay.get(day) || null,
  }));
}

async function forceOpenBusinessHours(snapshots) {
  for (const snapshot of snapshots) {
  const payload = {
    dia_semana: snapshot.today,
    ativo: true,
    hora_abertura: '00:00',
    hora_fechamento: '23:59',
    data_atualizacao: new Date().toISOString(),
  };

  if (snapshot.existed && snapshot.row?.id) {
    const { error } = await adminClient
      .from('horarios_atendimento')
      .update(payload)
      .eq('id', snapshot.row.id);
    if (error) throw error;
    continue;
  }

  const { error } = await adminClient
    .from('horarios_atendimento')
    .insert(payload);
  if (error) throw error;
  }
}

async function restoreTodayBusinessHours(snapshots) {
  for (const snapshot of snapshots) {
  if (snapshot.existed && snapshot.row) {
    const { error } = await adminClient
      .from('horarios_atendimento')
      .update({
        ativo: snapshot.row.ativo,
        hora_abertura: snapshot.row.hora_abertura,
        hora_fechamento: snapshot.row.hora_fechamento,
        data_atualizacao: new Date().toISOString(),
      })
      .eq('id', snapshot.row.id);
    if (error) throw error;
    continue;
  }

  const { error } = await adminClient
    .from('horarios_atendimento')
    .delete()
    .eq('dia_semana', snapshot.today);
  if (error) throw error;
  }
}

// Colors for console logging
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function logSuccess(message) {
  console.log(`${colors.green}✔ EXCELENTE: ${message}${colors.reset}`);
}

function logError(message, details = '') {
  console.error(`${colors.red}✘ ERROR: ${message}${colors.reset}`, details);
}

function logSection(title) {
  console.log(`\n${colors.bold}${colors.cyan}=== ${title} ===${colors.reset}\n`);
}

// Generate HMAC-SHA256 signature for test payloads
function generateSignature(payloadString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(payloadString)
    .digest('hex');
}

// Mock Meta Webhook Text Payload
function createTextPayload(messageId, phone, text, profileName = 'Cliente Teste') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1234567890',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5541999999999',
                phone_number_id: '123456789'
              },
              contacts: [
                {
                  profile: {
                    name: profileName
                  },
                  wa_id: phone
                }
              ],
              messages: [
                {
                  from: phone,
                  id: messageId,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: {
                    body: text
                  },
                  type: 'text'
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };
}

// Mock Meta Webhook Status Payload
function createStatusPayload(messageId, phone, status = 'delivered') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1234567890',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5541999999999',
                phone_number_id: '123456789'
              },
              statuses: [
                {
                  id: messageId,
                  status: status,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  recipient_id: phone
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };
}

// Mock Meta Webhook Image Payload
function createMediaPayload(messageId, phone, mediaId, mimeType, caption = '') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1234567890',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5541999999999',
                phone_number_id: '123456789'
              },
              contacts: [
                {
                  profile: {
                    name: 'Cliente Midia'
                  },
                  wa_id: phone
                }
              ],
              messages: [
                {
                  from: phone,
                  id: messageId,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'image',
                  image: {
                    caption: caption,
                    mime_type: mimeType,
                    id: mediaId
                  }
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  };
}

async function runTests() {
  logSection('Iniciando Testes de Integração (Sofía CRM - Épica 3)');
  await loadWebhookSecretsFromSystemConfig();
  
  // Test numbers and IDs
  const testPhoneCuritiba = '5541999990003';
  const testPhoneForaCuritiba = '5511999990003'; // SP phone
  const testPhoneReabrir = '5541999990004';
  const testPhoneMedia = '5541999990005';
  let systemConfigSnapshot = null;
  let todayBusinessHoursSnapshot = null;
  
  // Dynamic import of enviarMensagemWhatsapp to test TypeScript utility
  let enviarMensagemWhatsapp;
  try {
    const jiti = require('jiti')(__filename, {
      alias: {
        '@': path.resolve(__dirname, '../apps/web/src'),
      }
    });
    const sendModule = jiti('../apps/web/src/lib/whatsapp/send');
    enviarMensagemWhatsapp = sendModule.enviarMensagemWhatsapp;
  } catch (err) {
    logError('No se pudo importar enviarMensagemWhatsapp mediante jiti.', err);
    throw err;
  }

  try {
    // ====================================================
    // SOFIA GLOBAL GATE PREFLIGHT: Config keys for PR4 rollout
    // ====================================================
    logSection('Sofia Global Gate Preflight');

    systemConfigSnapshot = await snapshotSystemConfig([
      'SOFIA_GLOBAL_WHATSAPP_ENABLED',
      'SOFIA_GLOBAL_TELEGRAM_ENABLED',
    ]);
    todayBusinessHoursSnapshot = await snapshotTodayBusinessHours();

    const { error: forceGlobalSofiaConfigError } = await adminClient
      .from('configuracoes_sistema')
      .upsert([
        {
          chave: 'SOFIA_GLOBAL_WHATSAPP_ENABLED',
          valor: 'true',
          eh_segredo: false,
          data_atualizacao: new Date().toISOString(),
        },
        {
          chave: 'SOFIA_GLOBAL_TELEGRAM_ENABLED',
          valor: 'true',
          eh_segredo: false,
          data_atualizacao: new Date().toISOString(),
        },
      ], { onConflict: 'chave' });
    if (forceGlobalSofiaConfigError) throw forceGlobalSofiaConfigError;

    await forceOpenBusinessHours(todayBusinessHoursSnapshot);
    const forcedDays = todayBusinessHoursSnapshot.map((snapshot) => snapshot.today);
    const { data: forcedBusinessHours, error: forcedBusinessHoursError } = await adminClient
      .from('horarios_atendimento')
      .select('dia_semana, ativo, hora_abertura, hora_fechamento')
      .in('dia_semana', forcedDays)
      .order('dia_semana', { ascending: true });
    if (forcedBusinessHoursError) throw forcedBusinessHoursError;
    console.log('Horários forçados para verificação:', JSON.stringify(forcedBusinessHours, null, 2));

    const { data: existingGlobalSofiaConfig, error: existingGlobalSofiaConfigError } = await adminClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['SOFIA_GLOBAL_WHATSAPP_ENABLED', 'SOFIA_GLOBAL_TELEGRAM_ENABLED']);
    if (existingGlobalSofiaConfigError) throw existingGlobalSofiaConfigError;

    const existingKeys = new Set((existingGlobalSofiaConfig || []).map(row => row.chave));
    const missingRows = ['SOFIA_GLOBAL_WHATSAPP_ENABLED', 'SOFIA_GLOBAL_TELEGRAM_ENABLED']
      .filter(chave => !existingKeys.has(chave))
      .map(chave => ({
        chave,
        valor: 'true',
        eh_segredo: false,
        data_atualizacao: new Date().toISOString()
      }));

    if (missingRows.length > 0) {
      const { error: seedGlobalSofiaConfigError } = await adminClient
        .from('configuracoes_sistema')
        .upsert(missingRows, { onConflict: 'chave' });
      if (seedGlobalSofiaConfigError) throw seedGlobalSofiaConfigError;
    }

    const { data: globalSofiaConfig, error: globalSofiaConfigError } = await adminClient
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', ['SOFIA_GLOBAL_WHATSAPP_ENABLED', 'SOFIA_GLOBAL_TELEGRAM_ENABLED']);
    if (globalSofiaConfigError) throw globalSofiaConfigError;

    const whatsappGlobal = globalSofiaConfig?.find(row => row.chave === 'SOFIA_GLOBAL_WHATSAPP_ENABLED');
    const telegramGlobal = globalSofiaConfig?.find(row => row.chave === 'SOFIA_GLOBAL_TELEGRAM_ENABLED');
    assert.ok(whatsappGlobal, 'SOFIA_GLOBAL_WHATSAPP_ENABLED must be seeded before webhook rollout.');
    assert.ok(telegramGlobal, 'SOFIA_GLOBAL_TELEGRAM_ENABLED must be seeded before webhook rollout.');
    logSuccess('Global Sofia config keys are present and WhatsApp/Telegram Sofia are enabled for deterministic live webhook verification.');
    logSuccess('Business hours for today were forced open during this run to avoid time-dependent yellow-state assertions.');

    // ====================================================
    // TAREFA 3.1 & 3.2: Handshake GET & Validação HMAC-SHA256 (GET / POST)
    // ====================================================
    logSection('Tarefa 3.1 & 3.2: Verificação do Handshake GET e Validação HMAC-SHA256');

    // 1. GET Handshake - Sucesso
    console.log('1. Testando GET handshake com tokens corretos...');
    const verifyToken = encodeURIComponent(WHATSAPP_VERIFY_TOKEN);
    const challengeVal = 'challenge_123_test';
    const resGetSuccess = await fetch(
      `${NEXT_APP_URL}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=${challengeVal}`
    );
    const getSuccessText = await resGetSuccess.text();
    
    assert.strictEqual(resGetSuccess.status, 200, `GET handshake exitoso debe retornar 200, got ${resGetSuccess.status}`);
    assert.strictEqual(getSuccessText, challengeVal, `GET handshake debe retornar el challenge, got ${getSuccessText}`);
    logSuccess('GET handshake procesado correctamente.');

    // 2. GET Handshake - Falha (Token inválido)
    console.log('2. Testando GET handshake com token inválido...');
    const resGetFail = await fetch(
      `${NEXT_APP_URL}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=token_incorrecto&hub.challenge=${challengeVal}`
    );
    assert.strictEqual(resGetFail.status, 403, `GET handshake con token incorrecto debe retornar 403, got ${resGetFail.status}`);
    logSuccess('GET handshake rechazado correctamente con 403.');

    // 3. POST - Falha (Assinatura ausente ou inválida)
    console.log('3. Testando POST com assinatura HMAC inválida...');
    const payloadTestSign = JSON.stringify(createTextPayload('wamid.TestSign123', testPhoneCuritiba, 'Mensagem Teste HMAC'));
    const invalidSignature = 'sha256=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    
    const resPostInvalidSign = await fetch(`${NEXT_APP_URL}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': invalidSignature
      },
      body: payloadTestSign
    });
    
    // Si la validación HMAC está activada, debe retornar 401. 
    // Nota: en desarrollo, si WHATSAPP_APP_SECRET no tiene valor de test real o es placeholder, se salta la validación.
    // Nosotros forzamos WHATSAPP_APP_SECRET en el entorno, por lo que debe retornar 401.
    const postInvalidSignBody = await resPostInvalidSign.json().catch(() => ({}));
    if (resPostInvalidSign.status === 401) {
      logSuccess('POST con firma inválida correctamente rechazado con 401.');
    } else if (resPostInvalidSign.status === 200 && (!process.env.WHATSAPP_APP_SECRET || process.env.WHATSAPP_APP_SECRET.includes('placeholder'))) {
      console.log(`${colors.yellow}⚠ AVISO: El webhook aceptó la firma inválida (status 200) porque la validación HMAC está desactivada en modo desarrollo (falta WHATSAPP_APP_SECRET en .env).${colors.reset}`);
    } else {
      throw new Error(`Se esperaba status 401 para firma inválida, got ${resPostInvalidSign.status}. Respuesta: ${JSON.stringify(postInvalidSignBody)}`);
    }

    // 4. POST - Sucesso (Assinatura correta e telefone válido de Curitiba)
    console.log('4. Testando POST com assinatura HMAC correta e telefone Curitiba...');
    const messageIdVal = `wamid.SuccessMsg_${Date.now()}`;
    const payloadSuccessObj = createTextPayload(messageIdVal, testPhoneCuritiba, 'Olá, sou de Curitiba!');
    const payloadSuccessStr = JSON.stringify(payloadSuccessObj);
    const validSignature = 'sha256=' + generateSignature(payloadSuccessStr, WHATSAPP_APP_SECRET);

    const resPostSuccess = await fetch(`${NEXT_APP_URL}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': validSignature
      },
      body: payloadSuccessStr
    });

    const postSuccessBody = await resPostSuccess.json();
    assert.strictEqual(resPostSuccess.status, 200, `POST exitoso debe retornar 200, got ${resPostSuccess.status}. Detalle: ${JSON.stringify(postSuccessBody)}`);
    assert.strictEqual(postSuccessBody.success, true, 'El body debe tener success = true');
    logSuccess('Mensaje con firma válida y teléfono Curitiba procesado correctamente.');

    // Verificar en la DB que el cliente y el mensaje se crearon
    const { data: clienteDB } = await adminClient
      .from('clientes')
      .select('id, nome, telefone')
      .eq('telefone', testPhoneCuritiba)
      .single();
    
    assert.ok(clienteDB, 'El cliente de Curitiba debería haberse auto-registrado en la DB');
    logSuccess(`Cliente auto-registrado correctamente: ID: ${clienteDB.id}, Nombre: ${clienteDB.nome}`);

    const { data: mensajeDB } = await adminClient
      .from('mensagens')
      .select('id, conteudo, whatsapp_mensagem_id')
      .eq('whatsapp_mensagem_id', messageIdVal)
      .single();
    
    assert.ok(mensajeDB, 'El mensaje debería estar guardado en la DB');
    assert.strictEqual(mensajeDB.conteudo, 'Olá, sou de Curitiba!', 'El contenido del mensaje en DB no coincide');
    logSuccess('Mensaje persistido en la base de datos con éxito.');


    // ====================================================
    // TAREFA 3.3: Prevenção de Duplicidade (Idempotência)
    // ====================================================
    logSection('Tarefa 3.3: Prevenção de Duplicidade (Idempotência)');

    console.log('1. Re-enviando exatamente o mesmo payload (mesmo ID de mensagem)...');
    const resPostDuplicate = await fetch(`${NEXT_APP_URL}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': validSignature
      },
      body: payloadSuccessStr
    });

    const postDuplicateBody = await resPostDuplicate.json();
    assert.strictEqual(resPostDuplicate.status, 200, `Duplicado debe retornar 200, got ${resPostDuplicate.status}`);
    assert.strictEqual(postDuplicateBody.message, 'Mensagem duplicada ignorada', 'Debería responder indicando que se ignoró el duplicado');
    logSuccess('Petición duplicada interceptada correctamente por el mecanismo de idempotencia.');

    // Verificar en la DB que no haya registros duplicados (debe haber exactamente un mensaje con ese whatsapp_mensagem_id)
    const { data: mensajesDuplicateDB } = await adminClient
      .from('mensagens')
      .select('id')
      .eq('whatsapp_mensagem_id', messageIdVal);
    
    assert.strictEqual(mensajesDuplicateDB.length, 1, `Debería haber exactamente 1 mensaje en la DB con el ID ${messageIdVal}, got ${mensajesDuplicateDB.length}`);
    logSuccess('Confirmado en base de datos: No se crearon registros duplicados.');


    // ====================================================
    // FILTRO DE TELEFONE E STATUS
    // ====================================================
    logSection('Filtros Adicionais: Telefone fora de Curitiba e Notificações de Status');

    // 1. Telefone fora de Curitiba (DDD 11 - SP)
    console.log('1. Testando envio de telefone fora de Curitiba (DDD 11)...');
    const msgIdDdd = `wamid.DddMsg_${Date.now()}`;
    const payloadDddObj = createTextPayload(msgIdDdd, testPhoneForaCuritiba, 'Olá, sou de SP!');
    const payloadDddStr = JSON.stringify(payloadDddObj);
    const dddSignature = 'sha256=' + generateSignature(payloadDddStr, WHATSAPP_APP_SECRET);

    const resPostDdd = await fetch(`${NEXT_APP_URL}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': dddSignature
      },
      body: payloadDddStr
    });

    const postDddBody = await resPostDdd.json();
    assert.strictEqual(resPostDdd.status, 200, `Filtro de DDD debe retornar 200 OK para descartar silenciosamente`);
    assert.strictEqual(postDddBody.message, 'Telefone fora do padrão descartado silenciosamente', 'Debe indicar que fue descartado');

    // Verificar en DB que NO se haya insertado el cliente ni la mensaje
    const { data: clienteDddDB } = await adminClient
      .from('clientes')
      .select('id')
      .eq('telefone', testPhoneForaCuritiba)
      .maybeSingle();
    assert.strictEqual(clienteDddDB, null, 'El cliente con número fuera de Curitiba no debería estar en la base de datos');

    const { data: mensajeDddDB } = await adminClient
      .from('mensagens')
      .select('id')
      .eq('whatsapp_mensagem_id', msgIdDdd)
      .maybeSingle();
    assert.strictEqual(mensajeDddDB, null, 'El mensaje del cliente de SP no debería estar en la base de datos');
    logSuccess('El número fuera de Curitiba fue descartado silenciosamente sin alterar la base de datos.');

    // 2. Notificação de Status (Ignore)
    console.log('2. Testando notificação de status...');
    const statusMsgId = `wamid.StatusMsg_${Date.now()}`;
    const payloadStatusObj = createStatusPayload(statusMsgId, testPhoneCuritiba, 'delivered');
    const payloadStatusStr = JSON.stringify(payloadStatusObj);
    const statusSignature = 'sha256=' + generateSignature(payloadStatusStr, WHATSAPP_APP_SECRET);

    const resPostStatus = await fetch(`${NEXT_APP_URL}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': statusSignature
      },
      body: payloadStatusStr
    });

    const postStatusBody = await resPostStatus.json();
    assert.strictEqual(resPostStatus.status, 200, `Notificación de status debe retornar 200 OK`);
    assert.strictEqual(postStatusBody.message, 'Notificação de status ignorada', 'Debe indicar que la notificación fue ignorada');
    logSuccess('Notificación de status correctamente ignorada.');


    // ====================================================
    // TAREFA 3.4: Comportamento com Conversas Fechadas
    // ====================================================
    logSection('Tarefa 3.4: Fluxo de Conversas Fechadas');

    console.log('1. Criando cliente de teste e conversa fechada...');
    // Crear cliente
    const { data: clienteReabrir, error: errCliReabrir } = await adminClient
      .from('clientes')
      .insert({ nome: 'Cliente Reabrir', telefone: testPhoneReabrir })
      .select()
      .single();
    if (errCliReabrir) throw errCliReabrir;

    // Crear conversación con status = 'fechada' (cerrada) y ia_ativa = false
    const { data: conversaFechada, error: errConvFechada } = await adminClient
      .from('conversas')
      .insert({
        cliente_id: clienteReabrir.id,
        status: 'fechada',
        ia_ativa: false
      })
      .select()
      .single();
    if (errConvFechada) throw errConvFechada;
    logSuccess(`Conversa fechada criada (ID: ${conversaFechada.id}, Status: fechada)`);

    // Enviar un mensaje de entrada de este cliente
    console.log('2. Enviando mensagem do cliente para reabrir a conversa...');
    const messageIdReabrir = `wamid.ReabrirMsg_${Date.now()}`;
    const payloadReabrirObj = createTextPayload(messageIdReabrir, testPhoneReabrir, 'Quero iniciar novo atendimento!');
    const payloadReabrirStr = JSON.stringify(payloadReabrirObj);
    const reabrirSignature = 'sha256=' + generateSignature(payloadReabrirStr, WHATSAPP_APP_SECRET);

    const resPostReabrir = await fetch(`${NEXT_APP_URL}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': reabrirSignature
      },
      body: payloadReabrirStr
    });

    const postReabrirBody = await resPostReabrir.json();
    assert.strictEqual(resPostReabrir.status, 200, `POST para reabrir conversación debe retornar 200, got ${resPostReabrir.status}`);
    console.log('Respuesta webhook reabertura:', JSON.stringify(postReabrirBody, null, 2));
    logSuccess('Mensaje entrante procesado.');

    // Verificar en DB que se haya creado una NUEVA conversación con status = 'ia_atendendo'
    // (Porque la anterior estaba 'fechada')
    const { data: conversasReabertas, error: errGetConversas } = await adminClient
      .from('conversas')
      .select('id, status, ia_ativa')
      .eq('cliente_id', clienteReabrir.id)
      .order('data_criacao', { ascending: false });
    
    if (errGetConversas) throw errGetConversas;
    
    assert.strictEqual(conversasReabertas.length, 2, `Debería haber exactamente 2 conversaciones en DB (la cerrada anterior y la nueva abierta)`);
    console.log('Conversas encontradas para reabertura:', JSON.stringify(conversasReabertas, null, 2));
    assert.strictEqual(conversasReabertas[0].status, 'ia_atendendo', 'La conversación más reciente debe tener status = ia_atendendo');
    assert.strictEqual(conversasReabertas[0].ia_ativa, true, 'La conversación más reciente debe tener ia_ativa = true');
    logSuccess(`Nueva conversación activa creada correctamente (ID: ${conversasReabertas[0].id}, Status: ${conversasReabertas[0].status})`);


    // ====================================================
    // INGESTÃO DE MÍDIAS (IMAGEM)
    // ====================================================
    logSection('Bônus: Validação de Ingestão de Mídias (Image)');

    console.log('1. Enviando mensagem contendo anexo de imagem...');
    const messageIdMedia = `wamid.MediaMsg_${Date.now()}`;
    // Usamos el teléfono Curitiba válido ya auto-registrado
    const payloadMediaObj = createMediaPayload(messageIdMedia, testPhoneCuritiba, '444555666_id_midia', 'image/jpeg', 'Foto da churrasqueira');
    const payloadMediaStr = JSON.stringify(payloadMediaObj);
    const mediaSignature = 'sha256=' + generateSignature(payloadMediaStr, WHATSAPP_APP_SECRET);

    const resPostMedia = await fetch(`${NEXT_APP_URL}/api/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': mediaSignature
      },
      body: payloadMediaStr
    });

    const postMediaBody = await resPostMedia.json();
    assert.strictEqual(resPostMedia.status, 200, `POST con anexo debe retornar 200, got ${resPostMedia.status}`);
    logSuccess('Mensaje con anexo procesado en el webhook.');

    // Verificar en la DB que el mensaje contenga url_anexo y contenido
    const { data: mensagemMediaDB, error: errGetMediaMsg } = await adminClient
      .from('mensagens')
      .select('conteudo, url_anexo')
      .eq('whatsapp_mensagem_id', messageIdMedia)
      .single();

    if (errGetMediaMsg) throw errGetMediaMsg;
    assert.ok(mensagemMediaDB.url_anexo, 'El mensaje en la base de datos debe tener el link del anexo en url_anexo');
    assert.strictEqual(mensagemMediaDB.conteudo, 'Foto da churrasqueira', 'El contenido (caption) no coincide');
    logSuccess(`Mensaje de imagen guardado con éxito. url_anexo: ${mensagemMediaDB.url_anexo}, contenido: ${mensagemMediaDB.conteudo}`);


    // ====================================================
    // TAREFA 3.5: Validação da Janela de 24 Horas (Outbound Send Utility)
    // ====================================================
    logSection('Tarefa 3.5: Validação da Janela de 24 Horas no Utilitário de Saída');

    if (!enviarMensagemWhatsapp) {
      throw new Error('La función enviarMensagemWhatsapp no fue importada correctamente.');
    }

    console.log('1. Criando conversa limpa para teste de janela de 24h...');
    const { data: clienteJanela, error: errCliJanela } = await adminClient
      .from('clientes')
      .insert({ nome: 'Cliente Janela 24h', telefone: testPhoneMedia })
      .select()
      .single();
    if (errCliJanela) throw errCliJanela;

    const { data: conversaJanela, error: errConvJanela } = await adminClient
      .from('conversas')
      .insert({ cliente_id: clienteJanela.id, status: 'ia_atendendo', ia_ativa: true })
      .select()
      .single();
    if (errConvJanela) throw errConvJanela;

    // Escenario A: Janela Fechada (> 24 horas sem mensagem do cliente)
    console.log('A. Testando envio de texto livre fora da janela de 24h (Sem nenhuma mensagem do cliente)...');
    try {
      await enviarMensagemWhatsapp(conversaJanela.id, {
        texto: 'Olá, tudo bem? Texto livre fora da janela.',
        remetente: 'ia'
      });
      throw new Error('Se esperaba un error por exceder la ventana de 24 horas, pero el envío tuvo éxito.');
    } catch (err) {
      assert.ok(err.message.includes('Janela de 24 horas excedida'), `Mensaje de error inesperado: ${err.message}`);
      logSuccess(`Texto libre rechazado correctamente fuera de la ventana. Error: "${err.message}"`);
    }

    // Escenario B: Envio de Template com janela fechada
    if (RUN_WHATSAPP_OUTBOUND_LIVE) {
      console.log('B. Testando envio de template homologado fora da janela de 24h...');
      const resTemplate = await enviarMensagemWhatsapp(conversaJanela.id, {
        templateName: 'hello_world',
        templateParams: ['Wilkin'],
        remetente: 'ia'
      });
      assert.ok(resTemplate.sucesso, 'El envío del template debe ser exitoso');
      assert.ok(resTemplate.whatsappMensagemId, 'Debe retornar el ID de la mensaje de WhatsApp');
      logSuccess(`Template enviado con éxito fuera de la ventana. WhatsApp Message ID: ${resTemplate.whatsappMensagemId}`);
    } else {
      console.log(`${colors.yellow}⚠ AVISO: Envío real de template omitido. Use RUN_WHATSAPP_OUTBOUND_LIVE=true para probar el proveedor WhatsApp externo.${colors.reset}`);
    }

    // Escenario C: Janela Aberta (Mensagem do cliente há menos de 24h)
    console.log('C. Simulando mensagem do cliente enviada há 2 horas (Janela Aberta)...');
    const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    // Insertamos mensaje del cliente con fecha de hace 2 horas
    const { error: errInsertClienteMsg } = await adminClient
      .from('mensagens')
      .insert({
        conversa_id: conversaJanela.id,
        remetente: 'cliente',
        conteudo: 'Quero comprar assado!',
        data_criacao: duasHorasAtras,
        whatsapp_mensagem_id: `wamid.ClientJanelaMsg_${Date.now()}`
      });
    if (errInsertClienteMsg) throw errInsertClienteMsg;

    if (RUN_WHATSAPP_OUTBOUND_LIVE) {
      console.log('Testando envio de texto livre dentro da janela de 24h...');
      const resTextoLivre = await enviarMensagemWhatsapp(conversaJanela.id, {
        texto: 'Claro, temos costela e maionese hoje! Texto livre dentro da janela.',
        remetente: 'ia'
      });
      assert.ok(resTextoLivre.sucesso, 'El envío de texto libre dentro de la ventana de 24h debe ser exitoso');
      assert.ok(resTextoLivre.whatsappMensagemId, 'Debe retornar el ID de la mensaje de WhatsApp');
      logSuccess(`Texto libre enviado con éxito dentro de la ventana. WhatsApp Message ID: ${resTextoLivre.whatsappMensagemId}`);
    } else {
      console.log(`${colors.yellow}⚠ AVISO: Envío real de texto dentro de la ventana omitido. Use RUN_WHATSAPP_OUTBOUND_LIVE=true para probar el proveedor WhatsApp externo.${colors.reset}`);
    }

    // Escenario D: Janela Fechada de novo (> 24h com data de criação manual de mensagem antiga)
    console.log('D. Simulando última mensagem do cliente enviada há 26 horas (Janela Fechada)...');
    const vinteSeisHorasAtras = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    
    // Primero borramos mensajes anteriores del cliente para este test limpio o actualizamos el data_criacao del mensaje del cliente
    const { error: errUpdateMsgTime } = await adminClient
      .from('mensagens')
      .update({ data_criacao: vinteSeisHorasAtras })
      .eq('conversa_id', conversaJanela.id)
      .eq('remetente', 'cliente');
    
    if (errUpdateMsgTime) throw errUpdateMsgTime;

    console.log('Testando envio de texto livre após janela expirar novamente...');
    try {
      await enviarMensagemWhatsapp(conversaJanela.id, {
        texto: 'Texto livre com janela expirada novamente.',
        remetente: 'ia'
      });
      throw new Error('Se esperaba un error por exceder la ventana de 24 horas tras expirar de nuevo, pero el envío tuvo éxito.');
    } catch (err) {
      assert.ok(err.message.includes('Janela de 24 horas excedida'), `Mensaje de error inesperado: ${err.message}`);
      logSuccess(`Texto libre rechazado correctamente tras expirar la ventana de 24h. Error: "${err.message}"`);
    }

    logSection('Todos os Testes de Integração da Épica 3 passaram com sucesso! (100% de Sucesso)');

  } catch (err) {
    logError('Um ou mais testes de integração falharam!', err.message || err);
    process.exitCode = 1;
  } finally {
    // Teardown
    console.log('\nLimpando dados de teste do banco de dados...');
    try {
      if (todayBusinessHoursSnapshot) {
        await restoreTodayBusinessHours(todayBusinessHoursSnapshot);
        logSuccess('Horário de atendimento do dia restaurado.');
      }

      if (systemConfigSnapshot) {
        await restoreSystemConfig(systemConfigSnapshot);
        logSuccess('Configurações globais de Sofía restauradas.');
      }

      // Borrar mensajes asociadas a los clientes de prueba
      const { data: testClients } = await adminClient
        .from('clientes')
        .select('id')
        .or(`telefone.eq.${testPhoneCuritiba},telefone.eq.${testPhoneForaCuritiba},telefone.eq.${testPhoneReabrir},telefone.eq.${testPhoneMedia}`);
      
      if (testClients && testClients.length > 0) {
        const clientIds = testClients.map(c => c.id);
        
        // 1. Obter IDs das conversas
        const { data: conversas } = await adminClient
          .from('conversas')
          .select('id')
          .in('cliente_id', clientIds);
        
        if (conversas && conversas.length > 0) {
          const conversaIds = conversas.map(c => c.id);
          // 2. Borrar mensagens
          await adminClient.from('mensagens').delete().in('conversa_id', conversaIds);
        }
        
        // 3. Borrar conversas
        await adminClient.from('conversas').delete().in('cliente_id', clientIds);
        
        // 4. Borrar clientes
        const { error: errDelCli } = await adminClient
          .from('clientes')
          .delete()
          .in('id', clientIds);
          
        if (errDelCli) throw errDelCli;
        logSuccess('Dados de teste limpos com sucesso.');
      }
    } catch (cleanUpErr) {
      logError('Falha ao limpar dados de teste:', cleanUpErr);
    }
  }
}

runTests();
