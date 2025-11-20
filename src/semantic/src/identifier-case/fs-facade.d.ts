declare const defaultIdentifierCaseFsFacade: Readonly<{
    readFileSync(targetPath: any, encoding?: string): NonSharedBuffer & string;
    writeFileSync(targetPath: any, contents: any, encoding?: string): void;
    renameSync(fromPath: any, toPath: any): void;
    accessSync(targetPath: any, mode?: number): void;
    statSync(targetPath: any): import("fs").Stats;
    mkdirSync(targetPath: any): void;
    existsSync(targetPath: any): boolean;
}>;
export declare function getDefaultIdentifierCaseFsFacade(): Readonly<{
    readFileSync(targetPath: any, encoding?: string): NonSharedBuffer & string;
    writeFileSync(targetPath: any, contents: any, encoding?: string): void;
    renameSync(fromPath: any, toPath: any): void;
    accessSync(targetPath: any, mode?: number): void;
    statSync(targetPath: any): import("fs").Stats;
    mkdirSync(targetPath: any): void;
    existsSync(targetPath: any): boolean;
}>;
export { defaultIdentifierCaseFsFacade };
