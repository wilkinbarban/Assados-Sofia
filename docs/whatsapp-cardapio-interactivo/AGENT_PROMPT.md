# Prompt para el agente — Implementar cardápio interactivo en el CRM

Quiero que implementes en este CRM un módulo de cardápio interactivo de WhatsApp usando Evolution API y una cuenta normal conectada por QR mediante Baileys.

Antes de modificar código:

1. Audita la arquitectura actual del CRM.
2. Identifica stack, módulos de clientes, productos, carrito, pedidos y cualquier integración existente de WhatsApp/Evolution.
3. Lee `PR_IMPLEMENTACAO_CARTOES_EVOLUTION_API.md`.
4. Comprueba la versión de Evolution API usada por el proyecto.
5. No uses Evolution API 2.3.7 para Buttons/Lists.
6. Para carrusel, exige una versión que tenga `POST /message/sendCarousel/{instance}`. La investigación inicial lo sitúa en la línea 2.4.0; si existe una versión estable posterior, priorízala.
7. No uses la etiqueta Docker `latest`.
8. Si la instalación sigue usando una release candidate, deja el carrusel detrás de feature flag y crea fallback.

## UX requerida

Mensaje inicial:

`🔥 O que vai querer hoje?`

Productos:

### Frango Assado Inteiro
- descripción: `Frango bem temperado, assado lentamente até ficar douradinho e suculento.`
- R$ 39,90
- `🛒 Adicionar ao pedido`
- `👀 Ver detalhes`

### Costela Assada
- descripción: `Costela macia e suculenta, assada lentamente e com aquele sabor especial de domingo.`
- aproximadamente 1 kg
- R$ 59,90
- `🛒 Adicionar ao pedido`
- `👀 Ver detalhes`

### Combo Família
- 1 Frango Assado
- Farofa
- Maionese
- Refrigerante
- R$ 69,90
- `🛒 Quero esse combo`

Usa `mockup_whatsapp_cardapio.png` sólo como referencia visual. No intentes reproducirlo con HTML dentro de WhatsApp.

## Arquitectura obligatoria

No acoples el dominio del CRM al payload de Evolution.

Crea un gateway/adaptador:

- `EvolutionCarouselGateway`
- fallback `EvolutionButtonsGateway`
- fallback final de texto/lista

Normaliza todos los eventos entrantes a un modelo interno.

IDs mínimos:

- `cart:add:frango-assado-inteiro`
- `product:details:frango-assado-inteiro`
- `cart:add:costela-assada-1kg`
- `product:details:costela-assada-1kg`
- `cart:add:combo-familia`

No uses el texto visible del botón como identificador.

## Webhook

Implementa/usa un endpoint backend para recibir eventos de Evolution.

Debe:

- extraer el ID de respuesta interactiva;
- evitar duplicados usando `messageId`;
- identificar cliente;
- ejecutar acción;
- actualizar carrito;
- enviar respuesta.

## Seguridad

- API key únicamente backend.
- HTTPS.
- secretos en `.env`.
- nunca confiar en precio enviado en el mensaje.
- cargar precio/estado actual desde DB.
- logs sin credenciales.
- validar webhooks.
- idempotencia.

## Flujo de desarrollo

Trabaja por fases:

1. auditoría;
2. diseño y archivos a modificar;
3. cliente Evolution;
4. carrusel;
5. webhook normalizer;
6. carrito;
7. fallback;
8. tests;
9. smoke test en Evolution Manager;
10. pruebas Android/iOS/Web;
11. documentación.

Antes de escribir cambios grandes, muéstrame el plan de archivos y posibles incompatibilidades con el código actual.

No elimines funcionalidades existentes para adaptar esta implementación.

Entrega al final:

- resumen técnico;
- archivos modificados;
- variables `.env`;
- endpoints;
- payload final validado contra el Swagger de la versión instalada;
- ejemplo del webhook real capturado;
- pruebas realizadas;
- riesgos pendientes;
- procedimiento de rollback.
