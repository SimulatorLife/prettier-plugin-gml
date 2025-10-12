export function prepareEnumMembersForPrinting(
    members,
    trailingCommentPadding,
    getNodeName
) {
    if (!Array.isArray(members) || members.length === 0) {
        return;
    }

    const resolvedPadding =
        typeof trailingCommentPadding === "number" &&
        Number.isFinite(trailingCommentPadding)
            ? Math.max(trailingCommentPadding, 0)
            : 0;

    const nameLengths = members.map((member) => {
        const rawName = getNodeName?.(member?.name);
        return typeof rawName === "string" ? rawName.length : 0;
    });

    const maxNameLength = Math.max(...nameLengths);
    const maxInitializerNameLength = members.reduce((result, member, index) => {
        if (member?.initializer) {
            const length = nameLengths[index];
            return length > result ? length : result;
        }
        return result;
    }, 0);
    const shouldAlignInitializers = maxInitializerNameLength > 0;

    members.forEach((member, index) => {
        const nameLength = nameLengths[index];
        member._commentColumnTarget = maxNameLength + resolvedPadding;
        member._hasTrailingComma = index !== members.length - 1;
        member._nameLengthForAlignment = nameLength;

        if (shouldAlignInitializers && member.initializer) {
            member._enumNameAlignmentPadding =
                maxInitializerNameLength - nameLength;
        } else {
            member._enumNameAlignmentPadding = 0;
        }
    });
}

export function getEnumMemberCommentPadding(member) {
    if (!member) {
        return 0;
    }

    const targetColumn =
        typeof member._commentColumnTarget === "number" &&
        Number.isFinite(member._commentColumnTarget)
            ? member._commentColumnTarget
            : 0;

    const baseLength =
        (member._nameLengthForAlignment || 0) +
        (member._enumNameAlignmentPadding || 0) +
        (member._hasTrailingComma ? 1 : 0);

    return Math.max(targetColumn - baseLength - 1, 0);
}

export function getEnumNameAlignmentPadding(member) {
    if (!member) {
        return 0;
    }

    const padding = member._enumNameAlignmentPadding;
    return typeof padding === "number" && padding > 0 ? padding : 0;
}
