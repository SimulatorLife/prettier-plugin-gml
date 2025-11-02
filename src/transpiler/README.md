# GML Transpiler Module

This package will contain the implementation of the GML → JavaScript transpiler referenced in
`docs/semantic-scope-plan.md`. The transpiler runs on the Node side of the hot-reload loop
outlined in `docs/live-reloading-concept.md` and produces patch payloads that the runtime
wrapper can install without restarting the game.

## Responsibilities
- Accept annotated ASTs and scope metadata from `gamemaker-language-semantic`.
- Lower GML constructs to JavaScript that matches HTML5 runner semantics.
- Emit patch objects that encode script/event identifiers, version info, and the generated
  function body.
- Expose utilities that let the CLI request recompilation for dirty symbols while keeping
  downstream modules decoupled.

## Directory layout
- `src/` – source files for the transpiler implementation.
- `test/` – Node test suites for emitter helpers and lowering pipelines.

## Status
The module is currently skeletal. It exports a placeholder class to keep the workspaces wired
up while the detailed implementation described in the planning docs is still in progress.
