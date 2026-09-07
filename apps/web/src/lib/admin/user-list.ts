export interface AdminProfile {
  id: string
  [key: string]: unknown
}

export interface AdminAuthUser {
  id: string
  email?: string | null
  phone?: string | null
}

export interface AdminClientContact {
  id: string
  usuario_id?: string | null
  telefone?: string | null
}

export function consolidateAdminUsers<T extends AdminProfile>(
  profiles: T[],
  authUsers: AdminAuthUser[],
  clients: AdminClientContact[],
) {
  const authById = new Map(authUsers.map((user) => [user.id, user]))
  const clientByUserId = new Map(
    clients.filter((client) => client.usuario_id).map((client) => [client.usuario_id!, client])
  )
  const clientById = new Map(clients.map((client) => [client.id, client]))

  return profiles.map((profile) => {
    const authUser = authById.get(profile.id)
    const client = clientByUserId.get(profile.id) || clientById.get(profile.id)
    return {
      ...profile,
      email: authUser?.email || (profile as any).email || null,
      telefone: authUser?.phone || client?.telefone || (profile as any).telefone || null,
    }
  })
}
