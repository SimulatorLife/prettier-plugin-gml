declare const IdentifierRole: Readonly<{
    DECLARATION: "declaration";
    REFERENCE: "reference";
}>;
export declare function assertValidIdentifierRole(
    role: any,
    context?: string
): any;
export { IdentifierRole };
