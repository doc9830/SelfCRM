package com.example.selfcrm;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Скачивает APK обновления во временный каталог приложения и запускает
 * системный установщик Android. Реализован нативно, потому что у ассетов
 * GitHub нет CORS-заголовков и fetch из WebView не сработает.
 */
@CapacitorPlugin(name = "AppInstaller")
public class AppInstallerPlugin extends Plugin {

    private static final String PROGRESS_EVENT = "progress";
    private static final String APK_MIME = "application/vnd.android.package-archive";

    /** Скачивает файл во временный каталог и шлёт события "progress". */
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName");

        if (url == null || url.isEmpty() || fileName == null || fileName.isEmpty()) {
            call.reject("Не указаны url или fileName");
            return;
        }
        if (!isSafeName(fileName)) {
            call.reject("Некорректное имя файла");
            return;
        }

        getBridge()
            .execute(
                () -> {
                    HttpURLConnection connection = null;
                    try {
                        URL target = new URL(url);
                        connection = (HttpURLConnection) target.openConnection();
                        connection.setInstanceFollowRedirects(true);
                        connection.setConnectTimeout(30000);
                        connection.setReadTimeout(120000);
                        connection.setRequestProperty("Accept", APK_MIME + ", application/octet-stream, */*");
                        connection.setRequestProperty("User-Agent", "SelfCRM");
                        connection.connect();

                        int status = connection.getResponseCode();
                        if (status != HttpURLConnection.HTTP_OK) {
                            call.reject("Не удалось скачать обновление (ошибка " + status + ")");
                            return;
                        }

                        int total = connection.getContentLength();
                        File outFile = new File(getContext().getCacheDir(), fileName);

                        try (
                            InputStream in = new BufferedInputStream(connection.getInputStream());
                            OutputStream out = new FileOutputStream(outFile)
                        ) {
                            byte[] buffer = new byte[64 * 1024];
                            int read;
                            int received = 0;
                            long lastNotify = 0;
                            while ((read = in.read(buffer)) != -1) {
                                out.write(buffer, 0, read);
                                received += read;
                                long now = System.currentTimeMillis();
                                if (now - lastNotify >= 100) {
                                    lastNotify = now;
                                    notifyProgress(received, total);
                                }
                            }
                        }

                        if (total > 0 && outFile.length() != total) {
                            outFile.delete();
                            call.reject("Загрузка прервалась — попробуйте ещё раз");
                            return;
                        }
                        if (outFile.length() == 0) {
                            call.reject("Файл обновления пуст — попробуйте ещё раз");
                            return;
                        }

                        JSObject result = new JSObject();
                        result.put("path", outFile.getAbsolutePath());
                        result.put("size", outFile.length());
                        call.resolve(result);
                    } catch (Exception e) {
                        call.reject("Не удалось скачать обновление: " + e.getMessage(), e);
                    } finally {
                        if (connection != null) {
                            connection.disconnect();
                        }
                    }
                }
            );
    }

    /** Открывает скачанный APK в системном установщике. */
    @PluginMethod
    public void install(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null || fileName.isEmpty()) {
            call.reject("Не указано имя файла");
            return;
        }
        if (!isSafeName(fileName)) {
            call.reject("Некорректное имя файла");
            return;
        }

        File apk = new File(getContext().getCacheDir(), fileName);
        if (!apk.exists() || !apk.isFile() || apk.length() == 0) {
            call.reject("Файл обновления не найден — скачайте его заново");
            return;
        }

        Context context = getContext();

        // Android 8+ требует разрешение «Установка из неизвестных источников».
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!context.getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + context.getPackageName())
                );
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    context.startActivity(settings);
                } catch (Exception ignored) {
                    // Если экрана настроек нет — продолжаем, установщик сам покажет ошибку.
                }
                call.reject("Разрешите установку из неизвестных источников и нажмите «Установить» ещё раз");
                return;
            }
        }

        Uri apkUri;
        try {
            apkUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
        } catch (Exception e) {
            call.reject("Не удалось открыть файл обновления: " + e.getMessage(), e);
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, APK_MIME);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            context.startActivity(intent);
        } catch (Exception e) {
            call.reject("Не удалось запустить установщик: " + e.getMessage(), e);
            return;
        }

        JSObject result = new JSObject();
        result.put("value", true);
        call.resolve(result);
    }

    private void notifyProgress(int received, int total) {
        JSObject data = new JSObject();
        data.put("received", received);
        data.put("total", total);
        data.put("fraction", total > 0 ? (double) received / total : 0);
        notifyListeners(PROGRESS_EVENT, data);
    }

    private boolean isSafeName(String name) {
        return !name.contains("/") && !name.contains("\\") && !name.equals("..") && !name.contains("\0");
    }
}
