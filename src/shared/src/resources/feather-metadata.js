import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const FEATHER_METADATA_URL = new URL(
    "../../../../resources/feather-metadata.json",
    import.meta.url
);

export const FEATHER_METADATA_PATH = fileURLToPath(FEATHER_METADATA_URL);

export function loadBundledFeatherMetadata() {
    return require(FEATHER_METADATA_PATH);
}
