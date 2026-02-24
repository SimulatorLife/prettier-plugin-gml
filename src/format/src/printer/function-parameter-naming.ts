/**
 * Utilities for resolving preferred function-parameter names from doc-comment metadata.
 *
 * This module is responsible for all logic that determines what name a function
 * parameter should be printed as:
 *
 * - Resolving a preferred name from `@function` tag params, implicit argument
 *   doc entries, or the parameter list itself.
 * - Deciding whether a variable declarator is a redundant parameter alias that
 *   can be omitted from the formatted output.
 * - Filtering misattached function doc-comments from variable declarators.
 * - Building the initializer override string used when a `var x = argument[n]`
 *   assignment can be inlined as a named parameter reference.
 *
 * Exported symbols are consumed by the printer (`print.ts`). All other symbols
 * in this file are module-private helpers.
 */

import { Core } from "@gml-modules/core";
import type { AstPath } from "prettier";

import { NUMBER_TYPE, OBJECT_TYPE, STRING_TYPE } from "./constants.js";
import { findAncestorNode, safeGetParentNode } from "./path-utils.js";
import { isValidIdentifierName } from "./type-guards.js";

// ---------------------------------------------------------------------------
// Base utilities
// ---------------------------------------------------------------------------

function getFunctionParams(functionNode: unknown): unknown[] {
    if (!functionNode || typeof functionNode !== OBJECT_TYPE) {
        return [];
    }

    const { params } = functionNode as { params?: unknown };
    if (!Array.isArray(params)) {
        return [];
    }

    return params;
}

function getFunctionParameterNameByIndex(functionNode: unknown, index: number): string | null {
    if (!functionNode || typeof functionNode !== OBJECT_TYPE) {
        return null;
    }

    const params = getFunctionParams(functionNode);

    if (!Number.isInteger(index) || index < 0 || index >= params.length) {
        return null;
    }

    const param = params[index];
    if (!param || typeof param !== OBJECT_TYPE) {
        return null;
    }

    const p = param as { type?: string; name?: string; left?: { type?: string; name?: string } };

    if (p.type === "Identifier" && typeof p.name === STRING_TYPE) {
        return p.name;
    }

    if (p.type === "DefaultParameter" && p.left?.type === "Identifier" && typeof p.left.name === STRING_TYPE) {
        return p.left.name;
    }

    return null;
}

function findEnclosingFunctionForPath(path: AstPath<any>): unknown {
    return findAncestorNode(path, (node: unknown) => Core.isFunctionLikeNode(node));
}

// ---------------------------------------------------------------------------
// Doc-comment parameter name extraction
// ---------------------------------------------------------------------------

function getFunctionTagParamFromOriginalText(
    originalText: string | null | undefined,
    functionNode: unknown,
    paramIndex: number
): string | null {
    if (typeof originalText !== STRING_TYPE) {
        return null;
    }

    const functionStart = Core.getNodeStartIndex(functionNode);
    if (typeof functionStart !== NUMBER_TYPE) {
        return null;
    }

    const prefix = originalText.slice(0, functionStart);
    const lastDocIndex = prefix.lastIndexOf("///");
    if (lastDocIndex === -1) {
        return null;
    }

    const docBlock = prefix.slice(lastDocIndex);
    const lines = Core.splitLines(docBlock);
    for (const docLine of lines) {
        const params = Core.extractFunctionTagParams(docLine);
        if (params.length > 0) {
            return paramIndex < params.length ? params[paramIndex] : null;
        }
    }

    return null;
}

function getFunctionTagParamName(functionNode: unknown, paramIndex: number, options: unknown): string | null {
    if (!functionNode || !Number.isInteger(paramIndex) || paramIndex < 0) {
        return null;
    }

    const fn = functionNode as {
        _functionTagParamNames?: unknown[];
        docComments?: unknown[];
        comments?: unknown[];
    };

    const orderedParamNames = Array.isArray(fn._functionTagParamNames) ? fn._functionTagParamNames : null;
    if (
        orderedParamNames &&
        paramIndex < orderedParamNames.length &&
        Core.isNonEmptyString(orderedParamNames[paramIndex])
    ) {
        return orderedParamNames[paramIndex];
    }

    const docComments = Array.isArray(fn.docComments)
        ? fn.docComments
        : Array.isArray(fn.comments)
          ? fn.comments
          : null;
    if (!Core.isNonEmptyArray(docComments)) {
        return null;
    }

    const lineCommentOptions = Core.resolveLineCommentOptions(options);
    const formattingOptions = {
        ...lineCommentOptions,
        originalText: (options as { originalText?: string } | null)?.originalText
    };

    for (const comment of docComments) {
        const formatted = Core.formatLineComment(comment, formattingOptions);
        const rawValue =
            formatted ??
            (typeof (comment as { value?: string })?.value === "string" ? (comment as { value: string }).value : null);
        if (!Core.isNonEmptyString(rawValue)) {
            continue;
        }

        const params = Core.extractFunctionTagParams(rawValue);
        if (params.length === 0) {
            continue;
        }

        return paramIndex < params.length ? params[paramIndex] : null;
    }

    const docParamFromOriginalText = getFunctionTagParamFromOriginalText(
        (options as { originalText?: string } | null)?.originalText,
        functionNode,
        paramIndex
    );
    if (docParamFromOriginalText !== null) {
        return docParamFromOriginalText;
    }

    return null;
}

