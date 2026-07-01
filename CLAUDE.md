# CapFlow — рабочий контекст

Этот файл автоподгружается в начало каждой сессии Claude Code.
Цель — не читать заново всю архитектуру и не сканировать репо.

## Стек

- React Native 0.85.3 + Expo SDK 56, TypeScript 6.0.3
- expo-router (файловая навигация: `app/(tabs)/...`, `app/...`)
- Android-only, без EAS
- Сборка релиза: `gradlew :app:assembleRelease` в `android/`
- Релизы: `gh release create vX.Y.Z app-release.apk --title "..." --notes "..."`
- Версии бампать в `app.json` (`version`) + `android/app/build.gradle` (`versionCode` + `versionName`)
- OTA-обновления через GitHub Releases (Настройки → О приложении → Проверить обновления)

## Бренд

- Главный цвет: `#62709C` (slate-индиго). НЕ бирюзовый.
- Светлый оттенок: `#A8B6E2` (кнопки/чипы/swap/активные табы)
- «Рост»: зелёный `#1FA971` (не бирюза)
- Фон-градиент (все экраны): `linear-gradient(168deg, #F2F4F9 2.69%, #E0EDF4 56.51%, #F5F7FF 99.18%)`
- Тёмный hero (главный экран): `['#2C3654', '#3A466B', '#222A44']`
- Все токены: `src/theme/tokens.ts`. Использовать через `tokens.accent.base`, не хардкодить.

## Шрифт

- **Onest везде** через локальные TTF в `assets/fonts/`. Грузятся в `app/_layout.tsx`.
- Глобальный дефолт: `src/theme/globalFont.ts` патчит `Text`/`TextInput` через
  `require('react-native')` и подставляет нужное семейство по `fontWeight`.
- На Android именованный шрифт игнорирует `fontWeight` — поэтому каждый вес = своё семейство:
  `Onest_400Regular` → `_500Medium` → `_600SemiBold` → `_700Bold` → `_800ExtraBold`.
- Семантические алиасы в `src/theme/tokens.ts` → `font.regular`/`medium`/`semibold`/`bold`/`extrabold`.

## Канон экранов

- **Top padding контейнера экрана = 80** (без `insets.top` — статус-бар уже под маской из `_layout.tsx`).
- **Горизонтальные поля = 16** (через `tokens.spacing.screenH`). Не использовать 20 без явного запроса.
- **Заголовок экрана**: `<ScreenTitle>...</ScreenTitle>` из `src/components/ScreenTitle.tsx`
  (Onest SemiBold 34pt, letter-spacing -1% / -0.34, marginBottom 16).
- **Padding bottom** там, где экран должен заходить под плавающий таб-бар: `insets.bottom + 80`.
  Tab-bar плавающий: `bottom:16`, height `66` = 82px от низа + safe-area.

## Ключевые модули (короткие пометки, читать сам файл при правке)

- **Шиты**: нативный `formSheet` (`presentation: 'formSheet'`) + `animation: 'none'` —
  затемнение фона ОС просто проявляется, не едет со шитом. Грабер рисуем свой
  (`sheetGrabberVisible: false`). Образец: `app/currency-picker.tsx`.
  Мост между экранами: `src/lib/currencyPicker.ts` (`openCurrencyPicker(cb, current)`).
- **Логотипы банков**: `src/components/BankLogo.tsx` — `<OrgLogo color logo size />` ВЕЗДЕ,
  где показываем организацию (список, активы, поиск, инструменты). Лого банков в
  `assets/banks/<id>.svg` + `<id>-w.svg`. Реестр: `src/domain/banks.ts`.
- **Хаптика**: `src/lib/haptics.ts` — `tapBuzz / actionBuzz / successBuzz / warnBuzz`.
  На Android — `Haptics.performAndroidHapticsAsync` (нативные сегменты), iOS — `impactAsync`.
- **Диалоги**: `appAlert(title, message?, buttons?)` из `src/lib/dialog.tsx` —
  совместимо по сигнатуре с `Alert.alert`. Системный Alert НЕ используем.
- **Валюты**: 11 кодов в порядке Figma (node 255-2981): RUB, USD, EUR, TRY, KZT, BYN,
  CNY, INR, AED, BRL, ARS. Курсы: `src/rates/cbr.ts` (cbr-xml-daily.ru).
  Флаги (PNG из Figma): `src/components/Flag.tsx`, в `assets/flags/`.
- **Состояние**: `src/state/DataContext.tsx` (DataProvider в `_layout`).
  Селекторы и расчёты — `src/state/selectors.ts`.

## DO NOT (грабли)

- **НЕ запускать** `npx expo prebuild --clean` — затирает `android/app/debug.keystore`,
  ломает подпись → OTA-обновления перестают ставиться (signature mismatch).
- **НЕ возвращать** эмодзи-флаги — на Android они не рендерятся (RU вместо 🇷🇺).
  Использовать `<Flag code={code} />`.
- **НЕ возвращать** системный `Alert.alert` — только `appAlert` из `@/lib/dialog`.
- **НЕ хардкодить** цвета бренда в стилях — только через `tokens.accent.*`.
- **НЕ ставить** `fontFamily` руками без нужды — глобальный патч уже подставит Onest по `fontWeight`. Явный `fontFamily` оставлять только когда нужен конкретный вес (например `Onest_600SemiBold` для крупного числа).
- **Релизный APK ≈ 99 МБ** — ABI-split отложен.

## Workflow с пользователем

- Один экран за раз. Если задача про конвертер — НЕ грепать по всему проекту,
  НЕ читать DataContext/selectors/AssetRow «на всякий случай». Открыть нужный
  файл, поправить, проверить tsc. Сквозные правки делаем только когда явно сказано.
- **Сборки копим в пачку.** Не пересобирать APK после каждой мелочи (отступ, цвет).
  Накопил 3–5 правок → один build + один релиз. Версию бампать только при сборке.
- Прямо в `main`, без feature-веток и PR. Тег `vX.Y.Z`, релиз через `gh`.
- GH_TOKEN — пользователь даёт per-session, не хранить.
- TypeScript-чек обязателен перед сборкой: `npx tsc --noEmit`.

## Текущая работа

- Верстка экранов 1:1 по Figma (file key `k3kd6jxeHBVfBjjA0BZBXQ`).
- Готово: конвертер (node 229-4608), настройки, выбор валюты.
- На очереди: остальные экраны по мере выдачи макетов.
