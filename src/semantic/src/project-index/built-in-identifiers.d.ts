declare const GML_IDENTIFIER_FILE_PATH: any;
export declare function loadBuiltInIdentifiers(
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
    metrics?: any,
    options?: {}
): Promise<any>;
export { GML_IDENTIFIER_FILE_PATH as __BUILT_IN_IDENTIFIER_PATH_FOR_TESTS };
export declare const __loadBuiltInIdentifiersForTests: typeof loadBuiltInIdentifiers;
