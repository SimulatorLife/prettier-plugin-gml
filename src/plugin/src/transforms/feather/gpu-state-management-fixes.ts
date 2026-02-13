/**
 * GPU state management Feather diagnostic fixes.
 *
 * This module handles all GPU state-related Feather diagnostics including:
 * - GM2046: Surface targets must be reset
 * - GM2048: Blend enable must be reset
 * - GM2000: Blend mode must be reset
 * - GM2053: Alpha test enable must be reset
 * - GM2054: Alpha test ref must be reset
 * - GM2026: Halign must be reset
 * - GM2051: Cull mode must be reset
 * - GM2052: Colour write enable must be reset
 * - GM2056: Texture repeat must be reset
 * - GM2003: Shader reset must be called
 * - GM2004: Fog must be reset
 */

import { Core } from "@gml-modules/core";

import {
    attachFeatherFixMetadata,
    createCallExpressionTargetFixDetail,
    createFeatherFixDetail,
    hasFeatherDiagnosticContext,
    markStatementToSuppressFollowingEmptyLine,
    markStatementToSuppressLeadingEmptyLine,
    hasOnlyWhitespaceBetweenNodes,
    extractSurfaceTargetName,
    isCallExpression,
    isDrawFunctionCall,
    isLiteralFalse,
    isLiteralZero,
    isLiteralOne,
    isLiteralTrue,
    isNegativeOneLiteral
} from "./apply-feather-fixes.js";
import { resolveCallExpressionArrayContext, hasArrayParentWithNumericIndex } from "./ast-traversal.js";

