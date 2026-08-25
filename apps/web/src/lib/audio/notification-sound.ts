/**
 * Serviço de Alerta Sonoro e Notificações do Atendimento (Web Audio API & Web Notifications)
 * Emite sinais sonoros nítidos e distintos sem depender de arquivos de áudio externos.
 */
class NotificationSoundService {
  private audioCtx: AudioContext | null = null

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass()
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  /**
   * Sinal sonoro suave para mensagens normais de clientes (chime duplo)
   */
  public playChime() {
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return

      const now = ctx.currentTime

      // Nota 1: Ré (D5 - 587.33 Hz)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      gain1.gain.setValueAtTime(0.15, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.28)

      // Nota 2: Lá (A5 - 880.00 Hz)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880.00, now + 0.12)
      gain2.gain.setValueAtTime(0.18, now + 0.12)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.12)
      osc2.stop(now + 0.45)
    } catch (err) {
      console.warn('[NotificationSound] Áudio bloqueado ou não suportado:', err)
    }
  }

  /**
   * Alerta sonoro de ALTA PRIORIDADE (três tons ascendentes marcantes)
   * Usado para solicitações de alteração de itens, cancelamentos ou handoffs críticos.
   */
  public playPriorityAlert() {
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return

      const now = ctx.currentTime

      // Tom 1: Sol (G5 - 783.99 Hz)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'triangle'
      osc1.frequency.setValueAtTime(783.99, now)
      gain1.gain.setValueAtTime(0.22, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.20)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.20)

      // Tom 2: Si (B5 - 987.77 Hz)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(987.77, now + 0.10)
      gain2.gain.setValueAtTime(0.25, now + 0.10)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.10)
      osc2.stop(now + 0.35)

      // Tom 3: Mi agudo (E6 - 1318.51 Hz) - Enfatiza urgência
      const osc3 = ctx.createOscillator()
      const gain3 = ctx.createGain()
      osc3.type = 'sine'
      osc3.frequency.setValueAtTime(1318.51, now + 0.22)
      gain3.gain.setValueAtTime(0.28, now + 0.22)
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.55)
      osc3.connect(gain3)
      gain3.connect(ctx.destination)
      osc3.start(now + 0.22)
      osc3.stop(now + 0.55)
    } catch (err) {
      console.warn('[NotificationSound] Áudio de prioridade bloqueado:', err)
    }
  }

  /**
   * Alerta sonoro para novo pedido realizado pelo cliente
   */
  public playNewOrderAlert() {
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return

      const now = ctx.currentTime

      const notas = [523.25, 659.25, 783.99, 1046.50] // Dó, Mi, Sol, Dó (C Major Fanfare)
      notas.forEach((freq, idx) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const start = now + idx * 0.08
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, start)
        gain.gain.setValueAtTime(0.18, start)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.25)
      })
    } catch (err) {
      console.warn('[NotificationSound] Áudio de novo pedido bloqueado:', err)
    }
  }

  /**
   * Dispara notificação nativa do navegador (Desktop / Push local) caso permitido
   */
  public showDesktopNotification(titulo: string, opcoes?: NotificationOptions) {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'granted') {
      try {
        new Notification(titulo, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...opcoes,
        })
      } catch (e) {
        console.warn('[NotificationSound] Erro ao disparar notificação desktop:', e)
      }
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }
}

export const notificationSound = new NotificationSoundService()
