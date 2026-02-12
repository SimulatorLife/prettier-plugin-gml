/**
 * Method name reflection and derivation utilities.
 *
 * This module provides utilities for discovering and deriving method names from
 * ANTLR-generated visitor and listener base classes. These functions enable dynamic
 * method definition on wrapper classes without hardcoding method names.
 *
 * @module parser/runtime/method-reflection
 */

/**
 * Collects all visit method names from an ANTLR-generated visitor base class.
 *
 * @param BaseVisitor - The visitor constructor to reflect upon
 * @returns Array of method names that start with "visit" (excluding base visitor methods)
 *
 * @remarks
 * Filters out ANTLR's built-in visitor methods (visit, visitChildren, visitTerminal,
 * visitErrorNode) to return only grammar-specific visit methods.
 */
export function collectVisitMethodNames(BaseVisitor: unknown): ReadonlyArray<string> {
    const visitorClass = BaseVisitor as { prototype?: object } | null | undefined;
    const prototype = visitorClass?.prototype ?? Object.prototype;

    return Object.getOwnPropertyNames(prototype).filter((name) => {
        if (!name.startsWith("visit")) {
            return false;
        }

        if (name === "visit" || name === "visitChildren") {
            return false;
        }

        if (name === "visitTerminal" || name === "visitErrorNode") {
            return false;
        }

        return typeof (prototype as Record<string, unknown>)[name] === "function";
    });
}

/**
 * Collects all method names from a prototype object (excluding constructor).
 *
 * @param prototype - The prototype object to reflect upon
 * @returns Array of function property names from the prototype
 */
export function collectPrototypeMethodNames(prototype: unknown): ReadonlyArray<string> {
    if (!prototype || typeof prototype !== "object") {
        return [];
    }

    return Object.getOwnPropertyNames(prototype).filter((name) => {
        if (name === "constructor") {
            return false;
        }

        return typeof (prototype as Record<string, unknown>)[name] === "function";
    });
}

/**
 * Derives listener method names from visitor method names.
 *
 * @param visitMethodNames - Array of visit method names to transform
 * @returns Array of enter/exit listener method names
 *
 * @remarks
 * For each visit method like "visitProgram", generates both "enterProgram" and
 * "exitProgram" listener methods. This maintains the ANTLR listener pattern where
 * each parse tree node triggers enter/exit events.
 */
export function deriveListenerMethodNames(visitMethodNames: unknown): ReadonlyArray<string> {
    if (!Array.isArray(visitMethodNames)) {
        return [];
    }

    const listenerNames: string[] = [];
    for (const visitName of visitMethodNames) {
        if (typeof visitName !== "string") {
            continue;
        }
        const suffix = visitName.slice("visit".length);
        listenerNames.push(`enter${suffix}`, `exit${suffix}`);
    }

    return listenerNames;
}
