import fs from "node:fs";

import { Core } from "@gml-modules/core";

// Feather metadata file paths - duplicated from plugin/resources since CLI cannot
// import from plugin due to TypeScript project reference limitations
const FEATHER_METADATA_PATH = Core.resolveBundledResourcePath("feather-metadata.json");
const FEATHER_METADATA_URL = Core.resolveBundledResourceUrl("feather-metadata.json");

function loadBundledFeatherMetadata() {
    const contents = fs.readFileSync(FEATHER_METADATA_PATH, "utf8");
    return JSON.parse(contents);
}

export { FEATHER_METADATA_PATH, FEATHER_METADATA_URL, loadBundledFeatherMetadata };
