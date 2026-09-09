type Channel = "telegram" | "whatsapp";
type AdminClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ error: unknown }>;
};

export async function attachPersistedSofiaInboundMessage(input: {
  supabase: AdminClient;
  messageId: string;
  conversationId: string;
  customerId: string;
  channel: Channel;
}): Promise<boolean> {
  try {
    const { error } = await input.supabase.rpc("attach_sofia_inbound_message", {
      p_message_id: input.messageId,
      p_conversa_id: input.conversationId,
      p_cliente_id: input.customerId,
      p_canal: input.channel,
    });
    return !error;
  } catch {
    return false;
  }
}
