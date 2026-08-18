# PR funcional y técnico — Sofia Atendimento + Carrinho + Pedidos + Estoque

## 0. Propósito

Este documento define una arquitectura funcional reutilizable para integrar un bot de ventas llamado **Sofia** con WhatsApp mediante Evolution API dentro de un CRM.

El diseño NO depende de un framework, lenguaje, base de datos ni frontend concreto. Puede adaptarse a Next.js, React, Vue, Angular, Laravel, Django, FastAPI, NestJS, Spring, .NET o cualquier CRM que disponga de backend, persistencia de datos y control de acceso.

El objetivo es que WhatsApp sea solamente un **canal de entrada y salida**, mientras el CRM conserva la autoridad sobre:

- clientes;
- sesiones de atendimento;
- carrito;
- catálogo;
- precios;
- estoque;
- reservas;
- pedidos;
- pagos;
- recibos;
- auditoría;
- permisos;
- historial del cliente.

Los roles considerados son:

- **Administrador**
- **Supervisor**
- **Atendente**
- **Cliente**

---

# 1. Principio principal de arquitectura

Evolution API NO debe ser el sistema de pedidos.

Evolution API debe funcionar como adaptador:

```text
WhatsApp
   ↓
Evolution API
   ↓
Webhook / Adapter
   ↓
CRM
   ├── Sofia / Atendimento
   ├── Clientes
   ├── Carrinho
   ├── Pedidos
   ├── Estoque
   ├── Pagamentos
   └── Auditoria
```

La fuente de verdad es el CRM.

Una conversación puede desaparecer o reconectarse en Evolution sin que se pierdan:

- el carrito;
- el pedido;
- las reservas;
- los movimientos de estoque;
- el historial;
- el estado del atendimento.

---

# 2. Roles y responsabilidades

## 2.1 Administrador

Tiene acceso global.

Puede:

- administrar catálogo;
- crear/editar/desactivar productos;
- modificar precios;
- administrar estoque;
- registrar entradas, ajustes y pérdidas;
- visualizar todos los atendimentos;
- intervenir cualquier conversación;
- crear, modificar, cancelar y reabrir pedidos según política;
- registrar y corregir pagos;
- emitir/reemitir recibos;
- gestionar usuarios y permisos;
- consultar auditoría;
- configurar Sofia;
- configurar Evolution API;
- ver métricas y reportes;
- realizar ajustes excepcionales con motivo obligatorio.

No debería borrar transacciones históricas. Debe realizar ajustes auditables.

---

## 2.2 Supervisor

Responsable del control operacional.

Puede:

- ver todos los atendimentos del turno;
- tomar o reasignar conversaciones;
- supervisar atendentes;
- aprobar excepciones;
- corregir pedidos antes de finalizar;
- cancelar pedidos según política;
- liberar reservas;
- consultar estoque;
- registrar pérdidas operacionales;
- revisar pedidos retrasados;
- resolver conflictos de disponibilidad;
- reemitir recibos;
- consultar indicadores operacionales.

No debería:

- cambiar permisos administrativos;
- alterar configuración sensible de Evolution;
- eliminar auditoría;
- modificar datos estructurales críticos sin autorización.

---

## 2.3 Atendente

Trabaja directamente con el cliente.

Puede:

- recibir conversaciones transferidas por Sofia;
- abrir ficha del cliente;
- visualizar el carrito activo;
- añadir/quitar productos;
- cambiar cantidades;
- aplicar observaciones permitidas;
- seleccionar retirada o delivery;
- seleccionar horario;
- convertir carrito en pedido;
- registrar pago;
- marcar pedido como entregado/retirado;
- emitir recibo;
- cancelar carrito;
- solicitar aprobación del Supervisor para excepciones.

No debería:

- alterar precios base;
- modificar estoque manualmente;
- crear movimientos arbitrarios de inventario;
- editar permisos;
- modificar configuraciones de Sofia/Evolution.

---

## 2.4 Cliente

Interactúa principalmente por WhatsApp.

Puede:

