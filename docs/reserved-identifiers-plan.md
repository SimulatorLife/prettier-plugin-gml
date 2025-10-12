# Plan: Dynamically harvesting built-in GML identifiers

## Goals and constraints
- Avoid maintaining a static hand-curated list of reserved names such as built-in functions, constants, enums, keywords, and automatic variables.
- Always align with the currently installed GameMaker release, and be resilient to YoYo Games adding or deprecating identifiers between versions.
- Keep the formatter fast: resolve identifiers lazily during development/build steps rather than at runtime inside the Prettier plugin.
- Prefer first-party sources to minimise drift and licence risk.

## Current implementation
- The harvesting pipeline lives in [`scripts/generate-gml-identifiers.mjs`](../scripts/generate-gml-identifiers.mjs) and defaults to writing `resources/gml-identifiers.json` so downstream consumers can load a single canonical snapshot.【F:scripts/generate-gml-identifiers.mjs†L1-L55】
- Cached manual artefacts are stored under `scripts/cache/manual/<sha>/…` by default, allowing repeated runs without re-downloading the same GameMaker manual revision. When that directory needs to move (e.g. on CI runners with separate scratch storage) pass `--cache-root` or set `GML_MANUAL_CACHE_ROOT` to relocate it without editing the script.【F:scripts/generate-gml-identifiers.mjs†L46-L141】【F:src/shared/cli/manual-cache.js†L1-L19】
- Run the script with `--help` (or `-h`) to see the supported flags: `--ref/-r` chooses the manual tag or commit, `--output/-o` overrides the destination path, `--force-refresh` bypasses the cache when you need a fresh snapshot, `--progress-bar-width` resizes the terminal progress indicator, the new `--cache-root` flag relocates cached assets, and `--help/-h` prints the usage summary.【F:scripts/generate-gml-identifiers.mjs†L46-L141】
- `GML_MANUAL_REF` remains a convenient environment variable for CI jobs that must pin the identifiers to a specific GameMaker version, `GML_PROGRESS_BAR_WIDTH` lets you change the default progress bar width without passing CLI flags, and `GML_MANUAL_CACHE_ROOT` moves the manual cache globally for all invocations.【F:scripts/generate-gml-identifiers.mjs†L46-L141】【F:src/shared/cli/manual-cache.js†L1-L19】

## Primary upstream sources
1. **YoYo Games GameMaker Manual repository** (`YoYoGames/GameMaker-Manual`)
   - The `develop` branch mirrors the HTML manual that ships with monthly releases.
   - `ZeusDocs_keywords.json` contains the canonical keyword-to-manual-topic map that drives the manual search index. Every documented function, variable, enum member, etc., appears here under its exported name. Example entries such as `x` → `3_Scripting/4_GML_Reference/Instances/Instance_Variables/x` and `instance_create_layer` → `3_Scripting/4_GML_Reference/Instances/Instance_Functions/instance_create_layer` demonstrate the path data we can leverage for categorisation.【F:docs/reserved-identifiers-plan.md†L12-L17】【F:docs/reserved-identifiers-plan.md†L36-L39】
   - `Manual/contents/assets/scripts/gml.js` drives highlight.js on the manual site and already enumerates the reserved keywords (`KEYWORDS` array), literal constants and enums (`LITERALS` array), and built-in variables/symbols (`SYMBOLS` array). The file is machine-readable ES module code, so we can parse it and lift the identifier tables directly.【F:docs/reserved-identifiers-plan.md†L18-L24】
   - Manual topic HTML files embed keyword/tag comments (`<!-- KEYWORDS ... -->`, `<!-- TAGS ... -->`) that can be scraped for verification when we need to detect additions that bypass the JSON/JS datasets.【F:docs/reserved-identifiers-plan.md†L24-L27】
2. **Manual release metadata**
   - The manual repo tags (e.g. `release-2024.11`) line up with public GameMaker builds. Fetching tags lets us pin an identifier snapshot to the formatter's supported runtime or respect a user-provided IDE version.【F:docs/reserved-identifiers-plan.md†L28-L31】

## Extraction pipeline
1. **Version selection**
   - Accept either an explicit GameMaker version (from user/project config) or default to the latest manual tag. Resolve to a commit SHA via the GitHub API, cache it locally (e.g. under `scripts/cache/manual/<sha>/`).【F:docs/reserved-identifiers-plan.md†L33-L39】
