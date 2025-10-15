# Codex action list

## Interface Segregation sweep (`codex-isp.yml`)

Codex runs the Interface Segregation sweep on a regular cadence. When the
workflow opens a seed pull request, the assistant is expected to:

- Search for TypeScript/JavaScript interfaces or type aliases with many members
  (methods or properties) coupled to broad names such as `FooService`,
  `BarManager`, or `BazController`.
- Flag contracts whose sprawl suggests they violate the Interface Segregation
  Principle (ISP) and articulate why the responsibilities are too broad.
- Partition the contract into role-specific interfaces that group cohesive
  responsibilities together.
- Update the implementing classes/objects and any consuming call sites to depend
  on the smaller interfaces.
- Keep the change narrowly focused on the chosen contract: avoid unrelated
  refactors, preserve public API stability unless strictly necessary, and ensure
  tests keep passing.
- When no suitable candidate is found, document the investigation with concrete
  evidence (e.g., lists of reviewed files, metrics for member counts) and explain
  what would be required for a future ISP refactor.

### Examples of acceptable improvements

- Splitting a 15-member `ProjectService` interface into `ProjectReader` (read
  operations) and `ProjectMutator` (write operations) so that read-only
  components can depend on a smaller contract.
- Breaking up a `ResourceManager` type alias that mixes cache maintenance,
  network orchestration, and logging hooks into separate interfaces for cache
  hydration, fetch coordination, and audit logging. Consumers import only the
  slice they require, reducing accidental coupling.
- Replacing a `TelemetryController` interface that exposes configuration
  management, live sampling controls, and reporting pipelines with dedicated
  `TelemetryConfig`, `TelemetrySampling`, and `TelemetryReporter` contracts, and
  updating implementations to advertise the appropriate subset.

These examples illustrate the expectation: highlight a specific oversized
contract, justify the split, introduce cohesive replacements, and migrate the
consumers without broad collateral edits.