- consultar cardápio;
- ver detalles;
- añadir productos;
- cambiar cantidades;
- eliminar productos;
- visualizar carrito;
- cancelar carrito;
- elegir retirada/delivery;
- elegir horario disponible;
- confirmar pedido;
- consultar estado;
- solicitar atendimento humano;
- recibir comprobante/recibo;
- responder pós-venda.

Nunca debe poder modificar directamente:

- precios;
- estoque;
- estados internos;
- otros clientes;
- pagos internos;
- descuentos administrativos;
- reservas de terceros.

---

# 3. Atendimento: unidad central de la conversación

Crear una entidad independiente de la conversación de Evolution.

Ejemplo conceptual:

```ts
Atendimento {
  id
  clienteId
  canal: "WHATSAPP"
  instanceId
  remoteJid
  status
  mode
  assignedUserId
  cartId
  orderId?
  startedAt
  lastMessageAt
  closedAt?
}
```

Estados recomendados:

```text
BOT
AGUARDANDO_CLIENTE
AGUARDANDO_ATENDENTE
EM_ATENDIMENTO_HUMANO
AGUARDANDO_PAGAMENTO
PEDIDO_CONFIRMADO
FINALIZADO
CANCELADO
```

Modo:

```text
BOT
HUMANO
HIBRIDO
```

---

# 4. Lógica de Sofia

Sofia no debe ser propietaria del carrito.

Sofia es un actor conversacional que llama a casos de uso del CRM.

Ejemplo:

```text
Cliente:
"Quero um Clássico"

Sofia interpreta intención
        ↓
CartService.addItem()
        ↓
CRM guarda carrito
        ↓
Sofia responde usando el resultado del CRM
```

NO hacer:

```text
Sofia "recuerda" los productos solamente dentro del prompt.
```

Hacer:

```text
LLM/Bot
  ↓ tool/function
CartService
  ↓
Database
```

---

# 5. Intenciones mínimas de Sofia

Sofia debería trabajar con acciones estructuradas:

```text
SHOW_MENU
SHOW_PRODUCT
ADD_TO_CART
REMOVE_FROM_CART
CHANGE_QUANTITY
SHOW_CART
CLEAR_CART
SELECT_FULFILLMENT
SELECT_TIME_SLOT
CONFIRM_ORDER
CHECK_ORDER_STATUS
REQUEST_HUMAN
CANCEL_ORDER
HELP
```

Cada intención debe terminar llamando una función del CRM.

Ejemplos:

```ts
addItemToCart(customerId, productId, quantity)
removeItemFromCart(customerId, productId)
setItemQuantity(customerId, productId, quantity)
getActiveCart(customerId)
getAvailableSlots(date, fulfillmentType)
confirmCart(cartId, slotId)
```

Sofia nunca debe inventar la respuesta de estas funciones.

---

# 6. Identificación del cliente desde WhatsApp

Al llegar un webhook:

```text
Evolution
   ↓
remoteJid / número
   ↓
normalizador
   ↓
telefone normalizado
   ↓
CustomerResolver
```

Regla:

```text
si existe cliente → recuperar
si no existe → crear cliente mínimo
```

Ejemplo:

```ts
Customer {
  id
  name?
  phoneE164
  whatsappJid
  createdAt
}
```

El teléfono debe normalizarse a formato E.164.

No utilizar el nombre de perfil de WhatsApp como identificador único.

---

# 7. Creación del carrito

Un Cliente debería tener como máximo un carrito activo por contexto comercial.

Modelo:

```ts
Cart {
  id
  customerId
  status
  channel
  currency
  subtotal
  discount
  deliveryFee
  total
  fulfillmentType?
  slotId?
  expiresAt?
  createdAt
  updatedAt
}
```

Estados:

```text
OPEN
CHECKOUT
CONVERTED
ABANDONED
CANCELLED
EXPIRED
```

Items:

```ts
CartItem {
  id
  cartId
  productId
  quantity
  unitPriceSnapshot
  notes?
}
```

---

# 8. Regla de precios

Al añadir un producto:

