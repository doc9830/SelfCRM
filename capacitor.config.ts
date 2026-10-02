import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.selfcrm',
  appName: 'SelfCRM',
  webDir: 'dist',
  plugins: {
    // Напоминания в системе: значок в строке состояния — белая буква «S» из
    // `android/app/src/main/res/drawable-*/ic_stat_selfcrm.png` (scripts/make-icons.py),
    // цвет подложки — синий лендинга.
    LocalNotifications: {
      smallIcon: 'ic_stat_selfcrm',
      iconColor: '#2563EB'
    }
  }
};

export default config;
