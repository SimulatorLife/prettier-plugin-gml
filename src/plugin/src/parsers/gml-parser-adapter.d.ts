declare function parse(text: any, options: any): Promise<any>;
declare function locStart(node: any): any;
declare function locEnd(node: any): any;
export declare const gmlParserAdapter: {
    parse: typeof parse;
    astFormat: string;
    locStart: typeof locStart;
    locEnd: typeof locEnd;
};
export {};
