import path from "node:path";

import { isNonEmptyArray, pushUnique } from "../../../shared/array-utils.js";
import { isNonEmptyTrimmedString } from "../../../shared/string-utils.js";
import { getOrCreateMapEntry } from "../../../shared/object-utils.js";
import {
    createAbortGuard,
    throwIfAborted
} from "../../../shared/abort-utils.js";

import { isFsErrorCode } from "../../../shared/fs-utils.js";
import {
    isJsonParseError,
    parseJsonWithContext
} from "../../../shared/json-utils.js";
import {
    PROJECT_MANIFEST_EXTENSION,
    isProjectManifestPath
} from "./constants.js";
import { normalizeProjectResourcePath } from "./path-normalization.js";

const RESOURCE_ANALYSIS_ABORT_MESSAGE = "Project index build was aborted.";

function normalizeResourceDocumentMetadata(resourceData) {
    if (!resourceData || typeof resourceData !== "object") {
        return { name: null, resourceType: null };
    }

    const { name, resourceType } = resourceData;
    const normalizedName = isNonEmptyTrimmedString(name) ? name : null;
    const normalizedResourceType = isNonEmptyTrimmedString(resourceType)
        ? resourceType
        : null;

    return { name: normalizedName, resourceType: normalizedResourceType };
}

function deriveScopeId(kind, parts) {
    const suffix = Array.isArray(parts)
        ? parts.join("::")
        : String(parts ?? "");
    return `scope:${kind}:${suffix}`;
}

function ensureResourceRecord(resourcesMap, resourcePath, resourceData = {}) {
    const { name: normalizedName, resourceType: normalizedResourceType } =
        normalizeResourceDocumentMetadata(resourceData);
    const record = getOrCreateMapEntry(resourcesMap, resourcePath, () => {
        const lowerPath = resourcePath.toLowerCase();
        let defaultName = path.posix.basename(resourcePath);
        if (lowerPath.endsWith(".yy")) {
            defaultName = path.posix.basename(resourcePath, ".yy");
        } else if (isProjectManifestPath(resourcePath)) {
            defaultName = path.posix.basename(
                resourcePath,
                PROJECT_MANIFEST_EXTENSION
            );
        }

        return {
            path: resourcePath,
            name: normalizedName ?? defaultName,
            resourceType: normalizedResourceType ?? "unknown",
            scopes: [],
            gmlFiles: [],
            assetReferences: []
        };
    });

    if (normalizedName && record.name !== normalizedName) {
        record.name = normalizedName;
    }
    if (
        normalizedResourceType &&
        record.resourceType !== normalizedResourceType
    ) {
        record.resourceType = normalizedResourceType;
    }

    return record;
}

function createScriptScopeDescriptor(resourceRecord, gmlRelativePath) {
    const scopeId = deriveScopeId("script", [resourceRecord.name]);
    return {
        id: scopeId,
        kind: "script",
        name: resourceRecord.name,
        displayName: `script.${resourceRecord.name}`,
        resourcePath: resourceRecord.path,
        gmlFile: gmlRelativePath
    };
}

function getNumericEventField(event, keys) {
    for (const key of keys) {
        const value = event?.[key];
        if (typeof value === "number") {
            return value;
        }
    }

    return null;
}

function resolveEventMetadata(event) {
    const eventType = getNumericEventField(event, ["eventType", "eventtype"]);
    const eventNum = getNumericEventField(event, ["eventNum", "enumb"]);

    if (isNonEmptyTrimmedString(event?.name)) {
        return { eventType, eventNum, displayName: event.name };
    }

    if (eventType == null && eventNum == null) {
        return { eventType, eventNum, displayName: "event" };
    }

    if (eventNum == null) {
        return { eventType, eventNum, displayName: String(eventType) };
    }

    return { eventType, eventNum, displayName: `${eventType}_${eventNum}` };
}

