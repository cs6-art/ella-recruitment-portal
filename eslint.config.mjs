import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Next.js 16's flat config enables React Compiler diagnostics that are
    // useful for new code but currently flag established portal patterns.
    // Keep the ESLint CLI migration strict for ordinary syntax/type rules
    // while avoiding a repository-wide unrelated refactor.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react/no-unescaped-entities": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-dev/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Playwright report bundles, not source.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
