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
