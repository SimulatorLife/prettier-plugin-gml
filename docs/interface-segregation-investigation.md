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
- Split the contract into `CliCommandRegistry` and `CliCommandRunner`
  collaborators that expose only the registration or execution concerns used by
  each call site, then updated `cli.js` to rely on the specialized views.
- The CLI now imports the registry to wire up commands and the runner to launch
  the program, so each call site depends only on the capability it needs.

## Follow-up audit (2025-02-20)

- Located the `IdentifierCasePlanServices` bundle in
  `src/plugin/src/identifier-case/plan-service.js`. The wide "service" facade
  forced providers to manufacture preparation, rename lookup, and snapshot
  collaborators together even when a consumer only required one capability.
- Removed the bundle contract in favour of the existing
  `IdentifierCasePlanPreparationService`, `IdentifierCaseRenameLookupService`,
  and `IdentifierCasePlanSnapshotService` roles. Call sites now request and
  override the specific collaborator they need without depending on an
  aggregated service container.

## Follow-up audit (2025-02-27)

- Audited the CLI service registry and found `identifierCasePlanService` in
  `src/cli/lib/plugin-service-providers/default-plugin-services.js`. The facade
  merged plan preparation and cache clearing, so callers that only needed one
  capability depended on both.
- Removed the combined service in favour of explicit
  `CliIdentifierCasePlanPreparationService` and
  `CliIdentifierCasePlanCacheService` contracts. Updated the default registry
  and tests to rely on the focused services so each consumer depends only on
  the collaborator it actually uses.

## Follow-up audit (2025-03-05)

- Investigated the manual tooling pipeline and found `createManualCommandContext`
  in `src/cli/lib/manual-command-context.js`. The context returned repository
  paths, raw GitHub client adapters, and high-level operations as a single
  object, which forced commands that only needed one facet (for example,
  `fetchManualFile`) to depend on all of the manual wiring details.
- Split the contract into explicit helpers – `createManualEnvironmentContext`,
  `createManualGitHubExecutionContext`, and `createManualManualAccessContext` – so
  callers can depend solely on the slice they require. Updated the manual CLI
  commands and associated tests to destructure the focused views instead of the
  wide context.

## Follow-up audit (2025-03-12)

- Revisited `createManualCommandContext` in
  `src/cli/lib/manual-command-context.js` and noticed the
  `ManualCommandGitHubOperations` surface still bundled manual request
  execution, file fetching, ref resolution, and commit resolution behind one
  catch-all interface. Commands that only needed one of those collaborators
  were forced to depend on all four behaviours.
- Replaced the combined operations facade with focused services for requests,
  files, refs, and commits. Updated the manual CLI commands and unit tests to
  use `createManualManualAccessContext` and `createManualGitHubExecutionContext`
  so each call site depends only on the GitHub behaviour it requires.
