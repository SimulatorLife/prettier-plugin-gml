# Semantic Subsystem

The `src/semantic/` package consolidates scope-aware infrastructure that was
previously scattered across the parser and plugin packages. It exposes two
primary pillars:

- **Scope tools** – the `ScopeTracker` and supporting keyword helpers now live
  under `src/semantic/src/scopes/`. The parser continues to import the tracker
  when annotating AST nodes, while downstream consumers can share the same
  definitions without depending on parser internals.
- **Project index** – the project graph, cache coordinator, and filesystem
  facades moved from the Prettier plugin into
  `src/semantic/src/project-index/`. The plugin consumes these helpers to gather
  declaration metadata for rename plans, and future live-reload services will
  build on the same entry points.
- **Identifier-case pipeline** – rename planning, scope detection, and
  environment management migrated from `src/plugin/src/identifier-case/` to
  `src/semantic/src/identifier-case/` so the Prettier plugin can focus solely on
  formatting concerns.

## Identifier Case Bootstrap Controls

Formatter options that tune project discovery and cache behaviour now live in
the semantic layer. They continue to be part of the plugin’s public surface,
but their canonical documentation sits here alongside the implementation.

| Option | Default | Summary |
| --- | --- | --- |
| `gmlIdentifierCaseDiscoverProject` | `true` | Controls whether the formatter auto-discovers the nearest `.yyp` manifest to bootstrap the project index. |
| `gmlIdentifierCaseProjectRoot` | `""` | Pins project discovery to a specific directory when auto-detection is undesirable (e.g. CI or monorepos). |
| `gmlIdentifierCaseProjectIndexCacheMaxBytes` | `8 MiB` | Upper bound for the persisted project-index cache. Set the option or `GML_PROJECT_INDEX_CACHE_MAX_SIZE` to `0` to disable the size guard when coordinating cache writes manually. |
| `gmlIdentifierCaseProjectIndexConcurrency` | `4` (overridable via `GML_PROJECT_INDEX_CONCURRENCY`, clamped between `1` and the configured max; defaults to `16` via `GML_PROJECT_INDEX_MAX_CONCURRENCY`) | Caps how many GameMaker source files are parsed in parallel while building the identifier-case project index. |

When rolling out rename scopes, continue to warm the project index cache
before enabling write mode so the semantic layer can reuse cached dependency
analysis. The bootstrap generates `.prettier-plugin-gml/project-index-cache.json`
the first time a rename-enabled scope executes; pin `gmlIdentifierCaseProjectRoot`
in CI builds to avoid repeated discovery work.

