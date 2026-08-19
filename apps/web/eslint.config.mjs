import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // ACC-immediate-isvisible-probes. `locator.isVisible()` takes ONE optional
    // argument, an options bag whose only key is `timeout` - and playwright-core
    // 1.60.0 IGNORES it. Its own JSDoc says so: "@deprecated This option is
    // ignored. locator.isVisible() does not wait for the element to become
    // visible and returns immediately."
    //
    // So `isVisible({ timeout: N })` reads as "wait up to N, then answer" and
    // does neither. That is INC-10: a portal booking flow branched on it, took
    // the wrong branch, and the run reported a pass. Four sites were fixed then
    // and TWO MORE were written afterwards - one carrying a comment asserting
    // the wait it did not have. A comment did not stop it recurring; this does.
    //
    // BANNING EVERY ARGUMENT, not just `timeout`, because `timeout` is the only
    // key the signature accepts. Any argument at all is the defective form.
    // The bare `isVisible()` is NOT banned: it is honest about being immediate
    // and is correct after an explicit settle (marcacoes-tab-edit.spec.ts:124 is
    // the worked example). For an OPTIONAL element use `becameVisible()` from
    // ./helpers; for a REQUIRED one use `expect(locator).toBeVisible()`.
    files: ["e2e/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='isVisible'][arguments.length>0]",
          message:
            "isVisible() ignores its options: playwright-core 1.60.0 drops `timeout` (INC-10). Use becameVisible(locator, ms) from ./helpers for an optional element, or expect(locator).toBeVisible({ timeout }) for a required one.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
