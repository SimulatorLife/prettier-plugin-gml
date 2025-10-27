import { parseJsonObjectWithContext } from "../dependencies.js";

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

function createManualMappingDecoder({
    payloadDescription,
    payloadErrorMessage,
    valueDescription
}) {
    return (jsonText, { source } = {}) => {
        const record = parseJsonObjectWithContext(jsonText, {
            description: payloadDescription,
            source,
            assertOptions: {
                errorMessage: payloadErrorMessage
            }
        });

        return validateManualMapping(record, { valueDescription });
    };
}

export const decodeManualKeywordsPayload = createManualMappingDecoder({
    payloadDescription: "manual keywords payload",
    payloadErrorMessage: "Manual keywords payload must be a JSON object.",
    valueDescription: "Manual keywords"
});

export const decodeManualTagsPayload = createManualMappingDecoder({
    payloadDescription: "manual tags payload",
    payloadErrorMessage: "Manual tags payload must be a JSON object.",
    valueDescription: "Manual tags"
});
