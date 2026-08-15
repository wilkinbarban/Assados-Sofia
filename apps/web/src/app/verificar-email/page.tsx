import React from 'react'
import VerificarEmailClient from './VerificarEmailClient'

type SearchParams = Promise<{ sucesso?: string; next?: string }>

export default async function VerificarEmailPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams

  return (
    <VerificarEmailClient sucesso={params.sucesso ?? null} next={params.next ?? null} />
  )
}
