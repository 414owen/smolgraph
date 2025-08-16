// eslint.config.mjs

import globals from "globals";

export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 9,
      sourceType: "module",
      globals: {
        ...globals.browser,
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    rules: {
      "no-bitwise": "error",
      "camelcase": "error",
      "curly": "error",
      "eqeqeq": ["error", "always"],
      "guard-for-in": "error",
      "no-extend-native": "error",
      "wrap-iife": ["error", "inside"],
      "no-use-before-define": ["error", { "functions": true, "variables": true }],
      "new-cap": "error",
      "no-caller": "error",
      "no-empty": "error",
      "no-irregular-whitespace": "error",
      "no-new": "error",
      "no-plusplus": "off",
      "quotes": ["error", "double"],
      "no-undef": "error",
      "no-unused-vars": ["error", { "vars": "all", "args": "after-used" }],
      "strict": ["error", "function"],
      "max-len": ["error", { "code": 100 }],
      "no-var": "error",
      "semi": ["error", "always"],
      "no-eq-null": "error",
      "no-eval": "error",
      "no-new-func": "error",
      "no-extra-semi": "error",
      "no-loop-func": "off",
      "no-multi-str": "error",
      "no-shadow": "error",
      "dot-notation": "error",
      "no-script-url": "error",
      "valid-typeof": "error",
      "no-proto": "error",
      "no-labels": "error"
    }
  }
];