```text
CRM consulta Product/Price
        ↓
valida que esté activo
        ↓
obtiene precio actual
        ↓
guarda snapshot en CartItem
```

Al confirmar el pedido:

```text
revalidar precio actual
```

Si cambió:

```text
informar al cliente
recalcular
solicitar nueva confirmación
```

Nunca aceptar un precio enviado desde WhatsApp como fuente de verdad.

---

# 9. Carrito en el Dashboard de Atendimento

El Dashboard debería mostrar una vista operacional:

```text
┌──────────────────────────────────────────────┐
│ João Silva                      WhatsApp     │
│ Sofia: BOT                                   │
│ Carrinho: ABERTO                             │
│                                              │
│ 1x O Clássico da Sofia          R$ 69,90    │
│ 1x Costela Suprema             R$ 119,90    │
│                                              │
│ Subtotal                       R$ 189,80     │
│                                              │
│ [Editar carrinho] [Assumir atendimento]      │
│ [Converter em pedido]                       │
└──────────────────────────────────────────────┘
```

El carrito que Sofia modifica debe ser exactamente el mismo que visualiza el Atendente.

No crear un "carrito del bot" y un "carrito del dashboard".

---

# 10. Trabajo híbrido Sofia ↔ Atendente

## Bot atendiendo

```text
Atendimento.mode = BOT
```

Sofia responde automáticamente.

## Cliente pide humano

```text
REQUEST_HUMAN
        ↓
Atendimento.status = AGUARDANDO_ATENDENTE
        ↓
entra en fila
```

El Atendente pulsa:

```text
Assumir atendimento
```

Resultado:

```text
mode = HUMANO
assignedUserId = atendente
```

Sofia deja de responder mensajes comerciales automáticamente.

---

# 11. Devolver conversación a Sofia

El Atendente puede finalizar intervención:

```text
[Devolver para Sofia]
```

Antes:

- guardar modificaciones;
- verificar que no haya operación pendiente;
- actualizar carrito;
- registrar evento de auditoría.

Después:

```text
mode = BOT
```

Sofia recibe nuevamente contexto estructurado desde el CRM.

---

# 12. Catálogo y disponibilidad

Modelo mínimo:

```ts
Product {
  id
  sku
  name
  description
  active
  sellable
  price
  imageUrl
  stockMode
}
```

No mostrar:

```text
active = false
sellable = false
```

Sofia debe consultar disponibilidad antes de ofrecer un producto.

---

# 13. Estoque: separar producto vendible e insumos

Para un CRM de alimentos se recomienda soportar dos niveles:

```text
PRODUCTO/COMBO
        ↓ receta/BOM
INSUMOS
```

Ejemplo:

```text
O Clássico da Sofia

1 x frango recheado
250 g farofa
300 g maionese
1 x embalagem
1 x sacola
```

Esto permite que vender un combo consuma insumos reales.

---

# 14. Ficha técnica / BOM

Modelo conceptual:

```ts
Recipe {
  productId
}

RecipeItem {
  productId
  stockItemId
  quantity
  unit
}
```

Ejemplo:

```text
Product: classico-sofia

FRANGO_ASSADO       1 un
FAROFA            250 g
MAIONESE          300 g
EMBALAGEM           1 un
SACOLA              1 un
```

---

# 15. Modelo de estoque

```ts
StockItem {
  id
  sku
  name
  unit
  onHand
  reserved
  available
  minimumLevel
}
```

Fórmula:

```text
available = onHand - reserved
```

No mantener `available` duplicado si puede calcularse de forma segura.

---

# 16. Movimientos de estoque

Nunca limitarse a:

```sql
UPDATE estoque SET quantidade = quantidade - 1
```

Registrar movimientos:

```ts
StockMovement {
  id
  stockItemId
  type
  quantity
  referenceType
  referenceId
  reason
  userId?
  createdAt
}
```

Tipos:

```text
PURCHASE_IN
RESERVATION
RESERVATION_RELEASE
SALE_OUT
WASTE_OUT
MANUAL_ADJUSTMENT_IN
MANUAL_ADJUSTMENT_OUT
RETURN_IN
```

