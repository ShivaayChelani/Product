const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const {withSentryConfig} = require('@sentry/react-native/metro');

/**
 * Do NOT override serializer.getPolyfills / getModulesRunBeforeMainModule.
 * Empty overrides strip React Native's ErrorUtils + core setup and cause
 * "Fatal JS Error" alerts from the index.js stub (undefined is not a function).
 */
const config = {
  watchFolders: [path.resolve(__dirname, 'shared')],
  resolver: {
    blockList: [
      /android\/.*/,
      /ios\/.*/,
    ],
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: true,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = withSentryConfig(mergeConfig(getDefaultConfig(__dirname), config));
