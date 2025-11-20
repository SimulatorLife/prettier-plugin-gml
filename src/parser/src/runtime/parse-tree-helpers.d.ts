export declare function createWrapperSymbols(name: any, { hasInstanceSuffix, wrapperSuffix }?: {
    hasInstanceSuffix?: string;
    wrapperSuffix?: string;
}): {
    instance: symbol;
    patchFlag: symbol;
};
export declare function ensureHasInstancePatched(BaseClass: any, { markerSymbol, patchFlagSymbol }: {
    markerSymbol: any;
    patchFlagSymbol: any;
}): void;
export declare function collectVisitMethodNames(BaseVisitor: any): string[];
export declare function collectPrototypeMethodNames(prototype: any): string[];
export declare function definePrototypeMethods(prototype: any, methodNames: any, createMethod: any): void;
export declare function deriveListenerMethodNames(visitMethodNames: any): any[];
export declare function toDelegate(value: any, fallback?: any): any;
