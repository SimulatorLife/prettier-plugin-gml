# Follow-up plan: project index caching and scope integration

This roadmap captures the remaining work after landing the automated project
index bootstrap. Each section summarises what already shipped and highlights the
next improvements that will keep formatter runs predictable across large
GameMaker projects.

## 1. Project-index cache persistence & coordination — ✅ shipped

**Current state**
- `loadProjectIndexCache`, `saveProjectIndexCache`, and
  `createProjectIndexCoordinator` now back the bootstrap end to end, writing
  caches to `.prettier-plugin-gml/project-index-cache.json` and guarding
  concurrent builds inside a process.
- Cache payloads store manifest/source mtimes, formatter versions, and metrics,
  letting the plugin trace cache hits, misses, and rebuild costs during dry
  runs.

**Follow-up opportunities**
- Introduce cross-process coordination (lock files or advisory file handles) so
  multiple Node.js workers reuse caches safely on CI agents that fork Prettier.
- Ship a `scripts/inspect-project-index-cache.mjs` helper that prints cache
  metadata (schema version, mtimes, miss reasons) to simplify support tickets.
- Document troubleshooting guidance in the README for cache write failures and
  permission issues surfaced by the coordinator.

## 2. Auto-discovery bootstrap inside the plugin — ✅ shipped

**Current state**
- `bootstrapProjectIndex` resolves the GameMaker project root from
  `options.filepath`, honours `gmlIdentifierCaseProjectRoot`, and stores the
  bootstrap result on the Prettier options object for downstream consumers.
- The helper wires the cache coordinator, attaches version metadata, and exposes
  opt-outs via `gmlIdentifierCaseDiscoverProject` and manual index overrides.

**Follow-up opportunities**
- Expand documentation for editor integrations (VS Code, JetBrains) so users can
  confirm bootstrap results from format-on-save workflows.
- Surface a debug log toggle that prints root detection, cache paths, and miss
  reasons without requiring custom loggers.
- Consider exposing the bootstrap result through the wrapper CLI so automated
  scripts can assert discovery success.

## 3. Wire non-local scopes into the rename planner — 🚧 in progress

**Goal**
Enable scope toggles such as `gmlIdentifierCaseFunctions`,
`gmlIdentifierCaseStructs`, and `gmlIdentifierCaseGlobals` to participate in the
rename planner alongside locals and assets.

**Checkpoints**
1. Audit `projectIndex.identifiers` to confirm every scope exposes declaration
   metadata, reference spans, and collision hints needed for safe renames.
2. Extend `prepareIdentifierCasePlan` to evaluate the per-scope styles and emit
   rename operations with the same conflict detection used for locals.
3. Update dry-run reports so non-local scopes produce actionable summaries and
   existing metrics capture the new rename activity.
4. Cover the new paths with integration fixtures while keeping the golden output
   untouched.

## 4. Release readiness and observability — 🚧 queued

**Goal**
Harden the shipped bootstrap for production releases and make it easy to audit
identifier-case rollouts.

**Actions**
- Capture cache hit/miss telemetry during extended playtests and document the
  findings to guide concurrency tuning.
- Refresh the README and rollout guides once additional scopes ship so new teams
  can follow a single quick-start path.
- Schedule a regression sweep combining formatter smoke tests, rename dry runs,
  and asset-aware scenarios before tagging the feature-complete release.
