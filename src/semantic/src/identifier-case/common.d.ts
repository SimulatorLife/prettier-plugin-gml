export declare const COLLISION_CONFLICT_CODE = "collision";
export declare const PRESERVE_CONFLICT_CODE = "preserve";
export declare const IGNORE_CONFLICT_CODE = "ignored";
export declare const RESERVED_CONFLICT_CODE = "reserved";
export declare function formatConfigurationConflictMessage({ configConflict, identifierName, noun }: {
    configConflict: any;
    identifierName: any;
    noun?: string;
}): string;
export declare function escapeForRegExp(value: any): any;
export declare function createPatternRegExp(pattern: any): RegExp;
export declare function buildPatternMatchers(patterns: any): any[];
export declare function matchesIgnorePattern(matchers: any, identifierName: any, filePath: any): any;
export declare function resolveIdentifierConfigurationConflict({ preservedSet, identifierName, ignoreMatchers, filePath }: {
    preservedSet: any;
    identifierName: any;
    ignoreMatchers: any;
    filePath: any;
}): {
    code: string;
    reason: string;
    ignoreMatch?: undefined;
} | {
    code: string;
    reason: string;
    ignoreMatch: any;
};
export declare function createConflict({ code, severity, message, scope, identifier, suggestions, details }: {
    code: any;
    severity: any;
    message: any;
    scope: any;
    identifier: any;
    suggestions?: any[];
    details?: any;
}): {
    code: any;
    severity: any;
    message: any;
    scope: any;
    identifier: any;
    suggestions: any[];
    details: any;
};
export declare function incrementFileOccurrence(counts: any, filePath: any, fallbackPath: any): boolean;
export declare function summarizeReferenceFileOccurrences(references: any, { fallbackPath, includeFilePaths }?: {
    fallbackPath?: any;
    includeFilePaths?: any[];
}): {
    filePath: any;
    occurrences: any;
}[];
export declare function summarizeFileOccurrences(counts: any): {
    filePath: any;
    occurrences: any;
}[];
export declare const DEFAULT_WRITE_ACCESS_MODE: number;
