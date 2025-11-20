export declare function getIdentifierCaseStyleMetadata(style: any): any;
export declare function normalizeIdentifierCase(identifier: any): {
    original: any;
    prefix: any;
    leadingUnderscores: any;
    trailingUnderscores: any;
    suffixSeparator: string;
    suffixDigits: any;
    tokens: any[];
};
export declare function formatIdentifierCase(input: any, style: any): any;
export declare function isIdentifierCase(identifier: any, style: any): boolean;
export declare function normalizeIdentifierCaseWithOptions(
    identifier: any,
    options?: {}
): {
    original: any;
    prefix: any;
    leadingUnderscores: any;
    trailingUnderscores: any;
    suffixSeparator: string;
    suffixDigits: any;
    tokens: any[];
};
export declare function formatIdentifierCaseWithOptions(
    input: any,
    style: any,
    options?: {}
): any;
export declare function isIdentifierCaseWithOptions(
    identifier: any,
    style: any,
    options?: {}
): boolean;
