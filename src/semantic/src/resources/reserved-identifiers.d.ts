/**
 * Allow advanced integrations to supply alternate metadata at runtime while
 * keeping the default loader pointed at the bundled JSON file.
 *
 * @param {() => unknown} loader
 * @returns {() => void} Cleanup handler that restores the previous loader when
 *          invoked. The handler intentionally degrades to a no-op when another
 *          caller swapped the loader before cleanup runs. Identifier casing
 *          integrations layer overrides during try/finally flows described in
 *          `docs/legacy-identifier-case-plan.md#legacy-architecture-snapshot`; blindly
 *          reinstating `previousLoader` would roll back those newer overrides
 *          and leave the formatter reading stale metadata mid-run.
 */
declare function setReservedIdentifierMetadataLoader(loader: any): () => void;
/**
 * Restore the reserved identifier metadata loader back to the bundled JSON
 * implementation.
 */
declare function resetReservedIdentifierMetadataLoader(): void;
export declare function loadReservedIdentifierNames({
    disallowedTypes
}?: {}): Set<unknown>;
export {
    DEFAULT_IDENTIFIER_METADATA_PATH,
    resetReservedIdentifierMetadataLoader,
    setReservedIdentifierMetadataLoader
};