// ---------------------------------------------------------------------------
// Preferred parameter name resolution
// ---------------------------------------------------------------------------

function normalizePreferredParameterName(name: unknown): string | null {
    if (typeof name !== STRING_TYPE || (name as string).length === 0) {
        return null;
    }

    const canonical = Core.getCanonicalParamNameFromText(name);
    if (canonical && canonical.length > 0) {
        return canonical;
    }

    const normalizedValue = Core.normalizeDocMetadataName(name);
    if (typeof normalizedValue !== STRING_TYPE) {
        return null;
    }

    const normalized = (normalizedValue as string).trim();
    return normalized.length === 0 ? null : normalized;
}

function resolvePreferredParameterSource(
    functionNode: unknown,
    paramIndex: number,
    currentName: unknown,
    options: unknown,
    functionTagName: string | null
): unknown {
    if (Core.isNonEmptyString(functionTagName)) {
        return functionTagName;
    }

    const docPreferences = Core.preferredParamDocNamesByNode.get(functionNode);
    if (docPreferences?.has(paramIndex)) {
        return docPreferences.get(paramIndex) ?? null;
    }

    const implicitEntries = Core.collectImplicitArgumentDocNames(functionNode, options);
    if (!Array.isArray(implicitEntries)) {
        return null;
    }

    const implicitEntry = implicitEntries.find(
        (entry: unknown) => entry && (entry as { index?: unknown }).index === paramIndex
    );
    if (!implicitEntry) {
        return null;
    }

    const entry = implicitEntry as { canonical?: string; name?: string };
    if (entry.canonical) {
        return entry.name || entry.canonical;
    }

    if (entry.name && entry.name !== currentName) {
        return entry.name;
    }

    return null;
}

export function resolvePreferredParameterName(
    functionNode: unknown,
    paramIndex: number,
    currentName: unknown,
    options: unknown
): string | null {
    if (!functionNode || !Number.isInteger(paramIndex) || paramIndex < 0) {
        return null;
    }

    const params = getFunctionParams(functionNode);
    if (paramIndex >= params.length) {
        return null;
    }

    const functionTagName = getFunctionTagParamName(functionNode, paramIndex, options);
    const hasRenamableCurrentName =
        typeof currentName === STRING_TYPE && Core.getArgumentIndexFromIdentifier(currentName as string) !== null;

    if (!hasRenamableCurrentName) {
        return null;
    }

    const preferredSource = resolvePreferredParameterSource(
        functionNode,
        paramIndex,
        currentName,
        options,
        functionTagName
    );

    const normalizedName = normalizePreferredParameterName(preferredSource);
    if (!normalizedName || normalizedName === currentName) {
        return null;
    }

    return isValidIdentifierName(normalizedName) ? normalizedName : null;
}

// ---------------------------------------------------------------------------
// Path traversal helpers
// ---------------------------------------------------------------------------

export function findEnclosingFunctionNode(path: AstPath<any>): unknown {
    return findAncestorNode(path, (node: unknown) => Core.isFunctionLikeDeclaration(node));
}

export function findEnclosingFunctionDeclaration(path: AstPath<any>): unknown {
    return findAncestorNode(path, (node: unknown) => (node as { type?: string }).type === "FunctionDeclaration");
}

function findFunctionParameterContext(path: AstPath<any>): { functionNode: unknown; paramIndex: number } | null {
    if (!path || typeof (path as { getParentNode?: unknown }).getParentNode !== "function") {
        return null;
    }

    let candidate = (path as { getValue: () => unknown }).getValue();
    for (let depth = 0; ; depth += 1) {
        const parent = safeGetParentNode(path, depth);
        if (!parent) {
            break;
        }

        const p = parent as { type?: string; params?: unknown[] };

        if (p.type === "DefaultParameter") {
            candidate = parent;
            continue;
        }

        if (p.type === "FunctionDeclaration" || p.type === "ConstructorDeclaration") {
            const params = Core.toMutableArray(p.params ?? []);
            const index = params.indexOf(candidate);
            if (index !== -1) {
                return { functionNode: parent, paramIndex: index };
            }
        }

        candidate = parent;
    }

    return null;
}

// ---------------------------------------------------------------------------
// Primary exported API
// ---------------------------------------------------------------------------