---

# 17. Cuándo tocar el estoque

## Carrito OPEN

```text
NO reservar
NO descontar
```

Razón: un cliente puede abandonar WhatsApp.

## Checkout opcional

Puede utilizarse una reserva temporal corta si el negocio sufre alta concurrencia.

## Pedido CONFIRMADO

```text
reservar estoque
```

Ejemplo:

```text
onHand = 20
reserved = 7
available = 13
```

## Pedido FINALIZADO/ENTREGADO

```text
reserved ↓
onHand ↓
SALE_OUT registrado
```

---

# 18. Conversión de carrito a pedido

Caso de uso central:

```ts
confirmCart(cartId)
```

Debe ejecutarse como operación atómica/transacción.

Secuencia:

```text
1. cargar carrito OPEN
2. verificar cliente
3. verificar items
4. revalidar productos activos
5. revalidar precios
6. calcular total
7. verificar disponibilidade
8. verificar slot
9. verificar estoque
10. crear Order
11. crear OrderItems con snapshots
12. reservar estoque
13. reservar slot
14. marcar Cart = CONVERTED
15. asociar atendimento → orderId
16. emitir evento ORDER_CONFIRMED
```

Si falla cualquiera de los pasos críticos:

```text
rollback
```

No debe existir un pedido confirmado sin su reserva correspondiente.

---

# 19. Pedido

Modelo conceptual:

```ts
Order {
  id
  orderNumber
  customerId
  sourceChannel
  sourceCartId
  fulfillmentType
  slotId?
  status
  paymentStatus
  subtotal
  discount
  deliveryFee
  total
  createdAt
  confirmedAt?
  completedAt?
}
```

Items:

```ts
OrderItem {
  id
  orderId
  productId
  skuSnapshot
  nameSnapshot
  priceSnapshot
  quantity
  total
  notes?
}
```

Snapshots garantizan integridad histórica.

---

# 20. Estados del pedido

Recomendado:

```text
DRAFT
CONFIRMED
IN_PREPARATION
READY
OUT_FOR_DELIVERY
AWAITING_PICKUP
COMPLETED
CANCELLED
```

No todos son obligatorios.

Para retirada:

```text
CONFIRMED
→ IN_PREPARATION
→ READY
→ AWAITING_PICKUP
→ COMPLETED
```

Para delivery:

```text
CONFIRMED
→ IN_PREPARATION
→ READY
→ OUT_FOR_DELIVERY
→ COMPLETED
```

---

# 21. Dashboard de Atendimento

Columnas sugeridas:

```text
NOVOS
SOFIA
AGUARDANDO HUMANO
EM ATENDIMENTO
CHECKOUT
PEDIDOS CONFIRMADOS
PRONTOS
FINALIZADOS
```

Un card puede mostrar:

```text
Cliente
WhatsApp
última mensagem
modo BOT/HUMANO
valor carrinho
pedido
slot
tempo de espera
responsável
```

---

# 22. Permisos del carrito

## Cliente vía Sofia

Puede:

```text
ADD
REMOVE
CHANGE_QUANTITY
VIEW
CLEAR
```

Hasta la confirmación.

## Atendente

Puede realizar lo mismo en nombre del cliente.

Toda modificación manual debe guardar:

```text
actorType = USER
actorUserId
```

## Supervisor

Puede además aprobar:

```text
override de disponibilidad
cancelación excepcional
corrección autorizada
```

## Administrador

Control total auditado.

---

# 23. Auditoría

Registrar eventos:

```ts
AuditEvent {
  actorType
  actorId?
  action
  entityType
  entityId
  before?
  after?
  reason?
  createdAt
}
```

Ejemplos:

```text
SOFIA_ADD_CART_ITEM
ATTENDANT_REMOVE_CART_ITEM
SUPERVISOR_CANCEL_ORDER
ADMIN_STOCK_ADJUSTMENT
PAYMENT_REGISTERED
RECEIPT_ISSUED
```

---

# 24. Pago

Separar:

```text
Order.status
Payment.status
```

