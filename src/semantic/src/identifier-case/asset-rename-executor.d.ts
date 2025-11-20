declare function tryAccess(fsFacade: any, method: any, targetPath: any, ...args: any[]): boolean;
declare function resolveAbsolutePath(projectRoot: any, relativePath: any): any;
declare function readJsonFile(fsFacade: any, absolutePath: any, cache: any): any;
declare function getObjectAtPath(json: any, propertyPath: any): any;
declare function updateReferenceObject(json: any, propertyPath: any, newResourcePath: any, newName: any): boolean;
declare function ensureWritableDirectory(fsFacade: any, directoryPath: any): void;
declare function ensureWritableFile(fsFacade: any, filePath: any): void;
export declare function createAssetRenameExecutor({ projectIndex, fsFacade, logger }?: {
    fsFacade?: any;
    logger?: any;
}): {
    queueRename(): boolean;
    commit(): {
        writes: any[];
        renames: any[];
    };
} | {
    queueRename(rename: any): boolean;
    commit(): {
        writes: {
            filePath: any;
            contents: any;
        }[];
        renames: any[];
    };
};
export declare const __private__: {
    defaultFsFacade: Readonly<{
        readFileSync(targetPath: any, encoding?: string): NonSharedBuffer & string;
        writeFileSync(targetPath: any, contents: any, encoding?: string): void;
        renameSync(fromPath: any, toPath: any): void;
        accessSync(targetPath: any, mode?: number): void;
        statSync(targetPath: any): import("fs").Stats;
        mkdirSync(targetPath: any): void;
        existsSync(targetPath: any): boolean;
    }>;
    fromPosixPath: any;
    resolveAbsolutePath: typeof resolveAbsolutePath;
    readJsonFile: typeof readJsonFile;
    getObjectAtPath: typeof getObjectAtPath;
    updateReferenceObject: typeof updateReferenceObject;
    tryAccess: typeof tryAccess;
    ensureWritableFile: typeof ensureWritableFile;
    ensureWritableDirectory: typeof ensureWritableDirectory;
};
export {};
