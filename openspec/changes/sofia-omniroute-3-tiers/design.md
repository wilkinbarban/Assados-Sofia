# Design: AI Business Router & OmniRoute 3-Tiers Integration

## 1. Arquitetura de Roteamento

```
[ Mensagem do Cliente (WhatsApp / Telegram / Web) ]
                     │
                     ▼
        [ processarRagPipeline ]
                     │
                     ▼
       [ classifySofiaRequestTier ] ─── (Heurística sem latência)
        ├── FAQ / Endereço / Cardápio Geral ───► 'economy'  ──► business-economy
        ├── Objeções / Restrições / Upsell  ───► 'smart'    ──► business-smart
        └── Eventos / VIP / Pedidos > R$500 ───► 'frontier' ──► business-frontier
                     │
                     ▼
          [ chamarOmniRouteGateway ]
        (POST http://127.0.0.1:20128/v1/chat/completions)
                     │
         ┌───────────┴───────────┐
      Sucesso                 Falha / Timeout (>5s)
         │                       │
         ▼                       ▼
   [ Retorno IA ]          [ Fallback Legacy (OpenRouter/DeepSeek) ]
```

## 2. Contrato de Classificação de Negócio

A função `classifySofiaRequestTier` em `apps/web/src/lib/ai/router.ts`:
- **Input**:
  - `mensagem`: string
  - `valorCarrinhoCentavos`: number (opcional)
  - `itensCarrinhoCount`: number (opcional)
  - `historicoCount`: number (opcional)
- **Output**:
  - `tier`: `'economy' | 'smart' | 'frontier'`
  - `motivo`: string (para auditoria e telemetria interna)

## 3. Estrutura dos Combos no OmniRoute

| Combo | Alias | Estratégia | Mode Pack | Modelos / Providers |
| :--- | :--- | :--- | :--- | :--- |
| **Economy** | `business-economy` | `auto` | `cost-saver` | `DeepSeek V4 Flash`, `GPT-5.6 Luna` |
| **Smart** | `business-smart` | `auto` | `quality-first` | `GPT-5.6 Luna`, `DeepSeek V4 Pro`, `GPT-5.6 Terra` |
| **Frontier** | `business-frontier` | `auto` | `quality-first` | `GPT-5.6 Terra`, `DeepSeek V4 Pro`, `GPT-5.6 Sol` |

## 4. Variáveis de Ambiente e Feature Flags

- `OMNIROUTE_BASE_URL`: `http://127.0.0.1:20128`
- `OMNIROUTE_API_KEY`: Chave dedicada gerada para o CRM (`casa-de-asados-crm-prod`)
- `AI_ROUTING_V2_ENABLED`: `boolean` (controla se o novo router está ativo)
- `AI_ROUTING_LEGACY_FALLBACK_ENABLED`: `boolean` (permite fallback transparente se OmniRoute falhar)
