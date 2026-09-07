# Plan de ejecución por categorías: A → B → C → D → E

Este documento es un **plan**, no una autorización operativa. Las categorías se ejecutan estrictamente en orden: se cierra una, se entrega su resumen y se obtiene permiso explícito antes de iniciar la siguiente. La urgencia no reduce los controles de seguridad. No se promete que no habrá problemas imprevistos: ante una discrepancia, se detiene la categoría y se conserva evidencia sanitizada.

## Estado inicial y reglas comunes

- Fase A aún no comenzó; no existe permiso actual de purga.
- La última evidencia histórica disponible informa `1281` tests y `207` archivos, con `10` suites SQL omitidas; TypeScript y Docker pasaron. Es evidencia previa, no una ejecución nueva.
- No repetir canarios Web/Telegram ya aceptados como evidencia. No reutilizar ni purgar históricos de Telegram/Evolution.
- Usar fixtures sintéticos nuevos, aislados, no sensibles y con manifiesto privado de alcance exacto. La disposición de cada fixture se decide por separado.
- Eliminar únicamente lo que figure expresamente en el manifiesto y coincida con el alcance confirmado. Nunca hacer limpieza amplia, por patrón, por antigüedad o por inferencia.
- No enviar notificaciones externas. Los mensajes de prueba, si una categoría los requiere, deben permanecer dentro del alcance autorizado y no dirigirse a clientes reales.
- Los cambios de corrección (tests, build, migración forward-only y health) deben estar verdes y autorizados antes de A. No reescribir migraciones históricas; rollback de código sólo mediante imagen inmutable y rollback operativo autorizado por separado.
- Las pruebas locales SQL de concurrencia no sustituyen un canario operativo. Preferir tests aislados de locks/fences y, cuando corresponda, un canario acotado; no tocar un scheduler global riesgoso.
- Toda categoría tiene un dueño nombrado, umbrales, ventana de observación, condición de parada y procedimiento de cierre. Un cierre seguro significa detener, cerrar la capacidad temporal y registrar el estado; no significa continuar automáticamente.

## Preguntas de autorización inicial (resolver antes de ejecutar)

Registrar respuestas sanitizadas; no continuar con respuestas implícitas:

1. ¿Qué persona autoriza el inicio de A y quién es el dueño operativo de cada categoría?
2. ¿Qué ventana, umbrales de salud/cola/reintentos y canal de escalamiento aplican a cada canario?
3. ¿Qué fixtures sintéticos nuevos están aprobados y cuál es su manifiesto exacto de recursos? ¿Qué disposición final se aprueba para cada uno: conservar, purgar con tombstone o destruir tras evidencia?
4. ¿Qué decisión separada existe para migración forward-only, rollback de imagen y recreación de Web? Ninguna de ellas autoriza por sí sola purge, replay, restore o scheduler global.
5. ¿Qué umbral obliga a cerrar inmediatamente y quién confirma el cierre?
6. ¿Qué evidencia mínima habilita la siguiente categoría y qué persona concede el permiso siguiente?

Si alguna respuesta falta o contradice el manifiesto, detenerse y solicitar una decisión cerrada; no inventar paths, recursos, umbrales ni autorización.

## Gates previos a A — correcciones y preparación

**Entrada:** código, tests y artefactos de corrección identificados; identidad de worktree/imagen confirmada; no hay cambios operativos implícitos.

Antes de A, ejecutar y registrar sólo resultados sanitizados de:

- tests de corrección y regresión relevantes;
- build/typecheck y validación de migración forward-only;
- health/ready, scheduler, cola, almacenamiento y circuit breaker;
- pruebas SQL locales de concurrencia para locks, fences, leases, repetición idempotente y no-op de denegaciones.

**Permiso explícito requerido:** aprobación independiente para aplicar la migración forward-only, para desplegar/recrear Web y para cualquier rollback. Si falla una corrección, build, migración o health, no comienza A.

---

## A — Expiry, purge y tombstone; matriz restante de replay

**Objetivo:** probar, en fixture sintético nuevo, expiración/purge/tombstone y completar la matriz de elegibilidad y autoridad de replay sin reutilizar históricos.

### Alcance