export function ensureShaderResetIsCalled({ ast, diagnostic, sourceText }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureShaderResetAfterSet(node, parent, property, diagnostic, sourceText);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureShaderResetAfterSet(node, parent, property, diagnostic, sourceText) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "shader_set")) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;
    let lastSequentialCallIndex = property;
    let previousNode = node;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (isShaderResetCall(candidate)) {
            return null;
        }

        if (!isCallExpression(candidate)) {
            break;
        }

        if (Core.isIdentifierWithName(candidate.object, "shader_set")) {
            break;
        }

        if (!hasOnlyWhitespaceBetweenNodes(previousNode, candidate, sourceText)) {
            break;
        }

        lastSequentialCallIndex = insertionIndex;
        previousNode = candidate;
        insertionIndex += 1;
    }

    if (lastSequentialCallIndex > property) {
        insertionIndex = lastSequentialCallIndex + 1;
    }

    const resetCall = createShaderResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    markStatementToSuppressFollowingEmptyLine(node);
    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureFogIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureFogResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureFogResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_fog")) {
        return null;
    }

    if (isFogResetCall(node)) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isLiteralFalse(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (candidate?.type === "EmptyStatement") {
            insertionIndex += 1;
            continue;
        }

        if (isFogResetCall(candidate)) {
            return null;
        }

        if (!candidate || candidate.type !== "CallExpression") {
            break;
        }

        if (!isDrawFunctionCall(candidate)) {
            break;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
        insertionIndex += 1;
    }

    const resetCall = createFogResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureSurfaceTargetsAreReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureSurfaceTargetResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureSurfaceTargetResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "surface_set_target")) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;
    let lastDrawCallIndex = property;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (isSurfaceResetTargetCall(candidate)) {
            return null;
        }

        if (!candidate || candidate.type !== "CallExpression") {
            break;
        }

        const isDrawCall = isDrawFunctionCall(candidate);
        const isActiveTargetSubmit = !isDrawCall && isVertexSubmitCallUsingActiveTarget(candidate);

        if (!isDrawCall && !isActiveTargetSubmit) {
            break;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
        lastDrawCallIndex = insertionIndex;
        insertionIndex += 1;

        if (isActiveTargetSubmit) {
            break;
        }
    }

    if (lastDrawCallIndex > property) {
        insertionIndex = lastDrawCallIndex + 1;
    } else if (insertionIndex >= siblings.length) {
        insertionIndex = siblings.length;
    } else {
        return null;
    }

    const resetCall = createSurfaceResetTargetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: extractSurfaceTargetName(node),
        range: {
            start: Core.getNodeStartIndex(node),
            end: Core.getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    removeRedundantSurfaceResetCalls(siblings, insertionIndex + 1);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureBlendEnableIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureBlendEnableResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureBlendEnableResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_blendenable")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (!shouldResetBlendEnable(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isBlendEnableResetCall(sibling)) {
            return null;
        }

        if (!isTriviallyIgnorableStatement(sibling)) {
            insertionIndex = index + 1;
            break;
        }
    }

    const resetCall = createBlendEnableResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    for (let cleanupIndex = property + 1; cleanupIndex < insertionIndex; cleanupIndex += 1) {
        const candidate = siblings[cleanupIndex];

        if (!isTriviallyIgnorableStatement(candidate)) {
            continue;
        }

        siblings.splice(cleanupIndex, 1);
        insertionIndex -= 1;
        cleanupIndex -= 1;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const needsSeparator =
        !isAlphaTestDisableCall(nextSibling) &&
        nextSibling &&
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

    if (needsSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    markStatementToSuppressFollowingEmptyLine(node);
    markStatementToSuppressLeadingEmptyLine(resetCall);

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureBlendModeIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureBlendModeResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureBlendModeResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_blendmode")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isBlendModeNormalArgument(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;
    let lastDrawCallIndex = property;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (isBlendModeResetCall(candidate)) {
            return null;
        }

        if (!candidate) {
            break;
        }

        if (isTriviallyIgnorableStatement(candidate)) {
            insertionIndex += 1;
            continue;
        }

        if (!isCallExpression(candidate)) {
            break;
        }

        if (!isDrawFunctionCall(candidate)) {
            break;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
        lastDrawCallIndex = insertionIndex;
        insertionIndex += 1;
    }

    if (lastDrawCallIndex > property) {
        insertionIndex = lastDrawCallIndex + 1;
    } else if (insertionIndex >= siblings.length) {
        insertionIndex = siblings.length;
    } else {
        return null;
    }

    const resetCall = createBlendModeResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    markStatementToSuppressFollowingEmptyLine(node);
    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureAlphaTestEnableIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureAlphaTestEnableResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureAlphaTestEnableResetAfterCall(node, parent, property, diagnostic) {
    if (!resolveCallExpressionArrayContext(node, parent, property)) {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_alphatestenable")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (!isLiteralTrue(args[0])) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isAlphaTestEnableResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createAlphaTestEnableResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    let insertionIndex = insertionInfo.index;

    for (let index = property + 1; index < insertionIndex; index += 1) {
        const candidate = siblings[index];

        if (!candidate || isTriviallyIgnorableStatement(candidate)) {
            continue;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
    }

    markStatementToSuppressFollowingEmptyLine(node);

    const previousSibling = siblings[insertionIndex - 1] ?? siblings[property] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const shouldInsertSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        nextSibling &&
        !isTriviallyIgnorableStatement(nextSibling) &&
        !isAlphaTestDisableCall(nextSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

    if (shouldInsertSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureAlphaTestRefIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureAlphaTestRefResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureAlphaTestRefResetAfterCall(node, parent, property, diagnostic) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isLiteralZero(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isAlphaTestRefResetCall(sibling)) {
            return null;
        }

        if (isAlphaTestDisableCall(sibling)) {
            insertionIndex = index;
            break;
        }
    }

    const resetCall = createAlphaTestRefResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const shouldInsertSeparator =
        !nextSibling &&
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling) &&
        !isAlphaTestDisableCall(nextSibling);

    if (shouldInsertSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureHalignIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureHalignResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureHalignResetAfterCall(node, parent, property, diagnostic) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "draw_set_halign")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (Core.isIdentifierWithName(args[0], "fa_left")) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isHalignResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createHalignResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    const insertionIndex = typeof insertionInfo.index === "number" ? insertionInfo.index : siblings.length;

    for (let index = property + 1; index < insertionIndex; index += 1) {
        const candidate = siblings[index];

        if (!candidate || isTriviallyIgnorableStatement(candidate)) {
            continue;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
    }

    markStatementToSuppressFollowingEmptyLine(node);
    markStatementToSuppressLeadingEmptyLine(resetCall);

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureCullModeIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureCullModeResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureCullModeResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_cullmode")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    const [modeArgument] = args;

    if (!Core.isIdentifierNode(modeArgument)) {
        return null;
    }

    if (Core.isIdentifierWithName(modeArgument, "cull_noculling")) {
        return null;
    }

    const siblings = parent;
    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isCullModeResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createCullModeResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    const insertionIndex = typeof insertionInfo.index === "number" ? insertionInfo.index : siblings.length;

    for (let index = property + 1; index < insertionIndex; index += 1) {
        const candidate = siblings[index];

        if (!candidate || isTriviallyIgnorableStatement(candidate)) {
            continue;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
    }

    markStatementToSuppressFollowingEmptyLine(node);

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureColourWriteEnableIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureColourWriteEnableResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureColourWriteEnableResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_colourwriteenable")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (!hasDisabledColourChannel(args)) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isColourWriteEnableResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createColourWriteEnableResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    let insertionIndex = insertionInfo.index;

    if (typeof insertionIndex !== "number") {
        return null;
    }

    const cleanupStartIndex = property + 1;

    for (let index = cleanupStartIndex; index < insertionIndex; ) {
        const candidate = siblings[index];

        if (isTriviallyIgnorableStatement(candidate)) {
            siblings.splice(index, 1);
            insertionIndex -= 1;
            continue;
        }

        markStatementToSuppressLeadingEmptyLine(candidate);
        index += 1;
    }

    markStatementToSuppressFollowingEmptyLine(node);

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const hasOriginalSeparator = nextSibling
        ? hasOriginalBlankLineBetween(previousSibling, nextSibling)
        : hasOriginalBlankLineBetween(node, previousSibling);
    const shouldInsertSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        nextSibling &&
        !isTriviallyIgnorableStatement(nextSibling) &&
        !hasOriginalSeparator;

    if (shouldInsertSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    markStatementToSuppressLeadingEmptyLine(resetCall);
    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

export function ensureTextureRepeatIsReset({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Core.isCallExpressionNode(node)) {
            const fix = ensureTextureRepeatResetAfterCall(node, parent, property, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureTextureRepeatResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_texrepeat")) {
        return null;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (!shouldResetTextureRepeat(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isTextureRepeatResetCall(sibling)) {
            return null;
        }

        if (!isTriviallyIgnorableStatement(sibling)) {
            insertionIndex = index + 1;
            break;
        }
    }

    const resetCall = createTextureRepeatResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

    if (!fixDetail) {
        return null;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const needsSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        nextSibling &&
        !isTriviallyIgnorableStatement(nextSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

    if (needsSeparator) {
        insertionIndex = insertSeparatorStatementBeforeIndex(siblings, insertionIndex, previousSibling);
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function isShaderResetCall(node) {
    if (!isCallExpressionWithName(node, "shader_reset")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    return args.length === 0;
}

function isFogResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_fog")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length < 4) {
        return false;
    }

    return (
        isLiteralFalse(args[0]) &&
        Core.isIdentifierWithName(args[1], "c_black") &&
        isLiteralZero(args[2]) &&
        isLiteralOne(args[3])
    );
}

function isAlphaTestEnableResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_alphatestenable")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return isLiteralFalse(args[0]);
}

function isAlphaTestRefResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_alphatestref")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return isLiteralZero(args[0]);
}

function isHalignResetCall(node) {
    if (!isCallExpressionWithName(node, "draw_set_halign")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return Core.isIdentifierWithName(args[0], "fa_left");
}

function isCullModeResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_cullmode")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return Core.isIdentifierWithName(args[0], "cull_noculling");
}

function isColourWriteEnableResetCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_colourwriteenable")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length < 4) {
        return false;
    }

    return args.slice(0, 4).every((argument) => Core.isBooleanLiteral(argument, true));
}

function isAlphaTestDisableCall(node) {
    if (!isCallExpressionWithName(node, "gpu_set_alphatestenable")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function createAlphaTestEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_alphatestenable") {
        return null;
    }

    const literalFalse = createLiteral("false", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalFalse]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createAlphaTestRefResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_alphatestref") {
        return null;
    }

    const literalZero = createLiteral("0", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalZero]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createBlendModeResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_blendmode") {
        return null;
    }

    const blendModeIdentifier = Core.createIdentifierNode("bm_normal", template.arguments?.[0]);

    if (!blendModeIdentifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [blendModeIdentifier]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function isSurfaceSetTargetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return Core.isIdentifierWithName(node.object, "surface_set_target");
}

function createHalignResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "draw_set_halign") {
        return null;
    }

    const faLeft = Core.createIdentifierNode("fa_left", template.arguments?.[0]);

    if (!faLeft) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [faLeft]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createCullModeResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_cullmode") {
        return null;
    }

    const resetArgument = Core.createIdentifierNode("cull_noculling", template.arguments?.[0]);

    if (!resetArgument) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [resetArgument]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createColourWriteEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_colourwriteenable") {
        return null;
    }

    const templateArgs = Core.asArray(template.arguments);
    const argumentsList = [];

    for (let index = 0; index < 4; index += 1) {
        const argumentTemplate = templateArgs[index] ?? templateArgs.at(-1) ?? template;
        const literalTrue = createLiteral("true", argumentTemplate);
        argumentsList.push(literalTrue);
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: argumentsList
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function isBlendModeNormalArgument(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (Core.isIdentifierWithName(node, "bm_normal")) {
        return true;
    }

    if (Core.isLiteralNode(node)) {
        return node.value === "bm_normal";
    }

    return false;
}

function shouldResetBlendEnable(argument) {
    if (!argument || typeof argument !== "object") {
        return false;
    }

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function shouldResetTextureRepeat(argument) {
    if (!argument || typeof argument !== "object") {
        return false;
    }

    if (isLiteralFalse(argument) || isLiteralZero(argument)) {
        return false;
    }

    return isLiteralTrue(argument) || isLiteralOne(argument);
}

function isTextureRepeatResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_texrepeat")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function createTextureRepeatResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_texrepeat") {
        return null;
    }

    const literalFalse = createLiteral("false", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalFalse]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function isBlendModeResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_blendmode")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return isBlendModeNormalArgument(args[0]);
}

function isBlendEnableResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "gpu_set_blendenable")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralTrue(argument) || isLiteralOne(argument);
}

function createShaderResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.createIdentifierNode("shader_reset", template.object);

    if (!identifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createFogResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_fog") {
        return null;
    }

    const [argument0, argument1, argument2, argument3] = Core.asArray(template.arguments);

    const falseLiteral = createLiteral("false", argument0);
    const colorIdentifier = Core.createIdentifierNode("c_black", argument1);
    const zeroLiteral = createLiteral("0", argument2);
    const oneLiteral = createLiteral("1", argument3);

    if (!falseLiteral || !colorIdentifier || !zeroLiteral || !oneLiteral) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [falseLiteral, colorIdentifier, zeroLiteral, oneLiteral]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createBlendEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_blendenable") {
        return null;
    }

    const literalTrue = createLiteral("true", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalTrue]
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function createLiteral(value, template) {
    const literalValue = typeof value === "number" ? String(value) : value;

    const literal = {
        type: "Literal",
        value: literalValue
    };

    Core.assignClonedLocation(literal, template);

    return literal;
}

function isSurfaceResetTargetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return Core.isIdentifierWithName(node.object, "surface_reset_target");
}

function createSurfaceResetTargetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = Core.createIdentifierNode("surface_reset_target", template.object);

    if (!identifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    Core.assignClonedLocation(callExpression, template);

    return callExpression;
}

function isVertexSubmitCallUsingActiveTarget(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!Core.isIdentifierWithName(node.object, "vertex_submit")) {
        return false;
    }

    const args = Core.getCallExpressionArguments(node);

    if (args.length < 3) {
        return false;
    }

    return isNegativeOneLiteral(args[2]);
}

