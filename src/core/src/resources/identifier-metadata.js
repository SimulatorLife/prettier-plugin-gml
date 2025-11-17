export function normalizeIdentifierMetadataEntries(metadata) {
    if (!metadata || typeof metadata !== "object") {
        return [];
    }

    const identifiers = metadata.identifiers;
    if (!identifiers || typeof identifiers !== "object") {
        return [];
    }

    const entries = [];

    for (const [name, descriptor] of Object.entries(identifiers)) {
        if (typeof name !== "string" || name.length === 0) {
            continue;
        }

        // Descriptor must be an object (not a primitive). Missing but present
        // descriptors should be treated as empty object.
        if (descriptor === null || typeof descriptor !== "object") {
            continue;
        }

        const type =
            typeof descriptor.type === "string"
                ? descriptor.type.toLowerCase()
                : "";

        entries.push({ name, type, descriptor });
    }

    return entries;
}
