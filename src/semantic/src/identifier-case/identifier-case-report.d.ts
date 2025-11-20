/**
 * Identifier case reporting helpers.
 *
 * Normalizes rename plans/conflicts collected during identifier case dry runs
 * so downstream consumers (CLI output, diagnostics, and log files) receive
 * consistently shaped metadata regardless of the input source.
 */
declare function defaultNow(): number;
export declare function summarizeIdentifierCasePlan({ renamePlan, conflicts }?: {
    conflicts?: any[];
}): {
    summary: {
        renameCount: any;
        impactedFileCount: number;
        totalReferenceCount: number;
        conflictCount: any;
        severityCounts: any;
    };
    operations: any;
    renames: any;
    conflicts: any;
};
export declare function formatIdentifierCaseSummaryText(report: any): string[];
export declare function reportIdentifierCasePlan({ renamePlan, conflicts, logger, diagnostics, logFilePath, fsFacade, now }?: {
    conflicts?: any[];
    logger?: Console;
    diagnostics?: any;
    logFilePath?: any;
    fsFacade?: Readonly<{
        readFileSync(targetPath: any, encoding?: string): NonSharedBuffer & string;
        writeFileSync(targetPath: any, contents: any, encoding?: string): void;
        renameSync(fromPath: any, toPath: any): void;
        accessSync(targetPath: any, mode?: number): void;
        statSync(targetPath: any): import("fs").Stats;
        mkdirSync(targetPath: any): void;
        existsSync(targetPath: any): boolean;
    }>;
    now?: typeof defaultNow;
}): {
    summary: {
        renameCount: any;
        impactedFileCount: number;
        totalReferenceCount: number;
        conflictCount: any;
        severityCounts: any;
    };
    operations: any;
    renames: any;
    conflicts: any;
};
export declare function maybeReportIdentifierCaseDryRun(options: any): any;
export {};
