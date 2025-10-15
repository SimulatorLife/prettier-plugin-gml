# Workflow automation

## Codex DIP – Dependency Inversion Patrol

The `codex-dip` GitHub Actions workflow keeps the dependency inversion boundary in
check for the plugin’s orchestration layers. When it runs, Codex is prompted to
inspect the high-level entry points—`src/plugin/src/gml.js`,
`src/cli/prettier-wrapper.js`, and any glue module that stitches together parser,
printer, comment, or identifier-case subsystems—for two smells:

- `new` expressions that manufacture collaborators directly inside the
  orchestrator.
- Imports that pull concrete adapters (for example anything under
  `src/plugin/src/parsers/` or `src/plugin/src/printer/`) into those high-level
  modules.

If either case surfaces, Codex is expected to restore the inversion by
introducing an abstraction barrier before wiring dependencies back together.
Prefer one of the following strategies depending on the shape of the change:

1. **Interfaces or contracts** – Define a narrow interface that the adapter
   implements, then depend on that interface from the high-level module.
2. **Provider registries** – Route discovery through a lookup table or registry
   so the orchestrator only knows about tokens/keys, not concrete classes.
3. **Constructor injection** – Accept dependencies as parameters so callers
   decide which implementation to supply.

Keep refactors targeted, avoid behavioural changes, and update documentation or
call sites that rely on the previous concrete wiring. When a fix is too large to
ship immediately, document the follow-up in the workflow PR so it does not fall
through the cracks.
