/**
 * Настройки самообновления через GitHub Releases.
 * Приложение читает последний релиз репозитория и, если версия тега новее
 * текущей, предлагает скачать .apk. Репозиторий должен быть ПУБЛИЧНЫМ,
 * чтобы скачивание шло без токена.
 *
 * Заполнить GITHUB_OWNER после создания репозитория.
 */
export const GITHUB_OWNER = 'HotJuice90';
export const GITHUB_REPO = 'CapFlow';

export const UPDATE_ENABLED = GITHUB_OWNER.length > 0;
export const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
