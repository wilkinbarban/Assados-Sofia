# PR técnico — Tarjetas interactivas de cardápio con Evolution API + WhatsApp normal

## Objetivo

Implementar en el CRM un cardápio visual de restaurante parecido al mockup incluido en este paquete, usando una cuenta normal de WhatsApp conectada por QR a Evolution API mediante el proveedor **Baileys / WhatsApp Web**.

El objetivo funcional es que el cliente reciba productos con foto, nombre, descripción, precio y acciones como:

- 🛒 Adicionar ao pedido
- 👀 Ver detalhes
- 🛒 Quero esse combo

El CRM debe convertir cada interacción del usuario en una acción de negocio identificable por un `id` estable, actualizar el carrito y continuar el flujo de venta.

---

## 1. Decisión de versión

### No usar Evolution API 2.3.7 para este módulo

Existe una regresión reportada en Evolution API **v2.3.7** que afecta mensajes interactivos de Buttons y Lists con conexión Baileys. En el issue oficial se documenta que los payloads que funcionaban en 2.3.6 fallaban en 2.3.7.

### Versión necesaria para carrusel real

El endpoint explícito para carrusel fue introducido en la línea **Evolution API 2.4.0**:

`POST /message/sendCarousel/{instance}`

La release 2.4.0 añadió:

- mensajes interactivos Reply / CTA / PIX / List / Carousel;
- endpoint `sendCarousel`;
- correcciones de renderizado para Android, iOS, WhatsApp Web y Desktop;
- `SendCarouselDto`;
- `carouselMessageSchema`;
- correcciones del nodo `biz`/`native_flow` requerido por WhatsApp.

A fecha de esta investigación, las releases públicas visibles son **2.4.0-rc1** y **2.4.0-rc2**, ambas marcadas como pre-release.

### Recomendación para este CRM

Para un laboratorio/desarrollo del carrusel:

`evoapicloud/evolution-api:2.4.0-rc2`

No usar `latest` para este módulo. Fijar la imagen Docker por versión.

Para producción, el agente debe volver a comprobar primero si ya existe una **2.4.0 estable o posterior estable** que incluya `POST /message/sendCarousel/{instance}`. Si existe, migrar a esa estable y ejecutar pruebas de compatibilidad.

Si no existe estable, mantener el carrusel detrás de una feature flag:

`WHATSAPP_INTERACTIVE_CAROUSEL_ENABLED=true|false`

y conservar un fallback soportado por el CRM.

---

## 2. Cuenta de WhatsApp normal

Evolution API admite conexión basada en **Baileys**, que utiliza WhatsApp Web. Esto permite enlazar un número normal mediante QR sin registrar una aplicación en Meta Cloud API.

Arquitectura:

```text
WhatsApp del restaurante
        │
        │ QR / dispositivo vinculado
        ▼
Evolution API
Proveedor: Baileys
        │ REST + Webhooks
        ▼
CRM
        │
        ├── Catálogo
        ├── Carrito
        ├── Pedidos
        ├── Clientes
        └── Automatizaciones/Bot
```

Importante: Baileys no es la API oficial de Meta. Depende del protocolo de WhatsApp Web y puede sufrir cambios de compatibilidad, desconexiones o restricciones. Por eso este módulo debe aislarse detrás de un adaptador de mensajería.

---

## 3. Diferencia entre el mockup y lo que WhatsApp renderiza

El archivo `mockup_whatsapp_cardapio.png` es una referencia de UX, no una garantía pixel-perfect.

No se dibuja una tarjeta HTML dentro de WhatsApp.

El CRM envía una estructura de mensaje interactivo soportada por WhatsApp. El cliente de WhatsApp decide la presentación final según:

- Android;
- iOS;
- WhatsApp Web;
- WhatsApp Desktop;
- versión instalada del cliente.

Por eso no deben usarse CSS, HTML, React ni componentes web para diseñar el mensaje recibido.

El aspecto correcto se construye con:

