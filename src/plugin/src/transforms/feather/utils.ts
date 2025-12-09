import { Core } from "@gml-modules/core";

export const NUMERIC_STRING_LITERAL_PATTERN =
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function hasFeatherDiagnosticContext(ast, diagnostic) {
    if (!diagnostic) {
        return false;
    }

    if (!ast) {
        return false;
    }

    if (typeof ast !== "object") {
        return false;
    }

    return true;
}

export function createFeatherFixDetail(
    diagnostic,
    { target = null, range = null, automatic = true } = {}
) {
    if (!diagnostic) {
        return null;
    }

    return {
        id: diagnostic.id ?? null,
        title: diagnostic.title ?? null,
        description: diagnostic.description ?? null,
        correction: diagnostic.correction ?? null,
        target,
        range,
        automatic,
        replacement: null
    };
}

export function createCallExpressionTargetFixDetail(diagnostic, node) {
    if (!node) {
        return null;
    }

    return createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });
}

export function attachFeatherFixMetadata(target, fixes) {
    if (
        !target ||
        typeof target !== "object" ||
        !Array.isArray(fixes) ||
        fixes.length === 0
    ) {
        return;
    }

    const key = "_appliedFeatherDiagnostics";

    if (!Array.isArray(target[key])) {
        Object.defineProperty(target, key, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: []
        });
    }

    target[key].push(...fixes);
}

export function hasFeatherSourceTextContext(
    ast,
    diagnostic,
    sourceText,
    { allowEmpty = false } = {}
) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return false;
    }

    if (typeof sourceText !== "string") {
        return false;
    }

    if (!allowEmpty && sourceText.length === 0) {
        return false;
    }

    return true;
}
