import { Core } from "@gml-modules/core";

const DEFAULT_FUNCTION_NAME = "parser";

function toQualifiedSymbolKey(name, suffix) {
    const qualified =
        typeof name === "string" && name.length > 0
            ? name
            : DEFAULT_FUNCTION_NAME;
    return `prettier.gml.${qualified}.${suffix}`;
}

export function createWrapperSymbols(
    name,
    { hasInstanceSuffix = "hasInstancePatched", wrapperSuffix = "wrapper" } = {}
) {
    return {
        instance: Symbol.for(toQualifiedSymbolKey(name, wrapperSuffix)),
        patchFlag: Symbol.for(toQualifiedSymbolKey(name, hasInstanceSuffix))
    };
}

export function ensureHasInstancePatched(
    BaseClass,
    { markerSymbol, patchFlagSymbol }
) {
    if (!BaseClass || typeof BaseClass !== "function") {
        return;
    }

    const targetClass = BaseClass;

    if (patchFlagSymbol && targetClass[patchFlagSymbol]) {
        return;
    }

    const basePrototype = targetClass.prototype ?? Object.prototype;
    const originalHasInstance = targetClass[Symbol.hasInstance];

    Object.defineProperty(targetClass, Symbol.hasInstance, {
        configurable: true,
        value(instance) {
            if (markerSymbol && instance?.[markerSymbol]) {
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

export function collectVisitMethodNames(BaseVisitor) {
    const prototype = BaseVisitor?.prototype ?? Object.prototype;
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

        return typeof prototype[name] === "function";
    });
}

export function collectPrototypeMethodNames(prototype) {
    if (!prototype) {
        return [];
    }

    return Object.getOwnPropertyNames(prototype).filter((name) => {
        if (name === "constructor") {
            return false;
        }

        return typeof prototype[name] === "function";
    });
}

export function definePrototypeMethods(prototype, methodNames, createMethod) {
    if (!prototype || typeof createMethod !== "function") {
        return;
    }

    for (const methodName of methodNames) {
        Object.defineProperty(prototype, methodName, {
            value: createMethod(methodName),
            writable: true,
            configurable: true
        });
    }
}

export function deriveListenerMethodNames(visitMethodNames) {
    if (!Array.isArray(visitMethodNames)) {
        return [];
    }

    const listenerNames = [];
    for (const visitName of visitMethodNames) {
        const suffix = visitName.slice("visit".length);
        listenerNames.push(`enter${suffix}`, `exit${suffix}`);
    }

    return listenerNames;
}

export function toDelegate(value, fallback = Core.Utils.noop) {
    return typeof value === "function" ? value : fallback;
}
