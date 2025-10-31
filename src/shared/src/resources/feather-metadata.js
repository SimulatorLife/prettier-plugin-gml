import { createRequire } from "node:module";

import { asArray, assertArray } from "../utils/array.js";
import { assertPlainObject } from "../utils/object.js";
import { toTrimmedString } from "../utils/string.js";
import {
    resolveBundledResourcePath,
    resolveBundledResourceUrl
} from "./resource-locator.js";

const require = createRequire(import.meta.url);

export const FEATHER_METADATA_URL = resolveBundledResourceUrl(
    "feather-metadata.json"
);

export const FEATHER_METADATA_PATH = resolveBundledResourcePath(
    "feather-metadata.json"
);

export function loadBundledFeatherMetadata() {
    return require(FEATHER_METADATA_PATH);
}

function normalizeFeatherDiagnostic(diagnostic, index) {
    const normalizedDiagnostic = assertPlainObject(diagnostic, {
        name: `Feather metadata diagnostics[${index}]`
    });

    const normalizedId = toTrimmedString(normalizedDiagnostic.id);
    if (normalizedId.length === 0) {
        throw new TypeError(
            `Feather metadata diagnostics[${index}] must declare a non-empty id.`
        );
    }

    if (normalizedDiagnostic.id === normalizedId) {
        return normalizedDiagnostic;
    }

    return { ...normalizedDiagnostic, id: normalizedId };
}

function normalizeFeatherDiagnostics(diagnostics) {
    const normalizedDiagnostics = assertArray(diagnostics, {
        allowNull: true,
        errorMessage:
            "Feather metadata diagnostics must be provided as an array."
    });

    return normalizedDiagnostics.map((diagnostic, index) =>
        normalizeFeatherDiagnostic(diagnostic, index)
    );
}

function normalizeFeatherMetadata(payload) {
    const metadata = assertPlainObject(payload, {
        name: "Feather metadata"
    });

    return {
        ...metadata,
        diagnostics: normalizeFeatherDiagnostics(metadata.diagnostics)
    };
}

/**
 * Lightweight helpers for accessing the bundled Feather metadata artefact.
 *
 * The formatter queries individual diagnostics to understand the intent
 * behind specific auto-fixes. Centralizing metadata access keeps downstream
 * modules from worrying about relative path resolution or cache management.
 */

/**
 * @typedef {object} FeatherDiagnostic
 * @property {string} [id]
 */

/**
 * @typedef {object} FeatherMetadata
 * @property {Array<FeatherDiagnostic>} [diagnostics]
 */

/** @type {FeatherMetadata | null} */
let cachedMetadata = null;

function loadFeatherMetadata() {
    if (cachedMetadata) {
        return cachedMetadata;
    }

    /** @type {FeatherMetadata} */
    const metadata = loadBundledFeatherMetadata();
    const normalizedMetadata = normalizeFeatherMetadata(metadata);
    cachedMetadata = normalizedMetadata;
    return normalizedMetadata;
}

/**
 * Retrieve the shared Feather metadata payload bundled with the semantic
 * package.
 *
 * @returns {FeatherMetadata} Bundled Feather metadata payload.
 */
export function getFeatherMetadata() {
    return loadFeatherMetadata();
}

/**
 * Return the list of Feather diagnostics declared in the bundled metadata.
 *
 * @returns {Array<FeatherDiagnostic>} Array of diagnostics declared in the bundled metadata.
 */
export function getFeatherDiagnostics() {
    const metadata = loadFeatherMetadata();
    return asArray(metadata?.diagnostics);
}

/**
 * Look up a single Feather diagnostic by its identifier.
 *
 * @param {string | null | undefined} id Diagnostic identifier to find.
 * @returns {FeatherDiagnostic | null} Matching diagnostic when found; otherwise `null`.
 */
export function getFeatherDiagnosticById(id) {
    const normalizedId = toTrimmedString(id);
    if (!normalizedId) {
        return null;
    }

    const diagnostics = getFeatherDiagnostics();

    return (
        diagnostics.find(
            (diagnostic) => toTrimmedString(diagnostic?.id) === normalizedId
        ) ?? null
    );
}

export const __normalizeFeatherMetadataForTests = normalizeFeatherMetadata;
