/** Config ESLint partagée. Chaque workspace (backend/frontend) peut
 * l'étendre et ajouter ses propres règles spécifiques (ex: règles React
 * côté frontend uniquement). */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "no-console": "off",
  },
  ignorePatterns: ["dist/", "build/", "node_modules/", "*.config.js"],
};
