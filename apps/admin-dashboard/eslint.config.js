import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Workshop UI design rules — see CLAUDE.md "Workshop UI Design Rules" and
// apps/workshop/src/index.css role table. Forbidden className substrings are
// matched in JSX className literals AND in template/string concatenations.
// Selectors cover three shapes:
//   <div className="..."/>            → JSXAttribute > Literal
//   <div className={`...`}/>          → JSXAttribute > JSXExpressionContainer > TemplateLiteral.quasis
//   const c = "..."  / cn("...")      → ordinary Literal anywhere
//
// The selector below matches className-bearing literals AND template quasis.
// Pure-utility strings outside JSX (clsx args, cva variants) are caught by
// the bare-Literal selector restricted to .tsx files.
const uiRules = [
  {
    pattern: "font-bold",
    message:
      "Workshop UI rule: max font-semibold (600). `font-bold` fakes hierarchy — use color contrast or size. See CLAUDE.md.",
  },
  {
    pattern: "font-black",
    message: "Workshop UI rule: no font-black. Max is font-semibold (600).",
  },
  {
    pattern: "rounded-xl",
    message:
      "Workshop UI rule: single radius `rounded-md` on cards/chips/badges/buttons/inputs. Use `rounded-full` only for status dots.",
  },
  {
    pattern: "rounded-2xl",
    message: "Workshop UI rule: single radius `rounded-md`. No rounded-2xl.",
  },
  {
    pattern: "rounded-3xl",
    message: "Workshop UI rule: single radius `rounded-md`. No rounded-3xl.",
  },
  {
    pattern: "uppercase",
    message:
      "Workshop UI rule: no uppercase + tracking-wider section labels. Sentence case only (exception: true acronyms like QC, INV-, ID baked into the string).",
  },
  {
    pattern: "tracking-wider",
    message:
      "Workshop UI rule: no tracking-wider. Sentence case section labels use `text-sm font-medium text-muted-foreground`.",
  },
  {
    pattern: "tracking-widest",
    message: "Workshop UI rule: no tracking-widest.",
  },
  // Raw Tailwind palette on backgrounds/text — use semantic --status-* tokens.
  // Allow 700-shade icon tints (text-red-700, text-indigo-700, etc.) per CLAUDE.md.
  // Allow brand badges (text-emerald-900, text-blue-900, text-zinc-800) per StageBadge.
  {
    pattern:
      "\\b(bg-(red|amber|orange|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|800|900|950))\\b",
    isRegex: true,
    message:
      "Workshop UI rule: use semantic status tokens (`--status-ok/warn/bad/info` + `-bg` variants), not raw Tailwind palette. See apps/workshop/src/index.css.",
  },
  {
    pattern:
      "\\btext-(red|amber|orange|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|800|950)\\b",
    isRegex: true,
    message:
      "Workshop UI rule: use semantic status tokens or muted-foreground, not raw Tailwind palette. Exception: -700 shade allowed for indicator icon tints; -900 for brand badges.",
  },
];

const restrictedSyntax = uiRules.flatMap(({ pattern, message, isRegex }) => {
  const regex = isRegex ? pattern : pattern;
  // Match three AST shapes: className string literal, className template quasi,
  // and any string literal inside a JSXAttribute value (covers cn("...")).
  return [
    {
      selector: `JSXAttribute[name.name='className'] Literal[value=/${regex}/]`,
      message,
    },
    {
      selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=/${regex}/]`,
      message,
    },
  ];
});

export default tseslint.config(
  {
    ignores: ["dist/**", "src/routeTree.gen.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "warn",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...restrictedSyntax],
    },
  },
);
