export declare function createFileScopeDescriptor(relativePath: any): {
    id: string;
    kind: string;
    name: any;
    displayName: string;
    resourcePath: any;
    gmlFile: any;
};
export declare function analyseResourceFiles({
    projectRoot,
    yyFiles,
    fsFacade,
    signal
}: {
    projectRoot: any;
    yyFiles: any;
    fsFacade: any;
    signal?: any;
}): Promise<{
    resourcesMap: Map<any, any>;
    gmlScopeMap: Map<any, any>;
    assetReferences: any[];
    scriptNameToScopeId: Map<any, any>;
    scriptNameToResourcePath: Map<any, any>;
}>;