Nunca usar solamente:

```text
pedido = pago
```

Modelo:

```ts
Payment {
  id
  orderId
  method
  amount
  status
  externalReference?
  paidAt?
}
```

Estados:

```text
PENDING
PAID
FAILED
CANCELLED
REFUNDED
```

Métodos:

```text
PIX
CASH
DEBIT
CREDIT
OTHER
```

---

# 25. Finalización y baja del pedido

Acción:

```text
FINALIZAR PEDIDO
```

Debe comprobar:

```text
pedido existe
status permitido
pagamento válido según política
estoque reservado
```

Luego, dentro de una transacción:

```text
1. convertir reserva de estoque en SALE_OUT
2. actualizar cantidades
3. cerrar reserva del slot
4. Order.status = COMPLETED
5. completar atendimento
6. registrar fecha/hora
7. generar datos del recibo
8. emitir eventos
```

---

# 26. Recibo

El recibo debe generarse desde el snapshot del pedido.

No desde el catálogo actual.

Campos:

```text
empresa
número pedido
fecha/hora
cliente opcional
items
cantidades
precios
subtotal
descuento
delivery
total
forma de pagamento
atendente
```

Puede tener:

```text
PDF
HTML imprimible
térmica 80 mm
mensaje WhatsApp
```

La emisión debe quedar registrada.

---

# 27. Envío del recibo por WhatsApp

Después de completar:

```text
CRM
 ↓
ReceiptService
 ↓
MessagingGateway
 ↓
Evolution API
 ↓
WhatsApp
```

Sofia puede decir:

```text
✅ Pedido finalizado!
Obrigado pela preferência ❤️
Segue seu comprovante.
```

---

# 28. Cancelación

## Carrito

```text
OPEN → CANCELLED
```

Sin impacto de estoque.

## Pedido confirmado antes de producción

```text
CONFIRMED → CANCELLED
```

Acciones:

```text
liberar estoque reservado
liberar slot
registrar motivo
```

## Pedido ya producido

Debe existir una política.

Ejemplo:

```text
CANCELLED_AFTER_PRODUCTION
```

El Supervisor decide:

```text
retornar como produto disponível
registrar perda
reaproveitamento permitido
```

Nunca devolver automáticamente insumos consumidos físicamente al estoque.

---

# 29. Idempotencia de webhooks

Evolution puede reenviar eventos.

Cada webhook debe tener una clave idempotente.

Ejemplo:

```text
instance + messageId + eventType
```

Guardar:

```ts
ProcessedWebhook {
  idempotencyKey
  processedAt
}
```

Si llega otra vez:

```text
ignorar
```

Esto evita:

```text
dos clicks
dos productos
dos pedidos
dos cobros
```

---

# 30. Normalizador de Evolution

Crear una frontera:

```ts
EvolutionWebhook
      ↓
normalize()
      ↓
InboundMessage
```

Modelo interno:

```ts
InboundMessage {
  messageId
  instanceId
  phone
  remoteJid
  type
  text?
  interactiveId?
  timestamp
  raw
}
```

El resto del CRM no debería leer estructuras internas de Baileys/Evolution.

---

# 31. IDs interactivos

Ejemplo:

```text
catalog:show
product:view:classico-sofia
cart:add:classico-sofia
cart:remove:classico-sofia
cart:view
cart:checkout
order:confirm
human:request
```

Sofia/router:

```text
interactiveId
   ↓
ActionRouter
   ↓
UseCase
```

No interpretar el texto visual del botón.

---

# 32. Contexto conversacional

Sofia puede utilizar contexto humano:

```text
nome
último pedido
preferencias
```

Pero la información comercial debe obtenerse en tiempo real.

Ejemplo incorrecto:

```text
"Creo que el carrito tiene dos frangos."
```

Correcto:

```text
getCart(customerId)
```

---

# 33. Herramientas recomendadas para Sofia

Exponer funciones internas:

```text
get_customer
get_catalog
get_product
get_cart
add_to_cart
remove_from_cart
change_quantity
clear_cart
get_available_slots
select_fulfillment
select_slot
confirm_order
get_order
cancel_order_request
request_human
```

