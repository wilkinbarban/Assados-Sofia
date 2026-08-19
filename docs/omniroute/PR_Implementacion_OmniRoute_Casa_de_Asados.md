# PR: AI Business Router con OmniRoute — CRM Casa de Asados

**Agente implementador:** sin nombre asignado  
**Identidad del bot:** Sofia — bot/persona del proyecto Casa de Asados asociado a Wilkin Barban Rosabal  
**Canales:** WhatsApp (Evolution API), Telegram y app web  
**Objetivo:** implementar tres niveles de IA (Economy, Smart, Frontier) usando OmniRoute en el mismo VPS, sin romper el comportamiento actual.

> La versión DOCX adjunta contiene la especificación completa, criterios de aceptación, rollout, pruebas y runbook. Este Markdown funciona como PR body resumido.

## Arquitectura objetivo

```text
CRM / canales
  -> AI Service / Business Router
     -> economy  -> business-economy
     -> smart    -> business-smart
     -> frontier -> business-frontier
  -> OmniRoute /v1
  -> proveedor/modelo/fallback/health/budget
```

## Política

| Tier | Uso | Pool inicial |
|---|---|---|
| Economy | FAQ, extracción, clasificación, resumen, cotización simple | DeepSeek V4 Flash + GPT-5.6 Luna |
| Smart | objeciones, recomendaciones, upsell/cross-sell, personalización | GPT-5.6 Luna + DeepSeek V4 Pro + GPT-5.6 Terra |
| Frontier | ventas grandes, corporativos, negociación, alto riesgo/valor | GPT-5.6 Terra + DeepSeek V4 Pro + GPT-5.6 Sol |

## Secuencia obligatoria

1. Auditar repo, stack, flujos LLM, canales y suite actual.
2. Ejecutar baseline de tests.
3. Descubrir OmniRoute en el VPS, red/puerto/versión/management auth.
4. Descubrir modelos reales de la instancia.
5. Crear/reusar API key dedicada `casa-de-asados-crm-prod` con mínimo privilegio y límites.
6. Crear/verificar los tres combos de forma idempotente.
7. Smoke-test de cada alias contra `/v1`.
8. Añadir `OMNIROUTE_BASE_URL`, `OMNIROUTE_API_KEY` y feature flags sin exponer secretos.
9. Crear AI Service/Business Router y encapsular las llamadas actuales.
10. Mantener flujo legacy detrás de kill switch.
11. Tests unit + integration + E2E por WhatsApp/Evolution, Telegram y web.
12. Shadow/canary, métricas, rollout gradual y rollback probado.

## No-regresión

- No cambiar contratos de webhooks/HTTP salvo necesidad demostrada.
- No duplicar respuestas/pedidos bajo retries o webhooks repetidos.
- No eliminar integración legacy antes de estabilidad comprobada.
- No hardcodear modelos de proveedor fuera del módulo de infraestructura.
- No loguear API keys ni credenciales de gestión.
- No exponer management API de OmniRoute públicamente.

## Done

- Los tres canales continúan operativos.
- El CRM solo usa aliases `business-*`.
- Key dedicada y combos creados/verificados.
- Feature flag y rollback probados.
- Suite existente y nuevos tests verdes.
- E2E Economy/Smart/Frontier verificados en WhatsApp, Telegram y web.
- Telemetría de tier, modelo/proveedor resuelto, tokens, costo, latencia y fallbacks.

**Ver `PR_Implementacion_OmniRoute_Casa_de_Asados.docx` para la implementación detallada completa.**
