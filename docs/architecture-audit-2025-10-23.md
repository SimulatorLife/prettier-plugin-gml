# Architecture Audit — 2025-10-23

## Current layout pain points

- The `src/cli/src/shared/` directory mixes unrelated concerns: cross-cutting helpers live alongside modules that expose runtime tuning knobs for the CLI wrapper.
- The runtime option modules (`byte-format`, `skipped-directory-sample-limit`, `unsupported-extension-sample-limit`, and `vm-eval-timeout`) repeat the same integer option scaffolding and error messaging in isolation, making the directory harder to scan and inviting divergence.
- Having configuration helpers masquerade as "shared" primitives buries the fact that they depend on CLI-specific infrastructure such as `createIntegerOptionToolkit`, slowing discovery during audits.

## Target architecture

- Collect runtime configuration knobs for the CLI under a dedicated `src/cli/src/runtime-options/` boundary so the shared package only exposes primitives that are safe to depend on from other layers.
- Factor the duplicated sample-limit boilerplate behind a `createSampleLimitToolkit` helper so future limits can be added by providing the descriptive labels, keeping validation logic centralized.
- Keep public APIs stable by continuing to export the same functions from the renamed modules; only the import paths change for internal callers.

## First-step refactor

- Relocate the four runtime option modules from `src/cli/src/shared/` to `src/cli/src/runtime-options/` and update all importers to match the new structure.
- Introduce `createSampleLimitToolkit` to de-duplicate the configuration scaffolding for sample limits and apply the helper inside both modules.
- Leave additional helpers (e.g., `progress-bar`, `ignore-path-registry`) under `shared/` for now; follow-up audits can migrate them once the new boundary proves useful.