Sofia únicamente puede actuar mediante estas herramientas para operaciones de negocio.

---

# 34. Reglas anti-alucinación

Sofia nunca puede inventar:

- producto;
- disponibilidad;
- precio;
- promoción;
- estoque;
- horario;
- valor total;
- estado del pedido;
- pago.

Toda respuesta de ese tipo debe venir de una función del CRM.

---

# 35. Eventos internos

Se recomienda arquitectura por eventos, aunque se implemente inicialmente de forma simple.

Eventos:

```text
CART_CREATED
CART_UPDATED
CHECKOUT_STARTED
ORDER_CONFIRMED
STOCK_RESERVED
ORDER_IN_PREPARATION
ORDER_READY
PAYMENT_PAID
ORDER_COMPLETED
ORDER_CANCELLED
STOCK_RELEASED
RECEIPT_ISSUED
HUMAN_REQUESTED
ATTENDANT_ASSIGNED
```

Esto facilita futuras integraciones.

---

# 36. Ejemplo completo

```text
1. João escribe "Oi"
2. Evolution envía webhook
3. CRM identifica cliente
4. crea Atendimento BOT
5. Sofia muestra menú
6. João pulsa O Clássico
7. CRM crea Cart OPEN
8. CartService añade producto
9. Dashboard refleja cambio inmediatamente
10. João añade Costela
11. Sofia muestra carrito
12. João elige retirada
13. CRM consulta slots
14. João elige 12:15
15. Sofia solicita confirmación
16. João confirma
17. CRM revalida precio + estoque + slot
18. crea Order CONFIRMED
19. reserva estoque
20. reserva slot
21. Cart → CONVERTED
22. pedido aparece en Dashboard
23. Atendente/Supervisor gestiona operación
24. pedido → IN_PREPARATION
25. pedido → READY
26. Sofia avisa al cliente
27. Atendente registra PIX
28. Payment → PAID
29. Atendente pulsa Finalizar
30. CRM genera SALE_OUT
31. estoque se descuenta definitivamente
32. Order → COMPLETED
33. recibo generado
34. Evolution envía recibo
35. Atendimento → FINALIZADO
36. CRM conserva historial para fidelización
```

---

# 37. Esquema relacional mínimo

```text
customers
users
roles
attendances
products
product_prices
recipes
recipe_items
stock_items
stock_movements
carts
cart_items
orders
order_items
payments
receipts
time_slots
audit_events
processed_webhooks
```

Puede adaptarse a una base ya existente.

---

# 38. MVP recomendado

Como el carrito todavía no está implementado, desarrollar en este orden:

```text
FASE 1
Cart + CartItem

FASE 2
Integración Cart ↔ Product

FASE 3
Dashboard de Atendimento mostrando carrito

FASE 4
Sofia tools para carrito

FASE 5
Order + OrderItem

FASE 6
confirmCart() transaccional

FASE 7
StockItem + StockMovement

FASE 8
Recipe/BOM + reserva de estoque

FASE 9
Payment

FASE 10
Finalización + recibo

FASE 11
Roles/permisos completos

FASE 12
Auditoría + idempotencia + fallbacks
```

No comenzar por automatizar Sofia antes de tener CartService estable.

---

# 39. Contratos de servicio sugeridos

```ts
interface CartService {
  getOrCreateActiveCart(customerId: string): Promise<Cart>;
  getCart(cartId: string): Promise<Cart>;
  addItem(cartId: string, productId: string, quantity: number): Promise<Cart>;
  removeItem(cartId: string, productId: string): Promise<Cart>;
  changeQuantity(cartId: string, productId: string, quantity: number): Promise<Cart>;
  clear(cartId: string): Promise<Cart>;
}

interface CheckoutService {
  validate(cartId: string): Promise<CheckoutValidation>;
  confirm(cartId: string, options: ConfirmCartOptions): Promise<Order>;
}

interface InventoryService {
  checkAvailability(items: CheckoutItem[]): Promise<InventoryValidation>;
  reserveForOrder(orderId: string): Promise<void>;
  releaseForOrder(orderId: string): Promise<void>;
  consumeForOrder(orderId: string): Promise<void>;
}

interface OrderService {
  get(orderId: string): Promise<Order>;
  changeStatus(orderId: string, status: OrderStatus): Promise<Order>;
  cancel(orderId: string, actor: Actor, reason: string): Promise<Order>;
}

interface ReceiptService {
  issue(orderId: string): Promise<Receipt>;
}
```

