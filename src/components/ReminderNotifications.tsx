// Системные напоминания: компонент без разметки — он следит за базой и пересобирает
// расписание уведомлений в системе (см. notifications/reminders.ts).
//
// Синхронизация идёт после каждого изменения данных (создали напоминание, перенесли срок,
// отметили выполненным) и при возвращении в приложение: пока оно было свёрнуто, срок
// мог наступить. В браузере и в мини-приложении Telegram компонент ничего не делает.
import { useCallback, useEffect } from 'react'
import { App } from '@capacitor/app'
import {
  reminderNotificationsSupported,
  syncReminderNotifications,
} from '../notifications/reminders'
import { useData } from '../state/DataContext'

export function ReminderNotifications() {
  const { db, version } = useData()

  // db — один и тот же объект на всё приложение, поэтому функция синхронизации живёт
  // без пересоздания, а обновление запускает версия данных.
  const sync = useCallback(() => {
    void syncReminderNotifications({
      entries: db.getReminders(),
      clientName: (id) => (id ? db.getClient(id)?.name : undefined),
    })
  }, [db])

  useEffect(() => {
    sync()
  }, [sync, version])

  useEffect(() => {
    if (!reminderNotificationsSupported()) return
    // Возврат в приложение: срок мог наступить, пока оно было свёрнуто, поэтому
    // расписание пересобирается — просроченные напоминания из системы уходят,
    // а будущие остаются на месте.
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) sync()
    })
    return () => {
      void listener.then((handle) => handle.remove())
    }
  }, [sync])

  return null
}
