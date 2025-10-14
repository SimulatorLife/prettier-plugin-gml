export function prepareEnumMembersForPrinting(
    members,
    trailingCommentPadding,
    getNodeName
) {
    if (!Array.isArray(members) || members.length === 0) {
        return;
    }

    const padding =
        typeof trailingCommentPadding === "number" &&
        Number.isFinite(trailingCommentPadding)
            ? Math.max(trailingCommentPadding, 0)
            : 0;

    let maxNameLength = 0;
    let maxInitializerNameLength = 0;

    const metadata = members.map((member) => {
        const rawName = getNodeName?.(member?.name);
        const nameLength = typeof rawName === "string" ? rawName.length : 0;
        const hasInitializer = Boolean(member?.initializer);

        if (nameLength > maxNameLength) {
            maxNameLength = nameLength;
        }

        if (hasInitializer && nameLength > maxInitializerNameLength) {
            maxInitializerNameLength = nameLength;
        }

        return { member, nameLength, hasInitializer };
    });

    const shouldAlignInitializers = maxInitializerNameLength > 0;
    const commentColumnTarget = maxNameLength + padding;
    const lastIndex = members.length - 1;

    metadata.forEach(({ member, nameLength, hasInitializer }, index) => {
        member._commentColumnTarget = commentColumnTarget;
        member._hasTrailingComma = index !== lastIndex;
        member._nameLengthForAlignment = nameLength;

        member._enumNameAlignmentPadding =
            shouldAlignInitializers && hasInitializer
                ? maxInitializerNameLength - nameLength
                : 0;
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