- Expiry → purge → tombstone: comprobar eliminación de bytes originales y derivados, persistencia de hash/auditoría sin PII, respuesta genérica ante bytes posteriores y ausencia de resurrección o filtración entre clientes.
- Replay: comprobar elegibilidad, repeat-key, leases/fences, límites de reintento, auditoría y diagnósticos Web de sólo lectura.
- Matriz obligatoria: supervisor activo permitido cuando todo lo demás es elegible; admin activo permitido; vendedor activo denegado; vendedor inactivo denegado; actor stale/lease vencido denegado; rol no soportado denegado; objetivo terminal, bloqueado, expirado o inelegible denegado. Las denegaciones no deben mutar proof/order/payment/linkage/queue/lock ni crear auditoría de éxito.
- Verificar permisos del vendedor y que no vea ni ejecute replay/diagnósticos privilegiados.
- Verificar que el repeat-key produce un solo efecto y que no existe replay automático posterior.
- Usar tests SQL locales para carreras de locks/fences/leases; no validar esta propiedad activando un scheduler global riesgoso.

### Entrada

Correcciones/tests/build/migración/health previos aprobados; fixture nuevo y manifiesto firmado por el dueño; ventana, umbrales y rollback definidos; permiso separado para purge y para replay; ningún permiso histórico de Telegram/Evolution reutilizado.

### Salida

Existe evidencia agregada de eliminación, tombstone, no-resurrección, matriz completa de roles/eligibilidad, repeat-key, leases/fences, diagnósticos Web y ausencia de notificaciones externas. El fixture queda en la disposición exacta autorizada y sólo se elimina el alcance explícito del manifiesto.

### Parada segura

Cerrar cleanup/lifecycle/replay, recrear Web si corresponde y conservar auditoría/tombstone ante: bytes resucitados, más de un efecto, cross-customer, auditoría ausente, replay inelegible/terminal, lock o fence inválido, retry fuera del límite, fuga de datos, degradación de health/circuit breaker o cualquier diferencia con el manifiesto. No compensar con loops, purge global ni scheduler global.

### Informe de final de A

Entregar: decisión/ventana/owner; tests y conteos; evidencia sanitizada de expiry/purge/tombstone y matriz replay; health/cola/circuit breaker; fixture y disposición; issues; riesgos y residuos no pertenecientes a A; permiso solicitado para B. El informe no marca B como iniciado.

---

## B — Consolidación de evidencia OpenSpec y handoffs

**Objetivo:** consolidar la evidencia real disponible, sin repetir canarios ni convertir casillas en prueba.

### Alcance

- Completar un índice/handoff actual con referencias a OpenSpec, runbooks, tests, migraciones, health, imágenes y rollback realmente existentes.
- Incluir todas las comprobaciones ejecutadas y su fecha/ventana, distinguiendo "pasó", "omitido", "no ejecutado" y "bloqueado".
- Referenciar el informe de A y conservar la distinción entre evidencia histórica (`1281` tests, `207` archivos, `10` SQL omitidas, TypeScript/Docker pasaron) y resultados nuevos.
- No repetir canarios Web/Telegram para llenar casillas. No marcar tareas existentes ni editar checkboxes de operación en este documento.
- Excluir PII, secretos, payloads, URLs de almacenamiento e identificadores completos.

### Entrada y salida

**Entrada:** informe de A aceptado y permiso explícito para documentar B. **Salida:** handoff revisable con referencias verificables, estado de gates, límites, rollback y huecos abiertos; una persona distinta puede comprobar qué ocurrió sin reconstruirlo.

### Parada segura e informe

Detener si una referencia no coincide con el artefacto real, la evidencia es sólo histórica o contiene datos prohibidos. Entregar resumen de B con documentos/referencias, checks y conteos, discrepancias, residuos no categorizados y permiso para C.

---

## C — Decisiones humanas: gates, dueños, umbrales y disposición

**Objetivo:** obtener decisiones explícitas, separadas y trazables antes de cualquier transición operacional.

### Decisiones requeridas

