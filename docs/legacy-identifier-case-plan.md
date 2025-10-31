# Legacy identifier-case and rename plan

> **Status: Archived reference.** The strategy described below reflects the previous
> identifier-case semantic module and rename rollout plan. It is no longer being
> expanded, but it remains available to help interpret the historical
> implementation. The active scope roadmap now spans the
> [live reloading concept](./live-reloading-concept.md) under "Scope-aware
> semantic pipeline" and the dedicated
> [semantic scope plan](./semantic-scope-plan.md).

This archive consolidates the identifier-case handbook, scope reference,
rollout playbook, roadmap, and example set that previously lived across
multiple files. Use it when auditing legacy behaviour, interpreting past
reports, or migrating notes into the newer semantic pipeline.

## Legacy architecture snapshot

The original `gmlIdentifierCase` implementation rewrote user-defined
identifiers—variables, functions, macros, enums, and assets—to a configurable
case style while preserving GameMaker semantics. The helpers in
`src/semantic/src/identifier-case/identifier-case-utils.js` normalised each
identifier through the following stages:

1. **Prefix detection** – Known prefixes (for example `global.`, `other.`,
   `self.`, `local.`, `with.`, `noone.`, `argument`, `argument_local`,
   `argument_relative`, and array-style accessors such as `argument[2]`) were
   stripped before conversion and restored afterwards. Integrations could extend
   the preserved list through `reservedPrefixes` overrides when calling
   `normalizeIdentifierCaseWithOptions` or `formatIdentifierCaseWithOptions`
   directly.
2. **Numeric suffix capture** – Trailing digit runs, optionally preceded by an
   underscore (for example `_12`), were recorded separately so counters remained
   attached to the identifier.
3. **Edge underscores** – Leading and trailing underscores were temporarily
   removed and re-applied verbatim during reconstruction.
4. **Tokenisation** – The remaining content split into ordered tokens using
   underscore separators, camel-case boundaries, and digit runs. Alphabetic
   tokens were lowercased, while numeric tokens retained their digits.

Tokenisation respected existing separators (periods, underscores, array
brackets) and kept recognised prefixes untouched. Leading or trailing
underscores were restored after reconstruction. Case emitters produced the
requested style while keeping the process idempotent—identifiers that already
matched the target style survived round trips unchanged.

### Supported case reconstructions

| Style | Description |
| --- | --- |
| `camel` | Lower camelCase, capitalising tokens after the first alphabetic fragment while preserving numeric runs (for example `hp2D_max` → `hp2DMax`). |
| `pascal` | Upper camelCase with every alphabetic token capitalised (`hp2D_max` → `Hp2DMax`). |
| `snake-lower` | Lower snake_case joining tokens with underscores (`hp2DMax` → `hp2d_max`). |
| `snake-upper` | Upper snake_case (`hp2DMax` → `HP2D_MAX`). |

## Legacy scope coverage and planning

The planner evaluated additional scopes beyond locals and assets to keep rename
behaviour aligned across declarations and references:

| Scope | Source | Coverage |
| --- | --- | --- |
| Functions | Script resources | Declarations and call expressions resolved through the project index. |
| Struct constructors | Script resources marked as constructors | Declarations and `new` expressions resolved to struct scripts. |
| Macros | `#macro` statements | Declarations and macro references in expressions. |
| Globals | `globalvar` declarations and global assignments | Declarations plus reads/writes to `global` identifiers. |
| Instance | Assignments inside object events | Instance assignments inferred from object event scopes. |

Each scope respected the base `gmlIdentifierCase` style unless a dedicated toggle
(such as `gmlIdentifierCaseFunctions`) disabled or overrode it. When a scope was
turned "off" the planner still recorded metrics but skipped the corresponding
rename operations. Projects that relied on bespoke namespaces could extend the
reserved prefix list through the same overrides used by the core helpers.

Planning combined the project index with deterministic rename maps:

1. Resolve canonical identifier names from declarations, preferring explicit
   metadata over resource names.
2. Compute the target style through `formatIdentifierCase`.
3. Honour preserved and ignored lists, surfacing informational conflicts for
   skipped identifiers.
4. Detect cross-scope collisions (for example, function versus global) and block
   writes until the conflict cleared.
5. Store rename operations keyed by declaration/reference spans so the printer
   could update the source without mutating unrelated tokens.

Dry-run mode populated rename plans and conflicts without touching source files.
Write mode reused the same plan, applying the edits after all safety checks
passed.

## Bootstrap, configuration, and caching

The formatter auto-discovered GameMaker projects whenever renaming scopes were
enabled:

- Searching upward from the formatted file for a `.yyp` manifest.
- Loading `.prettier-plugin-gml/project-index-cache.json` when present and
  rebuilding the project index if the cache was missing or stale.