1. imagen del producto;
2. título;
3. texto/descripción;
4. footer opcional;
5. botones interactivos;
6. identificadores internos de cada acción.

---

## 4. Dos modos de implementación

### Modo A — Carrusel real

Usar cuando Evolution 2.4.x compatible esté habilitado y las pruebas hayan pasado.

Conceptualmente:

```text
🔥 O que vai querer hoje?

[ Card Frango ]  → deslizar
[ Card Costela ] → deslizar
[ Card Combo ]   → deslizar
```

Cada tarjeta debe contener una foto y sus botones.

Ventajas:

- experiencia de catálogo;
- menos mensajes verticales;
- permite explorar productos;
- más cercano al mockup moderno.

Riesgo:

- depende de un formato interactivo más sensible a cambios del protocolo;
- la línea 2.4.0 investigada está actualmente publicada como release candidate.

### Modo B — Tarjetas simuladas / fallback

Enviar cada producto como:

```text
[imagen]
🍗 FRANGO ASSADO
Frango Assado Inteiro
...
R$ 39,90

[Adicionar ao pedido] [Ver detalhes]
```

Si los botones no renderizan, usar lista o respuestas numéricas:

```text
1️⃣ Adicionar ao pedido
2️⃣ Ver detalhes
```

Este fallback debe existir aunque el carrusel esté habilitado.

---

## 5. Modelo de dominio recomendado

No guardar lógica del pedido dentro del texto mostrado.

Ejemplo:

```ts
type CatalogItem = {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  active: boolean;
};

type InteractiveAction = {
  id: string;
  type: "ADD_TO_CART" | "VIEW_DETAILS";
  productId: string;
};

type CartItem = {
  productId: string;
  quantity: number;
  unitPriceCents: number;
};
```

Productos de ejemplo:

```json
[
  {
    "id": "frango-assado-inteiro",
    "sku": "FRANGO-001",
    "name": "Frango Assado Inteiro",
    "description": "Frango bem temperado, assado lentamente até ficar douradinho e suculento.",
    "priceCents": 3990,
    "imageUrl": "https://cdn.seudominio.com/menu/frango.jpg"
  },
  {
    "id": "costela-assada-1kg",
    "sku": "COSTELA-001",
    "name": "Costela Assada",
    "description": "Costela macia e suculenta, assada lentamente e com aquele sabor especial de domingo.",
    "priceCents": 5990,
    "imageUrl": "https://cdn.seudominio.com/menu/costela.jpg"
  },
  {
    "id": "combo-familia",
    "sku": "COMBO-001",
    "name": "Combo Família",
    "description": "1 Frango Assado + Farofa + Maionese + Refrigerante",
    "priceCents": 6990,
    "imageUrl": "https://cdn.seudominio.com/menu/combo-familia.jpg"
  }
]
```

---

## 6. IDs de botones

Nunca interpretar el texto visible del botón para ejecutar una acción.

Usar IDs determinísticos:

```text
cart:add:frango-assado-inteiro
product:details:frango-assado-inteiro

cart:add:costela-assada-1kg
product:details:costela-assada-1kg

cart:add:combo-familia
```

El texto puede cambiar sin romper la lógica.

Parser:

```ts
function parseInteractiveAction(id: string) {
  const [scope, action, entityId] = id.split(":");

  if (scope === "cart" && action === "add") {
    return { type: "ADD_TO_CART", productId: entityId };
  }

  if (scope === "product" && action === "details") {
    return { type: "VIEW_DETAILS", productId: entityId };
  }

  return null;
}
```

---

## 7. Servicio adaptador

Crear una interfaz propia del CRM.

```ts
interface WhatsAppCatalogGateway {
  sendCatalog(
    to: string,
    products: CatalogItem[]
  ): Promise<void>;

  sendProduct(
    to: string,
    product: CatalogItem
  ): Promise<void>;
}
```

Implementaciones:

```text
EvolutionCarouselGateway
EvolutionButtonsGateway
EvolutionPlainTextFallbackGateway
```

