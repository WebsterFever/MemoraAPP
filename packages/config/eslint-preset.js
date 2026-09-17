// @ts-check
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const eslintConfigPrettier = require("eslint-config-prettier");
const globals = require("globals");

/**
 * Shared base ESLint flat config for Memora apps/packages.
 * Consumers extend this array and append their own environment-specific
 * overrides (e.g. React Native globals, NestJS decorator rules).
 */
module.exports = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Tooling config files (eslint.config.js, prettier.config.js, etc.) are
    // plain CommonJS Node scripts, not application TypeScript — they need
    // Node globals and are allowed to use require().
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    ignores: ["dist/**", "coverage/**", ".expo/**", "node_modules/**"],
  },
];