export function getPreferredFunctionParameterName(path: AstPath<any>, node: unknown, options: unknown): string | null {
    const context = findFunctionParameterContext(path);
    if (context) {
        const { functionNode, paramIndex } = context;
        if (!functionNode || !Number.isInteger(paramIndex) || paramIndex < 0) {
            return null;
        }

        const params = getFunctionParams(functionNode);
        if (paramIndex >= params.length) {
            return null;
        }

        const identifier = Core.getIdentifierFromParameterNode(params[paramIndex]);
        const n = node as { name?: string } | null;
        const currentName =
            (identifier && typeof (identifier as { name?: string }).name === STRING_TYPE
                ? (identifier as { name: string }).name
                : null) ?? (n && typeof n.name === STRING_TYPE ? n.name : null);

        const preferredName = resolvePreferredParameterName(functionNode, paramIndex, currentName, options);

        if (Core.isNonEmptyString(preferredName)) {
            return preferredName;
        }

        return null;
    }

    const n = node as { name?: string } | null;
    if (!n || typeof n.name !== STRING_TYPE) {
        return null;
    }

    const argumentIndex = Core.getArgumentIndexFromIdentifier(n.name);
    if (!Number.isInteger(argumentIndex) || argumentIndex < 0) {
        return null;
    }

    const functionNode = findEnclosingFunctionNode(path);
    if (!functionNode) {
        return null;
    }

    const preferredName = resolvePreferredParameterName(functionNode, argumentIndex, n.name, options);

    if (Core.isNonEmptyString(preferredName)) {
        return preferredName;
    }

    const params = getFunctionParams(functionNode);
    if (argumentIndex >= params.length) {
        return null;
    }

    const identifier = Core.getIdentifierFromParameterNode(params[argumentIndex]);
    if (!identifier || typeof (identifier as { name?: string }).name !== STRING_TYPE) {
        return null;
    }

    const normalizedIdentifier = normalizePreferredParameterName((identifier as { name: string }).name);
    if (normalizedIdentifier && normalizedIdentifier !== n.name && isValidIdentifierName(normalizedIdentifier)) {
        return normalizedIdentifier;
    }

    return null;
}

// ---------------------------------------------------------------------------
// Parameter alias / declarator helpers
// ---------------------------------------------------------------------------

function shouldOmitParameterAlias(declarator: unknown, functionNode: unknown, options: unknown): boolean {
    const d = declarator as {
        type?: string;
        id?: { type?: string; name?: string };
        init?: { type?: string; name?: string };
    } | null;

    if (
        !d ||
        d.type !== "VariableDeclarator" ||
        !d.id ||
        d.id.type !== "Identifier" ||
        !d.init ||
        d.init.type !== "Identifier"
    ) {
        return false;
    }

    const aliasName = d.id.name;

    const normalizedAliasName = normalizePreferredParameterName(aliasName);
    const normalizedInitName = normalizePreferredParameterName(d.init.name);

    if (normalizedAliasName && normalizedInitName && normalizedAliasName === normalizedInitName) {
        return true;
    }

    const argumentIndex = Core.getArgumentIndexFromIdentifier(d.init.name);

    let paramIndex: number | null = argumentIndex;
    if (argumentIndex === null && functionNode) {
        const params = getFunctionParams(functionNode);
        for (const [i, param] of params.entries()) {
            const paramId = Core.getIdentifierFromParameterNode(param);
            if (paramId && (paramId as { name?: string }).name === d.init.name) {
                paramIndex = i;
                break;
            }
        }
        if (paramIndex === null) {
            return false;
        }
    } else if (argumentIndex === null) {
        return false;
    }

    const preferredName = resolvePreferredParameterName(functionNode, paramIndex, d.init.name, options);

    const normalizedAlias = normalizePreferredParameterName(aliasName);
    if (!normalizedAlias) {
        return false;
    }

    if (!functionNode) {
        return false;
    }

    const params = getFunctionParams(functionNode);
    if (paramIndex < 0 || paramIndex >= params.length) {
        return false;
    }

    const identifier = Core.getIdentifierFromParameterNode(params[paramIndex]);
    if (!identifier || typeof (identifier as { name?: string }).name !== STRING_TYPE) {
        return false;
    }

    const normalizedParamName = normalizePreferredParameterName((identifier as { name: string }).name);

    if (
        typeof normalizedParamName === STRING_TYPE &&
        normalizedParamName.length > 0 &&
        normalizedParamName === normalizedAlias
    ) {
        return true;
    }

    const normalizedPreferred = preferredName ? normalizePreferredParameterName(preferredName) : null;

    if (normalizedPreferred && normalizedPreferred === normalizedAlias) {
        return true;
    }

    return false;
}

