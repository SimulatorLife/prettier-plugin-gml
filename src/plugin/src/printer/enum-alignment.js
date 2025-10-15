const ENUM_INITIALIZER_OPERATOR_WIDTH = " = ".length;

export function prepareEnumMembersForPrinting(enumNode, getNodeName) {
    if (!enumNode || typeof enumNode !== "object") {
        return;
    }

    const members = enumNode.members;
    if (!Array.isArray(members) || members.length === 0) {
        return;
    }

    const memberCount = members.length;
    const nameLengths = new Array(memberCount);
    const initializerWidths = new Array(memberCount);
    const memberWidths = new Array(memberCount);
    const trailingCommentLists = new Array(memberCount);

    let maxInitializerNameLength = 0;

    // A single indexed pass avoids re-scanning the array when computing
    // `Math.max` / `Array#reduce`, keeping this hot alignment prep tight.
    for (let index = 0; index < memberCount; index += 1) {
        const member = members[index];
        const rawName = getNodeName?.(member?.name);
        const length = typeof rawName === "string" ? rawName.length : 0;

        nameLengths[index] = length;

        const initializerWidth = getEnumInitializerWidth(member?.initializer);
        initializerWidths[index] = initializerWidth;

        trailingCommentLists[index] = collectTrailingEnumComments(member);

        if (member?.initializer && length > maxInitializerNameLength) {
            maxInitializerNameLength = length;
        }
    }

    const shouldAlignInitializers = maxInitializerNameLength > 0;

    const lastIndex = memberCount - 1;
    let maxMemberWidth = 0;

    // A hand-rolled loop avoids creating a callback closure for `Array#forEach`
    // and repeatedly reading `members.length` inside the hot post-processing
    // pass. The body mirrors the original logic while keeping the tight loop
    // friendlier to V8's optimizer.
    for (let index = 0; index < memberCount; index += 1) {
        const member = members[index];
        const nameLength = nameLengths[index];
        const hasInitializer = Boolean(member?.initializer);

        const alignmentPadding =
            shouldAlignInitializers && hasInitializer
                ? maxInitializerNameLength - nameLength
                : 0;

        member._enumNameAlignmentPadding = alignmentPadding;

        const initializerWidth = initializerWidths[index] ?? 0;
        const initializerSpan = hasInitializer
            ? ENUM_INITIALIZER_OPERATOR_WIDTH + initializerWidth
            : 0;

        const memberWidth = nameLength + alignmentPadding + initializerSpan;

        memberWidths[index] = memberWidth;
        if (memberWidth > maxMemberWidth) {
            maxMemberWidth = memberWidth;
        }
    }

    if (maxMemberWidth === 0) {
        return;
    }

    const hasTrailingComma = enumNode?.hasTrailingComma === true;

    for (let index = 0; index < memberCount; index += 1) {
        const comments = trailingCommentLists[index];
        if (!comments || comments.length === 0) {
            continue;
        }

        const memberWidth = memberWidths[index] ?? 0;
        const isLastMember = index === lastIndex;
        const commaWidth = !isLastMember || hasTrailingComma ? 1 : 0;
        const extraPadding = Math.max(
            maxMemberWidth - memberWidth - commaWidth,
            0
        );

        if (extraPadding === 0) {
            continue;
        }

        for (const comment of comments) {
            if (comment && typeof comment === "object") {
                const previous =
                    typeof comment._enumTrailingPadding === "number"
                        ? comment._enumTrailingPadding
                        : 0;
                comment._enumTrailingPadding = Math.max(previous, extraPadding);
            }
        }
    }
}

export function getEnumNameAlignmentPadding(member) {
    if (!member) {
        return 0;
    }

    const padding = member._enumNameAlignmentPadding;
    return typeof padding === "number" && padding > 0 ? padding : 0;
}

function getEnumInitializerWidth(initializer) {
    if (typeof initializer === "string") {
        return initializer.trim().length;
    }

    if (initializer == null) {
        return 0;
    }

    if (typeof initializer === "number") {
        return String(initializer).length;
    }

    if (typeof initializer === "object") {
        const text = String(initializer.value ?? "").trim();
        return text.length;
    }

    return String(initializer).trim().length;
}

function collectTrailingEnumComments(member) {
    const comments = member?.comments;
    if (!Array.isArray(comments) || comments.length === 0) {
        return [];
    }

    return comments.filter((comment) => {
        if (comment === null || typeof comment !== "object") {
            return false;
        }

        return comment.trailing === true || comment.placement === "endOfLine";
    });
}
