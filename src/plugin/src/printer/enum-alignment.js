export function prepareEnumMembersForPrinting(members, getNodeName) {
    if (!Array.isArray(members) || members.length === 0) {
        return;
    }

    const memberCount = members.length;
    const nameLengths = new Array(memberCount);

    let maxInitializerNameLength = 0;

    // A single indexed pass avoids re-scanning the array when computing
    // `Math.max` / `Array#reduce`, keeping this hot alignment prep tight.
    for (let index = 0; index < memberCount; index += 1) {
        const member = members[index];
        const rawName = getNodeName?.(member?.name);
        const length = typeof rawName === "string" ? rawName.length : 0;

        nameLengths[index] = length;

        if (member?.initializer && length > maxInitializerNameLength) {
            maxInitializerNameLength = length;
        }
    }

    const shouldAlignInitializers = maxInitializerNameLength > 0;

    const lastIndex = memberCount - 1;

    // A hand-rolled loop avoids creating a callback closure for `Array#forEach`
    // and repeatedly reading `members.length` inside the hot post-processing
    // pass. The body mirrors the original logic while keeping the tight loop
    // friendlier to V8's optimizer.
    for (let index = 0; index < memberCount; index += 1) {
        const member = members[index];
        const nameLength = nameLengths[index];
        if (shouldAlignInitializers && member.initializer) {
            member._enumNameAlignmentPadding =
                maxInitializerNameLength - nameLength;
        } else {
            member._enumNameAlignmentPadding = 0;
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
