# @gml-modules/lint

`@gml-modules/lint` is the ESLint language plugin and rule bundle for GameMaker Language (`.gml`) in this monorepo.

It owns lint diagnostics and semantic/content rewrites (via lint rules and `--fix`), while formatter-only layout behavior stays in `@gml-modules/format`.

- Owns:
    - ESLint language wiring for GML (`language: "gml/gml"`)
    - Lint rules and autofix behavior
- Does not own:
    - Prettier formatting behavior (should not directly manipulate whitespace, semicolons, line breaks, indentation, etc.) Should NOT depend on `@gml-modules/format` or its internal APIs.
    - Parser internals/grammar ownership
    - Refactor transaction planning/execution

See [../../docs/target-state.md](../../docs/target-state.md) for the split contract.

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

`Lint.configs` exposes these immutable flat-config sets:

- `recommended`: baseline `gml/*` rules
- `feather`: `feather/gm####` overlay rules from the feather manifest

Example:

```js
import * as LintWorkspace from "@gml-modules/lint";

export default [
    ...LintWorkspace.Lint.configs.recommended,
    ...LintWorkspace.Lint.configs.feather
];
```

For a full "all rules enabled" config (including all `feather/*` rules), see:
`docs/examples/example.eslint.all-rules.config.js`.

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
- `configs`: `recommended`, `feather`
- `ruleIds`: PascalCase map keys to canonical full IDs (`gml/...`, `feather/...`)

## GML Rule IDs

Built-in `gml/*` rule short names:

- `prefer-hoistable-loop-accessors` (includes former `prefer-loop-length-hoist` scenarios)
- `prefer-repeat-loops`
- `prefer-struct-literal-assignments`
- `prefer-compound-assignments`
- `optimize-logical-flow`
- `no-globalvar`
- `no-empty-regions`
- `no-scientific-notation`
- `no-unnecessary-string-interpolation`
- `remove-default-comments`
- `normalize-banner-comments`
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
- `simplify-real-calls`

`prefer-compound-assignments` rewrites safe self-assignment forms
`x = x <op> y` to `x <op>= y` for `-`, `*`, `/`, and `??`.

`prefer-struct-literal-assignments` only rewrites contiguous property assignments when they immediately follow an empty struct creation (`var foo = {};` or `foo = {};`). Property writes against existing structs are left unchanged.

`remove-default-comments` removes default GameMaker placeholder and migration-banner comments.

`normalize-banner-comments` canonicalizes decorative banner comments (line and block forms) and rewrites method-list `///` banner lines to plain `//` comments.

`normalize-doc-comments` canonicalizes doc tags/content, including removing `@param` separator hyphens (for example, `@param value - desc` to `@param value desc`). It synthesizes missing tags for declaration/assignment-style function docs, but constructor/struct-function definitions never retain synthetic `@returns` tags: existing `@returns` lines are stripped and new ones are not generated. The rule intentionally skips inline anonymous function values inside struct/object properties.

`normalize-operator-aliases` is intentionally syntax-safety scoped: it repairs invalid `not` keyword usage to `!` in executable code (while skipping uses in comments and string literals), and avoids style rewrites.
Logical operator style normalization (`&&`/`||`/`^^` vs `and`/`or`/`xor`) belongs to the formatter (`@gml-modules/format`, `logicalOperatorsStyle`), so lint does not rewrite those forms.

`optimize-logical-flow` and `optimize-math-expressions` now clone candidate AST fragments using a traversal-link-stripping helper (skipping `parent`/context pointers) so autofix performance remains stable on very large scripts.

Feather rules are exposed as `feather/gm####` and sourced from `Lint.services.featherManifest`. All feather-namespace lint rules follow the naming pattern `feather/gm####`, where the lint rule diagnoses/fixes specificy/only the issue for the associated Feather rule/diagnostic. For example, lint rule `feather/gm1000` identifies and fixes the specific issue described in Feather rule `gm1000`: "No enclosing loop from which to break" This creates a clear, traceable link between each Feather rule and its corresponding lint rule(s), and allows us to easily add new lint rules for new Feather rules as they are added to the manifest.

## Development

```bash
pnpm --filter @gml-modules/lint run build:types
pnpm --filter @gml-modules/lint run test
```

## TODO

- When run through the CLI, if no eslint configuration file is detected in the project, the CLI should fall back to a default, recommended ruleset.
- Add a lint rule for legacy functions/variables. See https://manual.gamemaker.io/monthly/en/#t=Additional_Information%2FObsolete_Functions.htm. This could be a `@gml/no-legacy-api` rule that flags usage of any deprecated functions or variables, with an optional auto-fix to replace them with their modern equivalents.
- The structure/files of `src/lint/src/doc-comment` is confusing and disorganized. Would a flat structure be better where we move files in 'src/lint/src/doc-comment/service' up one level?
