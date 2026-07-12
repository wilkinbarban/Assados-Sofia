import { z } from 'zod';

export const novaMensagemSchema = z
  .object({
    conteudo: z.string().nullable().optional(),
    url_anexo: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      const conteudoValido = typeof data.conteudo === 'string' && data.conteudo.trim().length > 0;
      const anexoValido = typeof data.url_anexo === 'string' && data.url_anexo.trim().length > 0;
      return conteudoValido || anexoValido;
    },
    {
      message: 'A mensagem deve conter texto ou um anexo.',
      path: ['conteudo'],
    }
  );

export type NovaMensagem = z.infer<typeof novaMensagemSchema>;
