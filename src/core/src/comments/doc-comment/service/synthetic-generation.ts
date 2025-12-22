import { getNodeName, isUndefinedSentinel } from "../../../ast/node-helpers.js";
import { isNonEmptyArray } from "../../../utils/array.js";
import { isNonEmptyTrimmedString } from "../../../utils/string.js";
import { parseDocCommentMetadata } from "./metadata.js";
import { normalizeDocCommentTypeAnnotations } from "./type-normalization.js";
import {
    docParamNamesLooselyEqual,
    getCanonicalParamNameFromText,
    isOptionalParamDocName,
    normalizeDocMetadataName,
    normalizeParamDocType,
    preservedUndefinedDefaultParameters,
    synthesizedUndefinedDefaultParameters
} from "./params.js";
import {
    collectImplicitArgumentDocNames,
    gatherImplicitArgumentReferences,
    getArgumentIndexFromIdentifier,
    getIdentifierFromParameterNode,
    getParameterDocInfo,
    getSourceTextForNode,
    shouldOmitUndefinedDefaultForFunctionNode,
    suppressedImplicitDocCanonicalByNode,
    preferredParamDocNamesByNode,
    SyntheticDocGenerationOptions,
    ImplicitArgumentDocEntry
} from "./synthetic-helpers.js";

const STRING_TYPE = "string";
const NUMBER_TYPE = "number";

type DocMeta = {
    tag: string;
    name?: string | null;
    type?: string | null;
    description?: string | null;
};

function normalizeDocMetadataNameToString(value: unknown): string | null {
    const normalized = normalizeDocMetadataName(value);
    return typeof normalized === STRING_TYPE ? (normalized as string) : null;
}

function suppressAliasCanonicalOverrides(
    aliasByIndex: Map<number, unknown>,
    documentedParamNames: Set<unknown>,
    suppressed: Set<string>
): void {
    for (const rawDocName of documentedParamNames) {
        const normalizedDocName =
            typeof rawDocName === "string"
                ? rawDocName.replaceAll(/^\[|\]$/g, "")
                : rawDocName;
        const maybeIndex = getArgumentIndexFromIdentifier(normalizedDocName);

        if (maybeIndex === null || !aliasByIndex.has(maybeIndex)) {
            continue;
        }

        const fallbackCanonical =
            getCanonicalParamNameFromText(`argument${maybeIndex}`) ||
            `argument${maybeIndex}`;
        suppressed.add(fallbackCanonical);
    }
}

function suppressOrderedCanonicalFallbacks(
    orderedParamMetadata: readonly any[],
    suppressed: Set<string>
): void {
    for (const [ordIndex, ordMeta] of orderedParamMetadata.entries()) {
        if (!ordMeta || typeof ordMeta.name !== STRING_TYPE) {
            continue;
        }

        const canonicalOrdinal = getCanonicalParamNameFromText(ordMeta.name);
        if (!canonicalOrdinal) {
            continue;
        }

        const fallback =
            getCanonicalParamNameFromText(`argument${ordIndex}`) ||
            `argument${ordIndex}`;
        suppressed.add(fallback);
    }
}

function applyOrdinalImplicitDocEntryOverrides(
    node: any,
    paramIndex: number,
    implicitDocEntry: any,
    canonicalOrdinal: string | null,
    ordinalDocName: string | null
) {
    if (!implicitDocEntry) {
        return;
    }

    implicitDocEntry._suppressDocLine = true;

    if (implicitDocEntry.canonical && node) {
        let suppressedCanonicals =
            suppressedImplicitDocCanonicalByNode.get(node);
        if (!suppressedCanonicals) {
            suppressedCanonicals = new Set();
            suppressedImplicitDocCanonicalByNode.set(
                node,
                suppressedCanonicals
            );
        }
        suppressedCanonicals.add(implicitDocEntry.canonical);
    }

    if (canonicalOrdinal) {
        implicitDocEntry.canonical = canonicalOrdinal;
    }

    if (!ordinalDocName) {
        return;
    }

    implicitDocEntry.name = ordinalDocName;
    if (node) {
        let preferredDocs = preferredParamDocNamesByNode.get(node);
        if (!preferredDocs) {
            preferredDocs = new Map();
            preferredParamDocNamesByNode.set(node, preferredDocs);
        }
        preferredDocs.set(paramIndex, ordinalDocName);
    }
}

