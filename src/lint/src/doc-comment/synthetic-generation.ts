import { Core } from "@gmloop/core";

import { parseDocCommentMetadata } from "./metadata.js";
import { appendDocumentedParamLines, type DocMeta } from "./synthetic-generation-parameter-doc-lines.js";
import {
    collectImplicitArgumentDocNames,
    gatherImplicitArgumentReferences,
    getArgumentIndexFromIdentifier,
    getIdentifierFromParameterNode,
    getParameterDocInfo,
    type ImplicitArgumentDocEntry,
    suppressedImplicitDocCanonicalByNode,
    type SyntheticDocGenerationOptions
} from "./synthetic-helpers.js";

const {
    asArray,
    compactArray,
    docParamNamesLooselyEqual,
    getCanonicalParamNameFromText,
    isNonEmptyArray,
    isUndefinedSentinel,
    normalizeDocCommentTypeAnnotations
} = Core;

const STRING_TYPE = "string";

function extractParamsFromFunctionTag(functionTagContent: string): string[] {
    const openParenIndex = functionTagContent.indexOf("(");
    const closeParenIndex = functionTagContent.lastIndexOf(")");

    if (openParenIndex === -1 || closeParenIndex === -1 || closeParenIndex <= openParenIndex) {
        return [];
    }

    const paramsString = functionTagContent.slice(openParenIndex + 1, closeParenIndex);
    return paramsString
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
}

function suppressAliasCanonicalOverrides(
    aliasByIndex: Map<number, unknown>,
    documentedParamNames: Set<unknown>,
    suppressed: Set<string>
): void {
    for (const rawDocName of documentedParamNames) {
        const normalizedDocName = typeof rawDocName === "string" ? rawDocName.replaceAll(/^\[|\]$/g, "") : rawDocName;
        const maybeIndex = getArgumentIndexFromIdentifier(normalizedDocName);

        if (maybeIndex === null || !aliasByIndex.has(maybeIndex)) {
            continue;
        }

        const fallbackCanonical = getCanonicalParamNameFromText(`argument${maybeIndex}`) || `argument${maybeIndex}`;
        suppressed.add(fallbackCanonical);
    }
}

function suppressOrderedCanonicalFallbacks(orderedParamMetadata: readonly DocMeta[], suppressed: Set<string>): void {
    for (const [ordIndex, ordMeta] of orderedParamMetadata.entries()) {
        if (!ordMeta || typeof ordMeta.name !== STRING_TYPE) {
            continue;
        }

        const canonicalOrdinal = getCanonicalParamNameFromText(ordMeta.name);
        if (!canonicalOrdinal) {
            continue;
        }

        const fallback = getCanonicalParamNameFromText(`argument${ordIndex}`) || `argument${ordIndex}`;
        if (canonicalOrdinal === fallback) {
            continue;
        }
        suppressed.add(fallback);
    }
}

type ReturnSummary = Readonly<{
    hasReturnStatement: boolean;
    hasNonUndefinedReturnValue: boolean;
}>;

