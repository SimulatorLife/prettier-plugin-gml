import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const GML_IDENTIFIER_METADATA_URL = new URL(
    "../../../../resources/gml-identifiers.json",
    import.meta.url
);
export const GML_IDENTIFIER_METADATA_PATH = fileURLToPath(
    GML_IDENTIFIER_METADATA_URL
);

export function loadBundledIdentifierMetadata() {
    return require(GML_IDENTIFIER_METADATA_PATH);
}
export {
    FEATHER_METADATA_PATH,
    loadBundledFeatherMetadata
} from "@prettier-plugin-gml/shared/resources/feather-metadata.js";
