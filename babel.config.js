module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    '@babel/plugin-transform-export-namespace-from',
    '@sentry/babel-plugin-component-annotate',
    'react-native-reanimated/plugin',
  ],
};
