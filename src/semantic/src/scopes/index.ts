// Public API: expose a single public coordinator type for external consumers.
export * from "./identifier-scope.js";
export * from "./scope-override-keywords.js";

// Deliberately exclude `ScopeTracker` from the public exports to enforce a clear
// architectural boundary: external consumers (including the plugin, CLI, and
// refactor modules) must interact with the semantic scope system exclusively
// through the `SemanticScopeCoordinator` facade. This prevents clients from
// depending on internal implementation details of the scope traversal machinery,
// making it possible to refactor or replace the underlying ScopeTracker logic
// without breaking external code. Internal tests that require direct access to
// ScopeTracker for whitebox validation can still import it explicitly from
// `./scope-tracker.js`, but production code paths remain insulated from churn.
