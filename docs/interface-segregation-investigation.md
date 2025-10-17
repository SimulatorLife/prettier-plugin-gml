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