- Gate de cada capacidad: cerrado, ventana limitada con inicio/fin o habilitación continua con revisión.
- Dueño accountable, on-call/escalamiento, umbrales de health/cola/dead letters/retries y condición de cierre.
- Fixture: conservar, purgar con tombstone o destruir; el permiso cubre únicamente el manifiesto exacto.
- Historia: qué evidencia histórica debe conservarse y qué nunca se purga/reutiliza (incluidos históricos Telegram/Evolution).
- Permisos separados para migración, recreación Web, rollback, cleanup/purge, restore y replay.

### Entrada y salida

**Entrada:** handoff B aceptado y ninguna discrepancia abierta que requiera adivinación. **Salida:** registro de decisiones con nombres/roles, ventanas, thresholds, fixtures y permisos separados. Una decisión de mantener cerrado es válida.

### Parada segura e informe

Sin decisión nombrada, detener; no inferir autorización por urgencia, health verde o evidencia de otra categoría. Entregar decisiones, abstenciones, issues, riesgos, residuos no categorizados y permiso para D.

---

## D — Commits, push, PR y merge separados

**Objetivo:** preparar una cadena causal revisable, sin mezclar operación con entrega de código.

### Reglas de entrega

- Dividir commits por cadena causal y mantener cada unidad en aproximadamente ≤400 líneas; no comprimir tests/evidencia para cumplir el límite.
- Revisar diff sanitizado, identidad de worktree, tests focalizados y validaciones autorizadas antes de push.
- Push y apertura de PR son pasos distintos de merge. El PR debe incluir alcance, evidencia, gates, rollback, issues y residuos.
- Merge requiere una autorización final explícita que nombre PR/commit; ningún canario, test, health, push o apertura de PR equivale a permiso de merge.

### Entrada y salida

**Entrada:** C aceptada y evidencia A/B completa. **Salida:** commits causales revisados, push/PR autorizado y PR abierto sin merge; o parada segura si el diff supera el límite, aparecen cambios no relacionados o falla una validación.

### Informe de final de D

Reportar commits/PR mediante referencias permitidas, tests/evidencia, archivos fuera de alcance detectados, issues, riesgos residuales, estado de merge (siempre separado) y permiso requerido para E.

---

## E — Secretos, rotación y go-live

**Objetivo:** cerrar la revisión de seguridad y obtener aprobación de configuración/go-live sin automatizar rotaciones.

### Alcance

- Inventariar secretos y rutas de configuración sólo con metadatos sanitizados; no imprimir valores.
- La rotación queda diferida hasta E y requiere coordinación con los dueños correspondientes. No auto-rotar ahora.
- Revisar impacto de vulnerabilidades, configuración efectiva, exposición, health, rollback y compatibilidad de la imagen.
- Obtener aprobación explícita de configuración y go-live, con alcance, ventana, owner, thresholds, on-call y plan de cierre.
- Si se decide rotar, ejecutar una operación separada, autorizada y reversible según el procedimiento aprobado; este plan no la inicia.

### Entrada y salida

**Entrada:** D aceptada, PR/commits identificados y sin permiso de merge implícito. **Salida:** inventario y revisión de impacto sanitizados, decisión de rotación (diferida o ventana autorizada), aprobación o rechazo de configuración/go-live y postura final de gates.

### Parada segura e informe

Detener ante secreto expuesto, vulnerabilidad no evaluada, configuración divergente, health degradado, rollback no disponible o aprobación incompleta. No rotar automáticamente ni declarar go-live. Entregar el resumen final: categorías completadas, tests, evidencia, issues, riesgos, residuos no categorizados, decisión de secretos/rotación, postura de gates y siguiente permiso explícito.

## Formato obligatorio de cada informe de categoría

1. Categoría y estado: completada, parcial o detenida.
2. Ventana, dueño y permisos realmente usados.
3. Tests ejecutados y conteos; distinguir evidencia histórica de ejecución nueva.
4. Evidencia sanitizada y referencias verificables.
5. Gates/health/cola/circuit breaker antes y después.
6. Fixtures y disposición exacta del manifiesto.
7. Issues, stop conditions activadas y rollback/cierre aplicado.
8. Riesgos residuales y trabajo pendiente fuera de la categoría.
9. Próximo permiso solicitado, sin asumirlo.

**No se considera completada una categoría sólo porque no haya ocurrido un incidente.** Se completa únicamente con sus criterios de salida, evidencia revisada y permiso documentado para continuar.