2. **Data acquisition**
   - Download `ZeusDocs_keywords.json`, `ZeusDocs_tags.json`, and `Manual/contents/assets/scripts/gml.js` at the chosen commit. Store them in the cache with the commit SHA to avoid repeated network calls.【F:docs/reserved-identifiers-plan.md†L39-L44】
   - Optionally pull specific topic HTML files on demand when a keyword’s classification is ambiguous (e.g. manual pages that act as category indexes instead of concrete identifiers).【F:docs/reserved-identifiers-plan.md†L44-L47】
3. **Parsing**
   - Evaluate `gml.js` in a sandboxed Node process (or parse with a lightweight JS parser) to extract the literal `KEYWORDS`, `LITERALS`, and `SYMBOLS` arrays. These become the base reserved-word, constant/enum, and built-in variable lists respectively.【F:docs/reserved-identifiers-plan.md†L49-L54】
   - Load `ZeusDocs_keywords.json` and build a lookup of `identifier → topic path`. Use heuristics on the path segments (`Instance_Functions`, `Constants`, `Variables`, `Enums`, etc.) to categorise the identifier type. `ZeusDocs_tags.json` provides additional hints (comma-separated topical tags) that can confirm or refine the classification when the folder name is generic.【F:docs/reserved-identifiers-plan.md†L54-L60】
   - When heuristics disagree (e.g. a keyword resolves to an index page), fetch and parse the corresponding HTML topic, inspecting the `<h1>` title, `Syntax` block, and `<!-- TAGS ... -->` comment to decide whether the identifier is a function, macro, constant group, or just a documentation hub.【F:docs/reserved-identifiers-plan.md†L60-L64】
4. **Normalisation & deduplication**
   - Merge the three sources, normalise casing, and drop duplicates. Where `gml.js` and `ZeusDocs_keywords.json` overlap, trust the richer metadata (path-derived classification). Keep `gml.js`-only items (e.g. raw keywords like `try`, `catch`) in a dedicated “language keyword” bucket.【F:docs/reserved-identifiers-plan.md†L66-L71】
   - Flag identifiers tagged as deprecated in the manual (look for strings like "Deprecated" in topic metadata) so consumers can optionally allow or warn on renaming.【F:docs/reserved-identifiers-plan.md†L71-L73】

## Consumption inside the plugin
- Emit a consolidated JSON artefact (e.g. `resources/gml-identifiers.json`) keyed by identifier with metadata (`{ type, source, manualPath, version }`). Regenerate this file via a script (e.g. `npm run build:gml-identifiers`) during release prep or when bumping supported GameMaker versions.【F:docs/reserved-identifiers-plan.md†L75-L80】
- The Prettier plugin can lazily load the JSON when performing rename-safe checks, ensuring runtime performance stays predictable.【F:docs/reserved-identifiers-plan.md†L80-L82】
- Add automated tests that diff the generated identifier set against the previous snapshot whenever the manual commit changes, catching unexpected removals and highlighting new reserved words that need explicit handling.【F:docs/reserved-identifiers-plan.md†L82-L85】

## Regeneration helper
- Run `npm run build:gml-identifiers` to download the latest manual artefacts (cached under `scripts/cache/`) and update `resources/gml-identifiers.json` with the consolidated identifier catalogue.
- Pass `--ref <branch|tag|commit>` to target a specific manual revision, or `--force-refresh` to bypass the cache when fetching upstream files.
- See the [README regeneration guide](../README.md#regenerate-metadata-snapshots) for a condensed workflow and related tooling entry points.

## Operational considerations
- **Rate limiting:** Use conditional requests (ETags) or GitHub API tokens when available to avoid 60-requests-per-hour unauthenticated ceilings, especially if multiple manual files must be fetched during development.【F:docs/reserved-identifiers-plan.md†L87-L90】
- **Offline workflows:** Cache the fetched manual artefacts in the repo (or allow pointing at a locally cloned manual) so CI and developer machines without internet access can still regenerate the identifier list.【F:docs/reserved-identifiers-plan.md†L90-L93】
- **Future data sources:** Monitor other YoYo Games repos (e.g. potential API dumps) and release notes to enrich metadata such as deprecated/experimental flags without scraping HTML each time.【F:docs/reserved-identifiers-plan.md†L93-L95】