- Storing the bootstrap metadata on the Prettier options object so tests and
  editor integrations could inspect whether the index came from a cache hit or a
  rebuild (`options.__identifierCaseProjectIndexBootstrap.source`).

Key configuration switches kept the bootstrap predictable:

| Option | Purpose |
| --- | --- |
| `gmlIdentifierCaseProjectRoot` | Pin the bootstrap to a specific project directory when formatting files outside the manifest tree. |
| `gmlIdentifierCaseDiscoverProject` | Disable discovery entirely when supplying an `identifierCaseProjectIndex` manually. |
| `identifierCaseProjectIndex` | Provide a JSON snapshot generated by external tooling to keep plans deterministic across machines. |
| `gmlIdentifierCaseAcknowledgeAssetRenames` | Required before enabling asset renames so disk mutations and `.yy` updates were opt-in. |
| `gmlIdentifierCaseProjectIndexCacheMaxBytes` | Cap the on-disk cache payload (default `8 MiB`, overridable through `GML_PROJECT_INDEX_CACHE_MAX_SIZE`). |
| `gmlIdentifierCaseProjectIndexConcurrency` | Control how many sources were parsed in parallel while building the index (default `4`, clamped between `1` and `16`, overridable through `GML_PROJECT_INDEX_CONCURRENCY`). |
| `gmlIdentifierCaseOptionStoreMaxEntries` | Bound the number of identifier-case option snapshots retained for debugging. |

Cache entries lived under `PROJECT/.prettier-plugin-gml/project-index-cache.json`
with keys derived from the formatter version, plugin version, manifest mtimes,
and the mtimes of the sources involved in the plan. Deleting the directory forced
a rebuild on the next run. Dry-run metrics reported cache hits versus rebuilds to
support deterministic CI assertions.