function summarizeReturnStatements(node: any): ReturnSummary {
    if (!node) {
        return {
            hasReturnStatement: false,
            hasNonUndefinedReturnValue: false
        };
    }

    if (node.type === "ReturnStatement") {
        const argument = "argument" in node ? node.argument : null;
        const hasNonUndefinedReturnValue = argument != null && !isUndefinedSentinel(argument);
        return {
            hasReturnStatement: true,
            hasNonUndefinedReturnValue
        };
    }

    if (node.type === "BlockStatement" && Array.isArray(node.body)) {
        let hasReturnStatement = false;
        let hasNonUndefinedReturnValue = false;
        for (const statement of node.body) {
            const statementSummary = summarizeReturnStatements(statement);
            hasReturnStatement = hasReturnStatement || statementSummary.hasReturnStatement;
            hasNonUndefinedReturnValue = hasNonUndefinedReturnValue || statementSummary.hasNonUndefinedReturnValue;
        }

        return {
            hasReturnStatement,
            hasNonUndefinedReturnValue
        };
    }

    if (node.type === "IfStatement") {
        const consequentSummary = summarizeReturnStatements(node.consequent);
        const alternateSummary = summarizeReturnStatements(node.alternate);
        return {
            hasReturnStatement: consequentSummary.hasReturnStatement || alternateSummary.hasReturnStatement,
            hasNonUndefinedReturnValue:
                consequentSummary.hasNonUndefinedReturnValue || alternateSummary.hasNonUndefinedReturnValue
        };
    }

    if (
        node.type === "WhileStatement" ||
        node.type === "DoUntilStatement" ||
        node.type === "ForStatement" ||
        node.type === "RepeatStatement" ||
        node.type === "WithStatement"
    ) {
        return summarizeReturnStatements(node.body);
    }

    if (node.type === "SwitchStatement" && Array.isArray(node.cases)) {
        let hasReturnStatement = false;
        let hasNonUndefinedReturnValue = false;
        for (const switchCase of node.cases) {
            if (!Array.isArray(switchCase?.consequent)) {
                continue;
            }

            for (const consequentNode of switchCase.consequent) {
                const nodeSummary = summarizeReturnStatements(consequentNode);
                hasReturnStatement = hasReturnStatement || nodeSummary.hasReturnStatement;
                hasNonUndefinedReturnValue = hasNonUndefinedReturnValue || nodeSummary.hasNonUndefinedReturnValue;
            }
        }

        return {
            hasReturnStatement,
            hasNonUndefinedReturnValue
        };
    }

    if (node.type === "TryStatement") {
        const blockSummary = summarizeReturnStatements(node.block);
        const handlerSummary = summarizeReturnStatements(node.handler);
        const finalizerSummary = summarizeReturnStatements(node.finalizer);
        return {
            hasReturnStatement:
                blockSummary.hasReturnStatement ||
                handlerSummary.hasReturnStatement ||
                finalizerSummary.hasReturnStatement,
            hasNonUndefinedReturnValue:
                blockSummary.hasNonUndefinedReturnValue ||
                handlerSummary.hasNonUndefinedReturnValue ||
                finalizerSummary.hasNonUndefinedReturnValue
        };
    }

    if (node.type === "CatchClause") {
        return summarizeReturnStatements(node.body);
    }

    if (node.type === "Finalizer") {
        return summarizeReturnStatements(node.body);
    }

    return {
        hasReturnStatement: false,
        hasNonUndefinedReturnValue: false
    };
}

function maybeAppendReturnsDoc(lines: string[], functionNode: any, hasReturnsTag: boolean, overrides: any = {}) {
    if (!Array.isArray(lines)) {
        return [];
    }

    if (overrides?.suppressReturns === true) {
        return lines;
    }

    if (
        hasReturnsTag ||
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" && functionNode.type !== "StructFunctionDeclaration") ||
        functionNode._suppressSyntheticReturnsDoc
    ) {
        return lines;
    }

    const body = functionNode.body;

    if (!body) {
        return lines;
    }

    const returnSummary = summarizeReturnStatements(body);
    if (!returnSummary.hasNonUndefinedReturnValue) {
        lines.push("/// @returns {undefined}");
    }

    return lines;
}

export function computeSyntheticFunctionDocLines(
    node: any,
    existingDocLines: readonly string[],
    options: SyntheticDocGenerationOptions,
    overrides: any = {}
) {
    if (!node) {
        return [];
    }

    const metadata = compactArray(asArray(existingDocLines).map(parseDocCommentMetadata)) as DocMeta[];

    let orderedParamMetadata = metadata.filter((meta) => meta.tag === "param");

    if (orderedParamMetadata.length === 0) {
        const functionTag = metadata.find((meta) => meta.tag === "function" || meta.tag === "func");
        if (functionTag && typeof functionTag.name === STRING_TYPE) {
            const params = extractParamsFromFunctionTag(functionTag.name);
            orderedParamMetadata = params.map((name) => ({
                tag: "param",
                name,
                type: null,
                description: null
            }));
        }
    }

    const hasReturnsTag = metadata.some((meta) => meta.tag === "returns");
    const hasOverrideTag = metadata.some((meta) => meta.tag === "override");
    const documentedParamNames = new Set<unknown>();
    const paramMetadataByCanonical = new Map<string, DocMeta>();
    for (const meta of metadata) {
        if (meta.tag !== "param") {
            continue;
        }

        const rawName = typeof meta.name === STRING_TYPE ? meta.name : null;
        if (!rawName) {
            continue;
        }

        documentedParamNames.add(rawName);

        const canonical = getCanonicalParamNameFromText(rawName);
        if (canonical && !paramMetadataByCanonical.has(canonical)) {
            paramMetadataByCanonical.set(canonical, meta);
        }
    }

    const shouldInsertOverrideTag = overrides?.includeOverrideTag === true && !hasOverrideTag;

    const lines: string[] = [];

    if (shouldInsertOverrideTag) {
        lines.push("/// @override");
    }

    const initialSuppressed = computeInitialSuppressedCanonicals(
        node,
        orderedParamMetadata,
        documentedParamNames,
        options,
        paramMetadataByCanonical
    );

    if (initialSuppressed.size > 0) {
        suppressedImplicitDocCanonicalByNode.set(node, initialSuppressed);
    }

    const implicitArgumentDocNames = collectImplicitArgumentDocNames(node, options);

    appendImplicitFallbackDocLines(implicitArgumentDocNames, documentedParamNames, lines);

    const implicitDocEntryByIndex = buildImplicitDocEntryByIndex(implicitArgumentDocNames);

    if (!isNonEmptyArray(node.params)) {
        appendDocLinesForNoParams(
            lines,
            implicitArgumentDocNames,
            documentedParamNames,
            node,
            paramMetadataByCanonical
        );
        return finalizeDocLines(lines, node, hasReturnsTag, overrides);
    }

    appendDocumentedParamLines(
        lines,
        node,
        options,
        documentedParamNames,
        orderedParamMetadata,
        paramMetadataByCanonical,
        implicitDocEntryByIndex,
        implicitArgumentDocNames
    );

    return finalizeDocLines(lines, node, hasReturnsTag, overrides);
}