function hasReturnStatement(node: any): boolean {
    if (!node) {
        return false;
    }

    if (node.type === "ReturnStatement") {
        return true;
    }

    if (node.type === "BlockStatement" && Array.isArray(node.body)) {
        return node.body.some(hasReturnStatement);
    }

    if (node.type === "IfStatement") {
        return (
            hasReturnStatement(node.consequent) ||
            hasReturnStatement(node.alternate)
        );
    }

    if (
        node.type === "WhileStatement" ||
        node.type === "DoUntilStatement" ||
        node.type === "ForStatement" ||
        node.type === "RepeatStatement" ||
        node.type === "WithStatement"
    ) {
        return hasReturnStatement(node.body);
    }

    if (node.type === "SwitchStatement" && Array.isArray(node.cases)) {
        return node.cases.some(
            (c: any) =>
                Array.isArray(c.consequent) &&
                c.consequent.some(hasReturnStatement)
        );
    }

    if (node.type === "TryStatement") {
        return (
            hasReturnStatement(node.block) ||
            hasReturnStatement(node.handler) ||
            hasReturnStatement(node.finalizer)
        );
    }

    if (node.type === "CatchClause") {
        return hasReturnStatement(node.body);
    }

    if (node.type === "Finalizer") {
        return hasReturnStatement(node.body);
    }

    return false;
}

