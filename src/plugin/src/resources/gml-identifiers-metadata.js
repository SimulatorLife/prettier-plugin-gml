import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const IDENTIFIER_METADATA_RESOURCE_PATH =
    "../../../../resources/gml-identifiers.json";

export const GML_IDENTIFIER_METADATA_URL = Object.freeze(
    new URL(IDENTIFIER_METADATA_RESOURCE_PATH, import.meta.url)
);

export function loadGmlIdentifierMetadata() {
    try {
        const metadata = require(IDENTIFIER_METADATA_RESOURCE_PATH);
        return metadata && typeof metadata === "object" ? metadata : null;
    } catch {
        return null;
    }
}
