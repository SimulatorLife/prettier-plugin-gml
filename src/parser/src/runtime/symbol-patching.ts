import { Core } from "@gml-modules/core";

const DEFAULT_FUNCTION_NAME = "parser";

function toQualifiedSymbolKey(name: unknown, suffix: string): string {
    const qualified = Core.isNonEmptyString(name) ? name : DEFAULT_FUNCTION_NAME;
    return `prettier.gml.${qualified}.${suffix}`;
}

export interface WrapperSymbols {
    instance: symbol;
    patchFlag: symbol;
}

export interface SymbolOptions {
    hasInstanceSuffix?: string;
    wrapperSuffix?: string;
}

export function createWrapperSymbols(
    name: unknown,
    { hasInstanceSuffix = "hasInstancePatched", wrapperSuffix = "wrapper" }: SymbolOptions = {}
): WrapperSymbols {
    return {
        instance: Symbol.for(toQualifiedSymbolKey(name, wrapperSuffix)),
        patchFlag: Symbol.for(toQualifiedSymbolKey(name, hasInstanceSuffix))
    };
}

export interface PatchOptions {
    markerSymbol?: symbol;
    patchFlagSymbol?: symbol;
}

export function ensureHasInstancePatched(BaseClass: unknown, { markerSymbol, patchFlagSymbol }: PatchOptions): void {
    if (!BaseClass || typeof BaseClass !== "function") {
        return;
    }

    const targetClass = BaseClass as unknown as {
        prototype?: object;
        [Symbol.hasInstance]?: (instance: unknown) => boolean;
        [key: symbol]: unknown;
    };

    if (patchFlagSymbol && targetClass[patchFlagSymbol]) {
        return;
    }

    const basePrototype = targetClass.prototype ?? Object.prototype;
    const originalHasInstance = targetClass[Symbol.hasInstance];

    Object.defineProperty(targetClass, Symbol.hasInstance, {
        configurable: true,
        value(this: typeof targetClass, instance: unknown): boolean {
            if (markerSymbol && instance && typeof instance === "object" && markerSymbol in instance) {
                return true;
            }

            if (typeof originalHasInstance === "function") {
                return originalHasInstance.call(this, instance);
            }

            return Object.prototype.isPrototypeOf.call(basePrototype, instance);
        }
    });

    if (patchFlagSymbol) {
        Object.defineProperty(targetClass, patchFlagSymbol, {
            configurable: true,
            value: true
        });
    }
}
