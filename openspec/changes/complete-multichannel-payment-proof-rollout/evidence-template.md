# Plantilla de Evidencia Operativa Sanitizada

Esta plantilla define el formato obligatorio para registrar la evidencia de ejecuciones, canarios operativos y despliegues del flujo multicanal de comprobantes de pago.

## Reglas de Privacidad y Sanitización

- **Prohibido incluir:** PII de clientes (nombres, correos, teléfonos, documentos), claves de API, secretos de webhook, tokens JWT/Bearer, payloads raw, URLs firmadas o rutas completas de Storage, identificadores UUID completos de comprobantes, pedidos, mensajes o chats.
- **Permitido exclusivamente:** Roles de actores, ventanas de ejecución, conteos agregados, códigos de estado HTTP, estados sanitizados de gates, alias truncados/redactados (máx. 8 caracteres o hash corto), nombres de archivo de migración y hashes de imagen Docker.

---

## Estructura del Registro

### 1. Metadatos de la Ventana
- **Operación / Canario:** [Nombre de la fase o canario ejecutado]
- **Responsable / Rol ejecutor:** [admin / supervisor / automated-runner]
- **Ventana temporal:** [YYYY-MM-DDTHH:MM:SSZ — YYYY-MM-DDTHH:MM:SSZ]
- **Entorno / Worktree:** [Ruta física confirmada con git root]
- **Rama Git / Commit Base:** [Nombre de rama y hash truncado]

### 2. Postura de Gates Operativos (Capturados al Inicio)
- `PAYMENT_PROOF_CANONICAL_INGEST_ENABLED`: [true / false]
- `TELEGRAM_PAYMENT_PROOF_INGEST_ENABLED`: [true / false]
- `WHATSAPP_PAYMENT_PROOF_INGEST_ENABLED`: [true / false]
- `PAYMENT_PROOF_PROCESSING_ENABLED`: [true / false]
- `PAYMENT_PROOF_SELLER_RECONCILIATION_ENABLED`: [true / false]
- `PAYMENT_PROOF_PRIVILEGED_REPLAY_ENABLED`: [true / false]
- `PAYMENT_PROOF_CLEANUP_ENABLED`: [true / false]
- `PAYMENT_PROOF_RESTORE_ENABLED`: [true / false]

### 3. Artefactos de Despliegue
- **Imagen Web inmutable:** [Nombre de imagen y tag]
- **Digest de imagen:** [sha256:prefix… (sanitizado)]
- **Migraciones aplicadas:** [Lista de versiones de migración forward-only aplicadas]
- **Imagen de rollback verificada:** [sha256:prefix… (disponible para recuperación)]

### 4. Resultados y Métricas Agregadas
| Métrica / Comprobación | Valor / Conteo | Resultado |
|---|---|:---:|
| Total comprobantes procesados | [N] | PASS / FAIL |
| Duplicados detectados | [N] | PASS / FAIL |
| Conciliaciones exitosas | [N] | PASS / FAIL |
| Cuarentenas aplicadas | [N] | PASS / FAIL |
| Restauraciones confirmadas | [N] | PASS / FAIL |
| Purgas ejecutadas (archivos exactos) | [N] | PASS / FAIL |
| Tombstones retenidos | [N] | PASS / FAIL |
| Mensajes outbox entregados | [N] | PASS / FAIL |
| Dead letters generadas | [N] | PASS / FAIL |

### 5. Verificación de Salud y Circuit Breaker
- **Endpoint `/api/health/live`:** [HTTP 200 / error]
- **Endpoint `/api/health/ready`:** [HTTP 200 / error]
- **Endpoint `/login`:** [HTTP 200 / error]
- **Reinicios de contenedor Web:** [0]
- **Reinicios de contenedor Scheduler:** [0]
- **Circuit breaker:** [Normal / Disparado]

### 6. Cierre Seguro de la Ventana
- **Gates modificados cerrados:** [Sí / No]
- **Actores temporales desactivados:** [Total creados: N / Total inactivos: N]
- **Symlinks de entorno removidos:** [Sí / No]
- **Fixtures históricos intactos:** [Sí / No]
- **Incidencias o anomalías:** [Ninguna / Descripción de evento sanitizado]
