export declare function scanProjectTree(
    projectRoot: any,
    fsFacade: any,
    metrics?: any,
    options?: {}
): Promise<{
    yyFiles: any[];
    gmlFiles: any[];
}>;
