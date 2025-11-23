// Public API: expose a single public coordinator type for external consumers.
export * from "./identifier-scope.js";
export * from "./scope-override-keywords.js";

// Do not export `ScopeTracker` here to force external consumers to use the
// `SemanticScopeCoordinator` public facade. Internal tests that need direct
// access to `ScopeTracker` can import it from `./scope-tracker.js`.