function hasSurfaceResetBeforeNextTarget(statements, startIndex) {
    if (!Array.isArray(statements)) {
        return false;
    }

    for (let index = startIndex + 1; index < statements.length; index += 1) {
        const candidate = statements[index];

        if (isSurfaceResetTargetCall(candidate)) {
            return true;
        }

        if (isSurfaceSetTargetCall(candidate)) {
            return false;
        }
    }

    return false;
}

function removeRedundantSurfaceResetCalls(statements, startIndex) {
    if (!Array.isArray(statements)) {
        return;
    }

    for (let index = startIndex; index < statements.length; index += 1) {
        const candidate = statements[index];

        if (isSurfaceSetTargetCall(candidate)) {
            return;
        }

        if (!isSurfaceResetTargetCall(candidate)) {
            continue;
        }

        const nextSibling = statements[index + 1] ?? null;
        const shouldPreserveBlankLine = nextSibling && hasOriginalBlankLineBetween(candidate, nextSibling);

        statements.splice(index, 1);
        index -= 1;

        if (shouldPreserveBlankLine && nextSibling) {
            const insertionIndex = index + 1;
            const followingNode = statements[insertionIndex];

            if (followingNode?.type !== "EmptyStatement") {
                insertSeparatorStatementBeforeIndex(statements, insertionIndex, nextSibling);
            }
        }
    }
}

