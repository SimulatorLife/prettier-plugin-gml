import path from "node:path";

import { toPosixPath } from "../../../shared/path-utils.js";
import { isNonEmptyArray } from "../../../shared/array-utils.js";
import { getOrCreateMapEntry } from "../../../shared/object-utils.js";
import {
    resolveAbortSignalFromOptions,
    throwIfAborted
} from "../../../shared/abort-utils.js";

import { isFsErrorCode } from "./fs-utils.js";
import {
    PROJECT_MANIFEST_EXTENSION,
    isProjectManifestPath
} from "./constants.js";

const RESOURCE_ANALYSIS_ABORT_MESSAGE = "Project index build was aborted.";

function pushUnique(array, value) {
    if (!array.includes(value)) {
        array.push(value);
    }
}

function deriveScopeId(kind, parts) {
    const suffix = Array.isArray(parts)
        ? parts.join("::")
        : String(parts ?? "");
    return `scope:${kind}:${suffix}`;
}

function toProjectRelativePath(projectRoot, absolutePath) {
    const relative = path.relative(projectRoot, absolutePath);
    return toPosixPath(relative);
}

function normalizeResourcePath(rawPath, { projectRoot } = {}) {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
        return null;
    }

    const normalized = toPosixPath(rawPath).replace(/^\.\//, "");
    if (!projectRoot) {
        return normalized;
    }

    const absoluteCandidate = path.isAbsolute(normalized)
        ? normalized
        : path.join(projectRoot, normalized);
    return toProjectRelativePath(projectRoot, absoluteCandidate);
}

function ensureResourceRecord(resourcesMap, resourcePath, resourceData = {}) {
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
            name: resourceData.name ?? defaultName,
            resourceType: resourceData.resourceType ?? "unknown",
            scopes: [],
            gmlFiles: [],
            assetReferences: []
        };
    });

    if (resourceData.name && record.name !== resourceData.name) {
        record.name = resourceData.name;
    }
    if (
        resourceData.resourceType &&
        record.resourceType !== resourceData.resourceType
    ) {
        record.resourceType = resourceData.resourceType;
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

function resolveEventMetadata(event) {
    const eventType =
        typeof event?.eventType === "number"
            ? event.eventType
            : typeof event?.eventtype === "number"
              ? event.eventtype
              : null;
    const eventNum =
        typeof event?.eventNum === "number"
            ? event.eventNum
            : typeof event?.enumb === "number"
              ? event.enumb
              : null;

    if (event && typeof event.name === "string" && event.name.trim()) {
        return { eventType, eventNum, displayName: event.name };
    }

    if (eventType == undefined && eventNum == undefined) {
        return { eventType, eventNum, displayName: "event" };
    }

    if (eventNum == undefined) {
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
        const normalized = normalizeResourcePath(candidate);
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

function collectAssetReferences(root, callback) {
    if (!root || typeof root !== "object") {
        return;
    }

    const stack = [{ value: root, path: "" }];

    while (stack.length > 0) {
        const { value, path } = stack.pop();

        if (Array.isArray(value)) {
            for (let index = value.length - 1; index >= 0; index -= 1) {
                const entry = value[index];
                if (!entry || typeof entry !== "object") {
                    continue;
                }

                stack.push({
                    value: entry,
                    path: path ? `${path}.${index}` : String(index)
                });
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
            if (!child || typeof child !== "object") {
                continue;
            }

            stack.push({
                value: child,
                path: path ? `${path}.${key}` : key
            });
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
    const signal = resolveAbortSignalFromOptions(options, {
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

    throwIfAborted(signal, RESOURCE_ANALYSIS_ABORT_MESSAGE);

    try {
        return JSON.parse(rawContents);
    } catch {
        return null;
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
            const normalizedTarget = normalizeResourcePath(targetPath, {
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
