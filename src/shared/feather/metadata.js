// Lightweight helpers for accessing the bundled Feather metadata artefact.
//
// The formatter needs to query individual diagnostics to understand
// the intent behind specific auto-fixes. Centralising the metadata
// access keeps downstream modules from worrying about relative path
// resolution or cache management.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let cachedMetadata = null;

function loadFeatherMetadata() {
    if (cachedMetadata) {
        return cachedMetadata;
    }

    const metadata = require("../../../resources/feather-metadata.json");
    cachedMetadata = metadata;
    return metadata;
}

export function getFeatherMetadata() {
    return loadFeatherMetadata();
}

export function getFeatherDiagnosticById(id) {
    if (!id) {
        return null;
    }

    const metadata = loadFeatherMetadata();
    const diagnostics = metadata?.diagnostics;

    if (!Array.isArray(diagnostics)) {
        return null;
    }

    return diagnostics.find((diagnostic) => diagnostic?.id === id) ?? null;
}

