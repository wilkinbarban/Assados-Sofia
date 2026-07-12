import React from 'react'
import InactivityLogout from '@/components/operator/InactivityLogout'

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
