import { assertPlainObject, parseJsonWithContext } from "../shared-deps.js";

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
    const payload = parseJsonWithContext(jsonText, {
        description: "manual keywords payload",
        source
    });
    const record = assertPlainObject(payload, {
        errorMessage: "Manual keywords payload must be a JSON object."
    });

    return validateManualMapping(record, {
        valueDescription: "Manual keywords"
    });
}

export function decodeManualTagsPayload(jsonText, { source } = {}) {
    const payload = parseJsonWithContext(jsonText, {
        description: "manual tags payload",
        source
    });
    const record = assertPlainObject(payload, {
        errorMessage: "Manual tags payload must be a JSON object."
    });

    return validateManualMapping(record, {
        valueDescription: "Manual tags"
    });
}
