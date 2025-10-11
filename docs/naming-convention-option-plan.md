# Plan: Project-wide naming-convention transformations in the Prettier GML plugin

## Objective
Introduce an opt-in Prettier plugin feature that can rewrite user-defined identifiers (variables, functions, macros, enums, and asset names) to a configurable naming convention (e.g. camelCase → snake_case) while formatting GameMaker projects. The extension must:
- Preserve program behaviour and avoid collisions with existing identifiers or GameMaker reserved names from [../resources/gml-identifiers.json](../resources/gml-identifiers.json).
- Respect identifier scope (local, script-level, object instance, global, macro, enum) and project asset relationships captured in `.yy` metadata.
- Provide transparent reporting so developers can audit or rollback changes.

## Constraints and open questions
- **GML case semantics:** GML treats identifiers case-sensitively at runtime and in the IDE, so variables with different casing are considered distinct. Our collision detection must assume case-sensitive runtime semantics even when the new casing differs only by lettercase.
- **Prettier execution model:** The plugin currently formats one file at a time with no persistent cross-file state. We need a lightweight project index that can be shared across formatting runs (e.g. via a cache file keyed by project root) without breaking Prettier’s stateless expectations.
- **Asset renames vs. filesystem changes:** Updating a script’s name in `.yy` metadata is insufficient if the IDE expects the filename to match. So, the formatter **must** be allowed to rename files on disk.
- **Incremental adoption:** Teams may only want to convert certain identifier classes (e.g. local variables or just macros) or exclude specific prefixes (e.g. `global.`). The option must be granular and default-safe (no renames unless explicitly enabled).
- **Third-party code:** Imported marketplace packages or engine snippets may rely on specific identifier shapes. Provide exclusion lists or directory-level opt outs to avoid unwanted rewrites.

## Deliverables
1. **Configuration schema**
   - New Prettier option `gmlIdentifierCase` (or similar) defined in the **options** array in [../src/plugin/src/gml.js](../src/plugin/src/gml.js) with these choices: `"off"`, `"camel"` (lower camelCase), `"pascal"` (upper camelCase), `"snake-lower"`, `"snake-upper"`. **NOTE**: Kebab case (or any hyphenated form) is invalid in GML identifiers.
   - Sub-option(s) to allow for scope targeting, e.g. `functions`, `structs`, `locals`, `instance`, `globals`, `assets`, `macros`, each defaulting to `off` until explicitly set and to allow for per-scope identifier case (e.g. `locals: "snake-lower"`, `globals: "snake-upper"`).
   - Optional `ignorePatterns` array (glob/regex) to skip identifiers or files, and `preserve` list for exact names.

2. **Identifier analysis infrastructure**
   - Extend the parser layer (`src/parser`) to emit richer symbol tables: capture declaration spans, scope hierarchy, and identifier classifications for each AST node.
   - Build a shared `ProjectIndex` module under `src/shared` that:
     - Scans `.gml` and `.yy` files once per formatting session (leveraging Prettier’s `options.filepath` to locate project root).
     - Records all user-defined identifiers keyed by fully qualified scope (e.g. `object.oPlayer.event.Step.local.hp`).
     - Loads `resources/gml-identifiers.json` and tags built-ins so they can be filtered out early.
     - Tracks cross-file references (script calls, event references) so renames cascade correctly.
   - Cache the index in a temp file keyed by project path + file mtimes to avoid rebuilding on every invocation.

3. **Naming transformation engine**
   - Implement deterministic case-conversion helpers (snake, camel, Pascal, upper, lower) that preserve numeric suffixes and known prefixes (e.g. `global.`, `argument[0]`).
   - Provide conflict detection by building the prospective rename map and verifying:
     - No two source identifiers map to the same target within the same scope, considering case-insensitive comparisons.
     - No target conflicts with reserved identifiers or user-preserved names.
     - Asset renames maintain unique `name` fields within resource folders.
   - On conflicts, emit structured diagnostics describing the offending identifiers and skip the rename rather than proceeding silently.

4. **Formatter integration**
   - During formatting, consult the `ProjectIndex` for the current file. For each identifier node, decide whether it is eligible (per scope flags) and, if so, replace the printed token with the converted name.
   - Update `.yy` asset formatters to rewrite `name`, `resourcePath`, and related identifier fields when `assets` is included in the list of , ensuring references in other assets (e.g. object events referencing scripts) are updated simultaneously.
   - For assets whose filenames must change, we need to verify that we have file-permissions to rename them before renaming an assets that would require files to be renamed.

5. **Safety nets & UX**
   - The default when running the formatter with the `gmlIdentifierCase` config option enabled should be a dry-run/report mode that just outputs a summary of planned renames and conflicts without touching files. But, like with Prettier, when the `--write` flag option is provided then the changes are applied.
   - Add lint-style warnings to Prettier’s `diagnostics` channel when renames are skipped, guiding the user to ignore or resolve collisions.

6. **Testing strategy**
   - Unit tests for case conversion helpers covering edge cases (leading underscores, mixed digits, existing separators).
   - Parser regression tests that ensure symbol tables correctly classify declarations in functions, `with` statements, `#macro`, `enum`, structs, and anonymous functions.
   - Integration tests using synthetic GameMaker projects:
     - Verify project index builds stable rename maps across multiple files and events.
     - Confirm conflicts (e.g. two variables differing only by case) block renaming.
     - Ensure `.yy` asset renames update dependent references (objects, rooms, scripts) consistently.
   - Snapshot the diagnostics/log output for representative rename runs.

7. **Documentation & onboarding**
   - Update `README.md` with configuration examples and usage guidance, including how to stage the renaming rollout (e.g. run dry-run, review log, enable per-scope flags incrementally).
   - Document interaction with existing features like reserved identifier handling and any new CLI helpers.

## Implementation phases
1. **Research & design**
   - Audit current parser symbol extraction capabilities; identify gaps for scope tracking (e.g. locals inside `for` loops, struct methods).
   - Prototype conversion helpers and confirm they align with community expectations for camel/snake/pascal cases.
   - Survey GameMaker IDE requirements for asset renames (file naming rules, GUID usage) to decide on automatic vs. advisory behaviour.

2. **Infrastructure groundwork**
   - Extend parser to emit declaration metadata and update existing formatter code to consume the richer AST without breaking backward compatibility.
   - Implement `ProjectIndex` caching and reserved identifier filters. Verify performance on medium projects (hundreds of scripts).

3. **Scoped renaming**
   - Enable renaming for local variables first (lowest risk). Validate with integration tests and dry-run logs.
   - Incrementally add support for script-level functions, macros, and enums, adding conflict detection for each scope.
   - Expand to instance/global fields once asset cross-references are stable.

4. **Asset metadata updates**
   - Implement `.yy` mutation layer with dependency graph to propagate renames to referencing assets.

## Risk mitigation
- **Collision risk:** Always compute rename plans globally before mutating. Abort formatting for files tied to unresolved conflicts and instruct the user to resolve duplicates or adjust ignore lists.
- **Performance regression:** Cache project analysis, debounce rebuilds based on file mtimes, and expose metrics (e.g. number of identifiers processed) for profiling.
- **Data corruption:** Wrap asset writes in atomic operations (temp file + rename) and create backups when altering `.yy` files. If the process fails, restore from backup.