---

# 40. Invariantes del sistema

El agente debe preservar estas reglas:

1. Un carrito OPEN no descuenta estoque.
2. Un pedido confirmado debe tener disponibilidad validada.
3. Un pedido confirmado reserva estoque.
4. Un pedido completado consume la reserva y genera salida.
5. Un pedido cancelado antes de consumo libera la reserva.
6. El precio histórico de un pedido nunca depende del catálogo actual.
7. Sofia y Atendente operan sobre el mismo carrito.
8. Evolution no es fuente de verdad.
9. Webhooks son idempotentes.
10. Toda acción sensible es auditada.
11. Atendente no puede alterar estoque directamente.
12. Supervisor controla excepciones operacionales.
13. Administrador conserva control global.
14. Cliente solamente actúa dentro de su propia sesión y pedido.
15. Las operaciones críticas deben ser transaccionales.

---

# 41. Adaptación a cualquier CRM

Antes de implementar, el agente debe mapear:

```text
CONCEPTO DE ESTE PR → ENTIDAD EXISTENTE DEL CRM
```

Ejemplo:

```text
Customer      → Cliente existente
User          → Usuario/Empleado existente
Product       → Produto existente
Attendance    → Conversa/Ticket existente
Cart          → crear si no existe
Order         → Pedido/Venda existente
StockItem     → Estoque/Insumo existente
```

No duplicar entidades existentes innecesariamente.

Si el CRM ya dispone de pedidos o estoque:

```text
adaptar contratos
no reemplazar módulos funcionales
```

---

# 42. Auditoría previa obligatoria para el agente

Antes de modificar código:

- identificar stack;
- localizar modelo de usuarios/roles;
- localizar clientes;
- localizar catálogo;
- localizar pedidos;
- localizar estoque;
- localizar Evolution API;
- localizar webhooks;
- localizar Dashboard de Atendimento;
- localizar sistema de permisos;
- identificar qué existe y qué falta.

Entregar primero:

```text
1. mapa de arquitectura actual
2. componentes reutilizables
3. componentes faltantes
4. migraciones necesarias
5. riesgos
6. plan de archivos
```

Después implementar.

---

# 43. Criterios de aceptación del MVP

El MVP estará listo cuando:

- Cliente escribe por WhatsApp.
- CRM identifica/crea Cliente.
- Se crea Atendimento.
- Sofia puede consultar catálogo.
- Cliente añade producto.
- Se crea Cart persistente.
- Cart aparece en Dashboard.
- Atendente puede modificar el mismo Cart.
- Cliente puede visualizarlo desde WhatsApp.
- Cart puede convertirse en Order.
- Confirmación valida disponibilidad.
- Order reserva estoque.
- Cancelación libera reserva.
- Atendente registra pago.
- Finalización consume estoque.
- Se genera recibo.
- Recibo puede enviarse por WhatsApp.
- Roles se respetan.
- Webhooks duplicados no duplican operaciones.
- Todo queda auditado.

---

# 44. Resultado esperado

La experiencia debe sentirse como un único sistema:

```text
WHATSAPP
   ↓
SOFIA
   ↓
CARRINHO
   ↓
PEDIDO
   ↓
ESTOQUE
   ↓
PAGAMENTO
   ↓
RECIBO
   ↓
HISTÓRICO CRM
```

Sofia es la interfaz conversacional.

El Dashboard es la interfaz operacional de Administrador, Supervisor y Atendente.

El CRM es la fuente de verdad.

Evolution API es únicamente el canal de comunicación.
