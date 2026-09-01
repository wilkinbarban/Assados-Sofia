import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export const metadata: Metadata = {
  metadataBase: new URL('https://casadeasados.duckdns.org'),
  title: {
    default: 'Casa de Assados Brasa & Sabor | O Verdadeiro Sabor do Domingo',
    template: '%s | Casa de Assados Brasa & Sabor',
  },
  description:
    'A autêntica Casa de Assados Brasa & Sabor no bairro Umbará, Curitiba - PR. Frango recheado dourado, costela no bafo por 6h, dueto especial e kit churrasco família com retirada sem filas em 15 minutos.',
  keywords: [
    'Casa de Assados Brasa & Sabor',
    'Frango Assado Curitiba',
    'Costela no Bafo Umbará',
    'Churrasco de Domingo Curitiba',
    'Assados Umbará',
    'CRM Sofia',
  ],
  authors: [{ name: 'Casa de Assados Brasa & Sabor' }],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Casa de Assados Brasa & Sabor | O Verdadeiro Sabor do Domingo',
    description:
      'Frango recheado, costela no bafo por 6h e combos completos para a sua família no Umbará, Curitiba.',
    url: 'https://casadeasados.duckdns.org',
    siteName: 'Casa de Assados Brasa & Sabor',
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: '/logo-brasa-sabor.png',
        width: 1024,
        height: 1024,
        alt: 'Casa de Assados Brasa & Sabor - Combos de Churrasco',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col font-sans bg-zinc-950 text-zinc-50 selection:bg-amber-500/30 selection:text-amber-200">
        {children}
      </body>
    </html>
  )
}
