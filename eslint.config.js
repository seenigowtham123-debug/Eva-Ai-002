// Run `npm install` once to get ESLint, then `npm run lint`.
let js = { configs: { recommended: { rules: {} } } };
let globals = { node: {}, browser: {} };
try {
  js = require("@eslint/js");
  globals = require("globals");
} catch { /* dev dependencies not installed */ }

module.exports = [
  { ignores: ["node_modules/**", "data/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: { ...globals.node } },
    rules: { "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }], "no-empty": ["error", { allowEmptyCatch: true }] },
  },
  { files: ["public/js/**/*.js"], languageOptions: { sourceType: "module", globals: { ...globals.browser } } },
  { files: ["public/js/theme.js"], languageOptions: { sourceType: "script" } },
];
