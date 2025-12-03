import { Core } from "@gml-modules/core";
import {
    attemptCancelReciprocalRatios,
    attemptCollectDistributedScalars,
    attemptCondenseNumericChainWithMultipleBases,
    attemptCondenseScalarProduct,
    attemptCondenseSimpleScalarProduct,
    attemptConvertDegreesToRadians,
    attemptRemoveAdditiveIdentity,
    attemptRemoveMultiplicativeIdentity,
    attemptSimplifyDivisionByReciprocal,
    attemptSimplifyNegativeDivisionProduct,
    attemptSimplifyOneMinusFactor,
    type ConvertManualMathTransformOptions,
    normalizeTraversalContext
} from "./traversal-normalization.js";

const { BINARY_EXPRESSION } = Core;

export function applyScalarCondensing(
    ast: any,
    context: ConvertManualMathTransformOptions | null = null
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const traversalContext = normalizeTraversalContext(ast, context);

    traverseForScalarCondense(ast, new Set(), traversalContext);

    return ast;
}

function traverseForScalarCondense(node, seen, context) {
    if (!node || typeof node !== "object") {
        return;
    }

    if (node._gmlManualMathOriginal === true) {
        return;
    }

    if (seen.has(node)) {
        return;
    }

    seen.add(node);

    if (Array.isArray(node)) {
        for (const element of node) {
            traverseForScalarCondense(element, seen, context);
        }
        return;
    }

    if (node.type === BINARY_EXPRESSION) {
        attemptSimplifyOneMinusFactor(node, context);
        attemptRemoveMultiplicativeIdentity(node, context);
        attemptRemoveAdditiveIdentity(node, context);

        if (attemptConvertDegreesToRadians(node, context)) {
            return;
        }

        if (attemptSimplifyDivisionByReciprocal(node, context)) {
            return;
        }

        attemptCancelReciprocalRatios(node, context);

        attemptSimplifyNegativeDivisionProduct(node, context);

        attemptCondenseScalarProduct(node, context);
        attemptCondenseNumericChainWithMultipleBases(node, context);
        attemptCollectDistributedScalars(node, context);
        attemptCondenseSimpleScalarProduct(node, context);
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === "parent" || !value || typeof value !== "object") {
            continue;
        }

        traverseForScalarCondense(value, seen, context);
    }
}
