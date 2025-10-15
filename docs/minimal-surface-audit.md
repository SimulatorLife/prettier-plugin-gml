# Minimal surface area audit

This guide explains how to evaluate the public surface area of the plugin's modules
and reduce accidental exports that leak internal utilities.

## When to run the audit

- Before publishing a new package version.
- After large refactors that touch shared utilities.
- During code reviews whenever a new `index.ts` or `index.js` file is introduced.

Run the automated sweep locally or in CI:

```bash
node scripts/codex-minimal-surface.js --report codex-minimal-surface-report.md
```

The script inspects every tracked `index.*` file and flags either of the following:

- `export * from './module'` re-exports that forward an entire directory or module.
- Named export blocks that expose eight or more symbols from a single entry point.

## CI automation

- The `Codex Minimal Surface` GitHub Action uses the shared Codex workflow to open a
  pull request and comment with these audit instructions.
- When the automation triggers, follow the prompts in the Codex PR to run the script,
  commit any needed fixes, and paste an excerpt of the generated report for context.
- Close the Codex PR without merging if the audit finds nothing actionable.

## Evaluating flagged exports

1. Open the generated `codex-minimal-surface-report.md` file.
2. For each index file:
   - Confirm whether the re-exported modules are intended for external use.
   - Group related helpers into dedicated submodules and expose only the single entry
     points that users need.
   - If internal modules must remain shared internally, move them to directories that
     are not re-exported from the package root.
3. Document the reasoning for any broad export that must stay to avoid regressions.

## Trimming the surface area

- Replace `export * from './module'` with explicit named exports for the small subset
  of helpers that are part of the supported API.
- Collapse large `export { ... }` blocks by creating feature-specific entry points
  (for example `format/index.ts`, `parser/index.ts`) and re-export only the stable
  API from the package root.
- Annotate internal modules with comments such as `/** @internal */` or
  `// Internal: not part of the public API.` to make the intent clear to reviewers.
- Update tests and examples so they rely on the trimmed imports, preventing the
  reintroduction of broad exports.

## Recording the outcome

- Commit the updated entry points together with a short summary of the rationale.
- When the Codex automation opens a pull request, include the generated
  `codex-minimal-surface-report.md` in the change set or PR comments so reviewers
  can confirm the rationale behind the trimmed exports.
- Update this document whenever thresholds or heuristics change so future audits stay
  aligned with the workflow.
