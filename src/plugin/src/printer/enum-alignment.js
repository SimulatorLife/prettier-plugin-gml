const ENUM_INITIALIZER_OPERATOR_WIDTH = " = ".length;

export function prepareEnumMembersForPrinting(enumNode, getNodeName) {
    if (!enumNode || typeof enumNode !== "object") {
        return;
    }

    const members = enumNode.members;
    if (!Array.isArray(members) || members.length === 0) {
        return;
    }

    let maxInitializerNameLength = 0;
    const memberStats = members.map((member) => {
        const rawName = getNodeName?.(member?.name);
        const nameLength = typeof rawName === "string" ? rawName.length : 0;
        const initializer = member?.initializer;
        const hasInitializer = Boolean(initializer);
        const initializerWidth = getEnumInitializerWidth(initializer);

        if (hasInitializer && nameLength > maxInitializerNameLength) {
            maxInitializerNameLength = nameLength;
        }

        return {
            member,
            nameLength,
            initializerWidth,
            hasInitializer,
            trailingComments: collectTrailingEnumComments(member)
        };
    });

    const shouldAlignInitializers = maxInitializerNameLength > 0;

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

    if (maxMemberWidth === 0) {
        return;
    }

    const hasTrailingComma = enumNode?.hasTrailingComma === true;
    const lastIndex = memberStats.length - 1;

    memberStats.forEach((entry, index) => {
        if (!entry.trailingComments || entry.trailingComments.length === 0) {
            return;
        }

        const commaWidth = index !== lastIndex || hasTrailingComma ? 1 : 0;
        const extraPadding = Math.max(
            maxMemberWidth - (entry.memberWidth ?? 0) - commaWidth,
            0
        );

        if (extraPadding === 0) {
            return;
        }

        for (const comment of entry.trailingComments) {
            if (comment && typeof comment === "object") {
                const previous =
                    typeof comment._enumTrailingPadding === "number"
                        ? comment._enumTrailingPadding
                        : 0;
                comment._enumTrailingPadding = Math.max(previous, extraPadding);
            }
        }
    });
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
