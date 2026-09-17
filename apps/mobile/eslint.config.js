const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

// Uses Expo's own flat config (React Native/Expo Router-aware rules)
// rather than @memora/config's Node-oriented preset — see
// docs/architecture/09-mobile-architecture.md.
module.exports = defineConfig([
  globalIgnores(["dist/*", ".expo/*", "node_modules/*"]),
  expoConfig,
]);