function maybeAppendReturnsDoc(
    lines: string[],
    functionNode: any,
    hasReturnsTag: boolean,
    overrides: any = {}
) {
    if (!Array.isArray(lines)) {
        return [];
    }

    if (overrides?.suppressReturns === true) {
        return lines;
    }

    if (
        hasReturnsTag ||
        !functionNode ||
        (functionNode.type !== "FunctionDeclaration" &&
            functionNode.type !== "StructFunctionDeclaration") ||
        functionNode._suppressSyntheticReturnsDoc
    ) {
        return lines;
    }

    const body = functionNode.body;

    if (!body) {
        return lines;
    }

    const hasReturn = hasReturnStatement(body);
    if (!hasReturn) {
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

    const metadata = (
        Array.isArray(existingDocLines)
            ? existingDocLines.map(parseDocCommentMetadata).filter(Boolean)
            : []
    ) as DocMeta[];

    const orderedParamMetadata = metadata.filter((meta) => meta.tag === "param");

    const hasReturnsTag = metadata.some((meta) => meta.tag === "returns");
    const hasOverrideTag = metadata.some((meta) => meta.tag === "override");
    const documentedParamNames = new Set<unknown>();
    const paramMetadataByCanonical = new Map<string, DocMeta>();
    const overrideName = overrides?.nameOverride;
    const functionName = overrideName ?? getNodeName(node);
    const existingFunctionMetadata = metadata.find(
        (meta) => meta.tag === "function"
    );
    const normalizedFunctionName =
        typeof functionName === STRING_TYPE &&
        isNonEmptyTrimmedString(functionName)
            ? normalizeDocMetadataNameToString(functionName)
            : null;
    const normalizedExistingFunctionName =
        typeof existingFunctionMetadata?.name === STRING_TYPE &&
        isNonEmptyTrimmedString(existingFunctionMetadata.name)
            ? normalizeDocMetadataNameToString(existingFunctionMetadata.name)
            : null;

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

    const shouldInsertOverrideTag =
        overrides?.includeOverrideTag === true && !hasOverrideTag;

    const lines: string[] = [];

    if (shouldInsertOverrideTag) {
        lines.push("/// @override");
    }

    const functionNameToUse =
        (overrideName && normalizedFunctionName) ??
        normalizedExistingFunctionName ??
        normalizedFunctionName;

    if (functionNameToUse) {
        lines.push(`/// @function ${functionNameToUse}`);
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

    const implicitArgumentDocNames = collectImplicitArgumentDocNames(
        node,
        options
    );

    appendImplicitFallbackDocLines(
        implicitArgumentDocNames,
        documentedParamNames,
        lines
    );

    const implicitDocEntryByIndex = buildImplicitDocEntryByIndex(
        implicitArgumentDocNames
    );

    if (!isNonEmptyArray(node.params)) {
        appendDocLinesForNoParams(
            lines,
            implicitArgumentDocNames,
            documentedParamNames,
            node
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

function finalizeDocLines(
    lines: string[],
    node: any,
    hasReturnsTag: boolean,
    overrides: any
) {
    return maybeAppendReturnsDoc(lines, node, hasReturnsTag, overrides).map(
        (line) => normalizeDocCommentTypeAnnotations(line)
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
        if (Array.isArray(node?.params)) {
            for (const [paramIndex, param] of node.params.entries()) {
                const ordinalMetadata =
                    Number.isInteger(paramIndex) && paramIndex >= 0
                        ? (orderedParamMetadata[paramIndex] ?? null)
                        : null;
                const rawOrdinalName =
                    typeof ordinalMetadata?.name === STRING_TYPE &&
                    ordinalMetadata.name.length > 0
                        ? ordinalMetadata.name
                        : null;
                const canonicalOrdinal = rawOrdinalName
                    ? getCanonicalParamNameFromText(rawOrdinalName)
                    : null;

                const paramInfo = getParameterDocInfo(param, node, options);
                const paramIdentifier = getIdentifierFromParameterNode(param);
                const paramIdentifierName =
                    typeof paramIdentifier?.name === STRING_TYPE
                        ? paramIdentifier.name
                        : null;
                const canonicalParamName = paramInfo?.name
                    ? getCanonicalParamNameFromText(paramInfo.name)
                    : null;

                const isGenericArgumentName =
                    typeof paramIdentifierName === STRING_TYPE &&
                    getArgumentIndexFromIdentifier(paramIdentifierName) !== null;

                const canonicalOrdinalMatchesParam =
                    Boolean(canonicalOrdinal) &&
                    Boolean(canonicalParamName) &&
                    (canonicalOrdinal === canonicalParamName ||
                        docParamNamesLooselyEqual(
                            canonicalOrdinal,
                            canonicalParamName
                        ));

                const shouldAdoptOrdinalName =
                    Boolean(rawOrdinalName) &&
                    (canonicalOrdinalMatchesParam || isGenericArgumentName);

                if (
                    !shouldAdoptOrdinalName &&
                    canonicalOrdinal &&
                    canonicalParamName &&
                    canonicalOrdinal !== canonicalParamName &&
                    !paramMetadataByCanonical.has(canonicalParamName)
                ) {
                    const canonicalOrdinalMatchesDeclaredParam =
                        Array.isArray(node?.params) &&
                        node.params.some(
                            (candidate: any, candidateIndex: number) => {
                                if (candidateIndex === paramIndex) {
                                    return false;
                                }

                                const candidateInfo = getParameterDocInfo(
                                    candidate,
                                    node,
                                    options
                                );
                                const candidateCanonical =
                                    candidateInfo?.name
                                        ? getCanonicalParamNameFromText(
                                              candidateInfo.name
                                          )
                                        : null;

                                return candidateCanonical === canonicalOrdinal;
                            }
                        );

                    if (!canonicalOrdinalMatchesDeclaredParam) {
                        suppressed.add(canonicalOrdinal);
                    }
                }
            }
        }
    } catch {
        /* ignore pre-pass errors */
    }

    try {
        const refInfo = gatherImplicitArgumentReferences(node);
        if (
            refInfo &&
            refInfo.aliasByIndex &&
            refInfo.aliasByIndex.size > 0
        ) {
            suppressAliasCanonicalOverrides(
                refInfo.aliasByIndex,
                documentedParamNames,
                suppressed
            );
            if (Array.isArray(orderedParamMetadata)) {
                suppressOrderedCanonicalFallbacks(
                    orderedParamMetadata,
                    suppressed
                );
            }
        }
    } catch {
        /* ignore gather errors */
    }

    return suppressed;
}

function appendImplicitFallbackDocLines(
    implicitArgumentDocNames: readonly ImplicitArgumentDocEntry[],
    documentedParamNames: Set<unknown>,
    lines: string[]
) {
    try {
        for (const entry of implicitArgumentDocNames) {
            if (!entry) continue;
            const { canonical, fallbackCanonical, index, hasDirectReference } =
                entry;
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

function buildImplicitDocEntryByIndex(
    implicitArgumentDocNames: readonly ImplicitArgumentDocEntry[]
) {
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
    node: any
) {
    for (const entry of implicitArgumentDocNames) {
        if (!entry) continue;
        const { name: docName, index, canonical, fallbackCanonical } = entry;

        if (documentedParamNames.has(docName)) {
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
            const suppressedCanonicals =
                suppressedImplicitDocCanonicalByNode.get(node);

            if (
                entry.hasDirectReference === true &&
                Number.isInteger(index) &&
                index >= 0 &&
                fallbackCanonical &&
                fallbackCanonical !== canonical &&
                !documentedParamNames.has(fallbackCanonical) &&
                (!suppressedCanonicals ||
                    !suppressedCanonicals.has(fallbackCanonical))
            ) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
        }
    } catch {
        /* best-effort */
    }
}

function appendDocumentedParamLines(
    lines: string[],
    node: any,
    options: SyntheticDocGenerationOptions,
    documentedParamNames: Set<unknown>,
    orderedParamMetadata: readonly DocMeta[],
    paramMetadataByCanonical: Map<string, DocMeta>,
    implicitDocEntryByIndex: Map<number, ImplicitArgumentDocEntry>,
    implicitArgumentDocNames: readonly ImplicitArgumentDocEntry[]
) {
    for (const [paramIndex, param] of (node.params ?? []).entries()) {
        const paramInfo = getParameterDocInfo(param, node, options);
        if (!paramInfo || !paramInfo.name) {
            continue;
        }
        const ordinalMetadata =
            Number.isInteger(paramIndex) && paramIndex >= 0
                ? (orderedParamMetadata[paramIndex] ?? null)
                : null;
        const rawOrdinalName =
            typeof ordinalMetadata?.name === STRING_TYPE &&
            ordinalMetadata.name.length > 0
                ? ordinalMetadata.name
                : null;
        const canonicalOrdinal = rawOrdinalName
            ? getCanonicalParamNameFromText(rawOrdinalName)
            : null;
        const implicitDocEntry = implicitDocEntryByIndex.get(paramIndex);
        const paramIdentifier = getIdentifierFromParameterNode(param);
        const paramIdentifierName =
            typeof paramIdentifier?.name === STRING_TYPE
                ? paramIdentifier.name
                : null;
        const isGenericArgumentName =
            typeof paramIdentifierName === STRING_TYPE &&
            getArgumentIndexFromIdentifier(paramIdentifierName) !== null;
        const implicitName =
            implicitDocEntry &&
            typeof implicitDocEntry.name === STRING_TYPE &&
            implicitDocEntry.name &&
            implicitDocEntry.canonical !==
                implicitDocEntry.fallbackCanonical
                ? implicitDocEntry.name
                : null;
        const canonicalParamName =
            (implicitDocEntry?.canonical && implicitDocEntry.canonical) ||
            getCanonicalParamNameFromText(paramInfo.name);
        const existingMetadata =
            (canonicalParamName &&
                paramMetadataByCanonical.has(canonicalParamName) &&
                paramMetadataByCanonical.get(canonicalParamName)) ||
            null;
        const existingDocName = existingMetadata?.name;
        const hasCompleteOrdinalDocs =
            Array.isArray(node?.params) &&
            orderedParamMetadata.length === node.params.length;
        const canonicalOrdinalMatchesParam =
            Boolean(canonicalOrdinal) &&
            Boolean(canonicalParamName) &&
            (canonicalOrdinal === canonicalParamName ||
                docParamNamesLooselyEqual(
                    canonicalOrdinal,
                    canonicalParamName
                ));

        const shouldAdoptOrdinalName =
            Boolean(rawOrdinalName) &&
            (canonicalOrdinalMatchesParam || isGenericArgumentName);

        handleOrdinalDocPreferences({
            node,
            paramInfo,
            paramIndex,
            options,
            shouldAdoptOrdinalName,
            hasCompleteOrdinalDocs,
            canonicalOrdinal,
            canonicalParamName,
            rawOrdinalName,
            paramMetadataByCanonical
        });
        const ordinalDocName =
            hasCompleteOrdinalDocs &&
            (!existingDocName || existingDocName.length === 0) &&
            shouldAdoptOrdinalName
                ? rawOrdinalName
                : null;
        let effectiveImplicitName = implicitName;
        effectiveImplicitName = applyImplicitNameOverride({
            node,
            paramIndex,
            implicitDocEntry,
            canonicalOrdinal,
            ordinalDocName,
            effectiveImplicitName,
            fallbackCanonical:
                implicitDocEntry?.fallbackCanonical ??
                getCanonicalParamNameFromText(paramInfo.name)
        });

        const baseDocName =
            (effectiveImplicitName &&
                effectiveImplicitName.length > 0 &&
                effectiveImplicitName) ||
            (ordinalDocName && ordinalDocName.length > 0 && ordinalDocName) ||
            paramInfo.name;

        const shouldMarkOptional = computeOptionalDocState({
            node,
            param,
            paramIndex,
            paramInfo,
            options,
            existingMetadata,
            serializedDocName: existingDocName
        });

        const docName = shouldMarkOptional ? `[${baseDocName}]` : baseDocName;

        const normalizedExistingType = normalizeParamDocType(
            existingMetadata?.type
        );
        const normalizedOrdinalType = normalizeParamDocType(
            ordinalMetadata?.type
        );
        const docType = normalizedExistingType ?? normalizedOrdinalType;

        if (documentedParamNames.has(docName)) {
            if (implicitDocEntry?.name) {
                documentedParamNames.add(implicitDocEntry.name);
            }
        } else {
            documentedParamNames.add(docName);
            const typePart = docType ? `{${docType}} ` : "";
            const descriptionPart =
                existingMetadata?.description ??
                ordinalMetadata?.description ??
                "";
            const separator = descriptionPart ? " - " : "";
            const newLine = `/// @param ${typePart}${docName}${separator}${descriptionPart}`;
            lines.push(newLine);
        }
    }

    for (const entry of implicitArgumentDocNames) {
        if (!entry || entry._suppressDocLine) {
            continue;
        }

        const { name: docName, index, canonical, fallbackCanonical } = entry;
        const isImplicitFallbackEntry = canonical === fallbackCanonical;
        let declaredParamIsGeneric = false;
        if (
            Array.isArray(node?.params) &&
            Number.isInteger(index) &&
            index >= 0
        ) {
            const decl = node.params[index];
            const declId = getIdentifierFromParameterNode(decl);
            if (declId && typeof declId.name === STRING_TYPE) {
                declaredParamIsGeneric =
                    getArgumentIndexFromIdentifier(declId.name) !== null;
            }
        }
        const isFallbackEntry = canonical === fallbackCanonical;
        if (
            isFallbackEntry &&
            Number.isInteger(index) &&
            orderedParamMetadata[index] &&
            typeof orderedParamMetadata[index].name === STRING_TYPE &&
            orderedParamMetadata[index].name.length > 0
        ) {
            continue;
        }

        if (documentedParamNames.has(docName)) {
            if (
                canonical &&
                fallbackCanonical &&
                canonical !== fallbackCanonical &&
                entry.hasDirectReference === true &&
                !documentedParamNames.has(fallbackCanonical) &&
                !declaredParamIsGeneric &&
                Array.isArray(node?.params) &&
                Number.isInteger(index) &&
                index >= 0 &&
                index < node.params.length
            ) {
                documentedParamNames.add(fallbackCanonical);
                lines.push(`/// @param ${fallbackCanonical}`);
            }
            continue;
        }

        if (
            isImplicitFallbackEntry &&
            Number.isInteger(index) &&
            orderedParamMetadata[index] &&
            typeof orderedParamMetadata[index].name === STRING_TYPE &&
            orderedParamMetadata[index].name.length > 0
        ) {
            continue;
        }

        documentedParamNames.add(docName);
        lines.push(`/// @param ${docName}`);

        if (
            canonical &&
            fallbackCanonical &&
            canonical !== fallbackCanonical &&
            entry.hasDirectReference === true &&
            !documentedParamNames.has(fallbackCanonical) &&
            Number.isInteger(index) &&
            index >= 0 &&
            !declaredParamIsGeneric
        ) {
            documentedParamNames.add(fallbackCanonical);
            lines.push(`/// @param ${fallbackCanonical}`);
        }
    }
}

type OrdinalDocPreferencesParams = {
    node: any;
    paramInfo: ReturnType<typeof getParameterDocInfo>;
    paramIndex: number;
    options: SyntheticDocGenerationOptions;
    shouldAdoptOrdinalName: boolean;
    hasCompleteOrdinalDocs: boolean;
    canonicalOrdinal: string | null;
    canonicalParamName: string | null;
    rawOrdinalName: string | null;
    paramMetadataByCanonical: Map<string, DocMeta>;
};

function handleOrdinalDocPreferences({
    node,
    paramInfo,
    paramIndex,
    options,
    shouldAdoptOrdinalName,
    hasCompleteOrdinalDocs,
    canonicalOrdinal,
    canonicalParamName,
    rawOrdinalName,
    paramMetadataByCanonical
}: OrdinalDocPreferencesParams) {
    if (
        hasCompleteOrdinalDocs &&
        node &&
        typeof paramIndex === NUMBER_TYPE &&
        shouldAdoptOrdinalName
    ) {
        const documentedParamCanonical =
            getCanonicalParamNameFromText(paramInfo.name) ?? null;
        if (
            documentedParamCanonical &&
            paramMetadataByCanonical.has(documentedParamCanonical)
        ) {
            // The parameter already appears in the documented metadata;
            // avoid overriding it with mismatched ordinal ordering.
        } else {
            let preferredDocs = preferredParamDocNamesByNode.get(node);
            if (!preferredDocs) {
                preferredDocs = new Map();
                preferredParamDocNamesByNode.set(node, preferredDocs);
            }
            if (!preferredDocs.has(paramIndex)) {
                preferredDocs.set(paramIndex, rawOrdinalName);
            }
        }
    }

    if (
        !shouldAdoptOrdinalName &&
        canonicalOrdinal &&
        canonicalParamName &&
        canonicalOrdinal !== canonicalParamName &&
        node &&
        !paramMetadataByCanonical.has(canonicalParamName)
    ) {
        const canonicalOrdinalMatchesDeclaredParam =
            Array.isArray(node?.params)
                ? node.params.some((candidate: any, candidateIndex: number) => {
                      if (candidateIndex === paramIndex) {
                          return false;
                      }

                      const candidateInfo = getParameterDocInfo(
                          candidate,
                          node,
                          options
                      );
                      const candidateCanonical =
                          candidateInfo?.name
                              ? getCanonicalParamNameFromText(
                                    candidateInfo.name
                                )
                              : null;

                      return candidateCanonical === canonicalOrdinal;
                  })
                : false;

        if (!canonicalOrdinalMatchesDeclaredParam) {
            let suppressedCanonicals =
                suppressedImplicitDocCanonicalByNode.get(node);
            if (!suppressedCanonicals) {
                suppressedCanonicals = new Set();
                suppressedImplicitDocCanonicalByNode.set(
                    node,
                    suppressedCanonicals
                );
            }
            suppressedCanonicals.add(canonicalOrdinal);
        }
    }
}

type ImplicitNameOverrideParams = {
    node: any;
    paramIndex: number;
    implicitDocEntry: ImplicitArgumentDocEntry | undefined;
    canonicalOrdinal: string | null;
    ordinalDocName: string | null;
    effectiveImplicitName: string | null;
    fallbackCanonical: string | null;
};

function applyImplicitNameOverride({
    node,
    paramIndex,
    implicitDocEntry,
    canonicalOrdinal,
    ordinalDocName,
    effectiveImplicitName,
    fallbackCanonical
}: ImplicitNameOverrideParams) {
    if (!effectiveImplicitName || !ordinalDocName) {
        return effectiveImplicitName;
    }

    const canonicalImplicit =
        getCanonicalParamNameFromText(effectiveImplicitName) ?? null;
    const resolvedFallbackCanonical = fallbackCanonical;
    const shouldOverrideImplicitName = Boolean(
        canonicalOrdinal &&
            canonicalOrdinal !== resolvedFallbackCanonical &&
            canonicalOrdinal !== canonicalImplicit
    );

    if (!shouldOverrideImplicitName) {
        return effectiveImplicitName;
    }

    const ordinalLength = canonicalOrdinal.length;
    const implicitCanonicalLength = canonicalImplicit?.length ?? 0;
    const hasImplicitName =
        implicitCanonicalLength > 0 ||
        isNonEmptyTrimmedString(effectiveImplicitName);
    const implicitComparisonLength = hasImplicitName
        ? implicitCanonicalLength
        : 0;

    if (ordinalLength > implicitComparisonLength) {
        applyOrdinalImplicitDocEntryOverrides(
            node,
            paramIndex,
            implicitDocEntry,
            canonicalOrdinal,
            ordinalDocName
        );
        return null;
    }

    return effectiveImplicitName;
}

type OptionalDocStateParams = {
    node: any;
    param: any;
    paramIndex: number;
    paramInfo: ReturnType<typeof getParameterDocInfo>;
    options: SyntheticDocGenerationOptions;
    existingMetadata: DocMeta | null;
    serializedDocName: string | undefined;
};

function computeOptionalDocState({
    node,
    param,
    paramIndex,
    paramInfo,
    options,
    existingMetadata,
    serializedDocName
}: OptionalDocStateParams) {
    const optionalOverrideFlag = paramInfo?.optionalOverride === true;
    const defaultIsUndefined =
        param?.type === "DefaultParameter" &&
        isUndefinedSentinel(param.right);
    const shouldOmitUndefinedDefault =
        defaultIsUndefined &&
        shouldOmitUndefinedDefaultForFunctionNode(node);
    const hasExistingMetadata = Boolean(existingMetadata);
    const hasOptionalDocName =
        param?.type === "DefaultParameter" &&
        isOptionalParamDocName(serializedDocName);
    const parameterSourceText = getSourceTextForNode(param, options);
    const defaultCameFromSource =
        defaultIsUndefined &&
        typeof parameterSourceText === STRING_TYPE &&
        parameterSourceText.includes("=");

    const explicitOptionalMarker =
        param?._featherOptionalParameter === true;

    let shouldMarkOptional =
        Boolean(paramInfo.optional) ||
        hasOptionalDocName ||
        (param?.type === "DefaultParameter" &&
            isUndefinedSentinel(param.right) &&
            (explicitOptionalMarker ||
                node?.type === "ConstructorDeclaration"));
    const hasSiblingExplicitDefault = Array.isArray(node?.params)
        ? node.params.some((candidate: any, candidateIndex: number) => {
              if (candidateIndex === paramIndex || !candidate) {
                  return false;
              }

              if (candidate.type !== "DefaultParameter") {
                  return false;
              }

              return (
                  candidate.right != null &&
                  !isUndefinedSentinel(candidate.right)
              );
          })
        : false;
    const hasPriorExplicitDefault = Array.isArray(node?.params)
        ? node.params.slice(0, paramIndex).some((candidate: any) => {
              if (!candidate || candidate.type !== "DefaultParameter") {
                  return false;
              }

              return (
                  candidate.right != null &&
                  !isUndefinedSentinel(candidate.right)
              );
          })
        : false;
    const shouldApplyOptionalSuppression =
        hasExistingMetadata || !hasSiblingExplicitDefault;

    const materializedFromExplicitLeft =
        param?._featherMaterializedFromExplicitLeft === true;
    if (
        !shouldMarkOptional &&
        !hasExistingMetadata &&
        hasSiblingExplicitDefault &&
        hasPriorExplicitDefault &&
        !materializedFromExplicitLeft &&
        param?._featherMaterializedTrailingUndefined !== true
    ) {
        shouldMarkOptional = true;
    }
    if (shouldApplyOptionalSuppression) {
        if (
            shouldMarkOptional &&
            defaultIsUndefined &&
            shouldOmitUndefinedDefault &&
            paramInfo?.explicitUndefinedDefault === true &&
            !optionalOverrideFlag &&
            !hasOptionalDocName
        ) {
            shouldMarkOptional = false;
        }
        if (
            shouldMarkOptional &&
            shouldOmitUndefinedDefault &&
            paramInfo.optional &&
            defaultCameFromSource &&
            !hasOptionalDocName
        ) {
            shouldMarkOptional = false;
        }
    }
    if (
        shouldMarkOptional &&
        param?.type === "Identifier" &&
        !synthesizedUndefinedDefaultParameters.has(param)
    ) {
        synthesizedUndefinedDefaultParameters.add(param);
    }
    if (shouldMarkOptional && defaultIsUndefined) {
        preservedUndefinedDefaultParameters.add(param);
    }

    return shouldMarkOptional;
}

/**
 * Merge synthetic doc comments with existing metadata while preserving order.
 */
