# Fixture Runner

`@gmloop/fixture-runner` is the shared fixture discovery, execution, assertion, and profiling framework used by format, lint, refactor, and integration fixture suites.

Responsibilities:

- load shared `gmloop.json` through `@gmloop/core`
- validate fixture-only `fixture` metadata
- discover directory-per-case fixtures
- run workspace-owned adapters
- compare outputs
- collect time, memory, and CPU metrics
- emit human and JSON profile reports

This workspace depends only on `@gmloop/core`. Product workspaces supply their own adapters and retain ownership of their tool-specific config sections.
