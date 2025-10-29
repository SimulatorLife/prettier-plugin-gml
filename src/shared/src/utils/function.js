/**
 * Return the provided value without modification. Centralizes the identity
 * function used across helper modules so hot paths can reuse a single exported
 * implementation instead of allocating ad-hoc closures.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function identity(value) {
    return value;
}

// Shared noop fallback reused across helpers that expect to decorate a stable
// callable. The export must remain a singleton so downstream consumers can
// detect "was this callback customized?" via reference equality checks instead
// of threading sentinel flags around. Manual CLI flows (documented in
// docs/live-reloading-concept.md#manual-mode-cleanup-handoffs) stash this exact
// reference as the fallback `unsubscribe` handler, and semantic integrations
// such as `setReservedIdentifierMetadataLoader` rely on returning the shared
// function so their try/finally cleanups stay balanced. Swapping it for an
// inline closure—even one that does nothing—would cause those guards to miss the
// sentinel, leak manual overrides, and require every consumer to grow bespoke
// equality logic.
const NOOP = () => {};

export { NOOP as noop };
