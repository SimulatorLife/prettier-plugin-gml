export declare function createProjectIndexCoordinator(options?: {}): {
    ensureReady: (descriptor: any) => Promise<any>;
    dispose: () => void;
};
export { findProjectRoot } from "./project-root.js";
export {
    createProjectIndexBuildOptions,
    createProjectIndexDescriptor
} from "./bootstrap-descriptor.js";
export {
    PROJECT_MANIFEST_EXTENSION,
    isProjectManifestPath,
    PROJECT_RESOURCE_METADATA_DEFAULTS,
    getProjectResourceMetadataExtensions,
    resetProjectResourceMetadataExtensions,
    setProjectResourceMetadataExtensions,
    isProjectResourceMetadataPath,
    matchProjectResourceMetadataExtension
} from "./constants.js";
export {
    PROJECT_INDEX_CACHE_SCHEMA_VERSION,
    PROJECT_INDEX_CACHE_DIRECTORY,
    PROJECT_INDEX_CACHE_FILENAME,
    DEFAULT_MAX_PROJECT_INDEX_CACHE_SIZE,
    PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE,
    PROJECT_INDEX_CACHE_MAX_SIZE_ENV_VAR,
    getDefaultProjectIndexCacheMaxSize,
    setDefaultProjectIndexCacheMaxSize,
    applyProjectIndexCacheEnvOverride,
    ProjectIndexCacheMissReason,
    ProjectIndexCacheStatus,
    assertProjectIndexCacheStatus,
    loadProjectIndexCache,
    saveProjectIndexCache,
    deriveCacheKey
} from "./cache.js";
export {
    DEFAULT_PROJECT_INDEX_GML_CONCURRENCY,
    getDefaultProjectIndexGmlConcurrency,
    setDefaultProjectIndexGmlConcurrency,
    PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE,
    clampConcurrency
} from "./concurrency.js";
export declare function buildProjectIndex(
    projectRoot: any,
    fsFacade?: {
        readDir(targetPath: any): Promise<string[]>;
        stat(targetPath: any): Promise<import("fs").Stats>;
        readFile(
            targetPath: any,
            encoding?: string
        ): Promise<NonSharedBuffer & string>;
        writeFile(
            targetPath: any,
            contents: any,
            encoding?: string
        ): Promise<void>;
        rename(fromPath: any, toPath: any): Promise<void>;
        mkdir(
            targetPath: any,
            options?: {
                recursive: boolean;
            }
        ): Promise<string>;
        unlink(targetPath: any): Promise<void>;
    },
    options?: {}
): Promise<any>;
export { defaultFsFacade } from "./fs-facade.js";
export {
    ProjectFileCategory,
    getProjectIndexSourceExtensions,
    resetProjectIndexSourceExtensions,
    setProjectIndexSourceExtensions,
    normalizeProjectFileCategory,
    resolveProjectFileCategory
} from "./project-file-categories.js";
export { __loadBuiltInIdentifiersForTests } from "./built-in-identifiers.js";
export { getProjectIndexParserOverride } from "./parser-override.js";
