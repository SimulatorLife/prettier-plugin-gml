# Prettier Plugin for GameMaker Language

> ⚠️ The formatter is experimental. Back up your GameMaker project or commit your work before running it across large codebases.

## Formatter at a glance

See how the plugin rewrites real GameMaker Language (GML) inputs. Each example links to the corresponding regression fixture used by the automated test suite so you can diff behaviour without running the formatter locally.

#### Legacy `#define` cleanup

<table>
<thead>
<tr><th>Before</th><th>After</th></tr>
</thead>
<tbody>
<tr>
<td>

```gml
#define  LEGACY_MACRO 123456789
#define region Utility Scripts
var util = function(val) {
        return val * LEGACY_MACRO;
}
#define    end region Utility Scripts
#define 123 not valid
```

</td>
<td>

```gml
#macro  LEGACY_MACRO 123456789

#region Utility Scripts

var util = function(val) {
    return val * LEGACY_MACRO;
};

#endregion Utility Scripts
```

</td>
</tr>
</tbody>
</table>

<p align="right"><sub><a href="src/plugin/tests/define-normalization.input.gml">Input fixture</a> · <a href="src/plugin/tests/define-normalization.output.gml">Output fixture</a></sub></p>

#### Struct consolidation & trailing comments

<table>
<thead>
<tr><th>Before</th><th>After</th></tr>
</thead>
<tbody>
<tr>
<td>

```gml
function trailing_comment() {
    var stats = {};
    stats.hp = 100; // base health
    stats.mp = 50;
    return stats;
}
```

</td>
<td>

```gml
/// @function trailing_comment
function trailing_comment() {
    var stats = {
        hp: 100, // base health
        mp: 50
    };
    return stats;
}
```

</td>
</tr>
</tbody>
</table>

<p align="right"><sub><a href="src/plugin/tests/testStructs.input.gml#L31-L37">Input fixture</a> · <a href="src/plugin/tests/testStructs.output.gml#L39-L48">Output fixture</a></sub></p>

#### Loop length hoisting

<table>
<thead>
<tr><th>Before</th><th>After</th></tr>
</thead>
<tbody>
<tr>
<td>

```gml
for(var i=0;i<ds_queue_size(queue);i+=1){
for(var j=0;j<array_length(arr);j+=1){
show_debug_message($"{i}x{j}");
}
}
```

</td>
<td>

```gml
var queue_count = ds_queue_size(queue);
for (var i = 0; i < queue_count; i += 1) {
    var arr_len = array_length(arr);
    for (var j = 0; j < arr_len; j += 1) {
        show_debug_message($"{i}x{j}");
    }
}
```

</td>
</tr>
</tbody>
</table>

<p align="right"><sub><a href="src/plugin/tests/testHoist.input.gml#L1-L6">Input fixture</a> · <a href="src/plugin/tests/testHoist.output.gml#L1-L6">Output fixture</a></sub></p>

---

## Documentation map

- [Documentation index](docs/README.md) &mdash; Jumping-off point for the design
  notes, rollout guides, and metadata playbooks that live alongside the
  formatter source. Each entry includes a short synopsis so you can scan for the
  right level of detail.
- [Architecture audits](docs/architecture-audit-2025-10-22.md) &mdash; Latest
  repository health check, with links back to the
  [May 2024 audit](docs/architecture-audit-2024-05-15.md) and
  [shared module layout refresh](docs/shared-module-layout.md) for historical
  context around the `src/shared/` consolidation. Pair it with the
  [interface segregation investigation](docs/interface-segregation-investigation.md)
  when you need a refresher on why the CLI and plugin expose separate entry
  points.
- [Identifier casing handbook](docs/naming-conventions.md) &mdash; End-to-end
  coverage of the rename pipeline paired with the
  [scope reference](docs/identifier-case-reference.md),
  [rollout playbook](docs/identifier-case-rollout.md), and
  [tricky examples](docs/examples/naming-convention/tricky-identifiers.md) so
  you can dry-run `gmlIdentifierCase` safely before enabling writes.
