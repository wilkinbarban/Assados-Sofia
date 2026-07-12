This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Configuração Manual do Supabase Cloud (Homologação)

Para homologar o ambiente e garantir o correto funcionamento das Server Actions, redefinições de senha e fluxos de autenticação, realize os seguintes passos no painel do Supabase:

### 1. Site URL e Redirect URLs
Acesse **Project Settings > Auth** no painel do Supabase e configure:
- **Site URL**: `http://localhost:3000` (ou a URL de produção do seu frontend)
- **Redirect URLs**: Adicione `http://localhost:3000/**` e `http://localhost:3000/auth/callback` para habilitar redirecionamentos seguros pós-redefinição de senha ou confirmação de e-mail.

### 2. Email Templates
Acesse **Authentication > Email Templates** e configure:
- **Confirm Signup**: Garanta que o template aponte para `{{ .SiteURL }}/auth/callback`.
- **Reset Password**: Garanta que o link do template de redefinição de senha utilize a variável de redirect URL adequada para guiar o operador de volta à página `/atendimento/perfil` ou `/login` com o token correspondente.
- **Change Email Address**: Garanta que o link aponte para a rota de callback para confirmar a alteração no perfil.