function computeStateResetInsertionIndex({ siblings, startIndex, isResetCall }) {
    if (!Array.isArray(siblings)) {
        return null;
    }

    let insertionIndex = siblings.length;

    for (let index = startIndex; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isResetCall(sibling)) {
            return { alreadyReset: true, index };
        }

        if (!isTriviallyIgnorableStatement(sibling)) {
            insertionIndex = index + 1;
            break;
        }
    }

    return { alreadyReset: false, index: insertionIndex };
}

function isTriviallyIgnorableStatement(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "EmptyStatement") {
        return true;
    }

    if (node.type === "ExpressionStatement") {
        const expression = node.expression;

        if (!expression || typeof expression !== "object") {
            return false;
        }

        if (expression.type === "Literal" && expression.value === ";") {
            return true;
        }
    }

    return false;
}

function hasOriginalBlankLineBetween(beforeNode, afterNode) {
    if (!beforeNode || !afterNode) {
        return false;
    }

    const beforeEnd = Core.getNodeEndIndex(beforeNode);
    const afterStart = Core.getNodeStartIndex(afterNode);

    if (typeof beforeEnd !== "number" || typeof afterStart !== "number") {
        return false;
    }

    return afterStart - beforeEnd > 1;
}

function insertSeparatorStatementBeforeIndex(siblings, insertionIndex, referenceNode) {
    const separator = createEmptyStatementLike(referenceNode);

    siblings.splice(insertionIndex, 0, separator);

    return insertionIndex + 1;
}

function createEmptyStatementLike(template) {
    const empty = { type: "EmptyStatement" };

    Core.assignClonedLocation(empty, template);

    return empty;
}

function isCallExpressionWithName(node, name) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return Core.isIdentifierWithName(node.object, name);
}

function hasDisabledColourChannel(args) {
    if (!Array.isArray(args)) {
        return false;
    }

    const channels = args.slice(0, 4);

    return channels.some((argument) => isLiteralFalse(argument));
}
