import {
    parseJsonWithContext,
    normalizeIdentifierMetadataEntries,
    areNumbersApproximatelyEqual,
    isPlainObject
} from "../dependencies.js";
import { GML_IDENTIFIER_METADATA_PATH } from "../resources/bundled-resources.js";

import { defaultFsFacade } from "./fs-facade.js";
import { createProjectIndexAbortGuard } from "./abort-guard.js";
import { getFileMtime } from "./fs-helpers.js";

const GML_IDENTIFIER_FILE_PATH = GML_IDENTIFIER_METADATA_PATH;

let cachedBuiltInIdentifiers = null;

function extractBuiltInIdentifierNames(payload) {
    if (!isPlainObject(payload)) {
        throw new TypeError(
            "Built-in identifier metadata must be an object payload."
        );
    }

    const { identifiers } = payload;
    if (!isPlainObject(identifiers)) {
        throw new TypeError(
            "Built-in identifier metadata must expose an identifiers object."
        );
    }

    const entries = normalizeIdentifierMetadataEntries(payload);
    const names = new Set();

    for (const { name, type } of entries) {
        if (type.length === 0) {
            continue;
        }

        names.add(name);
    }

    return names;
}

function parseBuiltInIdentifierNames(rawContents) {
    const payload = parseJsonWithContext(rawContents, {
        source: GML_IDENTIFIER_FILE_PATH,
        description: "built-in identifier metadata"
    });

    return extractBuiltInIdentifierNames(payload);
}

function areMtimesEquivalent(cachedMtime, currentMtime) {
    if (cachedMtime === currentMtime) {
        return true;
    }

    if (typeof cachedMtime !== "number" || typeof currentMtime !== "number") {
        return false;
    }

    return areNumbersApproximatelyEqual(cachedMtime, currentMtime);
}

export async function loadBuiltInIdentifiers(
    fsFacade = defaultFsFacade,
    metrics = null,
    options = {}
) {
    const { fallbackMessage, ...guardOptions } = options ?? {};
    const { signal, ensureNotAborted } = createProjectIndexAbortGuard(
        guardOptions,
        { fallbackMessage }
    );

    const currentMtime = await getFileMtime(
        fsFacade,
        GML_IDENTIFIER_FILE_PATH,
        { signal }
    );
    ensureNotAborted();
    const cached = cachedBuiltInIdentifiers;
    const cachedMtime = cached?.metadata?.mtimeMs ?? null;

    if (cached && areMtimesEquivalent(cachedMtime, currentMtime)) {
        metrics?.caches?.recordHit("builtInIdentifiers");
        return cached;
    }

    if (cached) {
        metrics?.caches?.recordStale("builtInIdentifiers");
    } else {
        metrics?.caches?.recordMiss("builtInIdentifiers");
    }

    let names = new Set();

    try {
        const rawContents = await fsFacade.readFile(
            GML_IDENTIFIER_FILE_PATH,
            "utf8"
        );
        ensureNotAborted();
        names = parseBuiltInIdentifierNames(rawContents);
    } catch {
        // Built-in identifier metadata ships with the formatter bundle; if the
        // file is missing or unreadable we intentionally degrade to an empty
        // set rather than aborting project indexing. That keeps the CLI usable
        // when installations are partially upgraded or when read permissions
        // are restricted, and the metrics recorder above still notes the cache
        // miss for observability.
    }

    cachedBuiltInIdentifiers = {
        metadata: { mtimeMs: currentMtime },
        names
    };

    return cachedBuiltInIdentifiers;
}

export { GML_IDENTIFIER_FILE_PATH as __BUILT_IN_IDENTIFIER_PATH_FOR_TESTS };
export const __loadBuiltInIdentifiersForTests = loadBuiltInIdentifiers;
