import { type AppData, DEFAULT_RATES, emptyAppData, SCHEMA_VERSION } from './types';
import { KEY_RATE_HISTORY } from '@/domain/keyRateHistory';
import { currentKeyRate, mergeKeyRateHistory, taxFreeLimitForYear } from '@/rates/keyRate';

/** Экспортирована ради тестов: это единственное место, где старые сохранения
 *  приводятся к текущей форме, и ломаться ей нельзя — цена ошибки тут данные. */
export function migrate(data: AppData): AppData {
  // бэкафилл полей, появившихся позже (для уже установленных копий)
  const next: AppData = { ...data };
  // Объекты-контейнеры добираем от дефолтов ПЕРВЫМ делом: дальше по коду к ним
  // идут обращения вида `next.settings.abbreviateMillions`, и отсутствие любого
  // из них роняло бы всю загрузку (а раньше — и данные, см. RESCUE_KEY).
  const base = emptyAppData();
  next.settings = { ...base.settings, ...(data.settings ?? {}) };
  next.params = { ...base.params, ...(data.params ?? {}) };
  next.organizations = data.organizations ?? [];
  next.instruments = data.instruments ?? [];
  next.assets = data.assets ?? [];
  next.snapshots = data.snapshots ?? [];
  // мерж с дефолтами — добавляет валюты, появившиеся позже (напр. CNY)
  next.rates = { ...DEFAULT_RATES, ...data.rates };
  if (!next.ratesHistory) next.ratesHistory = [];
  if (!next.manualRates) next.manualRates = {};
  if (!next.taxYearRecords) next.taxYearRecords = [];
  if (!next.goals) next.goals = [];
  if (!next.freeCapitalEntries) next.freeCapitalEntries = [];

  // Смена фирменного цвета банка в реестре (src/domain/banks.ts) НЕ доходит до
  // уже заведённых площадок: цвет копируется в организацию в момент создания
  // (`color: bank.color`) и дальше живёт в данных. Поэтому переносим точечно —
  // только ровно то старое значение, которое заменили в реестре.
  //
  // Сплошным «выровнять все по реестру» делать нельзя: цвет площадки
  // редактируется вручную (ColorField в app/catalog/organization.tsx), и такая
  // миграция затёрла бы осознанный выбор пользователя.
  const REBRANDED: { logo: string; from: string; to: string }[] = [
    { logo: 'tbank', from: '#1D1D1B', to: '#FFDD2D' },
  ];
  if (next.organizations?.length) {
    next.organizations = next.organizations.map((o) => {
      const hit = REBRANDED.find((r) => r.logo === o.logo && o.color?.toUpperCase() === r.from);
      return hit ? { ...o, color: hit.to } : o;
    });
  }
  // Самовосстанавливающийся мердж, не только «если пусто» — если сохранённая
  // история где-то обрезалась (напр. неудачный live-фетч), старый бэйзлайн
  // с 2013 года всё равно домердживается на каждой загрузке, не только один раз.
  next.keyRateHistory = mergeKeyRateHistory(KEY_RATE_HISTORY, next.keyRateHistory ?? []);
  if (next.keyRateUpdatedAt === undefined) next.keyRateUpdatedAt = null;
  // Ключевая ставка в расчётах — производная от истории, а не отдельно
  // хранимое число: руками её нигде не редактируют (на экране ставки есть
  // только кнопка «Обновить»), а история домердживается на каждой загрузке.
  // Пока синхронизации не было, приложение знало актуальные 14,25 и считало
  // премию к ключевой по дефолтным 16.
  next.params = { ...next.params, keyRate: currentKeyRate(next.keyRateHistory) };
  // Необлагаемый лимит текущего года — тоже производная от истории ставок
  // (1 млн × максимум года). Закрытые годы фиксируются отдельно в
  // taxYearRecords и задним числом не меняются. Флаг `taxFreeLimitManual`
  // ставится, только когда человек вписал своё число на экране налогов.
  if (!next.params.taxFreeLimitManual) {
    next.params = {
      ...next.params,
      taxFreeLimit: taxFreeLimitForYear(next.keyRateHistory, new Date().getFullYear()),
    };
  }
  if (!(next.schemaVersion >= SCHEMA_VERSION)) next.schemaVersion = SCHEMA_VERSION;
  return next;
}
