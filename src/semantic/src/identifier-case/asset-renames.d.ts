export declare function planAssetRenames({ projectIndex, assetStyle, preservedSet, ignoreMatchers, metrics }?: {
    preservedSet?: Set<unknown>;
    ignoreMatchers?: any[];
    metrics?: any;
}): {
    operations: any[];
    conflicts: any[];
    renames: any[];
};
export declare function applyAssetRenames({ projectIndex, renames, fsFacade, logger }?: {
    fsFacade?: any;
    logger?: any;
}): {
    writes: any[];
    renames: any[];
};