function createObjectEventScopeDescriptor(
    resourceRecord,
    event,
    gmlRelativePath
) {
    const { displayName, eventType, eventNum } = resolveEventMetadata(event);
    const scopeId = deriveScopeId("object", [resourceRecord.name, displayName]);
    return {
        id: scopeId,
        kind: "objectEvent",
        name: `${resourceRecord.name}.${displayName}`,
        displayName: `object.${resourceRecord.name}.${displayName}`,
        resourcePath: resourceRecord.path,
        gmlFile: gmlRelativePath,
        event: {
            name: displayName,
            eventType,
            eventNum
        }
    };
}

export function createFileScopeDescriptor(relativePath) {
    const fileBaseName = path.posix.basename(
        relativePath,
        path.extname(relativePath)
    );
    const scopeId = deriveScopeId("file", [relativePath]);
    return {
        id: scopeId,
        kind: "file",
        name: fileBaseName,
        displayName: `file.${relativePath}`,
        resourcePath: null,
        gmlFile: relativePath
    };
}

function extractEventGmlPath(event, resourceRecord, resourceRelativeDir) {
    const { displayName } = resolveEventMetadata(event);
    const candidatePaths = [];
    if (typeof event.eventContents === "string") {
        candidatePaths.push(event.eventContents);
    }
    if (typeof event.event === "string") {
        candidatePaths.push(event.event);
    }
    if (event.event && typeof event.event.path === "string") {
        candidatePaths.push(event.event.path);
    }
    if (event.eventId && typeof event.eventId.path === "string") {
        candidatePaths.push(event.eventId.path);
    }
    if (event.code && typeof event.code === "string") {
        candidatePaths.push(event.code);
    }

    for (const candidate of candidatePaths) {
        const normalized = normalizeProjectResourcePath(candidate);
        if (normalized) {
            return normalized;
        }
    }

    if (!resourceRecord?.name) {
        return null;
    }

    const guessed = path.posix.join(
        resourceRelativeDir,
        `${resourceRecord.name}_${displayName}.gml`
    );
    return guessed;
}

function pushChildNode(stack, parentPath, key, candidate) {
    if (!candidate || typeof candidate !== "object") {
        return;
    }

    const childPath = parentPath ? `${parentPath}.${key}` : String(key);
    stack.push({ value: candidate, path: childPath });
}

function collectAssetReferences(root, callback) {
    if (!root || typeof root !== "object") {
        return;
    }

    const stack = [{ value: root, path: "" }];

    while (stack.length > 0) {
        const { value, path } = stack.pop();

        if (Array.isArray(value)) {
            for (let index = value.length - 1; index >= 0; index -= 1) {
                pushChildNode(stack, path, index, value[index]);
            }
            continue;
        }

        if (typeof value.path === "string") {
            callback({
                propertyPath: path,
                targetPath: value.path,
                targetName: typeof value.name === "string" ? value.name : null
            });
        }

        const entries = Object.entries(value);
        for (let i = entries.length - 1; i >= 0; i -= 1) {
            const [key, child] = entries[i];
            pushChildNode(stack, path, key, child);
        }
    }
}

function createResourceAnalysisContext() {
    return {
        resourcesMap: new Map(),
        gmlScopeMap: new Map(),
        assetReferences: [],
        scriptNameToScopeId: new Map(),
        scriptNameToResourcePath: new Map()
    };
}

async function loadResourceDocument(file, fsFacade, options = {}) {
    const { ensureNotAborted } = createAbortGuard(options, {
        fallbackMessage: RESOURCE_ANALYSIS_ABORT_MESSAGE
    });
    let rawContents;
    try {
        rawContents = await fsFacade.readFile(file.absolutePath, "utf8");
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }

    ensureNotAborted();

    try {
        return parseJsonWithContext(rawContents, {
            source: file.absolutePath ?? file.relativePath,
            description: "resource document"
        });
    } catch (error) {
        if (isJsonParseError(error)) {
            return null;
        }
        throw error;
    }
}

function ensureResourceRecordForDocument(context, file, parsed) {
    return ensureResourceRecord(context.resourcesMap, file.relativePath, {
        name: parsed?.name,
        resourceType: parsed?.resourceType
    });
}

