export declare const PROJECT_INDEX_CACHE_SCHEMA_VERSION = 1;
export declare const PROJECT_INDEX_CACHE_DIRECTORY = ".prettier-plugin-gml";
export declare const PROJECT_INDEX_CACHE_FILENAME = "project-index-cache.json";
export declare const PROJECT_INDEX_CACHE_MAX_SIZE_ENV_VAR =
    "GML_PROJECT_INDEX_CACHE_MAX_SIZE";
export declare const PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE: number;
export declare const DEFAULT_MAX_PROJECT_INDEX_CACHE_SIZE: number;
export declare const ProjectIndexCacheMissReason: Readonly<{
    NOT_FOUND: "not-found";
    INVALID_JSON: "invalid-json";
    INVALID_SCHEMA: "invalid-schema";
    PROJECT_ROOT_MISMATCH: "project-root-mismatch";
    FORMATTER_VERSION_MISMATCH: "formatter-version-mismatch";
    PLUGIN_VERSION_MISMATCH: "plugin-version-mismatch";
    MANIFEST_MTIME_MISMATCH: "manifest-mtime-mismatch";
    SOURCE_MTIME_MISMATCH: "source-mtime-mismatch";
}>;
export declare const ProjectIndexCacheStatus: Readonly<{
    MISS: "miss";
    HIT: "hit";
    SKIPPED: "skipped";
    WRITTEN: "written";
}>;
export declare function assertProjectIndexCacheStatus(value: any): any;
declare function getDefaultProjectIndexCacheMaxSize(): any;
declare function setDefaultProjectIndexCacheMaxSize(size: any): any;
declare function applyProjectIndexCacheEnvOverride(env: any): void;
export {
    getDefaultProjectIndexCacheMaxSize,
    setDefaultProjectIndexCacheMaxSize,
    applyProjectIndexCacheEnvOverride
};
export declare function loadProjectIndexCache(
    descriptor: any,
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
export declare function saveProjectIndexCache(
    descriptor: any,
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
export declare function deriveCacheKey(
    {
        filepath,
        projectRoot,
        formatterVersion
    }?: {
        formatterVersion?: string;
    },
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
    }
): Promise<string>;
