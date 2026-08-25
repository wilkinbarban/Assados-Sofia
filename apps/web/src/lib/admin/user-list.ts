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
  telefone?: string | null
}

export function consolidateAdminUsers<T extends AdminProfile>(
  profiles: T[],
  authUsers: AdminAuthUser[],
  clients: AdminClientContact[],
) {
  const authById = new Map(authUsers.map((user) => [user.id, user]))
  const clientById = new Map(clients.map((client) => [client.id, client]))

  return profiles.map((profile) => {
    const authUser = authById.get(profile.id)
    const client = clientById.get(profile.id)
    return {
      ...profile,
      email: authUser?.email || null,
      telefone: authUser?.phone || client?.telefone || null,
    }
  })
}
