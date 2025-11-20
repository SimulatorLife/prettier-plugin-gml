export default class GMLParser {
    constructor(text: any, options?: {});
    static optionDefaults: Readonly<{
        getComments: true;
        getLocations: true;
        simplifyLocations: true;
        getIdentifierMetadata: false;
        createScopeTracker: any;
        astFormat: "gml";
        asJSON: false;
    }>;
    static parse(text: any, options: any): any;
    parse(): any;
    printTokens(text: any): void;
    restoreOriginalLiteralText(root: any): void;
    getHiddenNodes(lexer: any): void;
    removeLocationInfo(obj: any): void;
    simplifyLocationInfo(obj: any): void;
}
export { getLineBreakCount } from "./utils/index.js";
