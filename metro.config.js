const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    resolver: {
        assetExts: ['tflite', ...getDefaultConfig(__dirname)?.resolver?.assetExts],
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
