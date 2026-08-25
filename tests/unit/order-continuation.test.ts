import { describe, expect, it } from "vitest";
import { getOrderContinuation } from "@/components/operator/orderContinuation";

describe("getOrderContinuation", () => {
  it("offers only confirmation and cancellation for a new unpaid order", () => {
    expect(
      getOrderContinuation({ status: "novo", status_pagamento: "pendente" })
        .actions,
    ).toEqual([
      "confirmar",
      "cancelar",
      "aprovar_pagamento",
      "gerar_pagamento",
    ]);
  });

  it("keeps delivery and payment approval independent for a confirmed unpaid order", () => {
    const model = getOrderContinuation({
      status: "confirmado",
      status_pagamento: "pendente",
    });

    expect(model.actions).toEqual([
      "entregar",
      "cancelar",
      "aprovar_pagamento",
      "gerar_pagamento",
    ]);
    expect(model.message).toContain("Pagamento pendente");
  });

  it("explains the next payment continuation after delivery instead of exposing invalid lifecycle actions", () => {
    const model = getOrderContinuation({
      status: "entregue",
      status_pagamento: "pendente",
    });

    expect(model.actions).toEqual(["aprovar_pagamento", "gerar_pagamento"]);
    expect(model.message).toContain("Pagamento pendente");
  });

  it("has no mutation action for a cancelled or fully eligible order", () => {
    expect(
      getOrderContinuation({
        status: "cancelado",
        status_pagamento: "pendente",
      }).actions,
    ).toEqual([]);
    expect(
      getOrderContinuation({ status: "entregue", status_pagamento: "aprovado" })
        .actions,
    ).toEqual([]);
  });
});
