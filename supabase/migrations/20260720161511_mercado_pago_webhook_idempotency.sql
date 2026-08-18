alter table public.pedidos
  add column if not exists mercado_pago_pagamento_id text;

create unique index if not exists pedidos_mercado_pago_pagamento_id_key
  on public.pedidos (mercado_pago_pagamento_id)
  where mercado_pago_pagamento_id is not null;
