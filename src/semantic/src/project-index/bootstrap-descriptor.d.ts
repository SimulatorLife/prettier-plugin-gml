export declare function createProjectIndexBuildOptions({ logger, logMetrics, projectIndexConcurrency, parserOverride }?: {
    logger?: any;
    logMetrics?: boolean;
    parserOverride?: any;
}): {
    logger: any;
    logMetrics: boolean;
};
export declare function createProjectIndexDescriptor({ projectRoot, cacheMaxSizeBytes, cacheFilePath, formatterVersion, pluginVersion, buildOptions }?: {
    cacheFilePath?: any;
}): {
    projectRoot: any;
    cacheFilePath: any;
    formatterVersion: any;
    pluginVersion: any;
    buildOptions: any;
};
