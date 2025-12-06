import type {
    DocCommentLines,
    MutableDocCommentLines
} from "../../../comment-utils.js";
import {
    coercePositiveIntegerOption,
    findLastIndex,
    toMutableArray,
    toTrimmedString,
    isNonEmptyString
} from "../../../../utils/index.js";
import { parseDocCommentMetadata } from "../metadata.js";
import {
    dedupeReturnDocLines,
    reorderDescriptionLinesAfterFunction,
    convertLegacyReturnsDescriptionLinesToMetadata,
    promoteLeadingDocCommentTextToDescription,
    hasLegacyReturnsDescriptionLines
} from "../legacy.js";
import {
    normalizeDocCommentTypeAnnotations,
    normalizeGameMakerType
} from "../type-normalization.js";
import { resolveDocCommentWrapWidth } from "../wrap.js";
import {
    collectImplicitArgumentDocNames,
    getParameterDocInfo,
    preferredParamDocNamesByNode,
    suppressedImplicitDocCanonicalByNode
} from "./helpers.js";
import { getCanonicalParamNameFromText } from "../params.js";
import { computeSyntheticFunctionDocLines } from "./generation.js";

const STRING_TYPE = "string";

export function mergeSyntheticDocComments(
    node: any,
    existingDocLines: DocCommentLines | string[],
    options: any,
    overrides: any = {}
): MutableDocCommentLines {
    if (node && node.id && node.id.name === "string_height_scribble") {
        console.log("[DEBUG] mergeSyntheticDocComments for string_height_scribble");
        console.log("[DEBUG] existingDocLines:", existingDocLines);
    }

    let normalizedExistingLines: MutableDocCommentLines = toMutableArray(
        existingDocLines
    ) as MutableDocCommentLines;
    const originalExistingHasTags =
        Array.isArray(existingDocLines) &&
        existingDocLines.some((line) =>
            typeof line === STRING_TYPE ? parseDocCommentMetadata(line) : false
        );

    // Compute synthetic lines early so promotion can consider synthetic tags
    // such as `/// @function` when deciding whether the file-top doc-like
    // comment text should be promoted into `@description` metadata.
    const preserveDescriptionBreaks =
        normalizedExistingLines?._preserveDescriptionBreaks === true;

    normalizedExistingLines = toMutableArray(
        reorderDescriptionLinesAfterFunction(normalizedExistingLines)
    ) as MutableDocCommentLines;

    if (preserveDescriptionBreaks) {
        normalizedExistingLines._preserveDescriptionBreaks = true;
    }
    const dedupedResult = dedupeReturnDocLines(normalizedExistingLines);
    normalizedExistingLines = toMutableArray(
        dedupedResult.lines
    ) as MutableDocCommentLines;
    const removedExistingReturnDuplicates = dedupedResult.removed;

    if (preserveDescriptionBreaks) {
        normalizedExistingLines._preserveDescriptionBreaks = true;
    }

    // Normalize legacy `Returns:` description lines early so the synthetic
    // computation sees an existing `@returns` tag when conversion occurs.
    // This prevents synthetic `@returns` entries from being added and
    // avoids conversion regressions where a legacy description would be
    // overwritten or duplicated by a synthetic `@returns` later in the
    // merging process.
    normalizedExistingLines = toMutableArray(
        convertLegacyReturnsDescriptionLinesToMetadata(
            normalizedExistingLines,
            {
                normalizeDocCommentTypeAnnotations: normalizeGameMakerType
            }
        )
    ) as MutableDocCommentLines;

    const _computedSynthetic = computeSyntheticFunctionDocLines(
        node,
        normalizedExistingLines,
        options,
        overrides
    );

    // Only promote leading doc comment text to @description if the original
    // set contained tags (e.g., `@param`) or used an alternate doc-like
    // prefix that should normalize (e.g., `// /`). This prevents synthetic
    // tags from causing plain leading summaries (/// text) to become
    // promoted description metadata unexpectedly.
    const originalExistingHasDocLikePrefixes =
        Array.isArray(existingDocLines) &&
        existingDocLines.some((line) =>
            typeof line === STRING_TYPE ? /^\s*\/\/\s*\/\s*/.test(line) : false
        );

    if (originalExistingHasTags || originalExistingHasDocLikePrefixes) {
        normalizedExistingLines = toMutableArray(
            promoteLeadingDocCommentTextToDescription(
                normalizedExistingLines,
                _computedSynthetic
            )
        ) as MutableDocCommentLines;
    }

    const syntheticLines =
        reorderDescriptionLinesAfterFunction(_computedSynthetic);

    const implicitDocEntries =
        node?.type === "FunctionDeclaration" ||
        node?.type === "StructFunctionDeclaration"
            ? collectImplicitArgumentDocNames(node, options)
            : [];
    const declaredParamCount = Array.isArray(node?.params)
        ? node.params.length
        : 0;
    const hasImplicitDocEntries = implicitDocEntries.length > 0;
    const hasParamDocLines = normalizedExistingLines.some((line) => {
        if (typeof line !== STRING_TYPE) {
            return false;
        }

        return /^\/\/\/\s*@param\b/i.test(toTrimmedString(line));
    });
    const shouldForceParamPrune =
        hasParamDocLines && declaredParamCount === 0 && !hasImplicitDocEntries;

    if (syntheticLines.length === 0 && !shouldForceParamPrune) {
        return toMutableArray(
            convertLegacyReturnsDescriptionLinesToMetadata(
                normalizedExistingLines,
                {
                    normalizeDocCommentTypeAnnotations: normalizeGameMakerType
                }
            )
        ) as MutableDocCommentLines;
    }

    if (normalizedExistingLines.length === 0) {
        return toMutableArray(
            convertLegacyReturnsDescriptionLinesToMetadata(syntheticLines, {
                normalizeDocCommentTypeAnnotations: normalizeGameMakerType
            })
        ) as MutableDocCommentLines;
    }

    const docTagMatches = (line, pattern) => {
        const trimmed = toTrimmedString(line);
        if (trimmed.length === 0) {
            return false;
        }

        if (pattern.global || pattern.sticky) {
            pattern.lastIndex = 0;
        }

        return pattern.test(trimmed);
    };

    const isFunctionLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@function\b/i);
    const isOverrideLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@override\b/i);
    const isParamLine = (line) => docTagMatches(line, /^\/\/\/\s*@param\b/i);

    const isDescriptionLine = (line) =>
        docTagMatches(line, /^\/\/\/\s*@description\b/i);

    const functionLines = syntheticLines.filter(isFunctionLine);
    const syntheticFunctionMetadata = functionLines
        .map((line) => parseDocCommentMetadata(line))
        .find(
            (meta) =>
                meta?.tag === "function" && typeof meta.name === STRING_TYPE
        );
    const syntheticFunctionName =
        typeof syntheticFunctionMetadata?.name === STRING_TYPE
            ? syntheticFunctionMetadata.name.trim()
            : null;
    let otherLines = syntheticLines.filter((line) => !isFunctionLine(line));
    const overrideLines = otherLines.filter(isOverrideLine);
    otherLines = otherLines.filter((line) => !isOverrideLine(line));
    let returnsLines;

    // Cache canonical names so we only parse each doc comment line at most once.
    const paramCanonicalNameCache = new Map();
    const getParamCanonicalName = (line, metadata?) => {
        if (typeof line !== STRING_TYPE) {
            return null;
        }

        if (paramCanonicalNameCache.has(line)) {
            return paramCanonicalNameCache.get(line);
        }

        const docMetadata =
            metadata === undefined ? parseDocCommentMetadata(line) : metadata;
        const canonical =
            docMetadata?.tag === "param"
                ? getCanonicalParamNameFromText(docMetadata.name)
                : null;

        paramCanonicalNameCache.set(line, canonical);
        return canonical;
    };

    let mergedLines = [...normalizedExistingLines];
    let removedAnyLine = removedExistingReturnDuplicates;

    if (functionLines.length > 0) {
        const existingFunctionIndices = mergedLines
            .map((line, index) => (isFunctionLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingFunctionIndices.length > 0) {
            const [firstIndex, ...duplicateIndices] = existingFunctionIndices;
            mergedLines = [...mergedLines];

            for (let i = duplicateIndices.length - 1; i >= 0; i--) {
                mergedLines.splice(duplicateIndices[i], 1);
            }

            mergedLines.splice(firstIndex, 1, ...functionLines);
            removedAnyLine = true;
        } else {
            const firstParamIndex = mergedLines.findIndex(isParamLine);

            // If the original doc lines did not contain any metadata tags,
            // prefer to append synthetic `@function` tags after the existing
            // summary lines rather than inserting them before param tags.
            const insertionIndex = originalExistingHasTags
                ? firstParamIndex === -1
                    ? mergedLines.length
                    : firstParamIndex
                : mergedLines.length;
            const precedingLine =
                insertionIndex > 0 ? mergedLines[insertionIndex - 1] : null;
            const trimmedPreceding = toTrimmedString(precedingLine);
            const isDocCommentLine =
                typeof trimmedPreceding === STRING_TYPE &&
                /^\/\/\//.test(trimmedPreceding);
            const isDocTagLine =
                isDocCommentLine && /^\/\/\/\s*@/i.test(trimmedPreceding);

            let precedingDocTag = null;
            if (isDocCommentLine && isDocTagLine) {
                const metadata = parseDocCommentMetadata(precedingLine);
                if (metadata && typeof metadata.tag === STRING_TYPE) {
                    precedingDocTag = metadata.tag.toLowerCase();
                }
            }

            const shouldSeparateDocTag = precedingDocTag === "deprecated";

            const needsSeparatorBeforeFunction =
                trimmedPreceding !== "" &&
                typeof precedingLine === STRING_TYPE &&
                !isFunctionLine(precedingLine) &&
                (!isDocCommentLine || !isDocTagLine || shouldSeparateDocTag);

            if (needsSeparatorBeforeFunction) {
                mergedLines = [
                    ...mergedLines.slice(0, insertionIndex),
                    "",
                    ...mergedLines.slice(insertionIndex)
                ];
            }

            const insertAt = needsSeparatorBeforeFunction
                ? insertionIndex + 1
                : insertionIndex;

            mergedLines = [
                ...mergedLines.slice(0, insertAt),
                ...functionLines,
                ...mergedLines.slice(insertAt)
            ];
            removedAnyLine = true;
        }
    }

    if (overrideLines.length > 0) {
        const existingOverrideIndices = mergedLines
            .map((line, index) => (isOverrideLine(line) ? index : -1))
            .filter((index) => index !== -1);

        if (existingOverrideIndices.length > 0) {
            const [firstOverrideIndex, ...duplicateOverrideIndices] =
                existingOverrideIndices;
            mergedLines = [...mergedLines];

            for (let i = duplicateOverrideIndices.length - 1; i >= 0; i -= 1) {
                mergedLines.splice(duplicateOverrideIndices[i], 1);
            }

            mergedLines.splice(firstOverrideIndex, 1, ...overrideLines);
            removedAnyLine = true;
        } else {
            const firstFunctionIndex = mergedLines.findIndex(isFunctionLine);
            const insertionIndex =
                firstFunctionIndex === -1 ? 0 : firstFunctionIndex;

            mergedLines = [
                ...mergedLines.slice(0, insertionIndex),
                ...overrideLines,
                ...mergedLines.slice(insertionIndex)
            ];
            removedAnyLine = true;
        }
    }

    const paramLineIndices = new Map();
    for (const [index, line] of mergedLines.entries()) {
        if (!isParamLine(line)) {
            continue;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramLineIndices.set(canonical, index);
        }
    }

    if (otherLines.length > 0) {
        const normalizedOtherLines = [];

        for (const line of otherLines) {
            const metadata = parseDocCommentMetadata(line);
            const canonical = getParamCanonicalName(line, metadata);

            if (
                canonical &&
                paramLineIndices.has(canonical) &&
                metadata?.name
            ) {
                const lineIndex = paramLineIndices.get(canonical);
                const existingLine = mergedLines[lineIndex];

                const updatedLine = updateParamLineWithDocName(
                    existingLine,
                    metadata.name
                );
                if (updatedLine !== existingLine) {
                    mergedLines[lineIndex] = updatedLine;
                    removedAnyLine = true;
                }
                continue;
            }

            normalizedOtherLines.push(line);
        }

        otherLines = normalizedOtherLines;
    }

    if (otherLines.length > 0) {
        const nonReturnLines = [];
        const extractedReturns = [];

        for (const line of otherLines) {
            const metadata = parseDocCommentMetadata(line);
            if (metadata?.tag === "returns") {
                extractedReturns.push(line);
                continue;
            }

            nonReturnLines.push(line);
        }

        if (extractedReturns.length > 0) {
            otherLines = nonReturnLines;
            returnsLines = extractedReturns;
        }
    }

    const syntheticParamNames = new Set(
        otherLines
            .map((line) => getParamCanonicalName(line))
            .filter(isNonEmptyString)
    );

    if (syntheticParamNames.size > 0) {
        const beforeLength = mergedLines.length;
        mergedLines = mergedLines.filter((line) => {
            if (!isParamLine(line)) {
                return true;
            }

            const canonical = getParamCanonicalName(line);
            if (!canonical) {
                return false;
            }

            return !syntheticParamNames.has(canonical);
        });
        if (mergedLines.length !== beforeLength) {
            removedAnyLine = true;
        }
    }

    const lastFunctionIndex = findLastIndex(mergedLines, isFunctionLine);
    let insertionIndex = lastFunctionIndex === -1 ? 0 : lastFunctionIndex + 1;

    if (lastFunctionIndex === -1) {
        while (
            insertionIndex < mergedLines.length &&
            typeof mergedLines[insertionIndex] === STRING_TYPE &&
            mergedLines[insertionIndex].trim() === ""
        ) {
            insertionIndex += 1;
        }
    }

    while (
        insertionIndex < mergedLines.length &&
        typeof mergedLines[insertionIndex] === STRING_TYPE &&
        isParamLine(mergedLines[insertionIndex])
    ) {
        insertionIndex += 1;
    }

    let result: MutableDocCommentLines = [
        ...mergedLines.slice(0, insertionIndex),
        ...otherLines,
        ...mergedLines.slice(insertionIndex)
    ];

    if (Array.isArray(returnsLines) && returnsLines.length > 0) {
        const { lines: dedupedReturns } = dedupeReturnDocLines(returnsLines, {
            includeNonReturnLine: (line, trimmed) => trimmed.length > 0
        });

        if (dedupedReturns.length > 0) {
            const filteredResult = [];
            let removedExistingReturns = false;

            for (const line of result) {
                if (
                    typeof line === STRING_TYPE &&
                    /^\/\/\/\s*@returns\b/i.test(toTrimmedString(line))
                ) {
                    removedExistingReturns = true;
                    continue;
                }

                filteredResult.push(line);
            }

            let appendIndex = filteredResult.length;

            while (
                appendIndex > 0 &&
                typeof filteredResult[appendIndex - 1] === STRING_TYPE &&
                filteredResult[appendIndex - 1].trim() === ""
            ) {
                appendIndex -= 1;
            }

            result = [
                ...filteredResult.slice(0, appendIndex),
                ...dedupedReturns,
                ...filteredResult.slice(appendIndex)
            ];

            if (removedExistingReturns) {
                removedAnyLine = true;
            }
        }
    }

    const finalDedupedResult = dedupeReturnDocLines(result);
    result = toMutableArray(finalDedupedResult.lines) as MutableDocCommentLines;
    if (finalDedupedResult.removed) {
        removedAnyLine = true;
    }

    const functionIndex = result.findIndex(isFunctionLine);
    if (functionIndex > 0) {
        const [functionLine] = result.splice(functionIndex, 1);
        result.unshift(functionLine);
    }

    const paramDocsByCanonical = new Map();

    for (const line of result) {
        if (typeof line !== STRING_TYPE) {
            continue;
        }

        if (!isParamLine(line)) {
            continue;
        }

        const canonical = getParamCanonicalName(line);
        if (canonical) {
            paramDocsByCanonical.set(canonical, line);
        }
    }

    // Ensure that when the original existing doc lines did NOT include
    // metadata tags, but we have inserted synthetic tags, we preserve a
    // blank separator between the original summary and the synthetic tags.
    try {
        const hasOriginalTags =
            Array.isArray(existingDocLines) &&
            existingDocLines.some((l) =>
                typeof l === STRING_TYPE ? parseDocCommentMetadata(l) : false
            );
        if (
            !hasOriginalTags &&
            Array.isArray(existingDocLines) &&
            existingDocLines.length > 0
        ) {
            const firstSyntheticIndex = result.findIndex(
                (ln) =>
                    isFunctionLine(ln) || isOverrideLine(ln) || isParamLine(ln)
            );
            if (firstSyntheticIndex > 0) {
                const preceding = result[firstSyntheticIndex - 1];
                if (
                    typeof preceding === STRING_TYPE &&
                    preceding.trim() !== "" &&
                    result[firstSyntheticIndex] &&
                    typeof result[firstSyntheticIndex] === STRING_TYPE &&
                    /^\/\/\//.test(result[firstSyntheticIndex].trim()) && // Insert a blank line if we don't already have one
                    result[firstSyntheticIndex - 1] !== ""
                ) {
                    result = [
                        ...result.slice(0, firstSyntheticIndex),
                        "",
                        ...result.slice(firstSyntheticIndex)
                    ];
                }
            }
        }
    } catch {
        // best-effort: don't throw if core utilities are unavailable
    }

    const suppressedCanonicals = suppressedImplicitDocCanonicalByNode.get(node);

    if (suppressedCanonicals && suppressedCanonicals.size > 0) {
        // Only delete suppressed fallback doc lines if they are not
        // explicitly referenced (direct references) in the function body.
        // This mirrors the logic in `collectImplicitArgumentDocNames` and
        // ensures that explicitly referenced `argumentN` lines are preserved
        // even when a canonical was marked suppressed due to an alias.
        for (const canonical of suppressedCanonicals) {
            const candidate = paramDocsByCanonical.get(canonical);
            if (!candidate) continue;

            // If there is an implicit doc entry with the same canonical that
            // indicates a direct reference, keep the doc line. Otherwise remove
            // the fallback biased doc line so the alias doc comment can win.
            const directReferenceExists = implicitDocEntries.some((entry) => {
                if (!entry) return false;
                const key =
                    entry.canonical || entry.fallbackCanonical || entry.name;
                if (!key) return false;
                return key === canonical && entry.hasDirectReference === true;
            });

            if (!directReferenceExists) {
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    if (implicitDocEntries.length > 0) {
        const canonicalNames = new Set();
        const fallbackCanonicalsToRemove = new Set();

        for (const entry of implicitDocEntries) {
            if (entry?.canonical) {
                canonicalNames.add(entry.canonical);
            }

            if (
                entry?.fallbackCanonical &&
                entry.fallbackCanonical !== entry.canonical &&
                entry.hasDirectReference !== true
            ) {
                fallbackCanonicalsToRemove.add(entry.fallbackCanonical);
            }
        }

        for (const fallbackCanonical of fallbackCanonicalsToRemove) {
            // When an implicit alias entry indicates a different canonical
            // name for the same index (e.g. alias `two` for `argument2`),
            // prefer the alias and remove any stale fallback `argumentN`
            // doc line. Previously we avoided deleting the fallback when a
            // canonical with the same name was present; that prevented
            // alias-driven suppression from removing an explicit
            // `argumentN` doc line. Always remove the fallback canonical
            // here when it's marked for removal so aliases win.
            paramDocsByCanonical.delete(fallbackCanonical);
        }
    }

    let orderedParamDocs = [];
    if (Array.isArray(node.params)) {
        for (const param of node.params) {
            const paramInfo = getParameterDocInfo(param, node, options);
            const canonical = paramInfo?.name
                ? getCanonicalParamNameFromText(paramInfo.name)
                : null;
            if (canonical && paramDocsByCanonical.has(canonical)) {
                orderedParamDocs.push(paramDocsByCanonical.get(canonical));
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    if (orderedParamDocs.length === 0) {
        for (const entry of implicitDocEntries) {
            const canonical = entry?.canonical;
            if (canonical && paramDocsByCanonical.has(canonical)) {
                orderedParamDocs.push(paramDocsByCanonical.get(canonical));
                paramDocsByCanonical.delete(canonical);
            }
        }
    }

    const shouldDropRemainingParamDocs =
        !hasImplicitDocEntries &&
        declaredParamCount === 0 &&
        paramDocsByCanonical.size > 0;

    if (!shouldDropRemainingParamDocs) {
        for (const doc of paramDocsByCanonical.values()) {
            orderedParamDocs.push(doc);
        }
    }

    if (orderedParamDocs.length > 0) {
        const docsByCanonical = new Map();
        for (const docLine of orderedParamDocs) {
            if (typeof docLine !== STRING_TYPE) {
                continue;
            }

            const canonical = getParamCanonicalName(docLine);
            if (canonical) {
                docsByCanonical.set(canonical, docLine);
            }
        }

        const preferredDocs = preferredParamDocNamesByNode.get(node);
        const implicitEntryByIndex = new Map();
        for (const entry of implicitDocEntries) {
            if (entry && Number.isInteger(entry.index)) {
                implicitEntryByIndex.set(entry.index, entry);
            }
        }
        const reordered = [];

        if (Array.isArray(node.params)) {
            for (const [index, param] of node.params.entries()) {
                const implicitEntry = implicitEntryByIndex.get(index);
                if (implicitEntry) {
                    const implicitCanonical =
                        implicitEntry.canonical ||
                        getCanonicalParamNameFromText(implicitEntry.name);
                    if (
                        implicitCanonical &&
                        docsByCanonical.has(implicitCanonical)
                    ) {
                        reordered.push(docsByCanonical.get(implicitCanonical));
                        docsByCanonical.delete(implicitCanonical);
                        continue;
                    }
                }

                const preferredName = preferredDocs?.get(index);
                if (preferredName) {
                    const preferredCanonical =
                        getCanonicalParamNameFromText(preferredName);
                    if (
                        preferredCanonical &&
                        docsByCanonical.has(preferredCanonical)
                    ) {
                        reordered.push(docsByCanonical.get(preferredCanonical));
                        docsByCanonical.delete(preferredCanonical);
                        continue;
                    }
                }

                const paramInfo = getParameterDocInfo(param, node, options);
                const paramCanonical = paramInfo?.name
                    ? getCanonicalParamNameFromText(paramInfo.name)
                    : null;
                if (paramCanonical && docsByCanonical.has(paramCanonical)) {
                    reordered.push(docsByCanonical.get(paramCanonical));
                    docsByCanonical.delete(paramCanonical);
                }
            }
        }

        for (const docLine of docsByCanonical.values()) {
            reordered.push(docLine);
        }

        orderedParamDocs = reordered;
    }

    const finalDocs: MutableDocCommentLines = [];
    let insertedParams = false;

    for (const line of result) {
        if (isParamLine(line)) {
            if (!insertedParams && orderedParamDocs.length > 0) {
                finalDocs.push(...orderedParamDocs);
                insertedParams = true;
            }
            continue;
        }

        finalDocs.push(line);
    }

    if (!insertedParams && orderedParamDocs.length > 0) {
        finalDocs.push(...orderedParamDocs);
    }

    let reorderedDocs: MutableDocCommentLines = finalDocs;

    const descriptionStartIndex = reorderedDocs.findIndex(isDescriptionLine);
    if (descriptionStartIndex !== -1) {
        let descriptionEndIndex = descriptionStartIndex + 1;

        while (
            descriptionEndIndex < reorderedDocs.length &&
            typeof reorderedDocs[descriptionEndIndex] === STRING_TYPE &&
            reorderedDocs[descriptionEndIndex].startsWith("///") &&
            !parseDocCommentMetadata(reorderedDocs[descriptionEndIndex])
        ) {
            descriptionEndIndex += 1;
        }

        const descriptionBlock = reorderedDocs.slice(
            descriptionStartIndex,
            descriptionEndIndex
        );
        const docsWithoutDescription = [
            ...reorderedDocs.slice(0, descriptionStartIndex),
            ...reorderedDocs.slice(descriptionEndIndex)
        ];

        let shouldOmitDescriptionBlock = false;
        if (descriptionBlock.length === 1) {
            const descriptionMetadata = parseDocCommentMetadata(
                descriptionBlock[0]
            );
            const descriptionText =
                typeof descriptionMetadata?.name === STRING_TYPE
                    ? descriptionMetadata.name.trim()
                    : "";

            // Omit empty description blocks
            if (descriptionText.length === 0) {
                shouldOmitDescriptionBlock = true;
            } else if (
                syntheticFunctionName &&
                descriptionText.startsWith(syntheticFunctionName)
            ) {
                // Omit alias-style descriptions like "functionName()"
                const remainder = descriptionText.slice(
                    syntheticFunctionName.length
                );
                const trimmedRemainder = remainder.trim();
                if (
                    trimmedRemainder.startsWith("(") &&
                    trimmedRemainder.endsWith(")")
                ) {
                    shouldOmitDescriptionBlock = true;
                }
            }
        }

        if (shouldOmitDescriptionBlock) {
            reorderedDocs = docsWithoutDescription;
        } else {
            let lastParamIndex = -1;
            for (const [index, element] of docsWithoutDescription.entries()) {
                if (isParamLine(element)) {
                    lastParamIndex = index;
                }
            }

            const insertionAfterParams =
                lastParamIndex === -1
                    ? docsWithoutDescription.length
                    : lastParamIndex + 1;

            reorderedDocs = [
                ...docsWithoutDescription.slice(0, insertionAfterParams),
                ...descriptionBlock,
                ...docsWithoutDescription.slice(insertionAfterParams)
            ];
        }
    }

    reorderedDocs = toMutableArray(
        reorderDescriptionLinesAfterFunction(reorderedDocs)
    ) as MutableDocCommentLines;

    if (suppressedCanonicals && suppressedCanonicals.size > 0) {
        reorderedDocs = reorderedDocs.filter((line) => {
            if (!isParamLine(line)) {
                return true;
            }

            const canonical = getParamCanonicalName(line);
            return !canonical || !suppressedCanonicals.has(canonical);
        });
    }

    reorderedDocs = reorderedDocs.map((line) => {
        if (!isParamLine(line)) {
            return line;
        }

        const match = line.match(
            /^(\/\/\/\s*@param\s*)(\{[^}]*\}\s*)?(\s*\S+)(.*)$/i
        );
        if (!match) {
            return normalizeDocCommentTypeAnnotations(line);
        }

        const [, prefix, rawTypeSection = "", rawName = "", remainder = ""] =
            match;
        const normalizedPrefix = `${prefix.replace(/\s*$/, "")} `;
        let normalizedTypeSection = rawTypeSection.trim();
        if (
            normalizedTypeSection.startsWith("{") &&
            normalizedTypeSection.endsWith("}")
        ) {
            const innerType = normalizedTypeSection.slice(1, -1);
            const normalizedInner = innerType.replaceAll("|", ",");
            normalizedTypeSection = `{${normalizedInner}}`;
        }
        const typePart =
            normalizedTypeSection.length > 0 ? `${normalizedTypeSection} ` : "";
        let normalizedName = rawName.trim();
        let remainingRemainder = remainder;

        if (
            normalizedName.startsWith("[") &&
            !normalizedName.endsWith("]") &&
            typeof remainingRemainder === STRING_TYPE &&
            remainingRemainder.length > 0
        ) {
            let bracketBalance = 0;

            for (const char of normalizedName) {
                if (char === "[") {
                    bracketBalance += 1;
                } else if (char === "]") {
                    bracketBalance -= 1;
                }
            }

            if (bracketBalance > 0) {
                let sliceIndex = 0;

                while (
                    sliceIndex < remainingRemainder.length &&
                    bracketBalance > 0
                ) {
                    const char = remainingRemainder[sliceIndex];
                    if (char === "[") {
                        bracketBalance += 1;
                    } else if (char === "]") {
                        bracketBalance -= 1;
                    }
                    sliceIndex += 1;
                }

                if (bracketBalance <= 0) {
                    const continuation = remainingRemainder.slice(
                        0,
                        sliceIndex
                    );
                    normalizedName = `${normalizedName}${continuation}`.trim();
                    remainingRemainder = remainingRemainder.slice(sliceIndex);
                }
            }
        }

        const remainderText = remainingRemainder.trim();
        const hasDescription = remainderText.length > 0;
        let descriptionPart = "";

        if (hasDescription) {
            const hyphenMatch = remainingRemainder.match(/^(\s*-\s*)(.*)$/);
            let normalizedDescription;
            let hyphenSpacing = " - ";

            if (hyphenMatch) {
                const [, rawHyphenSpacing = "", rawDescription = ""] =
                    hyphenMatch;
                normalizedDescription = rawDescription.trim();

                const trailingSpaceMatch = rawHyphenSpacing.match(/-(\s*)$/);
                if (trailingSpaceMatch) {
                    const originalSpaceCount = trailingSpaceMatch[1].length;
                    const preservedSpaceCount = Math.max(
                        1,
                        Math.min(originalSpaceCount, 2)
                    );
                    hyphenSpacing = ` - ${" ".repeat(preservedSpaceCount - 1)}`;
                }
            } else {
                normalizedDescription = remainderText.replace(/^[-\s]+/, "");
            }

            if (normalizedDescription.length > 0) {
                descriptionPart = `${hyphenSpacing}${normalizedDescription}`;
            }
        }

        const updatedLine = `${normalizedPrefix}${typePart}${normalizedName}${descriptionPart}`;
        return normalizeDocCommentTypeAnnotations(updatedLine);
    });

    if (preserveDescriptionBreaks) {
        result = reorderedDocs;
    } else {
        const wrappedDocs = [];
        const normalizedPrintWidth = coercePositiveIntegerOption(
            options?.printWidth,
            120
        );
        const wrapWidth = Math.min(
            normalizedPrintWidth,
            resolveDocCommentWrapWidth(options)
        );

        const wrapSegments = (text, firstAvailable, continuationAvailable) => {
            if (firstAvailable <= 0) {
                return [text];
            }

            const words = text.split(/\s+/).filter((word) => word.length > 0);
            if (words.length === 0) {
                return [];
            }

            const segments = [];
            let current = words[0];
            let currentAvailable = firstAvailable;

            for (let index = 1; index < words.length; index += 1) {
                const word = words[index];

                const endsSentence = /[.!?]["')\]]?$/.test(current);
                const startsSentence = /^[A-Z]/.test(word);
                if (
                    endsSentence &&
                    startsSentence &&
                    currentAvailable >= 60 &&
                    current.length >=
                        Math.max(Math.floor(currentAvailable * 0.6), 24)
                ) {
                    segments.push(current);
                    current = word;
                    currentAvailable = continuationAvailable;
                    continue;
                }

                if (current.length + 1 + word.length > currentAvailable) {
                    segments.push(current);
                    current = word;
                    currentAvailable = continuationAvailable;
                } else {
                    current += ` ${word}`;
                }
            }

            segments.push(current);

            const lastIndex = segments.length - 1;
            if (lastIndex >= 2) {
                // `Array#at` handles negative indices but introduces an extra bounds
                // check on every call. This helper runs for every doc comment we
                // wrap, so prefer direct index math to keep the hot path lean.
                const lastSegment = segments[lastIndex];
                const isSingleWord =
                    typeof lastSegment === STRING_TYPE &&
                    !/\s/.test(lastSegment);

                if (isSingleWord) {
                    const maxSingleWordLength = Math.max(
                        Math.min(continuationAvailable / 2, 16),
                        8
                    );

                    if (lastSegment.length <= maxSingleWordLength) {
                        const penultimateIndex = lastIndex - 1;
                        const mergedSegment = `${segments[penultimateIndex]} ${lastSegment}`;

                        segments[penultimateIndex] = mergedSegment;
                        segments.pop();
                      }
                    }
                  }
          
                  return segments;
                };
          
                for (let index = 0; index < reorderedDocs.length; index += 1) {
                  const line = reorderedDocs[index];
                  if (isDescriptionLine(line)) {
                    const blockLines = [line];
                    let lookahead = index + 1;
          
                    while (lookahead < reorderedDocs.length) {
                      const nextLine = reorderedDocs[lookahead];
                      if (
                        typeof nextLine === STRING_TYPE &&
                        nextLine.startsWith("///") &&
                        !parseDocCommentMetadata(nextLine)
                      ) {
                        blockLines.push(nextLine);
                        lookahead += 1;
                        continue;
                      }
                      break;
                    }
          
                    index = lookahead - 1;
          
                    const prefixMatch = line.match(/^(\/\/\/\s*@description\s+)/i);
                    if (!prefixMatch) {
                      wrappedDocs.push(...blockLines);
                      continue;
                    }
          
                    const prefix = prefixMatch[1];
                    const continuationPrefix = `/// ${" ".repeat(Math.max(prefix.length - 4, 0))}`;
                    const descriptionText = blockLines
                      .map((docLine, blockIndex) => {
                        if (blockIndex === 0) {
                          return docLine.slice(prefix.length).trim();
                        }
          
                        if (docLine.startsWith(continuationPrefix)) {
                          return docLine
                            .slice(continuationPrefix.length)
                            .trim();
                        }
          
                        if (docLine.startsWith("///")) {
                          return docLine.slice(3).trim();
                        }
          
                        return docLine.trim();
                      })
                      .filter((segment) => segment.length > 0)
                      .join(" ");
          
                    if (descriptionText.length === 0) {
                      wrappedDocs.push(...blockLines);
                      continue;
                    }
          
                    const available = Math.max(wrapWidth - prefix.length, 16);
                    const continuationAvailable = Math.max(
                      Math.min(available, 62),
                      16
                    );
                    const segments = wrapSegments(
                      descriptionText,
                      available,
                      continuationAvailable
                    );
          
                    if (segments.length === 0) {
                      wrappedDocs.push(...blockLines);
                      continue;
                    }
          
                    if (blockLines.length > 1) {
                      if (segments.length > blockLines.length) {
                        const paddedBlockLines = blockLines.map(
                          (docLine, blockIndex) => {
                            if (
                              blockIndex === 0 ||
                              typeof docLine !== STRING_TYPE
                            ) {
                              return docLine;
                            }
          
                            if (
                              !docLine.startsWith("///") ||
                              parseDocCommentMetadata(docLine)
                            ) {
                              return docLine;
                            }
          
                            if (docLine.startsWith(continuationPrefix)) {
                              return docLine;
                            }
          
                            const trimmedContinuation = docLine
                              .slice(3)
                              .replace(/^\s+/, "");
          
                            if (trimmedContinuation.length === 0) {
                              return docLine;
                            }
          
                            return `${continuationPrefix}${trimmedContinuation}`;
                          }
                        );
          
                        wrappedDocs.push(...paddedBlockLines);
                        continue;
                      }
          
                      // If the description is already expressed as multiple
                      // block lines and the wrapping computation compresses it
                      // into fewer segments (or same number), preserve the
                      // original blockLines rather than collapsing them into a
                      // single description line. Tests expect explicit
                      // continuations to remain visible rather than being
                      // merged into the first line.
                      if (segments.length <= blockLines.length) {
                        wrappedDocs.push(...blockLines);
                        continue;
                      }
                    }
          
                    wrappedDocs.push(`${prefix}${segments[0]}`);
                    for (
                      let segmentIndex = 1;
                      segmentIndex < segments.length;
                      segmentIndex += 1
                    ) {
                      wrappedDocs.push(
                        `${continuationPrefix}${segments[segmentIndex]}`
                      );
                    }
                    continue;
                  }
          
                  wrappedDocs.push(line);
                }
          
                reorderedDocs = wrappedDocs;
          
                result = reorderedDocs;
              }
          
              if (removedAnyLine || otherLines.length > 0) {
                result._suppressLeadingBlank = true;
              }
          
              let filteredResult: MutableDocCommentLines = toMutableArray(
                result.filter((line) => {
                  if (typeof line !== STRING_TYPE) {
                    return true;
                  }
          
                  if (!/^\/\/\/\s*@description\b/i.test(line.trim())) {
                    return true;
                  }
          
                  const metadata = parseDocCommentMetadata(line);
                  const descriptionText = toTrimmedString(metadata?.name);
          
                  return descriptionText.length > 0;
                })
              );
          
              if (result._suppressLeadingBlank) {
                filteredResult._suppressLeadingBlank = true;
              }
          
              // If synthetic tags were computed and merged above, re-run promotion to
              // convert leading doc-like summary lines into a `@description` tag when a
              // doc tag now follows the summary. This can happen when the tag is
              // synthetic (inserted by computeSyntheticFunctionDocLines) and not present
              // in the original `existingDocLines` — re-running promotion here ensures
              // the presence of synthetic tags enables the promotion and avoids leaving
              // the summary as a plain inline/trailing comment.
              try {
                // Only re-run promotion if the original existing doc lines contained
                // metadata tags or were doc-like (`// /` style). Avoid promoting plain
                // triple slash summaries that had no metadata in the original source
                // so synthetic tags do not cause unwanted `@description` promotions.
                const originalExistingHasTags =
                  Array.isArray(existingDocLines) &&
                  existingDocLines.some((line) =>
                    typeof line === STRING_TYPE
                      ? parseDocCommentMetadata(line)
                      : false
                  );
                const originalExistingHasDocLikePrefixes =
                  Array.isArray(existingDocLines) &&
                  existingDocLines.some((line) =>
                    typeof line === STRING_TYPE
                      ? /^\s*\/\/\s*\/\s*/.test(line)
                      : false
                  );
          
                if (originalExistingHasTags || originalExistingHasDocLikePrefixes) {
                  filteredResult = toMutableArray(
                    promoteLeadingDocCommentTextToDescription(filteredResult)
                  );
                }
              } catch {
                // If the Core service is unavailable (testing contexts), fall back to
                // the original behavior without promotion so we don't throw.
              }
          
              // If the original existing doc lines contained plain triple-slash
              // summary lines but no explicit doc tags, prefer to keep the summary
              // as plain text rather than a promoted `@description` tag and ensure a
              // blank line separates the summary from the synthetic metadata.
              try {
                const originalHasPlainSummary =
                  Array.isArray(existingDocLines) &&
                  existingDocLines.some((l) =>
                    typeof l === STRING_TYPE
                      ? /^\/\/\/\s*(?!@).+/.test(l.trim())
                      : false
                  );
                const originalHasTags =
                  Array.isArray(existingDocLines) &&
                  existingDocLines.some((l) =>
                    typeof l === STRING_TYPE ? parseDocCommentMetadata(l) : false
                  );
                if (originalHasPlainSummary && !originalHasTags) {
                  const summaryLines = [] as string[];
                  const otherLines = [] as string[];
          
                  for (const ln of filteredResult) {
                    if (typeof ln !== STRING_TYPE) continue;
                    if (/^\/\/\/\s*@description\b/i.test(ln.trim())) {
                      const meta = parseDocCommentMetadata(ln);
                      const descriptionText =
                        typeof meta?.name === STRING_TYPE ? meta.name : "";
                      summaryLines.push(`/// ${descriptionText}`);
                      continue;
                    }
                    if (/^\/\/\/\s*@/i.test(ln.trim())) {
                      otherLines.push(ln);
                      continue;
                    }
                    // Treat other triple slash lines as summary continuations
                    if (/^\/\/\/\s*/.test(ln.trim())) {
                      summaryLines.push(ln);
                      continue;
                    }
                    otherLines.push(ln);
                  }
          
                  if (summaryLines.length > 0 && otherLines.length > 0) {
                    // Ensure a blank separator between summary block and synthetic metadata
                    const combined = [...summaryLines, "", ...otherLines];
                    filteredResult = toMutableArray(
                      combined as any
                    ) as MutableDocCommentLines;
                  }
                }
              } catch {
                // Best-effort fallback; do not throw on diagnostic operations
              }
              return toMutableArray(
                convertLegacyReturnsDescriptionLinesToMetadata(filteredResult, {
                  normalizeDocCommentTypeAnnotations: normalizeGameMakerType
                })
              ) as MutableDocCommentLines;
            }
            
            /**
             * Determines whether synthetic doc comments should be emitted for the given function.
             */
            export function shouldGenerateSyntheticDocForFunction(
                path: any,
                existingDocLines: DocCommentLines | string[],
                options: any
            ): boolean {
                const node = path.getValue();
                const parent = path.getParentNode();
                if (
                    !node ||
                    !parent ||
                    (parent.type !== "Program" && parent.type !== "BlockStatement")
                ) {
                    return false;
                }
            
                if (node.type === "ConstructorDeclaration") {
                    return true;
                }
            
                if (
                    node.type !== "FunctionDeclaration" &&
                    node.type !== "StructFunctionDeclaration"
                ) {
                    return false;
                }
            
                const convertedExistingForSynthetic =
                    convertLegacyReturnsDescriptionLinesToMetadata(existingDocLines, {
                        normalizeDocCommentTypeAnnotations: normalizeGameMakerType
                    });
                const syntheticLines = computeSyntheticFunctionDocLines(
                    node,
                    convertedExistingForSynthetic,
                    options
                );
            
                if (syntheticLines.length > 0) {
                    return true;
                }
            
                if (hasLegacyReturnsDescriptionLines(existingDocLines)) {
                    return true;
                }
            
                const hasParamDocLines = existingDocLines.some((line) => {
                    if (typeof line !== STRING_TYPE) {
                        return false;
                    }
            
                    const trimmed = toTrimmedString(line);
                    return /^\/\/\/\s*@param\b/i.test(trimmed);
                });
            
                if (hasParamDocLines) {
                    const declaredParamCount = Array.isArray(node.params)
                        ? node.params.length
                        : 0;
                    let hasImplicitDocEntries = false;
            
                    if (
                        node.type === "FunctionDeclaration" ||
                        node.type === "StructFunctionDeclaration"
                    ) {
                        const implicitEntries = collectImplicitArgumentDocNames(
                            node,
                            options
                        );
                        hasImplicitDocEntries = implicitEntries.length > 0;
                    }
            
                    if (declaredParamCount === 0 && !hasImplicitDocEntries) {
                        return true;
                    }
                }
            
                return (
                    Array.isArray(node.params) &&
                    node.params.some((param) => {
                        return param?.type === "DefaultParameter";
                    })
                );
            }
            
            function updateParamLineWithDocName(line: string, newDocName: string): string {
                if (typeof line !== STRING_TYPE || typeof newDocName !== STRING_TYPE) {
                    return line;
                }
            
                const prefixMatch = line.match(/^(\/\/\/\s*@param(?:\s+\{[^}]+\})?\s*)/i);
                if (!prefixMatch) {
                    return `/// @param ${newDocName}`;
                }
            
                const prefix = prefixMatch[0];
                const remainder = line.slice(prefix.length);
                if (remainder.length === 0) {
                    return `${prefix}${newDocName}`;
                }
            
                const updatedRemainder = remainder.replace(/^[^\s]+/, newDocName);
                return `${prefix}${updatedRemainder}`;
            }
