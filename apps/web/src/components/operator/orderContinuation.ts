export type OrderStatus = "novo" | "confirmado" | "entregue" | "cancelado";
export type PaymentStatus =
  "pendente" | "aprovado" | "rejeitado" | "reembolsado";
export type OrderAction =
  | "confirmar"
  | "entregar"
  | "cancelar"
  | "aprovar_pagamento"
  | "gerar_pagamento";

export interface OrderContinuationModel {
  actions: OrderAction[];
  message: string;
}

export function getOrderContinuation({
  status,
  status_pagamento: paymentStatus,
}: {
  status: OrderStatus;
  status_pagamento: PaymentStatus;
}): OrderContinuationModel {
  if (status === "cancelado") {
    return {
      actions: [],
      message: "Pedido cancelado. Nenhuma ação adicional está disponível.",
    };
  }

  const lifecycleActions: OrderAction[] =
    status === "novo"
      ? ["confirmar", "cancelar"]
      : status === "confirmado"
        ? ["entregar", "cancelar"]
        : [];

  const paymentActions: OrderAction[] =
    paymentStatus === "pendente"
      ? ["aprovar_pagamento", "gerar_pagamento"]
      : [];

  if (status === "entregue" && paymentStatus === "aprovado") {
    return {
      actions: [],
      message: "Pedido entregue e pagamento aprovado. Pronto para comprovante.",
    };
  }

  if (paymentStatus === "pendente") {
    return {
      actions: [...lifecycleActions, ...paymentActions],
      message:
        "Pagamento pendente. Registre a aprovação manual com um motivo ou gere um link de pagamento.",
    };
  }

  if (status === "entregue") {
    return {
      actions: paymentActions,
      message:
        "Pedido entregue. Aguarde a regularização do pagamento antes de emitir comprovante.",
    };
  }

  return {
    actions: lifecycleActions,
    message: "Siga a próxima etapa válida do ciclo do pedido.",
  };
}