function attachScopeDescriptor({
    context,
    resourceRecord,
    gmlRelativePath,
    descriptor
}) {
    pushUnique(resourceRecord.gmlFiles, gmlRelativePath);
    context.gmlScopeMap.set(gmlRelativePath, descriptor);
    pushUnique(resourceRecord.scopes, descriptor.id);
}

function registerScriptResourceIfNeeded({
    context,
    parsed,
    resourceRecord,
    resourceDir
}) {
    if (parsed?.resourceType !== "GMScript") {
        return;
    }

    const gmlRelativePath = path.posix.join(
        resourceDir,
        `${resourceRecord.name}.gml`
    );
    const descriptor = createScriptScopeDescriptor(
        resourceRecord,
        gmlRelativePath
    );

    attachScopeDescriptor({
        context,
        resourceRecord,
        gmlRelativePath,
        descriptor
    });

    context.scriptNameToScopeId.set(resourceRecord.name, descriptor.id);
    context.scriptNameToResourcePath.set(
        resourceRecord.name,
        resourceRecord.path
    );
}

function registerResourceEvents({
    context,
    parsed,
    resourceRecord,
    resourceDir
}) {
    const eventList = parsed?.eventList;
    if (!isNonEmptyArray(eventList)) {
        return;
    }

    for (const event of eventList) {
        const eventGmlPath = extractEventGmlPath(
            event,
            resourceRecord,
            resourceDir
        );
        if (!eventGmlPath) {
            continue;
        }

        const descriptor = createObjectEventScopeDescriptor(
            resourceRecord,
            event,
            eventGmlPath
        );

        attachScopeDescriptor({
            context,
            resourceRecord,
            gmlRelativePath: eventGmlPath,
            descriptor
        });
    }
}

function collectResourceAssetReferences({
    context,
    parsed,
    resourceRecord,
    resourcePath,
    projectRoot
}) {
    collectAssetReferences(
        parsed,
        ({ propertyPath, targetPath, targetName }) => {
            const normalizedTarget = normalizeProjectResourcePath(targetPath, {
                projectRoot
            });
            if (!normalizedTarget) {
                return;
            }

            const referenceRecord = {
                fromResourcePath: resourcePath,
                fromResourceName: resourceRecord.name,
                propertyPath,
                targetPath: normalizedTarget,
                targetName: targetName ?? null,
                targetResourceType: null
            };

            context.assetReferences.push(referenceRecord);
            resourceRecord.assetReferences.push(referenceRecord);
        }
    );
}

function processResourceDocument({
    context,
    parsed,
    resourceRecord,
    resourcePath,
    projectRoot
}) {
    const resourceDir = path.posix.dirname(resourcePath);

    registerScriptResourceIfNeeded({
        context,
        parsed,
        resourceRecord,
        resourceDir
    });

    registerResourceEvents({
        context,
        parsed,
        resourceRecord,
        resourceDir
    });

    collectResourceAssetReferences({
        context,
        parsed,
        resourceRecord,
        resourcePath,
        projectRoot
    });
}

function annotateAssetReferenceTargets(assetReferences, resourcesMap) {
    for (const reference of assetReferences) {
        const targetResource = resourcesMap.get(reference.targetPath);
        if (targetResource) {
            reference.targetResourceType = targetResource.resourceType;
            if (!reference.targetName && targetResource.name) {
                reference.targetName = targetResource.name;
            }
        }
    }
}

export async function analyseResourceFiles({
    projectRoot,
    yyFiles,
    fsFacade,
    signal = null
}) {
    const context = createResourceAnalysisContext();

    for (const file of yyFiles) {
        throwIfAborted(signal, RESOURCE_ANALYSIS_ABORT_MESSAGE);
        const parsed = await loadResourceDocument(file, fsFacade, { signal });
        if (!parsed) {
            continue;
        }

        const resourceRecord = ensureResourceRecordForDocument(
            context,
            file,
            parsed
        );

        processResourceDocument({
            context,
            parsed,
            resourceRecord,
            resourcePath: file.relativePath,
            projectRoot
        });
    }

    annotateAssetReferenceTargets(
        context.assetReferences,
        context.resourcesMap
    );

    return context;
}
