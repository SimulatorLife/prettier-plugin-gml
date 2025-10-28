import { createRequire } from "node:module";

import { resolveFromRepoRoot } from "../../shared/workspace-paths.js";

const require = createRequire(import.meta.url);

export const FEATHER_METADATA_PATH = resolveFromRepoRoot(
    "resources",
    "feather-metadata.json"
);

export function loadBundledFeatherMetadata() {
    return require(FEATHER_METADATA_PATH);
}
