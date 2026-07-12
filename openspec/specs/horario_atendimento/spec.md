# Especificação: Módulo Horário do Atendimento

Este documento define as especificações de negócio, comportamento do sistema e requisitos técnicos para o módulo de Horário do Atendimento.

**Origem:** `estoque-horarios` (arquivado em 2026-07-07)

---

## 1. Visão Geral

O módulo permite ao administrador definir os horários e dias de funcionamento do negócio. O sistema deve verificar automaticamente o horário de atendimento antes de processar mensagens em todos os canais (WhatsApp, Telegram, Chat Web). Quando fora do horário, uma mensagem fixa amigável é enviada sem consumir tokens do LLM.

---

## 2. Requisitos de Negócio e Funcionais

### 2.1. Definição de Horários (Spec H1)

#### 2.1.1. Modelo de Dados (`public.horarios_atendimento`)
O sistema MUST persistir os horários na tabela `public.horarios_atendimento` com o seguinte esquema:
- `id`: `UUID` (PRIMARY KEY, default `gen_random_uuid()`)
- `dia_semana`: `INTEGER` (NOT NULL, CHECK 0-6, 0=Domingo a 6=Sábado), UNIQUE
- `hora_abertura`: `TIME` (NOT NULL)
- `hora_fechamento`: `TIME` (NOT NULL)
- `ativo`: `BOOLEAN` (NOT NULL, default TRUE)
- `data_criacao`: `TIMESTAMPTZ` (default `now()`)
- `data_atualizacao`: `TIMESTAMPTZ` (default `now()`), com trigger de auto-update

#### 2.1.2. Gestão de Horários
- O admin SHALL poder definir horário de abertura e fechamento para cada dia da semana (0-6).
- Cada dia MUST ter toggle ativo/inativo independente.
- A UI MUST exibir 7 cards (Dom a Sáb) com seletor de hora e toggle.
- Alterações SHALL ser auditadas em `logs_auditoria`.
- A validação MUST garantir que `hora_abertura < hora_fechamento`.
- A permissão SHALL ser restrita a admin/supervisor.

#### 2.1.3. RLS (Row Level Security)
- Leitura pública (SELECT sem autenticação).
- Escrita restrita a usuários autenticados com roles `admin` ou `supervisor`.

---

### 2.2. Mensagem Fora de Horário (Spec H2)

#### 2.2.1. Configuração
- O admin SHALL poder editar a mensagem de fora de horário via `configuracoes_sistema` (chave `MENSAGEM_FORA_HORARIO`).
- A mensagem MUST ser fixa, amigável, em português, com tom caloroso da Sofía.

#### 2.2.2. Placeholders Dinâmicos
O sistema MUST substituir os seguintes placeholders automaticamente:
- `{dias_semana}` → lista formatada dos dias com `ativo = TRUE` (ex: "sábado e domingo", "segunda a sexta").
- `{horario_inicio}` → menor `hora_abertura` entre os dias ativos.
- `{horario_fim}` → maior `hora_fechamento` entre os dias ativos.

#### 2.2.3. Preview
A UI SHALL exibir preview em tempo real da mensagem com os placeholders substituídos.

---

### 2.3. Verificação Automática de Horário (Spec H3)

#### 2.3.1. Função `verificarHorarioAtendimento()`
- A função lib `src/lib/horarios/verificar.ts` SHALL retornar `{ dentro: boolean, mensagem?: string }`.
- A verificação MUST consultar `horarios_atendimento` para o `dia_semana` atual com `ativo = TRUE`.
- Se o dia atual não tiver registro ativo → considera fora do horário.
- Se a hora atual estiver entre `hora_abertura` e `hora_fechamento` → `dentro: true`.
- Caso contrário → `dentro: false` com `mensagem` gerada automaticamente.

#### 2.3.2. Condições de Ativação
- Todos os webhooks (Telegram, Evolution/WhatsApp) MUST verificar horário antes de processar.
- O chat web (`processarIaChat`) MUST verificar horário antes do RAG.
- Se fora do horário: envia `MENSAGEM_FORA_HORARIO` e NÃO dispara LLM.
- Se dentro do horário: fluxo normal (RAG pipeline).
- A verificação SHALL consumir 0 tokens do LLM.

---

### 2.4. Resposta Fora de Horário por Canal (Spec H4)

#### 2.4.1. Distribuição Multicanal
- WhatsApp: envia mensagem de texto via Evolution API.
- Telegram: envia mensagem via Bot API.
- Chat Web: retorna mensagem no response da server action.

#### 2.4.2. Consistência
A mensagem fora de horário MUST ser IDÊNTICA em todos os canais, substituindo os mesmos placeholders com os mesmos valores.

---

## Requirements added by `atendimento-global-sofia-status-control`

### Requirement: Yellow state uses schedule message only

When a channel is outside business hours or paused by schedule, the system MUST enter a yellow state for that channel.

In the yellow state, the system MUST send only the configured out-of-hours schedule message and MUST NOT invoke the LLM.

#### Scenario: Out-of-hours response
- GIVEN the current time is outside the configured business hours
- WHEN a WhatsApp or Telegram message arrives
- THEN the system MUST send the configured schedule message only
- AND the system MUST NOT call the LLM

### Requirement: Scheduled pause is distinct from global off

The schedule-driven yellow state MUST be distinct from the red global-off state.

A yellow state MUST mean the channel is temporarily constrained by business hours, while a red state MUST mean Sofia is globally disabled for that channel.

#### Scenario: Different colors for different causes
- GIVEN a channel is outside business hours
- WHEN the status is rendered
- THEN the channel MUST be yellow
- GIVEN a channel is globally disabled
- WHEN the status is rendered
- THEN the channel MUST be red
