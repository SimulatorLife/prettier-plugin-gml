# Prettier Plugin for GameMaker Language

> ⚠️ The formatter is experimental. Back up your GameMaker project or commit your work before running it across large codebases.

## Formatter at a glance

See how the plugin rewrites real GameMaker Language (GML) inputs. Each example links to the corresponding regression fixture used by the automated test suite.

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
}

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
        hp: 100,  // base health
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

## Quick start

### Requirements

- Node.js **18.18.0+** (20.9.0+ recommended). Use the bundled `.nvmrc` to align with the workspace version.
- npm (installed with Node.js). Verify availability with `node -v` and `npm -v`.

<details>
<summary><strong>Install Node.js with nvm</strong></summary>

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="${XDG_CONFIG_HOME:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install
nvm use
```

</details>

### Install in a GameMaker project

1. Change into the folder that contains your `.yyp` file.
2. Install Prettier, the plugin, and the ANTLR runtime next to the project:

   ```bash
   npm install --save-dev prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"
   ```

   - Quote dependency specifiers so shells such as `zsh` do not expand `^` as a glob.
   - Resolve any `EBADENGINE` errors by upgrading Node.js to a supported release.

3. Point Prettier at the bundled plugin entry from your project configuration (for example `prettier.config.cjs` or the `prettier` field inside `package.json`):

   ```json
   {
     "plugins": ["./node_modules/root/src/plugin/src/gml.js"],
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

4. Wire a script or wrapper so team members can format consistently:

   ```jsonc
   {
     "scripts": {
       "format:gml": "prettier --plugin=./node_modules/root/src/plugin/src/gml.js --write \"**/*.gml\""
     }
   }
   ```

5. Run the formatter:

   ```bash
   npm run format:gml
   # or
   node ./node_modules/root/src/plugin/prettier-wrapper.js --path .
   ```

6. Validate your setup whenever you pull new revisions:

   ```bash
   npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --support-info | grep gml-parse
   npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --check "**/*.gml"
   npm run format:gml -- --check --path .
   ```

### Format from a local clone

1. Clone this repository and install dependencies once:

   ```bash
   git clone https://github.com/SimulatorLife/prettier-plugin-gml.git
   cd prettier-plugin-gml
   npm install
   ```

2. Target any GameMaker project without adding dependencies to that project:

   ```bash
   npm run format:gml -- --path "/absolute/path/to/MyGame" --extensions=.gml,.yy
   ```

   The wrapper honours both repositories’ `.prettierrc` and `.prettierignore` files, prints a skipped-file summary, and accepts `--on-parse-error=skip|abort|revert` (or the `PRETTIER_PLUGIN_GML_ON_PARSE_ERROR` environment variable).

<details>
<summary><strong>Optional: global install</strong></summary>

```bash
npm install --global --save-exact prettier "antlr4@^4.13.2" "github:SimulatorLife/prettier-plugin-gml#main"
prettier --plugin="$(npm root -g)/root/src/plugin/src/gml.js" --write "**/*.gml"
```

If you see an `ENOTDIR` error mentioning `node_modules/root`, remove any stale folders created by previous installs and retry.

</details>

---

## Everyday use

### Command-line snippets

- Format everything in the current project:

  ```bash
  npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --write .
  ```

- Dry-run formatting for CI or pre-commit checks:

  ```bash
  npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --check "rooms/**/*.gml"
  ```

- Format a single file:

  ```bash
  npx prettier --plugin=./node_modules/root/src/plugin/src/gml.js --write scripts/player_attack.gml
  ```

- Use the wrapper helper (accepts the same flags as `npm run format:gml --`):

  ```bash
  node ./node_modules/root/src/plugin/prettier-wrapper.js --path . --extensions=.gml,.yy
  ```

### Visual Studio Code

1. Install the [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension.
2. Install a GML language service such as [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support).
3. Ensure the workspace `package.json` lists `prettier`, `antlr4`, and the Git dependency so VS Code can resolve the plugin.
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
  "plugins": ["./node_modules/root/src/plugin/src/gml.js"],
  "overrides": [
    {
      "files": "*.gml",
      "options": {
        "printWidth": 100,
        "tabWidth": 2,
        "semi": true
      }
    }
  ]
}
```

Refer to the [Prettier configuration guide](https://prettier.io/docs/en/configuration.html) for the complete option list. GameMaker-specific overrides live alongside your `.yyp` so both the CLI and editor integrations share a single source of truth.

### Plugin-specific options

| Option | Default | Summary |
| --- | --- | --- |
| `optimizeLoopLengthHoisting` | `true` | Hoists supported collection length checks out of `for` loop conditions and caches them in a temporary variable. |
| `condenseStructAssignments` | `true` | Converts consecutive struct property assignments into a single literal when comments and control flow permit it. |
| `allowSingleLineIfStatements` | `true` | Keeps trivial `if` statements on one line; set to `false` to always expand blocks. |
| `logicalOperatorsStyle` | `"keywords"` | Choose `"symbols"` to keep `&&`/`||` instead of rewriting them to `and`/`or`. |
| `condenseLogicalExpressions` | `false` | Merges adjacent logical expressions that use the same operator. |
| `convertDivisionToMultiplication` | `false` | Rewrites division by literals into multiplication by the reciprocal when safe. |
| `useStringInterpolation` | `false` | Upgrades eligible string concatenations to template strings (`$"Hello {name}"`). |
| `gmlIdentifierCase` | `"off"` | Enables automated identifier casing across scopes; pair with the rollout guide before enabling on large projects. |
| `preserveGlobalVarStatements` | `true` | Keeps `globalvar` declarations while still prefixing later assignments with `global.`. |
| `maxParamsPerLine` | `0` | Forces argument wrapping after the specified count (`0` keeps the original layout). |
| `loopLengthHoistFunctionSuffixes` | `""` | Override cached variable suffixes per function or disable hoisting for specific helpers. |
| `alignAssignmentsMinGroupSize` | `3` | Aligns simple assignment operators across consecutive lines once the group size threshold is met. |
| `trailingCommentPadding` | `2` | Controls spacing between code and trailing end-of-line comments. |
| `trailingCommentInlineOffset` | `1` | Trims part of the trailing comment padding for inline comments. |
| `lineCommentBannerMinimumSlashes` | `5` | Preserves banner-style comments with at least this many `/` characters. |
| `applyFeatherFixes` | `false` | Applies opt-in fixes backed by GameMaker Feather metadata (e.g. drop trailing semicolons from `#macro`). |
| `lineCommentBannerAutofillThreshold` | `4` | Pads banner comments up to the minimum slash count when they already start with several `/`. |
| `lineCommentBoilerplateFragments` | `""` | Removes boilerplate line comments that contain any of the provided comma-separated substrings. |
| `lineCommentCodeDetectionPatterns` | `""` | Adds custom regular expressions that flag commented-out code for verbatim preservation. |

Consult the [Identifier Case & Naming Convention Guide](docs/naming-conventions.md) and the [identifier-case rollout playbook](docs/identifier-case-rollout.md) before enabling renames.

---

## Identifier case rollout

1. **Generate a project index** using `npm run format:gml -- --path <project> --dump-project-index` (see the playbook for details).
2. **Dry-run renames** with locals-first safety nets before writing changes to disk.
3. **Promote renames** to write mode once you are satisfied with the preview and have backups ready.
4. **Follow the migration checklist** in `docs/identifier-case-rollout.md` to confirm that assets, macros, and globals were acknowledged.

---

## Troubleshooting

- Formatter fails to load the plugin → confirm the explicit `plugins` entry in your Prettier configuration.
- `npm install` reports `EBADENGINE` → upgrade Node.js to 18.18.0+, 20.9.0+, or 21.1.0+.
- Wrapper skips files unexpectedly → inspect the skipped-file summary and adjust `.prettierignore` or `--extensions` accordingly.
- Parser errors → rerun with `--on-parse-error=revert` to preserve original files, then report the issue with the offending snippet.

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

### Set up the workspace

```bash
nvm use # optional but recommended
npm install
```

The first install also wires up a local [Husky](https://typicode.github.io/husky/) pre-commit hook that runs `npm run format` and `npm run lint:fix`. Set `HUSKY=0` to bypass the hook when necessary (for example in CI environments).

### Test the plugin and parser

```bash
npm test
npm run test:plugin
npm run test:parser
npm run test:shared
npm run lint
npm run lint:ci
npm run format:check
npm run lint:fix
```

The suites use [Mocha](https://mochajs.org/); append `-- --watch` to any `npm run test --workspace …` command for watch mode.

Fixtures under `src/plugin/tests` and `src/parser/tests/input` are golden. Update them only when deliberately changing formatter output or parser behaviour.

### Regenerate metadata snapshots

```bash
npm run build:gml-identifiers
npm run build:feather-metadata
```

Both commands accept `--ref <branch|tag|commit>` to target a specific manual revision and `--force-refresh` to bypass cached downloads stored in `scripts/cache/manual/`. Use `--progress-bar-width <n>` (or `GML_PROGRESS_BAR_WIDTH`) to tune the terminal progress indicator.

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
```

---

## Useful VS Code extensions

- [ANTLR4 Grammar Syntax Support](https://marketplace.visualstudio.com/items?itemName=mike-lischke.vscode-antlr4)
- [GML Support](https://marketplace.visualstudio.com/items?itemName=electrobrains.gml-support)
