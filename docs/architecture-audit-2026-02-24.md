# Architectural Audit — 2026-02-24

## Design rationale

### Current pain points

The CLI runtime-option surface had a fragmented top-level structure: two sibling files (`sample-limits.ts` and `sample-limit-toolkit.ts`) represented one cohesive concept (sample-limit configuration and its factory). This made the `runtime-options/` root noisier and less concept-driven.

### Target architecture

Group conceptually-related runtime-option code under a dedicated directory so the top-level `runtime-options/` folder contains broader concepts (`progress-bar`, `sample-limit-options`, `vm-eval-timeout`) rather than low-level implementation fragments.

## Migration and fallback plan

1. Move sample-limit files into `runtime-options/sample-limit-options/`.
2. Add a local `index.ts` in that directory to keep exports discoverable.
3. Keep existing runtime-option exports stable through `runtime-options/index.ts` re-exports.
4. Update direct internal imports to the new path.

Fallback:
- If downstream usage reports path-coupling to old internal file locations, consumers can import from `runtime-options/index.ts` (stable export surface) while follow-up PRs remove internal deep imports over time.

## Focused refactor executed

### Before

```text
src/cli/src/runtime-options/
  progress-bar.ts
  sample-limit-toolkit.ts
  sample-limits.ts
  vm-eval-timeout.ts
  index.ts
```

### After

```text
src/cli/src/runtime-options/
  progress-bar.ts
  sample-limit-options/
    config.ts
    toolkit.ts
    index.ts
  vm-eval-timeout.ts
  index.ts
```

## Why this is a structural improvement

- Consolidates one top-level concept into one directory.
- Reduces root-level fragmentation.
- Preserves runtime behavior and public exports by continuing to re-export from `runtime-options/index.ts`.
- Keeps scope intentionally small (single cohesive refactor, fewer than 15 changed files).
