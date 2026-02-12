/**
 * Symbol-based type patching for ANTLR-generated parser classes.
 *
 * This module provides utilities for managing symbol-based markers and patching
 * the hasInstance behavior of ANTLR base classes. This is necessary because our
 * custom wrapper classes (GameMakerLanguageParserListener and GameMakerLanguageParserVisitor)
 * use composition rather than inheritance to wrap the generated ANTLR classes,
 * but need to be recognized as instanceof the base classes for compatibility
 * with ANTLR's internal type checks.
 *
 * @module parser/runtime/symbol-patching
 */

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

/**
 * Creates a pair of global symbols for marking and identifying wrapper instances.
 *
 * @param name - The base name for the wrapper class (used to generate unique symbol keys)
 * @param options - Configuration for symbol suffix customization
 * @returns An object containing the instance marker symbol and patch flag symbol
 *
 * @remarks
 * The symbols are registered in the global symbol registry using Symbol.for(),
 * ensuring they are stable across module boundaries and can be used for reliable
 * instanceof checks.
 */
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

/**
 * Patches a base class to recognize wrapper instances via symbol-based markers.
 *
 * @param BaseClass - The base class constructor to patch
 * @param options - Symbols to use for marker checks and tracking patch state
 *
 * @remarks
 * This function modifies the Symbol.hasInstance behavior of the base class so that
 * wrapper instances decorated with the marker symbol are recognized as instances
 * of the base class. This allows compositional wrappers to pass instanceof checks
 * without inheritance, which is necessary for ANTLR compatibility while maintaining
 * clean architecture boundaries.
 *
 * The patch is idempotent - if already applied (checked via patchFlagSymbol), the
 * function returns early without re-patching.
 */
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
