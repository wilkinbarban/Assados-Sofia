# Proposal: AI Business Router com OmniRoute (3 Níveis de Inteligência para Sofía)

## 1. Contexto e Motivação
Atualmente, o CRM da Casa de Assados Sofia invoca chamadas LLM de forma direta via OpenRouter/DeepSeek usando um modelo estático configurado no sistema. Embora funcional, essa abordagem acopla a lógica comercial a fornecedores específicos e impede a otimização de custo/qualidade conforme o valor da mensagem do cliente (ex.: responder uma pergunta repetitiva de horário custa o mesmo que negociar um evento corporativo de R$ 1.500,00).

O **OmniRoute** já se encontra instalado no mesmo VPS (`http://127.0.0.1:20128`). Esta proposta desacopla o CRM dos fornecedores de IA através de 3 níveis de negócio (*Economy*, *Smart*, *Frontier*), mantendo total compatibilidade com WhatsApp, Telegram e Web.

## 2. Objetivos de Negócio
1. **Redução de Custo e Latência**: ~80% das interações (horários, localização, cardápio) serão tratadas pelo tier `business-economy` com respostas ultrarrápidas e custo mínimo.
2. **Máxima Eficácia em Vendas**: Dúvidas sobre rendimento de carne por pessoa, cálculo de porções e objeções comerciais são tratadas pelo tier `business-smart`.
3. **Alto Nível para Encomendas Grandes**: Eventos acima de 30 pessoas e pedidos corporativos são tratados pelo tier `business-frontier`.
4. **Resiliência e Zero Downtime**: Fallback automático e transparente para a integração legacy via feature flag (`AI_ROUTING_V2_ENABLED`).

## 3. Não-Objetivos
- Não alterar contratos de webhooks públicos (Evolution API, Telegram, Mercado Pago).
- Não alterar a persona nem os prompts de base da Chef Sofía.
- Não expor credenciais de gestão do OmniRoute na internet.
