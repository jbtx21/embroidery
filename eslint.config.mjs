// ESLint flat config. Standard recommendations for TypeScript, with Prettier
// switched in last so formatting rules do not fight the formatter.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "out/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // Unused arguments are fine when they are prefixed — that is how the
      // stubs (medialAxis, importInkstitchFont) mark a parameter they do not
      // use yet.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Bench and tools are plain JS modules run by node.
    files: ["**/*.mjs", "**/*.js"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
);
