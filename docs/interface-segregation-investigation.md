# Interface Segregation Survey

The repository does not define any TypeScript or JavaScript interfaces with broad catch-all names
(such as `*Service`, `*Manager`, or `*Controller`) that expose large contracts. To confirm this, I
surveyed the codebase using the following searches:

- `rg "interface" src --stats` — returned only a comment in `src/cli/src/cli.js`, no actual interface definitions.
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
  `src/semantic/src/identifier-case/` to ensure they expose narrow responsibilities (for example,
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
  `src/semantic/src/identifier-case/plan-service.js`. The wide "service" facade
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
  in `src/cli/lib/manual/context.js`. The context returned repository
  paths, raw GitHub client adapters, and high-level operations as a single
  object, which forced commands that only needed one facet (for example,
  `fetchManualFile`) to depend on all of the manual wiring details.
- Split the contract into explicit helpers – `createManualEnvironmentContext`,
  the since-superseded `createManualGitHubExecutionContext`, and
  `createManualManualAccessContext` – so
  callers can depend solely on the slice they require. Updated the manual CLI
  commands and associated tests to destructure the focused views instead of the
  wide context.

## Follow-up audit (2025-03-12)

- Revisited `createManualCommandContext` in
  `src/cli/lib/manual/context.js` and noticed the
  `ManualCommandGitHubOperations` surface still bundled manual request
  execution, file fetching, ref resolution, and commit resolution behind one
  catch-all interface. Commands that only needed one of those collaborators
  were forced to depend on all four behaviours.
- Replaced the combined operations facade with focused services for requests,
  files, refs, and commits. Updated the manual CLI commands and unit tests to
  use `createManualManualAccessContext` and
  (at the time) `createManualGitHubExecutionContext` so each call site depends
  only on the GitHub behaviour it requires.

## Follow-up audit (2025-03-19)

- Audited the manual GitHub execution helpers again and found the
  `ManualCommandGitHubClients` contract in
  `src/cli/lib/manual/context.js`. The catch-all "clients" object still
  combined the raw request executor, commit resolver, ref resolver, and file
  fetcher into one dependency, which meant consumers importing the execution
  context needed to accept all four collaborators even when they only required
  one.
- Removed the aggregated `ManualCommandGitHubClients` interface in favour of
  exposing the individual collaborators (`request`, `commitResolver`,
  `refResolver`, and `fileClient`) directly on the execution context. Updated
  the associated unit test to assert against the focused properties so each
  call site now depends solely on the GitHub behaviour it needs.

## Follow-up audit (2025-03-26)

- Revisited the manual GitHub helpers once more and found the exported
  `ManualGitHubExecutionContext` contract still coupled service facades with the
  raw request/commit/ref/file clients. Even after earlier splits, callers that
  only needed one collaborator had to depend on the entire execution bundle.
- Replaced the umbrella helper with targeted resolvers
  (`resolveManualGitHubRequestService`,
  `resolveManualGitHubRequestExecutor`,
  `resolveManualGitHubCommitService`,
  `resolveManualGitHubCommitResolver`,
  `resolveManualGitHubRefResolver`, and
  `resolveManualGitHubFileClient`). Updated the CLI unit test to import the
  specialised helpers so consumers opt into only the collaborator they require.

## Follow-up audit (2025-04-09)

- Audited `createManualAccessContext` in
  `src/cli/features/manual/context.js` and found it still returned a combined
  `ManualAccessContext` interface that bundled manual file fetching with
  reference resolution. CLI commands that only needed to download manual pages
  were forced to depend on reference helpers (and vice versa), violating the
  Interface Segregation Principle.
- Split the contract into `ManualFileAccessContext` and
  `ManualReferenceAccessContext`, plus a helper that produces both specialised
  views without rebuilding the underlying GitHub wiring. Updated the manual CLI
  commands and unit tests to import the targeted contexts so each call site
  depends only on the collaborators it requires.

## Follow-up audit (2025-04-16)

- Identified `createMetricsTracker` in `src/shared/src/reporting/metrics.js` as a
  wide surface that combined timing helpers, counter incrementers, cache
  recorders, and reporting utilities behind one "tracker" object. Callers that
  only needed to bump counters or capture a snapshot still depended on all of
  the other behaviours.
- Split the contract into focused collaborator bundles: `timers`, `counters`,
  `caches`, and `reporting`. Updated the tracker implementation, metrics
  consumers, tests, and documentation to rely on the specialised interfaces so
  each consumer opts into only the responsibilities it uses.

## Follow-up audit (2025-04-23)

- Audited the CLI plugin defaults and found the `CliPluginServiceRegistry`
  typedef in `src/cli/plugin/service-providers/default.js`. The registry
  reintroduced a catch-all `defaultCliPluginServices` bundle that coupled the
  project index helpers with the identifier case services. Modules that only
  needed identifier case collaborators were forced to depend on the project
  index builder as well.
- Removed the combined registry typedef and now expose the project index and
  identifier case service families as separate exports. Updated the service
  factory, module-level defaults, and unit tests to depend on the specialised
  collaborators so each call site opts into only the helpers it uses.

## Follow-up audit (2025-10-25)

- Surveyed the doc comment tooling and spotted `getDocCommentManager` in
  `src/plugin/src/comments/doc-comment-manager.js`. The exported "manager"
  facade surfaced traversal, lookup, description, and update helpers together,
  so call sites that only needed one behaviour had to depend on the entire
  contract.
- Removed the umbrella export so collaborators import the narrow
  `resolveDocComment*Service` helpers instead. The CLI parser still primes the
  environment via `prepareDocCommentEnvironment`, but consumers now rely on the
  focused traversal/lookup/description/update services and no longer observe
  the wide manager surface.
- Updated the unit tests to assert against the segregated services, ensuring
  each interface exposes only the behaviour it owns.

## Follow-up audit (2025-11-19)

- Re-audited the CLI plugin default services and found the
  `CliIdentifierCaseServices` bundle lingering in
  `src/cli/plugin/service-providers/default.js`. The bundle coupled the
  preparation and cache collaborators into a single "services" interface,
  forcing callers that only needed one helper to depend on both behaviours.
- Removed the aggregated contract and now return only the focused preparation
  and cache services. Updated the accompanying unit tests to assert against the
  specialised collaborators and verify the bundle property no longer exists.

## Follow-up audit (2025-12-03)

- Surveyed the manual command helpers and found the
  `ManualCommandFileService`/`ManualCommandRefResolutionService` facades in
  `src/cli/features/manual/context.js`. Each wrapped a single GitHub helper but
  still forced consumers of the manual access context to depend on nested
  service objects before they could reach the `fetchManualFile` or
  `resolveManualRef` collaborators they actually needed.
- Removed the indirection by updating the manual access helpers to expose the
  direct functions alongside the environment metadata. CLI commands now import
  the focused helpers (`fetchManualFile`, `resolveManualRef`) without going
  through the broad service wrappers, and the unit tests assert the narrowed
  surface.

## Follow-up audit (2025-12-10)

- Revisited the manual access utilities and found the exported
  `ManualAccessBundle` still coupled file fetching and reference resolution
  behind one umbrella. CLI commands destructured both collaborators even when a
  change only needed one of them.
- Replaced the bundle with `ManualAccessContexts`, which surfaces the shared
  environment plus the focused `ManualFileAccess` and `ManualReferenceAccess`
  views. Updated the manual CLI commands and unit tests to depend on the
  specific context they require so each call site opts into only the manual
  helper it consumes.

## Follow-up audit (2025-12-17)

- Audited `IdentifierCasePlanSnapshotCollaborators` in
  `src/semantic/src/identifier-case/plan-service.js`. The provider forced hosts
  to manufacture both snapshot capture and apply helpers together, so callers
  that only needed one collaborator still depended on the other.
- Split the contract into discrete capture and apply service providers. Updated
  the identifier-case service registry and unit tests to register the focused
  collaborators independently so each call site pulls in only the snapshot role
  it exercises.