function finalizeDocLines(lines: string[], node: any, hasReturnsTag: boolean, overrides: any) {
    return maybeAppendReturnsDoc(lines, node, hasReturnsTag, overrides).map((line) =>
        normalizeDocCommentTypeAnnotations(line)
    );
}

function computeInitialSuppressedCanonicals(
    node: any,
    orderedParamMetadata: readonly DocMeta[],
    documentedParamNames: Set<unknown>,
    options: SyntheticDocGenerationOptions,
    paramMetadataByCanonical: Map<string, DocMeta>
) {
    const suppressed = new Set<string>();

    try {
        const { aliasByIndex } = gatherImplicitArgumentReferences(node);

        if (Array.isArray(node?._featherImplicitArgumentDocEntries)) {
            for (const entry of node._featherImplicitArgumentDocEntries as ImplicitArgumentDocEntry[]) {
                if (!entry || typeof entry.index !== "number" || typeof entry.name !== "string") {
                    continue;
                }

                const fallback = getCanonicalParamNameFromText(`argument${entry.index}`) || `argument${entry.index}`;
                const canonicalEntryName = getCanonicalParamNameFromText(entry.name) ?? entry.name;

                if (canonicalEntryName !== fallback) {
                    aliasByIndex.set(entry.index, entry.name);
                }
            }
        }

        if (Array.isArray(node?.params)) {
            for (const [paramIndex, param] of node.params.entries()) {
                const ordinalMetadata =
                    Number.isInteger(paramIndex) && paramIndex >= 0 ? (orderedParamMetadata[paramIndex] ?? null) : null;
                const rawOrdinalName =
                    typeof ordinalMetadata?.name === STRING_TYPE && ordinalMetadata.name.length > 0
                        ? ordinalMetadata.name
                        : null;
                const canonicalOrdinal = rawOrdinalName ? getCanonicalParamNameFromText(rawOrdinalName) : null;

                const paramInfo = getParameterDocInfo(param, node, options);
                const paramIdentifier = getIdentifierFromParameterNode(param);
                const paramIdentifierName = typeof paramIdentifier?.name === STRING_TYPE ? paramIdentifier.name : null;
                const canonicalParamName = paramInfo?.name ? getCanonicalParamNameFromText(paramInfo.name) : null;

                const isGenericArgumentName =
                    typeof paramIdentifierName === STRING_TYPE &&
                    getArgumentIndexFromIdentifier(paramIdentifierName) !== null;

                const canonicalOrdinalMatchesParam =
                    Boolean(canonicalOrdinal) &&
                    Boolean(canonicalParamName) &&
                    (canonicalOrdinal === canonicalParamName ||
                        docParamNamesLooselyEqual(canonicalOrdinal, canonicalParamName));

                const shouldAdoptOrdinalName =
                    Boolean(rawOrdinalName) && (canonicalOrdinalMatchesParam || isGenericArgumentName);

                if (
                    !shouldAdoptOrdinalName &&
                    canonicalOrdinal &&
                    canonicalParamName &&
                    canonicalOrdinal !== canonicalParamName &&
                    !paramMetadataByCanonical.has(canonicalParamName) &&
                    shouldSuppressImplicitOrdinal(canonicalOrdinal, paramIndex, node, options, aliasByIndex)
                ) {
                    suppressed.add(canonicalOrdinal);
                }
            }
        }

        suppressAliasCanonicalOverrides(aliasByIndex, documentedParamNames, suppressed);
        suppressOrderedCanonicalFallbacks(orderedParamMetadata, suppressed);
    } catch {
        /* ignore */
    }

    return suppressed;
}