- [Operational runbooks](docs/project-index-cache-design.md) &mdash; Design notes,
  cache architecture, and the rolling [project index roadmap](docs/project-index-next-steps.md)
  alongside the [Feather data plan](docs/feather-data-plan.md). Pair them with
  the [reserved identifier metadata hook overview](docs/reserved-identifier-metadata-hook.md)
  when staging bespoke metadata sources or regeneration scripts.
- [Live reloading concept](docs/live-reloading-concept.md) &mdash; Concept brief for
  the HTML5 runtime fork and watcher pipeline that powers in-place code reloads
  during gameplay. Use it alongside the architecture audits when evaluating
  runtime tooling work.

---

## Quick start

Confirm your runtime, then pick the install flow that matches how you plan to
use the formatter.

### 1. Verify prerequisites

- Node.js **25.0.0+**. Run `nvm use` against the bundled `.nvmrc` so local
  tooling matches CI. The workspace enforces the same floor across the parser,
  plugin, and CLI packages.
- npm (bundled with Node.js). Double-check availability with `node -v` and
  `npm -v`.

<details>
<summary><strong>Install Node.js with nvm</strong></summary>

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="${XDG_CONFIG_HOME:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install
nvm use
nvm alias default node
```

</details>

### 2. Install in a GameMaker project

1. Change into the directory that contains your `.yyp` file.
2. Decide how you want to source the formatter:

   - **Published package** &mdash; Install the released plugin directly from npm.

     ```bash
     npm install --save-dev prettier@^3 antlr4@^4.13.2 prettier-plugin-gamemaker@latest
     ```

   - **Nightly / workspace build** &mdash; Track `main` (or a specific tag/SHA)
     straight from GitHub when you need unreleased fixes or want access to the
     CLI workspace helpers.

     ```bash
     npm install --save-dev "prettier@^3" "antlr4@^4.13.2" \
         github:SimulatorLife/prettier-plugin-gml#main
     ```

     Quote dependency specs when using shells such as `zsh` so `^` is not
     treated as a glob, and pin the Git reference (`#vX.Y.Z` or `#<sha>`) for
     reproducible CI builds.

   Resolve `EBADENGINE` errors by upgrading Node.js to a supported release.
   The npm package ships only the Prettier plugin; rely on the commands in
   [Use a local clone](#3-use-a-local-clone) or the Git dependency when you need
   the CLI wrapper.
3. Configure Prettier so editor integrations and CLI runs resolve the plugin the
   same way.

   _Installed from npm_

   ```json
   {
     "plugins": [
       "prettier-plugin-gamemaker"
     ],
     "overrides": [
       {
         "files": "*.gml",
         "options": {
           "parser": "gml-parse"
         }
       }
     ]
   }
   ```

   _Installed from Git_

   ```jsonc
   {
     "plugins": [
       "./node_modules/root/src/plugin/src/gml.js"
     ]
   }
   ```

4. Expose a wrapper script so every teammate resolves the formatter the same
   way. Git installs bundle the CLI under `node_modules/root/src/cli/cli.js`.
   Track release notes for the companion CLI package if you prefer referencing
   an npm binary once it ships.

   ```jsonc
   {
     "scripts": {
       "format:gml": "node ./node_modules/root/src/cli/cli.js"
     }
   }
   ```

   Pass arguments with `npm run format:gml -- <flags>` so wrapper improvements
   propagate automatically. See [CLI wrapper environment knobs](#cli-wrapper-environment-knobs)
   for overrides such as `PRETTIER_PLUGIN_GML_PLUGIN_PATHS` when CI builds the
   plugin into a temporary directory. Use Prettier directly when you depend on
   the npm package alone—the CLI wrapper currently ships with the Git
   workspace.
5. Run the formatter. The wrapper defaults to the current working directory when
   no path is provided. Pass `--help` at any time to confirm which plugin entry
   was resolved and which extensions will run:

   ```bash
   npm run format:gml
   npm run format:gml -- --check
   npm run format:gml -- --path . --extensions=.gml,.yy
   npx prettier --plugin=prettier-plugin-gamemaker --check "**/*.gml"
   node ./node_modules/root/src/cli/cli.js --path .
   node ./node_modules/root/src/cli/cli.js --help
   ```

### 3. Use a local clone

1. Clone this repository and install dependencies:

   ```bash
   git clone https://github.com/SimulatorLife/prettier-plugin-gml.git
   cd prettier-plugin-gml
   npm install
   ```

2. Format any GameMaker project without adding dependencies to that project. The
   CLI exposes a `format` command that accepts an explicit path and optional
   extensions:

   ```bash
   npm run cli -- format "/absolute/path/to/MyGame" --extensions=.gml,.yy
   ```

   The wrapper honours both repositories’ `.prettierrc` and `.prettierignore`
   files, prints a skipped-file summary with concrete examples of unsupported
  files, lets you cap the ignored-directory sample list surfaced in summaries
  with `--ignored-directory-sample-limit` (alias
  `--ignored-directory-samples`) or the
  `PRETTIER_PLUGIN_GML_SKIPPED_DIRECTORY_SAMPLE_LIMIT` environment variable,
  and trims unsupported-extension examples with
  `--unsupported-extension-sample-limit` or
  `PRETTIER_PLUGIN_GML_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT`, explains when no
  files match the configured extensions, supports dry-run
   enforcement via `--check` (exits with code 1 when differences remain),
   accepts
   `--on-parse-error=skip|abort|revert` (or
   `PRETTIER_PLUGIN_GML_ON_PARSE_ERROR`), surfaces Prettier’s logging knob via
   `--log-level=debug|info|warn|error|silent` (or
   `PRETTIER_PLUGIN_GML_LOG_LEVEL`), and can pick up a default extension list
   from `PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS`. Leave `--extensions` unset to
   format only `.gml` files, or override it when you also want to process `.yy`
   metadata. Explore additional helpers with `npm run cli -- --help`,
   `npm run cli -- format --help`, or the dedicated
   [CLI reference](#cli-wrapper-environment-knobs).

<details>
<summary><strong>Optional: global install</strong></summary>

```bash
npm install --global --save-exact prettier prettier-plugin-gamemaker
prettier --plugin=prettier-plugin-gamemaker --write "**/*.gml"
```

If you see an `ENOTDIR` error mentioning `node_modules/root`, remove any stale
folders created by previous installs and retry.

</details>

### 4. Validate your setup

Run these commands after dependency updates or when onboarding a teammate. Add
`--extensions` only when your project stores `.yy` metadata alongside `.gml`.

_Installed from npm_

```bash
npx prettier --plugin=prettier-plugin-gamemaker --support-info | grep gml-parse
npx prettier --plugin=prettier-plugin-gamemaker --check "**/*.gml"
```

_Installed from Git_

```bash
npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --support-info | grep gml-parse
npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --check "**/*.gml"
```

```bash
npm run format:gml -- --extensions=.gml,.yy
node ./node_modules/root/src/cli/cli.js --help
npm run cli -- --help
```

Consult the [identifier-case rollout playbook](docs/identifier-case-rollout.md)
when you plan to enable automated renames and need to audit bootstrap
behaviour, cache hygiene, or dry-run reports.

## Architecture overview

The repository is organised as a multi-package workspace so the parser, plugin,
and CLI can evolve together. Each package ships its own tests and CLI entry
points while sharing utilities via the `src/shared/` module.

| Package / folder | Location | Purpose |
| --- | --- | --- |
| `prettier-plugin-gamemaker` | `src/plugin/` | Prettier plugin entry point (`src/gml.js`), printers, option handlers, CLI surface helpers, and regression fixtures. |
| `gamemaker-language-parser` | `src/parser/` | ANTLR grammar sources, generated parser output, and the parser test suite. |
| `prettier-plugin-gml-cli` | `src/cli/` | Command-line interface (`cli.js`) for metadata generation, formatting wrapper commands, integration tests, and performance tooling. |
| Shared modules | `src/shared/` | Helper modules shared by the plugin, CLI, and parser (identifier casing, AST utilities, string helpers). |
| Metadata snapshots | `resources/` | Generated datasets consumed by the formatter (identifier inventories, Feather metadata). |
| Documentation | `docs/` | Planning notes, rollout guides, and deep-dive references. Start with [`docs/README.md`](docs/README.md) for an index. |

The `npm run format:gml` script wires the CLI wrapper to the workspace copy of
Prettier so both local development and project integrations resolve the same
plugin entry. Regeneration helpers such as `npm run build:gml-identifiers` and
`npm run build:feather-metadata` refresh the datasets under `resources/` when the
upstream GameMaker releases change. See the [Development](#development) section
for the full suite of contributor commands.

> **Note:** All developer-facing utilities live under `src/cli/commands/`.
> When adding new helpers, expose them through the CLI instead of creating
> stand-alone scripts so contributors have a single, discoverable entry point.

---

## Everyday use

### Command-line snippets

- Format everything in the current project:

  ```bash
  npx prettier --plugin=prettier-plugin-gamemaker --write .
  ```

- Dry-run formatting for CI or pre-commit checks:

  ```bash
  npx prettier --plugin=prettier-plugin-gamemaker --check "rooms/**/*.gml"
  ```

- Format a single file:

  ```bash
  npx prettier --plugin=prettier-plugin-gamemaker --write scripts/player_attack.gml
  ```

  > **Workspace installs:** Replace the `--plugin` specifier with
  > `./node_modules/root/src/plugin/src/gml.js` when the repository is vendored
  > directly into `node_modules/root/`.

- Use the wrapper helper (accepts the same flags as `npm run format:gml --`):

  ```bash
  node ./node_modules/root/src/cli/cli.js --extensions=.gml,.yy
  ```

- Preview formatting changes without writing them back:

  ```bash
  node ./node_modules/root/src/cli/cli.js --check
  ```

- Discover supported flags or double-check defaults:

  ```bash
  node ./node_modules/root/src/cli/cli.js --help
  ```

- Inspect formatter-specific switches:

  ```bash
  node ./node_modules/root/src/cli/cli.js format --help
  ```

- Check the wrapper version label surfaced by `--version` or `-V`:

  ```bash
  node ./node_modules/root/src/cli/cli.js --version
  ```

### CLI wrapper environment knobs

The wrapper honours environment variables so CI systems can tune behaviour
without editing project scripts:

- `PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS` &mdash; Overrides the implicit
  extension list used when `--extensions` is omitted. The wrapper defaults to formatting `.gml` only when neither the flag nor the environment variable is present.
- `PRETTIER_PLUGIN_GML_LOG_LEVEL` &mdash; Sets the default Prettier log level
  when the wrapper runs without `--log-level`. Accepted values mirror Prettier:
  `debug`, `info`, `warn`, `error`, or `silent`.
- `PRETTIER_PLUGIN_GML_ON_PARSE_ERROR` &mdash; Sets the default
  `--on-parse-error` strategy (`skip`, `revert`, or `abort`).
- `PRETTIER_PLUGIN_GML_SKIPPED_DIRECTORY_SAMPLE_LIMIT` &mdash; Caps how many
  ignored directories appear in the summary when the wrapper honours
  `.prettierignore` entries. Combine with
  `--ignored-directory-sample-limit` (or `--ignored-directory-samples`) for
  per-run overrides.
- `PRETTIER_PLUGIN_GML_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT` &mdash; Limits how many
  example files appear in the unsupported-extension summary. Pair with
  `--unsupported-extension-sample-limit` when tuning individual runs.
- `PRETTIER_PLUGIN_GML_PLUGIN_PATHS` (or the singular `PRETTIER_PLUGIN_GML_PLUGIN_PATH`) &mdash;
  Adds repository-relative or absolute plugin entry point paths for the wrapper
  to consider before falling back to its built-in candidates. Useful when CI
  jobs build the plugin into a temporary directory.
- `PRETTIER_PLUGIN_GML_PRETTIER_MODULE` &mdash; Overrides the module specifier used
  to resolve Prettier. Handy when the formatter runs inside a monorepo with a
  custom Prettier build or when you pin a nightly via a local alias.
- `PRETTIER_PLUGIN_GML_VERSION` &mdash; Injects the version label surfaced by
  `node ./node_modules/root/src/cli/cli.js --version`. Handy when mirroring
  release tags or packaging nightly builds.

### Visual Studio Code

1. Install the [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension.
2. Install a GML language service such as [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support).
3. Ensure the workspace `package.json` lists `prettier`, `antlr4`, and either the
   npm package (`prettier-plugin-gamemaker`) or the Git dependency so VS Code can
   resolve the plugin.
4. Enable format-on-save:

   ```json
   {
     "editor.formatOnSave": true,
     "[gml]": {
       "editor.defaultFormatter": "esbenp.prettier-vscode"
     }
   }
   ```

---

## Configuration reference

Keep overrides scoped to `.gml` files so other languages remain unaffected.

```json
{
  "plugins": ["prettier-plugin-gamemaker"],
  "overrides": [
    {
      "files": "*.gml",
      "options": {
        "printWidth": 120,
        "tabWidth": 4,
        "semi": true
      }
    }
  ]
}
```

Refer to the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for the complete option list. GameMaker-specific overrides live alongside your `.yyp` so both the CLI and editor integrations share a single source of truth.

> **Workspace installs:** When you track `main` directly from GitHub, swap the
> plugin entry for `"./node_modules/root/src/plugin/src/gml.js"` so Prettier
> resolves the bundled workspace build.

### Plugin-specific options

#### Core formatter behaviour

Optional arguments without explicit defaults always render as `undefined` in formatted output.

Template strings that never interpolate expressions automatically collapse back to regular quoted strings, stripping the `$` prefix so placeholder-free text stays concise.

| Option | Default | Summary |
| --- | --- | --- |
| `optimizeLoopLengthHoisting` | `true` | Hoists supported collection length checks out of `for` loop conditions and caches them in a temporary variable. |
| `condenseStructAssignments` | `true` | Converts consecutive struct property assignments into a single literal when comments and control flow permit it. |
| `loopLengthHoistFunctionSuffixes` | `""` | Override cached variable suffixes per function or disable hoisting for specific helpers. |
| `allowSingleLineIfStatements` | `false` | Enable to keep trivial `if` statements on one line; leave at `false` to always expand blocks. |
| `logicalOperatorsStyle` | `"keywords"` | Choose `"symbols"` to keep `&&`/`||` instead of rewriting them to `and`/`or`. |
| `condenseLogicalExpressions` | `false` | Merges adjacent logical expressions that use the same operator. |
| `preserveGlobalVarStatements` | `true` | Keeps `globalvar` declarations while still prefixing later assignments with `global.`. |
| `alignAssignmentsMinGroupSize` | `3` | Aligns simple assignment operators across consecutive lines once the group size threshold is met. |
| `maxParamsPerLine` | `0` | Forces argument wrapping after the specified count (set to `0` to remove the numeric limit; nested callbacks may still wrap for readability). |
| `applyFeatherFixes` | `false` | Applies opt-in fixes backed by GameMaker Feather metadata (e.g. drop trailing semicolons from `#macro`). |
| `useStringInterpolation` | `false` | Upgrades eligible string concatenations to template strings (`$"Hello {name}"`). |
| `convertDivisionToMultiplication` | `false` | Rewrites division by literals into multiplication by the reciprocal when safe. |
| `convertManualMathToBuiltins` | `false` | Collapses bespoke math expressions into their equivalent built-in helpers (for example, turn repeated multiplication into `sqr()`). |
| `condenseUnaryBooleanReturns` | `false` | Converts unary boolean returns (such as `return !condition;`) into ternaries so condensed output preserves intent. |
| `condenseReturnStatements` | `false` | Merges complementary `if` branches that return literal booleans into a single simplified return statement. |

Line comments automatically drop YoYo Games' generated banner message (`Script assets have changed for v2.3.0 ... for more information`) and the default IDE stubs (`/// @description Insert description here`, `// You can write your code in this editor`) so repository diffs stay focused on deliberate edits instead of generated scaffolding.

> **Note:** The formatter intentionally enforces canonical whitespace. Legacy escape hatches such as `preserveLineBreaks` and the `maintain*Indentation` toggles were removed to keep formatting deterministic.

Bare struct literals now respect Prettier's [`objectWrap`](https://prettier.io/docs/en/options.html#object-wrap) option introduced in v3.5.0. When formatting GML, the plugin maps the behaviour directly onto struct literals:

- `objectWrap: "preserve"` (default) keeps the literal multi-line when the original source placed a newline immediately after `{`.
- `objectWrap: "collapse"` inlines eligible literals onto a single line when they fit within the configured `printWidth`.

```gml
// objectWrap: "preserve"
var enemy = {
    name: "Slime",
    hp: 5
};

// objectWrap: "collapse"
var enemy = {name: "Slime", hp: 5};
```

Bare decimal literals are always padded with leading and trailing zeroes to improve readability.

Banner line comments are automatically detected when they contain five or more consecutive `/` characters. Once identified, the formatter rewrites the banner prefix to 60 slashes so mixed-width comment markers settle on a single, readable standard.

#### Identifier-case rollout

| Option | Default | Summary |
| --- | --- | --- |
| `gmlIdentifierCase` | `"off"` | Enables automated identifier casing across scopes; review the rollout guide before activating on large projects. |
| `gmlIdentifierCase<Scope>` | `"inherit"` | Scope overrides such as `gmlIdentifierCaseLocals` or `gmlIdentifierCaseGlobals`; each accepts the same style choices as the base option. |
| `gmlIdentifierCaseIgnore` | `""` | Comma- or newline-separated list of identifiers or glob patterns that should never be renamed. |
| `gmlIdentifierCasePreserve` | `""` | Locks specific identifiers to their original spelling even when a new style is enabled. |
| `gmlIdentifierCaseAcknowledgeAssetRenames` | `false` | Required confirmation before asset renames update `.yy` metadata and on-disk file names. |
| `gmlIdentifierCaseDiscoverProject` | `true` | Controls whether the formatter auto-discovers the nearest `.yyp` manifest to bootstrap the project index. |
| `gmlIdentifierCaseProjectRoot` | `""` | Pins project discovery to a specific directory when auto-detection is undesirable (e.g. CI or monorepos). |
| `gmlIdentifierCaseProjectIndexCacheMaxBytes` | `8 MiB` | Upper bound for the persisted project-index cache. Set the option or `GML_PROJECT_INDEX_CACHE_MAX_SIZE` to `0` to disable the size guard when coordinating cache writes manually. |
| `gmlIdentifierCaseProjectIndexConcurrency` | `4` (overridable via `GML_PROJECT_INDEX_CONCURRENCY`, clamped to `1`–`16`) | Caps how many GameMaker source files are parsed in parallel while building the identifier-case project index. |
| `gmlIdentifierCaseOptionStoreMaxEntries` | `128` | Caps the identifier-case option store size; set to `0` to keep all historical entries without eviction. |

Additional automation hooks such as `identifierCaseProjectIndex`,
`identifierCaseDryRun`, and `identifierCaseReportLogPath` are documented in the
[Identifier case rollout playbook](docs/identifier-case-rollout.md).

---

## Identifier case rollout

1. **Enable identifier casing** in your Prettier configuration. Start with a locals-first plan similar to [`docs/examples/identifier-case/locals-first.prettierrc.mjs`](docs/examples/identifier-case/locals-first.prettierrc.mjs) so other scopes stay in observation mode.
2. **Warm the project index cache** by running the formatter once with your target project path. The bootstrap automatically creates `.prettier-plugin-gml/project-index-cache.json` the first time a rename-enabled scope executes. Use the example configuration above when you want to script a manual snapshot or commit a deterministic JSON index for CI.
3. **Dry-run renames** with locals-first safety nets before writing changes to disk. Keep `identifierCaseDryRun` enabled and capture logs via `identifierCaseReportLogPath` until you are comfortable with the rename summaries.
4. **Promote renames** to write mode once you are satisfied with the preview and have backups ready.
5. **Follow the migration checklist** in `docs/identifier-case-rollout.md` to confirm that assets, macros, and globals were acknowledged.

---

## Troubleshooting

- Formatter fails to load the plugin → confirm the explicit `plugins` entry in your Prettier configuration.
- Wrapper reports "Unable to locate the Prettier plugin entry point" → point the CLI at additional build locations with `PRETTIER_PLUGIN_GML_PLUGIN_PATHS` or update the script’s `node_modules/root/...` path to match your installation layout.
- `npm install` reports `EBADENGINE` → upgrade Node.js to 25.0.0+.
- Wrapper skips files unexpectedly → inspect the skipped-file summary and adjust `.prettierignore` or `--extensions` accordingly.
- Parser errors → rerun with `--on-parse-error=revert` to preserve original files, then report the issue with the offending snippet.
- Identifier-case bootstrap stuck on stale data → delete `.prettier-plugin-gml/project-index-cache.json` or set `gmlIdentifierCaseProjectRoot` explicitly before rerunning.

---

## Development

### Repository layout

```
prettier-plugin-gml/
├─ src/parser/        # ANTLR grammar, generated parser, and parser tests
├─ src/plugin/        # Prettier plugin source, printer, CLI wrapper, and plugin tests
├─ src/shared/        # Shared utilities (AST helpers, identifier casing, CLI plumbing)
├─ resources/         # Generated metadata consumed by the formatter
├─ docs/              # Design notes and rollout guides
└─ package.json       # Workspace manifest with scripts and shared tooling
```

All developer automation should be exposed through the CLI entry points in
`src/cli/commands/`. Avoid adding stand-alone scripts elsewhere in the
repository so new tooling remains easy to discover and maintain.

### Set up the workspace

```bash
nvm use # optional but recommended
npm install
```

The first install also wires up a local [Husky](https://typicode.github.io/husky/) pre-commit hook that runs `npm run format` and `npm run lint:fix`. Set `HUSKY=0` to bypass the hook when necessary (for example in CI environments).

### Test the plugin and parser

```bash
npm test
npm run check
npm run test:plugin
npm run test:parser
npm run test:shared
npm run test:cli
npm run lint
npm run lint:ci
npm run format:check
npm run lint:fix
```

`npm run check` chains the formatter audit, lint (CI mode), and full test suite.
All suites run on [Node.js’s built-in test runner](https://nodejs.org/api/test.html);
append `-- --watch` to any `npm run test --workspace …` command for watch mode.

#### Checkstyle lint reports

`npm run lint:report` uses the standalone
[`eslint-formatter-checkstyle`](https://www.npmjs.com/package/eslint-formatter-checkstyle)
package to emit the XML file that the GitHub automerge workflow parses when it
builds its warning/error summary table. Keep the dependency in `devDependencies`
so the CI job continues producing checkstyle output; removing it leaves the
formatter unavailable at runtime and collapses the summary into the "No lint
(checkstyle) data found" fallback state.

Fixtures under `src/plugin/tests` and `src/parser/tests/input` are golden. Update them only when deliberately changing formatter output or parser behaviour.

### Regenerate metadata snapshots

```bash
npm run build:gml-identifiers
npm run build:feather-metadata
```

Both commands accept `--ref <branch|tag|commit>` to target a specific manual revision and `--force-refresh` to bypass cached downloads stored in `scripts/cache/manual/`. Use `--progress-bar-width <n>` (or `GML_PROGRESS_BAR_WIDTH`) to tune the terminal progress indicator and `--vm-eval-timeout-ms <ms>` (or `GML_IDENTIFIER_VM_TIMEOUT_MS`) to adjust the manual array evaluation timeout.

### Regenerate the parser grammar

Install [ANTLR 4](https://www.antlr.org/download.html) and Java, then run:

```bash
npm run build:antlr
```

### Handy development commands

```bash
npm run example:plugin      # Format a fixture with the development build
npm run format:check        # Audit repository formatting without writes
npm --prefix src/plugin run prettier:plugin -- --path=tests/test14.input.gml
npm run cli -- --help       # Explore CLI utilities without switching directories
npm run cli -- performance  # Run the benchmarking helpers registered with the CLI
npm run memory -- --suite normalize-string-list --pretty      # Measure normalizeStringList memory usage
```

Tune the memory suites with environment variables when scripting CI runs:
`GML_MEMORY_ITERATIONS` adjusts the default iteration count, while
`GML_MEMORY_PARSER_MAX_ITERATIONS` and `GML_MEMORY_FORMAT_MAX_ITERATIONS`
cap the parser and formatter hot loops respectively when a suite requests more
work than the configured ceiling.

---

## Useful VS Code extensions

- [ANTLR4 Grammar Syntax Support](https://marketplace.visualstudio.com/items?itemName=mike-lischke.vscode-antlr4)
- [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)
