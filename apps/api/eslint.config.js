const basePreset = require("@memora/config/eslint-preset.js");

module.exports = [
  ...basePreset,
  {
    rules: {
      // NestJS DI relies on classes with no public members in some cases
      // (e.g. guards/interceptors implementing an interface only).
      "@typescript-eslint/no-extraneous-class": "off",
      // `import type` erases the import at compile time. For a class used
      // only as a constructor parameter type on a @Injectable/@Controller,
      // TS's emitDecoratorMetadata needs that import to survive as a real
      // value binding so it can emit a runtime reference for Nest's DI
      // metadata (design:paramtypes) — converting it to `import type` would
      // silently break dependency injection at runtime.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