function shouldSuppressImplicitOrdinal(
    canonicalOrdinal: string,
    paramIndex: number,
    node: any,
    options: any,
    aliasByIndex: Map<number, string>
): boolean {
    if (!canonicalOrdinal || !Array.isArray(node?.params)) {
        return false;
    }

    const canonicalOrdinalMatchesDeclaredParam = node.params.some((candidate: unknown, candidateIndex: number) => {
        const candidateInfo = getParameterDocInfo(candidate, node, options);
        const candidateCanonical = candidateInfo?.name ? getCanonicalParamNameFromText(candidateInfo.name) : null;

        return candidateIndex !== paramIndex && candidateCanonical === canonicalOrdinal;
    });

    if (canonicalOrdinalMatchesDeclaredParam) {
        return false;
    }

    if (aliasByIndex.size > 0) {
        for (const alias of aliasByIndex.values()) {
            if (alias === canonicalOrdinal) {
                return false;
            }
        }
    }

    return true;
}

function appendImplicitFallbackDocLines(
    implicitArgumentDocNames: readonly ImplicitArgumentDocEntry[],
    documentedParamNames: Set<unknown>,
    lines: string[]
) {
    try {
        for (const entry of implicitArgumentDocNames) {
            if (!entry) continue;
            const { canonical, fallbackCanonical, index, hasDirectReference } = entry;
            if (
                canonical &&
                fallbackCanonical &&
                canonical !== fallbackCanonical &&
                hasDirectReference === true &&
                Number.isInteger(index) &&
                index >= 0 &&
                !documentedParamNames.has(fallbackCanonical)
            ) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
        }
    } catch {
        /* best-effort */
    }
}

function buildImplicitDocEntryByIndex(implicitArgumentDocNames: readonly ImplicitArgumentDocEntry[]) {
    const implicitDocEntryByIndex = new Map<number, ImplicitArgumentDocEntry>();

    for (const entry of implicitArgumentDocNames) {
        if (!entry) {
            continue;
        }

        const { index } = entry;
        if (!Number.isInteger(index) || index < 0) {
            continue;
        }

        if (!implicitDocEntryByIndex.has(index)) {
            implicitDocEntryByIndex.set(index, entry);
        }
    }

    return implicitDocEntryByIndex;
}

function appendDocLinesForNoParams(
    lines: string[],
    implicitArgumentDocNames: readonly ImplicitArgumentDocEntry[],
    documentedParamNames: Set<unknown>,
    node: any,
    paramMetadataByCanonical: Map<string, DocMeta>
) {
    for (const entry of implicitArgumentDocNames) {
        if (!entry) continue;
        const { name: docName, index, canonical, fallbackCanonical } = entry;

        if (documentedParamNames.has(docName)) {
            const meta =
                (canonical && paramMetadataByCanonical.get(canonical)) ||
                (docName && paramMetadataByCanonical.get(docName));

            if (meta) {
                const typePart = meta.type ? `{${meta.type}} ` : "";
                const descriptionPart = meta.description ?? "";
                const separator = descriptionPart ? " - " : "";
                const line = `/// @param ${typePart}${docName}${separator}${descriptionPart}`;
                lines.push(line.trimEnd());
            }

            if (
                canonical &&
                fallbackCanonical &&
                canonical !== fallbackCanonical &&
                entry.hasDirectReference === true &&
                Number.isInteger(index) &&
                index >= 0 &&
                !documentedParamNames.has(fallbackCanonical)
            ) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
            continue;
        }

        documentedParamNames.add(docName);
        lines.push(`/// @param ${docName}`);

        const shouldAddFallbackInDocumentedBranch =
            Boolean(canonical && fallbackCanonical) &&
            canonical !== fallbackCanonical &&
            entry.hasDirectReference === true &&
            Number.isInteger(index) &&
            index >= 0 &&
            !documentedParamNames.has(fallbackCanonical);

        if (shouldAddFallbackInDocumentedBranch) {
            documentedParamNames.add(fallbackCanonical);
            lines.push(`/// @param ${fallbackCanonical}`);
        }
    }

    try {
        for (const entry of implicitArgumentDocNames) {
            if (!entry) continue;
            const { index, canonical, fallbackCanonical } = entry;
            const suppressedCanonicals = suppressedImplicitDocCanonicalByNode.get(node);

            if (
                entry.hasDirectReference === true &&
                Number.isInteger(index) &&
                index >= 0 &&
                fallbackCanonical &&
                fallbackCanonical !== canonical &&
                !documentedParamNames.has(fallbackCanonical) &&
                (!suppressedCanonicals || !suppressedCanonicals.has(fallbackCanonical))
            ) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
        }
    } catch {
        /* best-effort */
    }
}
