# Runbook: Configuração e Provisionamento do OmniRoute no VPS

Este guia documenta o provisionamento idempotente dos 3 combos de negócio no **OmniRoute** (`http://127.0.0.1:20128`) para uso pelo CRM da **Casa de Assados Sofia**.

---

## 1. Topologia e Segurança
- **Host**: Localhost no VPS (`http://127.0.0.1:20128`).
- **Acesso**: Apenas tráfego local / interno. O endpoint `/v1` responde no formato compatível com OpenAI.
- **Identidade da Chave**: `casa-de-asados-crm-prod`.

---

## 2. Estrutura dos Combos de Negócio

### A. `business-economy` (Tier Economy)
- **Objetivo**: Máxima velocidade e custo mínimo para FAQs, horários, localização e cardápio básico.
- **Pool de Modelos**: `deepseek/deepseek-chat`, `deepseek-ai/deepseek-v3`, `gpt-4o-mini`, `gemini-2.5-flash`.
- **Estratégia**: `auto` (com fallback de disponibilidade).

### B. `business-smart` (Tier Smart)
- **Objetivo**: Equilíbrio perfeito entre inteligência de vendas, cálculo de porções por pessoa, objeções e recomendações com restrições.
- **Pool de Modelos**: `deepseek/deepseek-reasoner`, `gpt-4o`, `claude-3-5-haiku`.
- **Estratégia**: `auto` (quality-first).

### C. `business-frontier` (Tier Frontier)
- **Objetivo**: Máxima capacidade de raciocínio para grandes encomendas corporativas (> 30 pessoas), clientes VIP e negociações de alto ticket (> R$ 500,00).
- **Pool de Modelos**: `gpt-4o`, `claude-3-5-sonnet`, `deepseek/deepseek-reasoner`.
- **Estratégia**: `auto` (quality-first com limite de orçamento).

---

## 3. Provisionamento Automatizado

Execute o script idempotente para verificar e provisionar os combos:

```bash
node scripts/omniroute/provision-combos.mjs
```

---

## 4. Variáveis de Ambiente no CRM (.env)

```env
# Gateway OmniRoute
OMNIROUTE_BASE_URL=http://127.0.0.1:20128
OMNIROUTE_API_KEY=sk-omni-...
AI_ROUTING_V2_ENABLED=true
AI_ROUTING_LEGACY_FALLBACK_ENABLED=true
```
