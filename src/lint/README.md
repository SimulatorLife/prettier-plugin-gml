# @gml-modules/lint

`@gml-modules/lint` is the ESLint language plugin and rule bundle for GameMaker Language (`.gml`) in this monorepo.

It owns lint diagnostics and semantic/content rewrites (via lint rules and `--fix`), while formatter-only layout behavior stays in `@gml-modules/plugin`.

## Ownership Boundaries

- Owns:
  - ESLint language wiring for GML (`language: "gml/gml"`)
  - Lint rules and autofix behavior
  - Project-aware lint context contracts consumed through ESLint `settings.gml.project`
- Does not own:
  - Prettier formatting behavior
  - Parser internals/grammar ownership
  - Refactor transaction planning/execution

See [../../docs/formatter-linter-split-plan.md](../../docs/formatter-linter-split-plan.md) for the split contract.

## Install and Peer Requirements

- Package: `@gml-modules/lint`
- Peer dependency: `eslint` `>=9.39.0 <10`
- Runtime: Node `>=22`

## Quick Start (Flat Config)

```js
// eslint.config.js
import * as LintWorkspace from "@gml-modules/lint";

export default [...LintWorkspace.Lint.configs.recommended];
```

This wires:

- `plugins.gml = Lint.plugin`
- `language = "gml/gml"`
- The baseline recommended `gml/*` rule levels

## Config Sets

`Lint.configs` exposes three immutable flat-config sets:

- `recommended`: baseline `gml/*` rules
- `feather`: `feather/gm####` overlay rules from the feather manifest
- `performance`: disables costlier/project-aware rewrites for faster passes

Example:

```js
import * as LintWorkspace from "@gml-modules/lint";

export default [
    ...LintWorkspace.Lint.configs.recommended,
    ...LintWorkspace.Lint.configs.feather
];
```

For a full "all rules enabled" config (including all `feather/*` rules plus project-context wiring for project-aware `gml/*` rules), see:
`docs/examples/example.eslint.all-rules.config.js`.

## Project-Aware Rules

Some `gml/*` rules require project context to safely reason about cross-file behavior. Current project-aware IDs:

- `gml/no-globalvar`
- `gml/prefer-loop-length-hoist`
- `gml/prefer-string-interpolation`
- `gml/prefer-struct-literal-assignments`

Canonical generated inventory: [../../docs/generated/project-aware-rules.md](../../docs/generated/project-aware-rules.md)

**Note**: `settings.gml.project` is not a file in your GameMaker project. It is a runtime object attached to your ESLint flat config entry:

- Not required in `.yyp` or any `.gml` file
- Not a standalone config file to create in the game project
- It is the value you provide at `eslint.config.js -> settings -> gml -> project`
- If you use the monorepo CLI lint command, this is already wired for you

Shape in config:

```js
settings: {
    gml: {
        project: projectSettings
    }
}
```

If you run these rules directly through ESLint (outside CLI wiring), inject `settings.gml.project`:

```js
// eslint.config.js
import * as LintWorkspace from "@gml-modules/lint";
import * as SemanticWorkspace from "@gml-modules/semantic";

const projectRoot = process.cwd();
const projectIndex = await SemanticWorkspace.Semantic.buildProjectIndex(projectRoot);
const excludedDirectories = new Set(
    LintWorkspace.Lint.services.defaultProjectIndexExcludes.map((entry) => entry.toLowerCase())
);
const snapshot = LintWorkspace.Lint.services.createProjectAnalysisSnapshotFromProjectIndex(
    projectIndex,
    projectRoot,
    {
        excludedDirectories,
        allowedDirectories: []
    }
);
const analysisProvider = LintWorkspace.Lint.services.createPrebuiltProjectAnalysisProvider(
    new Map([[projectRoot, snapshot]])
);
const registry = LintWorkspace.Lint.services.createProjectLintContextRegistry({
    cwd: process.cwd(),
    forcedProjectPath: null,
    indexAllowDirectories: [],
    analysisProvider
});
const projectSettings = LintWorkspace.Lint.services.createProjectSettingsFromRegistry(registry);

export default [
    ...LintWorkspace.Lint.configs.recommended,
    {
        files: ["**/*.gml"],
        settings: {
            gml: {
                project: projectSettings
            }
        }
    }
];
```

If you do not provide project settings, project-aware rules will emit `missingProjectContext`.

## Language Behavior

The plugin registers `gml/gml` as an ESLint v9 language implementation and returns parser services under `parserServices.gml`:

- `schemaVersion`
- `filePath`
- `recovery`
- `directives`
- `enums`

Recovery mode is controlled by language options:

- `recovery: "limited"` (default)
- `recovery: "none"`

## Public API

The workspace exports a single namespace:

```ts
import * as LintWorkspace from "@gml-modules/lint";

LintWorkspace.Lint;
```

`Lint` contains:

- `plugin`: ESLint plugin object for `gml/*` (`rules`, `languages`)
- `featherPlugin`: ESLint plugin object for `feather/*` (`rules`)
- `configs`: `recommended`, `feather`, `performance`
- `ruleIds`: PascalCase map keys to canonical full IDs (`gml/...`, `feather/...`)
- `services`: project-analysis/context helpers and constants
- `docs`:
  - `collectProjectAwareRuleIds()`
  - `renderProjectAwareRulesMarkdown()`

## GML Rule IDs

Built-in `gml/*` rule short names:

- `prefer-loop-length-hoist`
- `prefer-hoistable-loop-accessors`
- `prefer-repeat-loops`
- `prefer-struct-literal-assignments`
- `optimize-logical-flow`
- `no-globalvar`
- `normalize-doc-comments`
- `normalize-directives`
- `require-control-flow-braces`
- `no-assignment-in-condition`
- `prefer-is-undefined-check`
- `prefer-epsilon-comparisons`
- `normalize-operator-aliases`
- `prefer-string-interpolation`
- `optimize-math-expressions`
- `require-argument-separators`
- `normalize-data-structure-accessors`
- `require-trailing-optional-defaults`

`normalize-operator-aliases` is intentionally syntax-safety scoped: it repairs invalid `not` keyword usage to `!` and avoids style rewrites.
Logical operator style normalization (`&&`/`||`/`^^` vs `and`/`or`/`xor`) belongs to the formatter (`@gml-modules/plugin`, `logicalOperatorsStyle`), so lint does not rewrite those forms.

Feather rules are exposed as `feather/gm####` and sourced from `Lint.services.featherManifest`.

## Development

```bash
pnpm --filter @gml-modules/lint run build:types
pnpm --filter @gml-modules/lint run test
```
