export interface CalendarConfig {
  googleCalendarId: string | null
  googleClientEmail: string | null
  googlePrivateKeyConfigured: boolean
}

export interface IntegrationCardProps {
  initialConfigs: Record<string, string>
  showToast: (type: 'success' | 'error', msg: string) => void
}

export interface CalendarCardProps extends IntegrationCardProps {
  calendarConfig: CalendarConfig
}

export interface EvolutionCardProps extends IntegrationCardProps {
  provedorAtivo: 'meta' | 'evolution'
  onProvedorChange: (provider: 'meta' | 'evolution') => void
}
