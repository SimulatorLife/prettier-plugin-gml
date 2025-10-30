# Statement Newline Padding Extension

## Pre-change analysis

The printer currently decides whether to surround a statement with blank lines
using the hard-coded `NODE_TYPES_WITH_SURROUNDING_NEWLINES` set in
`src/plugin/src/printer/util.js`. Only the four node kinds listed in that set
(`FunctionDeclaration`, `ConstructorDeclaration`, `RegionStatement`, and
`EndRegionStatement`) receive spacing by default. Any downstream consumer that
needs to pad a new AST statement type has no supported hook today and must patch
`util.js` directly, coupling their experiment to the plugin's private internals.

## Extension seam

Introduce a small registry API that exposes
`registerSurroundingNewlineNodeTypes()` and
`resetSurroundingNewlineNodeTypes()` from the spacing helpers. The registry
builds on the existing default set, allowing callers inside the monorepo to
register additional node type names without mutating the shared implementation
details. Because the registry only accepts string node types and ignores invalid
input, the hot path remains predictable and opinionated.

## Preserving today's default

The registry initializes from the same default node types, so the formatting
output remains unchanged unless a caller explicitly adds a new entry. The
`resetSurroundingNewlineNodeTypes()` helper exists for tests and experiments to
return to the default behavior quickly, which keeps the plugin's opinionated
spacing intact.

## Usage and guardrails

The hook targets internal monorepo consumers that experiment with additional GML
AST statement forms. External Prettier users keep the existing spacing policy;
no new end-user configuration is exposed. Consumers should register extra node
types during setup (for example, alongside other plugin component wiring) and
should avoid removing defaults so the formatter stays readable by default. Over
time, if multiple callers converge on a shared spacing rule, the new node type
can graduate into the default set to make the behavior universal.
