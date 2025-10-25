import { parseJsonObjectWithContext } from "../shared/dependencies.js";

function validateManualMapping(record, { valueDescription }) {
    for (const [key, value] of Object.entries(record)) {
        if (typeof value !== "string") {
            const formattedKey = key ? `'${key}'` : "<empty key>";
            throw new TypeError(
                `${valueDescription} entry ${formattedKey} must map to a string value.`
            );
        }
    }

    return record;
}

export function decodeManualKeywordsPayload(jsonText, { source } = {}) {
    const record = parseJsonObjectWithContext(jsonText, {
        description: "manual keywords payload",
        source,
        assertOptions: {
            errorMessage: "Manual keywords payload must be a JSON object."
        }
    });

    return validateManualMapping(record, {
        valueDescription: "Manual keywords"
    });
}

export function decodeManualTagsPayload(jsonText, { source } = {}) {
    const record = parseJsonObjectWithContext(jsonText, {
        description: "manual tags payload",
        source,
        assertOptions: {
            errorMessage: "Manual tags payload must be a JSON object."
        }
    });

    return validateManualMapping(record, {
        valueDescription: "Manual tags"
    });
}
