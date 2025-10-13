# Follow-up plan: project index caching and scope integration

This plan turns the outstanding gaps from the naming-convention rollout into actionable engineering tasks. Each task includes
context, implementation checkpoints, and validation guidance so the work can be sequenced or parallelised safely.

## 1. Finish project-index cache persistence & coordination
- **Problem**: `loadProjectIndexCache`, `saveProjectIndexCache`, and `createProjectIndexCoordinator` are TODOs, so every
  formatter run rebuilds the index and concurrent runs may race each other.
- **Actions**:
  1. Define the cache file schema (likely JSON) and document it inline. Include project-root path, dependency mtimes, Prettier
     version, and plugin version to guard against stale reads.
  2. Implement `loadProjectIndexCache` to validate the schema, discard corrupted or expired caches, and surface precise reasons
     for misses (e.g. version mismatch vs. mtime changes).
  3. Implement `saveProjectIndexCache` with atomic writes (temp file + rename) and optional size caps to avoid runaway disk
     usage.
  4. Flesh out `createProjectIndexCoordinator` to serialise cache writes and index builds when multiple formatter workers act on
     the same project root (use a mutex/lock file or Node IPC-friendly primitive). Provide a `dispose` hook so build artifacts
     clean up gracefully.
- **Validation**:
  - Unit tests simulating fresh cache write, successful reuse, version mismatch, and mtime invalidation.
  - Stress/integration test that spawns multiple formatter processes targeting the same project and confirms only one rebuilds
    the index while others reuse the cached result.

## 2. Auto-detect project roots and preload the index inside the plugin
- **Problem**: Callers currently have to construct and inject a `projectIndex` manually. The plugin should discover roots and
  manage caches transparently.
- **Actions**:
  1. Implement a helper that walks up from `options.filepath` to find the GameMaker project root (e.g. directory containing
     `.yyp`). Respect overrides supplied via plugin options.
  2. Update the Prettier `resolveConfig`/`preprocess` path (or equivalent entry point) to invoke the root detector, load or build
     the project index via the coordinator, and attach it to the formatter context so printers need no external wiring.
  3. Ensure cache lifecycle hooks run in both `--check` and `--write` modes and fall back gracefully when invoked on standalone
     files outside a project.
  4. Expand documentation (`README` or dedicated usage guide) describing how automatic discovery works and how to override or
     disable it for bespoke workflows.
- **Validation**:
  - Integration tests exercising formatter runs on fixtures located inside and outside a detected root.
  - Smoke test in dry-run mode confirming the plugin surfaces rename plans without requiring manual index injection.
  - Documentation review to make sure onboarding steps reflect the new automation.

## 3. Wire non-local scopes into the rename planner
- **Problem**: The planner collects identifiers for functions, structs, macros, globals, and instances but only applies renames
  for local scope (and optional assets). Scope-specific toggles exist yet are ignored.
- **Actions**:
  1. Audit the `ProjectIndex` outputs for each scope and document any missing metadata (e.g. declaration spans for macros or
     struct fields). Fill gaps before enabling renames.
  2. Extend the rename planner to evaluate per-scope toggles and generate rename proposals for scripts/functions, structs,
     macros, instance variables, and globals. Preserve existing dry-run reporting format.
  3. Enhance conflict detection to account for cross-scope interactions (e.g. function rename colliding with a global) and ensure
     conflicts cancel the minimum necessary rename set.
  4. Add integration fixtures covering each newly enabled scope in both dry-run and `--write` modes, keeping existing golden
     fixtures untouched.
- **Validation**:
  - Unit tests for the planner demonstrating toggle behaviour and conflict resolution.
  - Dry-run logs reviewed to confirm reporting remains intelligible when multiple scopes participate.
  - Manual verification on a sample project that enabling, for example, `gmlIdentifierCase.functions` rewrites function names
    consistently.

## 4. Release readiness follow-up
- **Problem**: Once the above items land, the feature set nears completion but still lacks operational polish.
- **Actions**:
  1. Track telemetry (cache hit/miss rates, rebuild durations) during implementation to inform performance tuning in the existing
     telemetry task.
  2. Update `CHANGELOG.md` and documentation once automatic root detection and broader rename scopes are available.
  3. Coordinate a regression sweep covering formatter smoke tests, rename dry-runs, and asset-aware scenarios to validate the
     integrated system before release.
- **Validation**:
  - Documented telemetry results and performance notes.
  - Passing regression runs across the formatter + rename suites.
  - Reviewed documentation updates merged alongside the code changes.
