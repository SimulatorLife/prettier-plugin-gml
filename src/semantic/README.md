# Semantic Analyzer Subsystem

This `src/semantic` subsystem is a semantic layer that annotates parse tree(s) to add *meaning* to the parsed GML code so the emitter/transpiler can make correct decisions. See the plan for this component/feature in [../../docs/semantic-scope-plan.md](../../docs/semantic-scope-plan.md).

## Symbol Resolution Queries

The `ScopeTracker` provides query methods that enable hot reload coordination and dependency tracking:

### `getSymbolOccurrences(name)`

Find all occurrences (declarations and references) of a specific symbol across all scopes. Returns an array of occurrence records with scope context.

```javascript
const tracker = new ScopeTracker({ enabled: true });
// ... track declarations and references ...
const occurrences = tracker.getSymbolOccurrences("myVariable");
// Returns: [
//   { scopeId: "scope-0", scopeKind: "function", kind: "declaration", occurrence: {...} },
//   { scopeId: "scope-1", scopeKind: "block", kind: "reference", occurrence: {...} }
// ]
```

**Use case:** Identify what needs to be recompiled when a symbol changes, supporting faster invalidation in hot reload pipelines.

### `getScopeSymbols(scopeId)`

Get all unique identifier names declared or referenced in a specific scope. Returns an array of symbol names.

```javascript
const symbols = tracker.getScopeSymbols("scope-0");
// Returns: ["param1", "param2", "localVar"]
```

**Use case:** Track dependencies and enable selective recompilation by understanding which symbols are used in each scope.

### `resolveIdentifier(name, scopeId)`

Resolve an identifier to its declaration metadata by walking up the scope chain. Implements proper lexical scoping rules with shadowing support.

```javascript
const declaration = tracker.resolveIdentifier("myVar", "scope-1");
// Returns: { name: "myVar", scopeId: "scope-0", classifications: [...], start: {...}, end: {...} }
```

**Use case:** Accurate binding resolution for transpilation, enabling correct code generation that respects lexical scope boundaries.

### `getScopeChain(scopeId)`

Get the parent scope chain for a given scope, walking from the specified scope up to the root. Returns an array of scope descriptors from nearest to root.

```javascript
const chain = tracker.getScopeChain("scope-2");
// Returns: [
//   { id: "scope-2", kind: "block" },
//   { id: "scope-1", kind: "function" },
//   { id: "scope-0", kind: "program" }
// ]
```

**Use case:** Efficient dependency tracking and faster invalidation in hot reload pipelines by traversing lexical scope hierarchies without walking the full scope stack.

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

## Resource Metadata Extension Hook
> TODO: Remove this option/extension – handling custom resource metadata is out of scope. Keep this implementation 'opinionated'.

**Pre-change analysis.** The project index previously treated only `.yy`
resource documents as metadata, so integrations experimenting with alternate
GameMaker exports (for example, bespoke build pipelines that emit `.meta`
descriptors) had to fork the scanner whenever they wanted those files to be
indexed. The formatter’s defaults remain correct for the vast majority of
users, so the new seam keeps the behavior opinionated while allowing internal
callers to extend it on demand.

Use `setProjectResourceMetadataExtensions()` from the semantic project-index
package to register additional metadata suffixes. The helper normalizes and
deduplicates the list, seeds it with the default `.yy` entry, and is intended
for host integrations, tests, or future live tooling—not end-user
configuration. `resetProjectResourceMetadataExtensions()` restores the
defaults, and `getProjectResourceMetadataExtensions()` exposes the frozen list
for diagnostics. Production consumers should treat the defaults as canonical
until downstream formats stabilize; the hook exists to unblock experimentation
without diluting the formatter’s standard behavior.


## TODO
- Align the structure of `semantic` with the plan outlined in
  [../../docs/semantic-scope-plan.md](../../docs/semantic-scope-plan.md).