Manual snapshots remained supported for audits: call
`buildProjectIndex(projectRoot)` (or reuse the scripted example in the
[locals-first configuration](#locals-first-configuration-script)), persist the
JSON, and provide it via `identifierCaseProjectIndex` to replay the exact plan.

### Project index cache design

This note outlines the initial direction for the project-index cache that backed
upcoming formatter concurrency features. These details now live alongside the
rest of the archived identifier-case rollout material so historical references
remain consolidated.

#### Locating the GameMaker project root

The cache needs to be keyed by the GameMaker project that a formatted file
belongs to. Prettier exposes the current file path via `options.filepath`, so we
treat it as the starting point for discovery.

1. Normalize the path with `path.resolve` to collapse relative segments and to
   give us a stable anchor that works across invocations.
2. Walk up the directory tree from `dirname(options.filepath)` until either a
   `.yyp` manifest is found or we reach the filesystem root.
3. Treat the first directory that contains a `.yyp` file as the project root.
   GameMaker places exactly one manifest in the root, so the nearest manifest
   matches the user's expectation even when nested project folders exist.
4. Bail out (return `null`) if no manifest is discovered. This covers formatting
   loose scripts or running Prettier on a subset of files that do not belong to
   a full project checkout.

The lookup uses `fs.promises.readdir` by default but accepts an injected file
system facade so tests and callers with virtual file systems can reuse the
logic.

#### Cache key shape and modification times

Cache entries must be invalidated when any project metadata that influences the
formatter changes. The key therefore includes the following components:

- The formatter build identifier (for now a version string passed in by the
  caller).
- The canonical project root path detected by the heuristic above.
- A stable digest that captures the modification times (`mtimeMs`) for the
  `.yyp` manifest and the formatted source file.

To keep the implementation deterministic we sort manifest names and stringify
all numeric values before mixing them into a SHA-256 digest. Any time either
file changes on disk, its `mtimeMs` shifts, producing a new hash and therefore a
new cache entry. This keeps cache coordination simple while still allowing the
system to reuse work across parallel Prettier runs when nothing relevant has
changed.

#### Metrics-driven tuning and operational heuristics

Instrumentation was added to both the project index builder and the rename
planner so we can observe timing, identifier counts, and cache behaviour in real
projects. The collected metrics surfaced three practical improvements:

1. **Built-in identifier cache invalidation** – the loader now records the
   `mtimeMs` of `resources/gml-identifiers.json`. If the file changes between
   runs the cache is treated as stale and reloaded; otherwise we count a cache
   hit. The tracker exposes hit/miss/stale counters so we can detect unexpected
   churn during benchmarking.
2. **I/O batching with bounded concurrency** – scanning and parsing GML files now
   honours a configurable concurrency limit (defaulting to four workers and
   clamped between one and sixteen). The metrics include the active concurrency
   to make it obvious when the system is CPU- or I/O-bound. Processing happens in
   batches so slow network storage no longer serialises the entire pipeline.
3. **Rename planner accounting** – the identifier-case pipeline records how many
   declarations, references, and rename operations were examined versus accepted.
   Conflict counters (configuration, collisions, reserved words) make it easy to
   spot tuning opportunities for ignore/preserve lists when the numbers spike.

The `performance` CLI command (for example,
`node ./src/cli/src/cli.js performance --suite identifier-text`) runs the
selected benchmark suites and prints the captured metrics as structured JSON.
Use `--stdout` when piping the report into tools like `jq`; the CLI now keeps
that stream clean by redirecting the "report written" summary to stderr. The
command also emits a short stderr summary when any benchmark suite fails so the
failure is visible even without inspecting the JSON, and exits with a non-zero
status so automation can react immediately. This gives us an ad-hoc regression
harness for spotting regressions before they make it into CI.

#### Cache persistence schema

The persisted cache now lives inside
`.prettier-plugin-gml/project-index-cache.json` at the project root. Each
payload is versioned (`schemaVersion`) so future changes can coexist with older
formatter releases. The remaining metadata captures everything needed to
validate a cache hit without rebuilding the index:

- `projectRoot` – canonical absolute path for the project that produced the
  cache file.
- `formatterVersion` / `pluginVersion` – surface compatibility mismatches between
  the host Prettier binary and the plugin bundle.
- `manifestMtimes` / `sourceMtimes` – normalised maps of `mtimeMs` readings for
  `.yyp` manifests and the formatted source file(s).
- `metricsSummary` – condensed snapshot of the metrics captured during the build,
  re-attached to the in-memory project index when a cache hit occurs.
- `projectIndex` – the actual index data structure with the metrics removed (they
  are stored separately as noted above).

`loadProjectIndexCache` validates this schema and returns typed miss reasons so
callers can distinguish corruption (`invalid-json`/`invalid-schema`) from stale
inputs (`manifest-mtime-mismatch`, `formatter-version-mismatch`, etc.).
`saveProjectIndexCache` writes the payload via a temporary file followed by an
atomic rename and refuses to persist entries that exceed the configured size
limit (8 MiB by default) to avoid unbounded disk growth. Callers can tune the
limit with the `gmlIdentifierCaseProjectIndexCacheMaxBytes` Prettier option;
setting the option (or `GML_PROJECT_INDEX_CACHE_MAX_SIZE`) to `0` disables the
cap when larger caches are required.

#### Coordination and locking

`createProjectIndexCoordinator` guards concurrent builds for the same
`projectRoot`. Calls to `ensureReady(projectRoot, …)` share in-flight work via an
in-process mutex so only one formatter worker rebuilds the index while others
await the result. When the build completes, the coordinator persists the cache
before unblocking queued calls. A `dispose()` hook clears in-memory state so
long-lived processes (tests, language servers) can release resources explicitly
between runs.

## Rollout workflow and safeguards

A locals-first rollout kept the legacy feature safe for teams adopting renames:

1. **Warm the cache** by running the formatter once from the project root so the
   bootstrap could materialise `.prettier-plugin-gml/project-index-cache.json`.
2. **Enable a dry-run locals scope** (`gmlIdentifierCaseLocals: "camel"`) while
   leaving other scopes set to `"inherit"` and capture reports through
   `identifierCaseReportLogPath`.
3. **Review dry-run output** for collisions, preserved identifiers, and missing
   coverage before enabling writes.
4. **Expand scope coverage incrementally** (functions → structs → instance →
   globals → macros/defines) with peer review at each stage. Asset renames were
   deferred until the team was ready for on-disk changes.
5. **Promote to write mode** by disabling the dry-run flag, re-running Prettier
   with `--write`, and committing both code edits and the accompanying audit log.

Operational safeguards emphasised reversible checkpoints and predictable disk
mutations:

- Capture a commit or external backup before running rename writes.
- Confirm the formatter process had write access; rename utilities aborted when
  permissions were missing.
- Review generated rename logs and keep them with the backup until the GameMaker
  IDE validated the changes.
- Restore from the checkpoint if a rename failed midway.

## Example conversions

These preserved examples illustrate how tricky identifiers normalised across the
supported case styles:

| Original identifier | camel | pascal | snake-lower | snake-upper |
| --- | --- | --- | --- | --- |
| `hp2D_max` | `hp2DMax` | `Hp2DMax` | `hp2d_max` | `HP2D_MAX` |
| `argument[0]` | `argument[0]` | `argument[0]` | `argument[0]` | `argument[0]` |
| `argument[0].hp_max` | `argument[0].hpMax` | `argument[0].HpMax` | `argument[0].hp_max` | `argument[0].HP_MAX` |
| `global.__hpMax` | `global.__hpMax` | `global.__HpMax` | `global.__hp_max` | `global.__HP_MAX` |
| `HTTPRequestURL` | `httpRequestUrl` | `HttpRequestUrl` | `http_request_url` | `HTTP_REQUEST_URL` |
| `_privateValue` | `_privateValue` | `_PrivateValue` | `_private_value` | `_PRIVATE_VALUE` |
| `__init__` | `__init__` | `__Init__` | `__init__` | `__INIT__` |
| `pathFinder_state_2` | `pathFinderState2` | `PathFinderState2` | `path_finder_state_2` | `PATH_FINDER_STATE_2` |

Identifiers that already satisfied the requested case (for example `argument[0]`)
remained unchanged across conversions.

## Related legacy assets

- `resources/gml-identifiers.json` — Snapshot of reserved identifiers harvested
  from the GameMaker manuals to avoid collisions during automated renames.

For current scope behaviour, consult the "Scope-aware semantic pipeline" section
in `docs/live-reloading-concept.md`, the
[`docs/semantic-scope-plan.md`](./semantic-scope-plan.md) companion, and the
semantic package README.

## Archived project-index roadmap

> **Status: Historical reference.** The follow-up plan below has been
> superseded by newer semantic pipeline work, but it remains available for
> teams that need to replay the original project-index rollout.

### 1. Project-index cache persistence & coordination — ✅ shipped

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

### 2. Auto-discovery bootstrap inside the plugin — ✅ shipped

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

### 3. Wire non-local scopes into the rename planner — 🚧 in progress

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

### 4. Release readiness and observability — 🚧 queued

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

## Locals-first configuration script

The following script bootstraps a locals-first rollout, captures the project
index for reuse, and records dry-run reports. Update the `projectRoot` if your
configuration lives outside the GameMaker manifest directory.

```mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildProjectIndex } from "./node_modules/root/src/plugin/src/project-index/index.js";

const configFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(configFilePath);
const reportsDir = path.join(projectRoot, ".gml-reports");
const indexPath = path.join(reportsDir, "project-index.json");
const logPath = path.join(reportsDir, "identifier-case-dry-run.json");

await mkdir(reportsDir, { recursive: true });

let projectIndex;
try {
    const cachedIndex = await readFile(indexPath, "utf8");
    projectIndex = JSON.parse(cachedIndex);
} catch {
    projectIndex = await buildProjectIndex(projectRoot);
    await writeFile(
        indexPath,
        `${JSON.stringify(projectIndex, null, 2)}\n`,
        "utf8"
    );
}

export default {
    plugins: ["./node_modules/root/src/plugin/src/gml.js"],
    overrides: [
        {
            files: "*.gml",
            options: {
                parser: "gml-parse"
            }
        }
    ],
    // Enable locals-first renaming while keeping other scopes in observation mode.
    gmlIdentifierCase: "camel",
    gmlIdentifierCaseLocals: "camel",
    gmlIdentifierCaseFunctions: "inherit",
    gmlIdentifierCaseStructs: "inherit",
    gmlIdentifierCaseInstance: "inherit",
    gmlIdentifierCaseGlobals: "inherit",
    gmlIdentifierCaseAssets: "off",
    gmlIdentifierCaseMacros: "inherit",
    identifierCaseProjectIndex: projectIndex,
    identifierCaseDryRun: true,
    identifierCaseReportLogPath: logPath
};
```

## Sample dry-run report

Dry runs captured JSON payloads that validated rename coverage, conflicts, and
preservation rules before enabling write mode. The structure below illustrates a
minimal locals-first run.

```json
{
  "version": 1,
  "generatedAt": "2024-03-07T12:34:56.789Z",
  "summary": {
    "renameCount": 1,
    "impactedFileCount": 1,
    "totalReferenceCount": 3,
    "conflictCount": 2,
    "severityCounts": {
      "warning": 1,
      "info": 1
    }
  },
  "renames": [
    {
      "id": "local:demo-script:counter_value",
      "kind": "identifier",
      "scope": {
        "id": "script:demo",
        "displayName": "demo (Script)"
      },
      "from": {
        "name": "counter_value"
      },
      "to": {
        "name": "counterValue"
      },
      "referenceCount": 3,
      "references": [
        {
          "filePath": "scripts/demo/demo.gml",
          "occurrences": 3
        }
      ]
    }
  ],
  "conflicts": [
    {
      "code": "collision",
      "message": "Renaming 'collision_counter' to 'collisionCounter' collides with 'collisionCounter'.",
      "severity": "warning",
      "scope": {
        "id": "script:demo",
        "displayName": "demo (Script)"
      },
      "identifier": "collision_counter",
      "suggestions": [],
      "details": null
    },
    {
      "code": "preserve",
      "message": "Identifier 'preserve_me' is preserved by configuration.",
      "severity": "info",
      "scope": {
        "id": "script:demo",
        "displayName": "demo (Script)"
      },
      "identifier": "preserve_me",
      "suggestions": [
        "Remove the name from gmlIdentifierCasePreserve to allow renaming."
      ],
      "details": null
    }
  ]
}
```
