# Evolution API + WhatsApp Interactive Cards — paquete de referencia

Contenido:


- `PR_SOFIA_ATENDIMENTO_CARRINHO_PEDIDOS_ESTOQUE.md` — especificación adaptable para integrar Sofia, roles (Administrador, Supervisor, Atendente, Cliente), atendimento híbrido, carrito persistente, conversión a pedido, reservas y movimientos de estoque, pagos, recibos, auditoría e idempotencia.

- `mockup_whatsapp_cardapio.png` — imagen de referencia visual.
- `PR_IMPLEMENTACAO_CARTOES_EVOLUTION_API.md` — especificación técnica detallada.
- `AGENT_PROMPT.md` — prompt listo para entregar al agente que desarrolla el CRM.

Punto principal de la investigación:

- Evolution API 2.3.7 tiene reportes de regresión en Buttons/Lists con Baileys.
- El endpoint `POST /message/sendCarousel/{instance}` aparece en la línea 2.4.0.
- Las publicaciones encontradas para 2.4.0 son RC; por eso debe fijarse la versión, probarse y mantener fallback.
- Para una cuenta normal enlazada por QR, usar el proveedor Baileys/WhatsApp Web de Evolution API.

Fecha de investigación: 2026-08-17.
