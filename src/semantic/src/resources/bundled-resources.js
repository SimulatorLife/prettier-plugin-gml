// Remove this import/export passthrough once all consumers
// have migrated to use the core package directly.
import { Core } from "@gml-modules/core";

const {
    Resources: {
        GML_IDENTIFIER_METADATA_PATH,
        GML_IDENTIFIER_METADATA_URL,
        loadBundledIdentifierMetadata,
        FEATHER_METADATA_PATH,
        loadBundledFeatherMetadata
    }
} = Core;

export {
    GML_IDENTIFIER_METADATA_PATH,
    GML_IDENTIFIER_METADATA_URL,
    loadBundledIdentifierMetadata,
    FEATHER_METADATA_PATH,
    loadBundledFeatherMetadata
};
