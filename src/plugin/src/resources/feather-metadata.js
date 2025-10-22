import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const FEATHER_METADATA_RESOURCE_PATH =
    "../../../../resources/feather-metadata.json";

export function loadFeatherMetadata() {
    const metadata = require(FEATHER_METADATA_RESOURCE_PATH);
    return metadata && typeof metadata === "object" ? metadata : null;
}
