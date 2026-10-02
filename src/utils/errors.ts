// Сообщение об ошибке для пользователя.
//
// Библиотеки и сеть отвечают техническим текстом («Failed to fetch»), который ничего
// не объясняет, поэтому наружу отдаются только свои сообщения — они написаны
// по-русски и говорят, что делать. Всё остальное заменяется понятной фразой.
export function humanErrorMessage(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : ''
  return /[А-Яа-я]/.test(text) ? text : fallback
}
