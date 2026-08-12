/**
 * Настройки самообновления через GitHub Releases.
 * Приложение читает последний релиз репозитория и, если версия тега новее
 * текущей, СКАЧИВАЕТ .apk внутри себя и отдаёт системному установщику
 * (см. `installUpdate.ts`) — без ухода в браузер. Репозиторий должен быть
 * ПУБЛИЧНЫМ, чтобы скачивание шло без токена.
 */
export const GITHUB_OWNER = 'HotJuice90';
export const GITHUB_REPO = 'CapFlow';

export const UPDATE_ENABLED = GITHUB_OWNER.length > 0;
export const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/** Как часто тихо проверять обновления при запуске (6 часов).
 *  GitHub API без токена — 60 запросов/час на IP, так что реже = спокойнее. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** AsyncStorage-ключи кэша проверки — чтобы не дёргать сеть на каждый запуск. */
export const STORAGE_LAST_CHECK = 'capflow.update.lastCheckAt';
export const STORAGE_CACHED = 'capflow.update.cached';
