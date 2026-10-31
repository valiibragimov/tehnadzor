import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Tehnadzor lint configuration for client, server, functions, scripts, and smoke tests.
const tsFiles = ["src/**/*.ts", "server/src/**/*.ts", "functions/src/**/*.ts"];
const jsFiles = ["scripts/**/*.mjs", "tests/**/*.mjs", "eslint.config.mjs"];

export default [
  {
    ignores: [
      "dist/**",
      "dist-local/**",
      "tmp/**",
      "dist-hosting/**",
      "server/dist/**",
      "functions/dist/**",
      "node_modules/**",
      "tools/**",
      "sw.js"
    ]
  },
  {
    ...js.configs.recommended,
    files: jsFiles,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-console": "off"
    }
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: tsFiles
  })),
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    },
    rules: {
      "no-console": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    files: ["server/src/**/*.ts", "functions/src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    rules: {
      "no-console": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off"
    }
  },
  {
    files: ["src/shared/bim/**/*.ts", "server/src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        group: ["**/client/**", "**/repositories/**", "**/infrastructure/**", "firebase*", "express", "piscina"],
        message: "Domain and application modules depend on ports, not UI or infrastructure."
      }] }]
    }
  },
  {
    files: [
      "src/client/features/inspections/*/evaluation.ts",
      "src/client/features/inspections/acceptance.ts",
      "src/client/features/inspections/assessment-status.ts",
      "src/client/features/inspections/geometry/dimensions.ts",
      "src/client/app/construction.ts", "src/client/app/inspection-registry.ts"
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-imports": ["error", { patterns: [{
        group: ["firebase", "firebase/**", "@firebase/**", "express", "piscina",
          "**/firebase.js", "**/repositories/**", "**/infrastructure/**", "**/ui/**",
          "**/services/**", "**/runtime.js", "**/*-runtime.js", "**/dom.js", "**/form.js", "**/*-service.js", "**/utils.js", "**/app.js"],
        message: "Engineering evaluation depends on pure domain contracts, not UI, services or persistence."
      }] }],
      "no-restricted-syntax": ["error",
        { selector: "ImportExpression", message: "Engineering evaluation uses explicit static domain imports." },
        { selector: "CallExpression[callee.name='require']", message: "Engineering evaluation uses explicit static domain imports." }
      ],
      "no-restricted-globals": ["error", "window", "document", "fetch", "localStorage", "indexedDB", "navigator", "globalThis", "self"]
    }
  },
  {
    files: ["tests/ui/**/*.mjs"],
    languageOptions: { globals: { ...globals.browser } }
  },
  {
    files: ["scripts/**/*.mjs"],
    rules: {
      "no-console": "off"
    }
  }
];
