// Common types used by identifier-case package
export type DebuggableMap<K = unknown, V = unknown> = Map<K, V> & {
    __dbgId?: string | null;
};

export type IdentifierCasePlanSnapshot = {
    projectIndex?: unknown;
    projectRoot?: string | null;
    bootstrap?: unknown;
    renameMap?: DebuggableMap<string, string> | null;
    renamePlan?: unknown;
    conflicts?: Array<unknown> | null;
    metricsReport?: unknown;
    metrics?: unknown;
    assetRenames?: unknown;
    assetRenameResult?: unknown;
    assetRenamesApplied?: boolean | null;
    dryRun?: boolean | null;
    planGenerated?: boolean;
};

export function getDebugId(
    map: DebuggableMap | null | undefined
): string | null {
    if (!map) return null;
    return (map as DebuggableMap).__dbgId ?? null;
}
