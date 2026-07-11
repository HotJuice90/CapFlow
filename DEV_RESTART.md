# Перезапуск dev-среды CapFlow

Что делать, если dev-build на телефоне завис на заставке (сплеше) или не подключается к Metro.

## Самый быстрый путь — dev-restart.bat

В корне репо лежит `dev-restart.bat` — двойной клик (или запуск из терминала) делает всё сам:

1. Убивает все процессы, занявшие порт 8081 (в т.ч. упавший/зависший Metro).
2. Поднимает Metro заново в отдельном окне и ждёт, пока он ответит на `/status`.
3. Ждёт телефон по ADB (Wireless debugging должен быть включён, экран разблокирован).
4. `adb reverse tcp:8081 tcp:8081` + холодный перезапуск приложения с deep-link'ом на Metro.

Если после него телефон всё равно висит на сплеше — почти всегда экран телефона
был заблокирован (Wi-Fi ADB засыпает вместе с экраном): разбудить телефон и
запустить скрипт ещё раз.

## Ручной путь (то же самое по шагам)

Телефон подключён по Wi-Fi ADB (Wireless debugging). `--host lan` в этом случае
часто не работает: браузер/файрвол Windows режет входящие на 8081 с телефона по LAN.
Правильный обход — пробросить порт прямо через сам ADB-туннель.

```powershell
cd "C:\Users\hooot\YandexDisk\My apps\Capital Flow app"

# 1. Убедиться, что телефон виден
adb devices

# 2. Поднять Metro (если ещё не запущен)
npx expo start --dev-client --host lan --clear

# 3. В отдельном окне — пробросить порт через ADB (ключевой шаг)
adb reverse tcp:8081 tcp:8081

# 4. Перезапустить приложение с указанием адреса Metro через localhost
adb shell am force-stop com.capflow.app
adb shell am start -a android.intent.action.VIEW -d "capflow://expo-development-client/?url=http://127.0.0.1:8081"
```

Проверить, что Metro реально отдал бандл — в логе Metro должна появиться строка
`Android Bundled ... node_modules\expo-router\entry.js (N modules)`.

## Проверка, что Metro жив

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8081/status
```

Ожидаемый ответ: `packager-status:running`.

## Если после adb reverse всё ещё держит на сплеше

1. Полностью закрыть приложение на телефоне (recent apps → смахнуть).
2. `adb shell am force-stop com.capflow.app`
3. Повторить шаги 3–4 из «быстрого пути» выше.
4. Проверить код:

```powershell
npm run typecheck
npm test
```

## Что не делать без отдельной причины

- Не удалять `node_modules`.
- Не переустанавливать зависимости.
- Не чистить Gradle/Android build-кэши.
- Не менять Android SDK / PATH / системные переменные.
- Не делать `git reset`, `git checkout` или другие действия, которые могут потерять изменения.
