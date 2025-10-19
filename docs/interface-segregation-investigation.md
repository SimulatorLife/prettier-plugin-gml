# Interface Segregation Survey

The repository does not define any TypeScript or JavaScript interfaces with broad catch-all names
(such as `*Service`, `*Manager`, or `*Controller`) that expose large contracts. To confirm this, I
surveyed the codebase using the following searches:

- `rg "interface" src --stats` — returned only a comment in `src/cli/cli.js`, no actual interface definitions.
- `rg "@typedef" src -n` — surfaced the handful of small JSDoc object typedefs (`CommentLineNode`, `CommentBlockNode`, `FeatherDiagnostic`, and a couple of helper structs), each of which only contains a few focused properties.
- `rg "Service" src`, `rg "Manager" src`, and `rg "Controller" src` — produced no matches outside of fixture strings.
- `find src -name "*.ts"` — confirmed there are no in-repo TypeScript sources beyond vendored dependencies under `node_modules`.

Additionally, I manually inspected the larger modules in `src/plugin/src/project-index/` and
`src/plugin/src/printer/`, but they rely on plain objects and functions without defining reusable
interface or type contracts. Given these findings, there is no oversized interface in the project
that needs to be split under the Interface Segregation Principle.

## Follow-up audit (2024-05-15)

To re-validate the earlier conclusion, I reran a broader set of surveys:

- `rg "@typedef \\{object\\}" src` — confirmed every object contract is a focused data shape such as
  diagnostics metadata or helper structs.
- `rg "Object\\.freeze\\(\\{" src/plugin/src` — highlighted utility enums and facades; manual inspection
  showed each serves a single concern (for example, `defaultIdentifierCaseFsFacade` simply forwards
  to Node's fs module without accumulating unrelated behavior).
- Reviewed coordinator/facade modules in `src/plugin/src/project-index/` and
  `src/plugin/src/identifier-case/` to ensure they expose narrow responsibilities (for example,
  `createProjectIndexCoordinator` only brokers cache readiness and disposal).

No new interface or type definition surfaced that violates the Interface Segregation Principle, so
no code changes were required.

## Follow-up audit (2025-02-17)

- Surveyed CLI infrastructure for broad contracts and found `CliCommandManager`
  coupled registration helpers with the command runner behind a single
  "manager" API. That forced the CLI entry point to depend on both
  responsibilities simultaneously.
- Split the contract into `CliCommandRegistrar` and `CliProgramRunner`
  interfaces that expose only the registration or execution concerns used by
  each call site, then updated `cli.js` to rely on the specialized views.
