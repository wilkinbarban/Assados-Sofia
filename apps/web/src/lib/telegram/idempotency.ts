export function deriveTelegramMessageKey(chatId: string | number, messageId: string | number): string {
  return `telegram:${String(chatId)}:${String(messageId)}`
}
