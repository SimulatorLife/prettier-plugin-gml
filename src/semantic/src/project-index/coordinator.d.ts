export declare function createProjectIndexCoordinator({ fsFacade, loadCache, saveCache, buildIndex, cacheMaxSizeBytes: rawCacheMaxSizeBytes, getDefaultCacheMaxSize }?: {}): {
    ensureReady: (descriptor: any) => Promise<any>;
    dispose: () => void;
};
