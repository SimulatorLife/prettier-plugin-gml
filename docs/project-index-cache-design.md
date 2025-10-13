# Project index cache design

This note outlines the initial direction for the project-index cache that will
back upcoming formatter concurrency features.

## Locating the GameMaker project root

The cache needs to be keyed by the GameMaker project that a formatted file
belongs to.  Prettier exposes the current file path via `options.filepath`, so
we treat it as the starting point for discovery.

1. Normalize the path with `path.resolve` to collapse relative segments and to
   give us a stable anchor that works across invocations.
2. Walk up the directory tree from `dirname(options.filepath)` until either a
   `.yyp` manifest is found or we reach the filesystem root.
3. Treat the first directory that contains a `.yyp` file as the project root.
   GameMaker places exactly one manifest in the root, so the nearest manifest
   matches the user's expectation even when nested project folders exist.
4. Bail out (return `null`) if no manifest is discovered.  This covers
   formatting loose scripts or running Prettier on a subset of files that do not
   belong to a full project checkout.

The lookup uses `fs.promises.readdir` by default but accepts an injected file
system facade so tests and callers with virtual file systems can reuse the
logic.

## Cache key shape and modification times

Cache entries must be invalidated when any project metadata that influences the
formatter changes.  The key therefore includes the following components:

- The formatter build identifier (for now a version string passed in by the
  caller).
- The canonical project root path detected by the heuristic above.
- A stable digest that captures the modification times (`mtimeMs`) for the
  `.yyp` manifest and the formatted source file.

To keep the implementation deterministic we sort manifest names and stringify
all numeric values before mixing them into a SHA-256 digest.  Any time either
file changes on disk, its `mtimeMs` shifts, producing a new hash and therefore a
new cache entry.  This keeps cache coordination simple while still allowing the
system to reuse work across parallel Prettier runs when nothing relevant has
changed.

## Metrics-driven tuning and operational heuristics

Instrumentation was added to both the project index builder and the rename
planner so we can observe timing, identifier counts, and cache behaviour in
real projects. The collected metrics surfaced three practical improvements:

1. **Built-in identifier cache invalidation** – the loader now records the
   `mtimeMs` of `resources/gml-identifiers.json`. If the file changes between
   runs the cache is treated as stale and reloaded; otherwise we count a cache
   hit. The tracker exposes hit/miss/stale counters so we can detect unexpected
   churn during benchmarking.
2. **I/O batching with bounded concurrency** – scanning and parsing GML files
   now honours a configurable concurrency limit (defaulting to four workers).
   The metrics include the active concurrency to make it obvious when the
   system is CPU- or I/O-bound. Processing happens in batches so slow network
   storage no longer serialises the entire pipeline.
3. **Rename planner accounting** – the identifier-case pipeline records how
   many declarations, references, and rename operations were examined versus
   accepted. Conflict counters (configuration, collisions, reserved words) make
   it easy to spot tuning opportunities for ignore/preserve lists when the
   numbers spike.

The new `scripts/bench-identifier-pipeline.mjs` helper runs the project index
twice (to observe cache reuse) and optionally executes the rename planner for a
specific file, printing the captured metrics as structured JSON. This gives us
an ad-hoc regression harness for spotting regressions before they make it into
CI.

## Cache persistence schema

The persisted cache now lives inside `.prettier-plugin-gml/project-index-cache.json`
at the project root. Each payload is versioned (`schemaVersion`) so future
changes can coexist with older formatter releases. The remaining metadata
captures everything needed to validate a cache hit without rebuilding the index:

- `projectRoot` – canonical absolute path for the project that produced the
  cache file.
- `formatterVersion` / `pluginVersion` – surface compatibility mismatches
  between the host Prettier binary and the plugin bundle.
- `manifestMtimes` / `sourceMtimes` – normalised maps of `mtimeMs` readings for
  `.yyp` manifests and the formatted source file(s).
- `metricsSummary` – condensed snapshot of the metrics captured during the
  build, re-attached to the in-memory project index when a cache hit occurs.
- `projectIndex` – the actual index data structure with the metrics removed
  (they are stored separately as noted above).

`loadProjectIndexCache` validates this schema and returns typed miss reasons so
callers can distinguish corruption (`invalid-json`/`invalid-schema`) from stale
inputs (`manifest-mtime-mismatch`, `formatter-version-mismatch`, etc.).
`saveProjectIndexCache` writes the payload via a temporary file followed by an
atomic rename and refuses to persist entries that exceed the configured size
limit (8 MiB by default) to avoid unbounded disk growth.

## Coordination and locking

`createProjectIndexCoordinator` guards concurrent builds for the same
`projectRoot`. Calls to `ensureReady(projectRoot, …)` share in-flight work via an
in-process mutex so only one formatter worker rebuilds the index while others
await the result. When the build completes, the coordinator persists the cache
before unblocking queued calls. A `dispose()` hook clears in-memory state so
long-lived processes (tests, language servers) can release resources explicitly
between runs.
