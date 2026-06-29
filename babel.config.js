module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 56) автоматически подключает поддержку
    // expo-router и react-native-reanimated/worklets — вручную плагины не добавляем.
    presets: ['babel-preset-expo'],
  };
};
