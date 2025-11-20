export declare function findProjectRoot(
    options: any,
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
): Promise<any>;