/**
 * Filters variable declarators based on parameter alias omission rules.
 *
 * Removes declarators that are redundant parameter aliases when formatting optimization
 * is enabled. The filtering logic delegates to `shouldOmitParameterAlias` for each declarator.
 *
 * @param declarators - Array of declarator nodes to filter
 * @param functionNode - The enclosing function node (if any)
 * @param options - Prettier options
 * @returns Filtered array of declarators to keep
 */
export function filterKeptDeclarators(declarators: unknown[], functionNode: unknown, options: unknown): unknown[] {
    return declarators.filter((declarator) => {
        const omit = shouldOmitParameterAlias(declarator, functionNode, options);
        return !omit;
    });
}

/**
 * Filters out misattached function doc-comments from a declarator's comments array.
 *
 * Mutates the declarator in place by filtering its comments array and marking
 * filtered comments as printed. If all comments are filtered, deletes the comments property.
 *
 * This workaround addresses a parser issue where JSDoc function comments (@function, @func)
 * are incorrectly attached to variable declarators instead of their intended function targets.
 *
 * @param declarator - The variable declarator node to process
 */
export function filterMisattachedFunctionDocComments(declarator: unknown): void {
    const d = declarator as { comments?: Array<{ value: string; printed?: boolean }> };
    if (!d.comments) {
        return;
    }

    d.comments = d.comments.filter((comment) => {
        const isFunctionComment = comment.value.includes("@function") || comment.value.includes("@func");

        if (isFunctionComment) {
            comment.printed = true;
            return false;
        }

        return true;
    });

    if (d.comments.length === 0) {
        delete d.comments;
    }
}

/**
 * Joins an array of declarator doc fragments with comma separators.
 *
 * Inserts ", " between each pair of elements to produce a comma-separated list
 * suitable for variable declarations.
 *
 * @param parts - Array of doc fragments to join
 * @returns Flat array with commas inserted between parts
 */
export function joinDeclaratorPartsWithCommas(parts: unknown[]): unknown[] {
    const joined: unknown[] = [];
    const count = parts.length;

    for (let i = 0; i < count; i += 1) {
        joined.push(parts[i]);

        if (i < count - 1) {
            joined.push(", ");
        }
    }

    return joined;
}

export function shouldSynthesizeUndefinedDefaultForIdentifier(path: AstPath<any>, node: unknown): boolean {
    if (!node || Core.synthesizedUndefinedDefaultParameters.has(node)) {
        return false;
    }

    if (!path || typeof (path as { getParentNode?: unknown }).getParentNode !== "function") {
        return false;
    }

    const parent = safeGetParentNode(path);
    if (!parent || (parent as { type?: string }).type !== "FunctionDeclaration") {
        return false;
    }

    const params = getFunctionParams(parent);
    return params.includes(node);
}

// ---------------------------------------------------------------------------
// Argument alias initializer resolution
// ---------------------------------------------------------------------------

// Collects index/reference bookkeeping for implicit `arguments[index]` usages
// within a function. The traversal tracks alias declarations, direct
// references, and the set of indices that require doc entries so the caller
// can format them without dipping into low-level mutation logic.

export function resolveArgumentAliasInitializerDoc(path: AstPath<any>): string | null {
    const node = (path as { getValue: () => unknown }).getValue();
    const n = node as { type?: string; init?: unknown; id?: unknown } | null;
    if (!n || n.type !== "VariableDeclarator") {
        return null;
    }

    const initializer = n.init as { type?: string; name?: string } | null;
    if (!initializer || initializer.type !== "Identifier") {
        return null;
    }

    const match = Core.GML_ARGUMENT_IDENTIFIER_PATTERN.exec(initializer.name ?? "");
    if (!match) {
        return null;
    }

    const aliasIdentifier = n.id as { type?: string; name?: string } | null;
    if (!aliasIdentifier || aliasIdentifier.type !== "Identifier") {
        return null;
    }

    const aliasName = aliasIdentifier.name;
    if (!Core.isNonEmptyString(aliasName)) {
        return null;
    }

    const argumentIndex = Number.parseInt(match[1]);
    if (!Number.isInteger(argumentIndex) || argumentIndex < 0) {
        return null;
    }

    const functionNode = findEnclosingFunctionForPath(path);
    if (!functionNode) {
        return null;
    }

    const docPreferences = Core.preferredParamDocNamesByNode.get(functionNode);
    let parameterName: string | null = null;

    if (docPreferences && docPreferences.has(argumentIndex)) {
        const preferred = docPreferences.get(argumentIndex);
        if (Core.isNonEmptyString(preferred)) {
            parameterName = preferred;
        }
    }

    if (!parameterName) {
        parameterName = getFunctionParameterNameByIndex(functionNode, argumentIndex);
    }

    if (!parameterName || parameterName === aliasName || parameterName === initializer.name) {
        return null;
    }

    return parameterName;
}