El dominio del CRM no debe conocer el JSON interno de Evolution API.

---

## 8. Endpoint Evolution API

Ruta documentada por la release 2.4.0:

```http
POST /message/sendCarousel/{instance}
apikey: <EVOLUTION_API_KEY>
Content-Type: application/json
```

El agente debe consultar el Swagger/Manager de **la imagen exacta instalada** antes de cerrar el DTO, porque 2.4.0 está en evolución y el contrato puede cambiar entre RC y estable.

### Payload conceptual

El siguiente JSON representa la estructura que debe producir el adaptador. Los nombres exactos de campos deben ser confirmados contra el Swagger de la versión fijada.

```json
{
  "number": "55DDDNUMERO",
  "text": "🔥 O que vai querer hoje?",
  "cards": [
    {
      "image": "https://cdn.seudominio.com/menu/frango.jpg",
      "title": "🍗 Frango Assado Inteiro",
      "body": "Frango bem temperado, assado lentamente até ficar douradinho e suculento.\n\nR$ 39,90",
      "buttons": [
        {
          "type": "reply",
          "displayText": "🛒 Adicionar ao pedido",
          "id": "cart:add:frango-assado-inteiro"
        },
        {
          "type": "reply",
          "displayText": "👀 Ver detalhes",
          "id": "product:details:frango-assado-inteiro"
        }
      ]
    }
  ]
}
```

No copiar este payload directamente a producción sin validarlo con:

- Swagger del contenedor instalado;
- pestaña `Test Interactive` del Manager 2.4;
- prueba real Android;
- prueba real iOS;
- prueba WhatsApp Web/Desktop.

---

## 9. Recepción de clics mediante webhook

El CRM debe recibir eventos de mensajes en un webhook:

```text
POST /api/webhooks/evolution
```

Flujo:

```text
Cliente pulsa botón
      ↓
WhatsApp
      ↓
Evolution API
      ↓
Webhook del CRM
      ↓
normalizar mensaje
      ↓
extraer button/list/native-flow response id
      ↓
parseInteractiveAction(id)
      ↓
CartService / ProductService
      ↓
respuesta al cliente
```

Nunca acoplarse directamente a una sola forma de webhook.

Crear:

```ts
type NormalizedInboundMessage = {
  instance: string;
  remoteJid: string;
  phone: string;
  messageId: string;
  type: "TEXT" | "INTERACTIVE";
  text?: string;
  interactiveId?: string;
  raw: unknown;
};
```

Implementar una función:

```ts
normalizeEvolutionWebhook(payload): NormalizedInboundMessage
```

y cubrirla con fixtures reales capturados durante las pruebas.

---

## 10. Flujo del carrito

Al pulsar:

`cart:add:frango-assado-inteiro`

el sistema debe:

1. identificar cliente por teléfono/JID;
2. encontrar o crear carrito OPEN;
3. cargar producto por ID;
4. verificar que sigue activo;
5. leer el precio actual desde la base de datos;
6. agregar/incrementar cantidad;
7. persistir;
8. responder confirmación.

Ejemplo:

```text
✅ Frango Assado Inteiro adicionado!

Seu pedido:
1x Frango Assado Inteiro — R$ 39,90

Subtotal: R$ 39,90

[➕ Continuar comprando]
[🛒 Ver pedido]
[✅ Finalizar pedido]
```

No confiar en el precio recibido desde WhatsApp.

---

## 11. Seguridad

- Evolution API no debe exponerse directamente al frontend.
- `EVOLUTION_API_KEY` sólo en backend.
- Usar HTTPS.
- Validar/filtrar webhooks.
- Idempotencia por `messageId`.
- No procesar dos veces el mismo click.
- Rate limiting.
- Logs sin secretos.
- Imágenes servidas por HTTPS.
- Productos, precios y disponibilidad siempre cargados desde DB.
- Guardar `raw webhook` sólo si la política de privacidad del CRM lo permite.

