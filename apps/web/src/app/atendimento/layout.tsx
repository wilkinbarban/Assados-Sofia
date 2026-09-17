import type { Metadata } from 'next'
import React from 'react'
import InactivityLogout from '@/components/operator/InactivityLogout'

export const metadata: Metadata = {
  title: 'Painel de Atendimento',
}

export default function AtendimentoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <InactivityLogout />
      {children}
    </>
  )
}
