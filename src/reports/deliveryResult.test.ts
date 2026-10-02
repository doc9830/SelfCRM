// Что пользователь читает после выгрузки файла: у каждого исхода своё объяснение.
import { describe, expect, it } from 'vitest'
import { describeDelivery } from './deliveryResult'

const FILE = 'SelfCRM_Прайс-лист_2026-10-02.pdf'

describe('Пояснение после выгрузки файла', () => {
  it('на телефоне файл уходит системным меню', () => {
    expect(describeDelivery({ kind: 'native' }, FILE)).toEqual({
      note: 'Файл готов — выберите, куда его сохранить или отправить.',
      error: '',
    })
    expect(describeDelivery({ kind: 'shared' }, FILE).note).toBe(
      'Файл готов — выберите, куда его сохранить или отправить.',
    )
  })

  it('в браузере называет скачанный файл', () => {
    expect(describeDelivery({ kind: 'downloaded' }, FILE).note).toBe(
      `${FILE} скачан в «Загрузки».`,
    )
  })

  it('отмена системного меню — не ошибка', () => {
    const text = describeDelivery({ kind: 'cancelled' }, FILE)
    expect(text.note).toBe('Отправка отменена — можно попробовать ещё раз.')
    expect(text.error).toBe('')
  })

  it('в Telegram без моста честно говорит, что отдать файл нечем', () => {
    const text = describeDelivery({ kind: 'unsupported' }, FILE)
    expect(text.error).toContain('файл отдать нечем')
  })

  it('объясняет исход доставки через мост', () => {
    expect(describeDelivery({ kind: 'bridge', result: { kind: 'opened', url: 'u' } }, FILE).note).toContain(
      'уходит в «Загрузки»',
    )
    expect(describeDelivery({ kind: 'bridge', result: { kind: 'copied', url: 'u' } }, FILE).note).toContain(
      'Ссылка на файл скопирована',
    )
    expect(
      describeDelivery({ kind: 'bridge', result: { kind: 'failed', url: null } }, FILE).error,
    ).toContain('Не удалось передать файл')
  })
})