Variables:

```env
EVOLUTION_BASE_URL=https://evolution.seudominio.com
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=restaurante
WHATSAPP_INTERACTIVE_CAROUSEL_ENABLED=true
```

---

## 12. Feature detection

Antes de activar carrusel:

```text
1. Obtener versión de Evolution.
2. Comprobar >= línea compatible con sendCarousel.
3. Smoke test.
4. Verificar entrega.
5. Verificar que los botones renderizan.
6. Verificar webhook del click.
```

Si falla:

```text
carousel → buttons → list → text
```

Nunca dejar el flujo de venta sin fallback.

---

## 13. Prueba de compatibilidad obligatoria

Matriz:

| Cliente | Carrusel | Imagen | Reply | Detalles | Webhook | Fallback |
|---|---:|---:|---:|---:|---:|---:|
| Android | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| iOS | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| WhatsApp Web | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Desktop | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

También probar:

- chat nuevo;
- chat existente;
- número guardado/no guardado;
- reconexión de instancia;
- reinicio de Evolution;
- imagen no disponible;
- producto agotado;
- precio modificado;
- click duplicado.

---

## 14. Diseño recomendado para venta

Para el restaurante:

### Card 1

```text
🍗 FRANGO ASSADO
Frango Assado Inteiro

Frango bem temperado, assado lentamente até ficar douradinho e suculento.

R$ 39,90

🛒 Adicionar ao pedido
👀 Ver detalhes
```

### Card 2

```text
🥩 COSTELA ASSADA
Costela Assada

Costela macia e suculenta, assada lentamente e com aquele sabor especial de domingo.

Aproximadamente 1 kg

R$ 59,90

🛒 Adicionar ao pedido
👀 Ver detalhes
```

### Card 3

```text
🔥 COMBO FAMÍLIA

1 Frango Assado
Farofa
Maionese
Refrigerante

R$ 69,90

🛒 Quero esse combo
```

---

## 15. Arquitectura de carpetas sugerida

```text
src/
  modules/
    whatsapp/
      domain/
        normalized-message.ts
      application/
        send-catalog.use-case.ts
        handle-interactive-action.use-case.ts
      infrastructure/
        evolution/
          evolution.client.ts
          evolution-carousel.gateway.ts
          evolution-buttons.gateway.ts
          evolution-webhook.normalizer.ts
      api/
        evolution-webhook.route.ts

    catalog/
      catalog.service.ts
      catalog.repository.ts

    cart/
      cart.service.ts
      cart.repository.ts

    orders/
      order.service.ts
```

---

## 16. Criterios de aceptación

La tarea se considera terminada cuando:

- el número normal se conecta por QR;
- el CRM no depende de Cloud API;
- el bot puede enviar `🔥 O que vai querer hoje?`;
- muestra los tres productos;
- las fotos se visualizan;
- el precio se ve claramente;
- cada acción lleva un ID interno estable;
- `Adicionar ao pedido` modifica el carrito;
- `Ver detalhes` devuelve información del producto;
- el combo se añade correctamente;
- clicks duplicados son idempotentes;
- el CRM recibe el evento por webhook;
- existe fallback si carrusel/botones no funcionan;
- Android + iOS + Web han sido probados;
- la versión de Evolution está fijada y no usa `latest`.

---

## 17. Fuentes verificadas durante la preparación

Evolution Foundation — repositorio principal:
https://github.com/evolution-foundation/evolution-api

Documentación actual:
https://docs.evolutionfoundation.com.br/evolution-api

Releases:
https://github.com/evolution-foundation/evolution-api/releases

Issue v2.3.7 Buttons/Lists:
https://github.com/evolution-foundation/evolution-api/issues/2390

Release 2.4.0-rc2:
https://newreleases.io/project/github/evolution-foundation/evolution-api/release/2.4.0-rc2

Nota: antes de implementar, el agente debe verificar nuevamente releases y Swagger, porque el endpoint apareció inicialmente en una release candidate.
