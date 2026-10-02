// Что сказать пользователю после выгрузки файла.
//
// Исход выгрузки — данные (`ReportDeliveryResult`), а не текст: экранов с кнопкой
// «выгрузить» уже два (отчёт в Excel и прайс-лист в PDF), и объяснять одно и то же
// в каждом нельзя — иначе одинаковые случаи описывались бы по-разному.
// Модуль ничего не подгружает во время работы, поэтому его можно брать в основной
// бандл: причина «ничего не произошло» объясняется одним и тем же кодом.
import type { ReportDeliveryResult } from './delivery'

export interface DeliveryText {
  // Пояснение, что произошло: показывается под кнопкой выгрузки.
  note: string
  // Ошибка: показывается вместо пояснения, когда файл отдать не удалось.
  error: string
}

// Формулировки общие для любого файла: экран подставляет имя файла, а не текст
// («Отчёт за месяц», «Прайс-лист») — так подпись не разойдётся с содержимым.
export function describeDelivery(result: ReportDeliveryResult, fileName: string): DeliveryText {
  switch (result.kind) {
    case 'native':
    case 'shared':
      return { note: 'Файл готов — выберите, куда его сохранить или отправить.', error: '' }
    case 'downloaded':
      return { note: `${fileName} скачан в «Загрузки».`, error: '' }
    case 'cancelled':
      return { note: 'Отправка отменена — можно попробовать ещё раз.', error: '' }
    case 'unsupported':
      return {
        note: '',
        error: 'В этой версии Telegram файл отдать нечем — откройте приложение в браузере.',
      }
    case 'bridge': {
      if (result.result.kind === 'opened') {
        return { note: 'Файл уходит в «Загрузки» — его можно открыть или отправить дальше.', error: '' }
      }
      if (result.result.kind === 'copied') {
        return { note: 'Ссылка на файл скопирована — откройте её в браузере, чтобы скачать.', error: '' }
      }
      return { note: '', error: 'Не удалось передать файл — попробуйте ещё раз.' }
    }
  }
}
