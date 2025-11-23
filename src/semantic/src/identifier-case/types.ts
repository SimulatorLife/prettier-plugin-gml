// Common types used by identifier-case package
export type DebuggableMap<K = unknown, V = unknown> = Map<K, V> & {
    __dbgId?: string | null;
};

export type IdentifierCasePlanSnapshot = {
    projectIndex?: unknown | null;
    projectRoot?: string | null;
    bootstrap?: unknown | null;
    renameMap?: DebuggableMap<string, string> | null;
    renamePlan?: unknown | null;
    conflicts?: Array<unknown> | null;
    metricsReport?: unknown | null;
    metrics?: unknown | null;
    assetRenames?: unknown | null;
    assetRenameResult?: unknown | null;
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
