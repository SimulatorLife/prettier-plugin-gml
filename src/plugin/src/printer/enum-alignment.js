import { isNonEmptyArray, getCommentArray } from "../shared/index.js";

const ENUM_INITIALIZER_OPERATOR_WIDTH = " = ".length;

/**
 * Mutate an enum declaration so subsequent printer passes know how much spacing
 * is required to align member names, initializers, and trailing comments.
 *
 * Each member receives bookkeeping properties (for example,
 * `_enumNameAlignmentPadding`) that store the padding width needed to align the
 * columnar layout. When no alignment work is required the function exits early
 * to avoid allocating metadata in hot printer paths.
 *
 * @param {{
 *     members?: Array<unknown> | null | undefined;
 *     hasTrailingComma?: boolean;
 } | null | undefined} enumNode Enum AST node to augment.
 * @param {(node: unknown) => string | null | undefined} [getNodeName]
 *        Optional resolver used to extract a stable member name.
 */
export function prepareEnumMembersForPrinting(enumNode, getNodeName) {
    if (!enumNode || typeof enumNode !== "object") {
        return;
    }

    const members = enumNode.members;
    if (!isNonEmptyArray(members)) {
        return;
    }

    const resolveName =
        typeof getNodeName === "function" ? getNodeName : undefined;
    const { memberStats, maxInitializerNameLength, allMembersHaveInitializer } =
        collectEnumMemberStats(members, resolveName);

    const shouldAlignInitializers =
        allMembersHaveInitializer && maxInitializerNameLength > 0;

    const maxMemberWidth = applyEnumMemberAlignment({
        memberStats,
        shouldAlignInitializers,
        maxInitializerNameLength
    });

    if (maxMemberWidth === 0) {
        return;
    }

    const hasTrailingComma = enumNode?.hasTrailingComma === true;
    applyTrailingCommentPadding({
        memberStats,
        maxMemberWidth,
        hasTrailingComma,
        shouldAlignInitializers
    });
}

/**
 * Retrieve the alignment padding previously attached by
 * {@link prepareEnumMembersForPrinting}. Callers default to zero so the printer
 * can treat members without metadata as already aligned.
 *
 * @param {unknown} member Enum member node carrying optional alignment state.
 * @returns {number} Non-negative padding width in spaces.
 */
export function getEnumNameAlignmentPadding(member) {
    if (!member) {
        return 0;
    }

    const padding = member._enumNameAlignmentPadding;
    return typeof padding === "number" && padding > 0 ? padding : 0;
}

function getEnumInitializerWidth(initializer) {
    if (initializer == undefined) {
        return 0;
    }

    if (typeof initializer === "number") {
        return String(initializer).length;
    }

    const normalized =
        typeof initializer === "object"
            ? extractInitializerText(initializer)
            : initializer;

    if (typeof normalized === "number") {
        return String(normalized).trim().length;
    }

    if (typeof normalized === "string") {
        return normalized.trim().length;
    }

    return String(normalized ?? "").trim().length;
}

function extractInitializerText(initializer) {
    if (typeof initializer._enumInitializerText === "string") {
        return initializer._enumInitializerText;
    }

    return initializer.value ?? "";
}

function collectTrailingEnumComments(member) {
    const comments = getCommentArray(member);
    const { length } = comments;
    if (length === 0) {
        return [];
    }

    // Manual iteration avoids creating a new callback per invocation while the
    // printer walks enum members, which keeps the micro-hot path allocation
    // free.
    const trailingComments = [];

    for (let index = 0; index < length; index += 1) {
        const comment = comments[index];
        if (comment === null || typeof comment !== "object") {
            continue;
        }

        if (comment.trailing === true || comment.placement === "endOfLine") {
            trailingComments.push(comment);
        }
    }

    return trailingComments;
}

function collectEnumMemberStats(members, resolveName) {
    const memberCount = members.length;
    const memberStats = new Array(memberCount);
    let maxInitializerNameLength = 0;
    let allMembersHaveInitializer = true;

    // Avoid `Array#map` here so the hot enum printing path does not allocate a
    // new callback for each member. The manual loop keeps the same data shape
    // while shaving observable time off the tight formatter benchmark.
    for (let index = 0; index < memberCount; index += 1) {
        const member = members[index];
        const rawName = resolveName ? resolveName(member?.name) : undefined;
        const nameLength = typeof rawName === "string" ? rawName.length : 0;
        const initializer = member?.initializer;
        const hasInitializer = Boolean(initializer);
        const initializerWidth = getEnumInitializerWidth(initializer);

        if (hasInitializer && nameLength > maxInitializerNameLength) {
            maxInitializerNameLength = nameLength;
        } else if (!hasInitializer) {
            allMembersHaveInitializer = false;
        }

        memberStats[index] = {
            member,
            nameLength,
            initializerWidth,
            hasInitializer,
            trailingComments: collectTrailingEnumComments(member)
        };
    }

    return { memberStats, maxInitializerNameLength, allMembersHaveInitializer };
}

function applyEnumMemberAlignment({
    memberStats,
    shouldAlignInitializers,
    maxInitializerNameLength
}) {
    let maxMemberWidth = 0;

    for (const entry of memberStats) {
        const alignmentPadding =
            shouldAlignInitializers && entry.hasInitializer
                ? maxInitializerNameLength - entry.nameLength
                : 0;

        entry.member._enumNameAlignmentPadding = alignmentPadding;

        const initializerSpan = entry.hasInitializer
            ? ENUM_INITIALIZER_OPERATOR_WIDTH + entry.initializerWidth
            : 0;

        const memberWidth =
            entry.nameLength + alignmentPadding + initializerSpan;

        entry.memberWidth = memberWidth;
        if (memberWidth > maxMemberWidth) {
            maxMemberWidth = memberWidth;
        }
    }

    return maxMemberWidth;
}

function applyTrailingCommentPadding({
    memberStats,
    maxMemberWidth,
    hasTrailingComma,
    shouldAlignInitializers
}) {
    if (!shouldAlignInitializers) {
        return;
    }

    const lastIndex = memberStats.length - 1;

    // Manual index iteration avoids allocating iterator tuples from
    // `Array#entries()` while the printer walks enum members.
    for (let index = 0; index <= lastIndex; index += 1) {
        const entry = memberStats[index];
        const trailingComments = entry.trailingComments;
        const trailingCount = trailingComments.length;

        if (trailingCount === 0) {
            continue;
        }

        const basePadding = maxMemberWidth - entry.memberWidth;
        if (basePadding <= 0) {
            continue;
        }

        const commaWidth = index !== lastIndex || hasTrailingComma ? 1 : 0;
        const extraPadding = basePadding - commaWidth;

        if (extraPadding <= 0) {
            continue;
        }

        for (
            let commentIndex = 0;
            commentIndex < trailingCount;
            commentIndex += 1
        ) {
            const comment = trailingComments[commentIndex];
            const previous = comment._enumTrailingPadding;

            // Skip reassignments when another member already provided padding
            // that meets or exceeds the computed width. This mirrors the
            // original Math.max call while avoiding the extra allocation.
            if (typeof previous !== "number" || previous < extraPadding) {
                comment._enumTrailingPadding = extraPadding;
            }
        }
    }
}
