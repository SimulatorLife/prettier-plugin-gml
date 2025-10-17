import path from "node:path";

import { isNonEmptyArray } from "../../../shared/array-utils.js";
import { toPosixPath } from "../../../shared/path-utils.js";
import { isFsErrorCode, listDirectory } from "./fs-utils.js";

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

function appendUnique(array, value) {
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
    if (!event) {
        return null;
    }

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

function ensureResourceRecord(resourcesMap, resourcePath, resourceData = {}) {
    let record = resourcesMap.get(resourcePath);
    if (record) {
        if (resourceData.name && record.name !== resourceData.name) {
            record.name = resourceData.name;
        }
        if (
            resourceData.resourceType &&
            record.resourceType !== resourceData.resourceType
        ) {
            record.resourceType = resourceData.resourceType;
        }
    } else {
        const lowerPath = resourcePath.toLowerCase();
        let defaultName = path.posix.basename(resourcePath);
        if (lowerPath.endsWith(".yy")) {
            defaultName = path.posix.basename(resourcePath, ".yy");
        } else if (lowerPath.endsWith(".yyp")) {
            defaultName = path.posix.basename(resourcePath, ".yyp");
        }
        record = {
            path: resourcePath,
            name: resourceData.name ?? defaultName,
            resourceType: resourceData.resourceType ?? "unknown",
            scopes: [],
            gmlFiles: [],
            assetReferences: []
        };
        resourcesMap.set(resourcePath, record);
    }

    return record;
}

export async function scanProjectTree(projectRoot, fsFacade, metrics = null) {
    const yyFiles = [];
    const gmlFiles = [];
    const pending = ["."];

    while (pending.length > 0) {
        const relativeDir = pending.pop();
        const absoluteDir = path.join(projectRoot, relativeDir);
        const entries = await listDirectory(fsFacade, absoluteDir);
        metrics?.incrementCounter("io.directoriesScanned");

        for (const entry of entries) {
            const relativePath = path.join(relativeDir, entry);
            const absolutePath = path.join(projectRoot, relativePath);
            let stats;
            try {
                stats = await fsFacade.stat(absolutePath);
            } catch (error) {
                if (isFsErrorCode(error, "ENOENT")) {
                    metrics?.incrementCounter("io.skippedMissingEntries");
                    continue;
                }
                throw error;
            }

            if (
                typeof stats?.isDirectory === "function" &&
                stats.isDirectory()
            ) {
                pending.push(relativePath);
                continue;
            }

            const relativePosix = toPosixPath(relativePath);
            const lowerPath = relativePosix.toLowerCase();
            if (lowerPath.endsWith(".yy") || lowerPath.endsWith(".yyp")) {
                yyFiles.push({
                    absolutePath,
                    relativePath: relativePosix
                });
                metrics?.incrementCounter("files.yyDiscovered");
            } else if (lowerPath.endsWith(".gml")) {
                gmlFiles.push({
                    absolutePath,
                    relativePath: relativePosix
                });
                metrics?.incrementCounter("files.gmlDiscovered");
            }
        }
    }

    yyFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    gmlFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return { yyFiles, gmlFiles };
}

export async function analyseResourceFiles({ projectRoot, yyFiles, fsFacade }) {
    const resourcesMap = new Map();
    const gmlScopeMap = new Map();
    const assetReferences = [];
    const scriptNameToScopeId = new Map();
    const scriptNameToResourcePath = new Map();

    for (const file of yyFiles) {
        let rawContents;
        try {
            rawContents = await fsFacade.readFile(file.absolutePath, "utf8");
        } catch (error) {
            if (isFsErrorCode(error, "ENOENT")) {
                continue;
            }
            throw error;
        }

        let parsed;
        try {
            parsed = JSON.parse(rawContents);
        } catch {
            // Skip invalid JSON entries but continue scanning.
            continue;
        }

        const resourceRecord = ensureResourceRecord(
            resourcesMap,
            file.relativePath,
            {
                name: parsed?.name,
                resourceType: parsed?.resourceType
            }
        );

        const resourceDir = path.posix.dirname(file.relativePath);

        if (parsed?.resourceType === "GMScript") {
            const gmlRelativePath = path.posix.join(
                resourceDir,
                `${resourceRecord.name}.gml`
            );
            appendUnique(resourceRecord.gmlFiles, gmlRelativePath);

            const descriptor = createScriptScopeDescriptor(
                resourceRecord,
                gmlRelativePath
            );
            gmlScopeMap.set(gmlRelativePath, descriptor);
            appendUnique(resourceRecord.scopes, descriptor.id);

            scriptNameToScopeId.set(resourceRecord.name, descriptor.id);
            scriptNameToResourcePath.set(
                resourceRecord.name,
                resourceRecord.path
            );
        }

        const eventList = parsed?.eventList;
        if (isNonEmptyArray(eventList)) {
            for (const event of eventList) {
                const eventGmlPath = extractEventGmlPath(
                    event,
                    resourceRecord,
                    resourceDir
                );
                if (!eventGmlPath) {
                    continue;
                }

                appendUnique(resourceRecord.gmlFiles, eventGmlPath);
                const descriptor = createObjectEventScopeDescriptor(
                    resourceRecord,
                    event,
                    eventGmlPath
                );

                gmlScopeMap.set(eventGmlPath, descriptor);
                appendUnique(resourceRecord.scopes, descriptor.id);
            }
        }

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
                    fromResourcePath: file.relativePath,
                    fromResourceName: resourceRecord.name,
                    propertyPath,
                    targetPath: normalizedTarget,
                    targetName: targetName ?? null,
                    targetResourceType: null
                };
                assetReferences.push(referenceRecord);
                resourceRecord.assetReferences.push(referenceRecord);
            }
        );
    }

    for (const reference of assetReferences) {
        const targetResource = resourcesMap.get(reference.targetPath);
        if (targetResource) {
            reference.targetResourceType = targetResource.resourceType;
            if (!reference.targetName && targetResource.name) {
                reference.targetName = targetResource.name;
            }
        }
    }

    return {
        resourcesMap,
        gmlScopeMap,
        assetReferences,
        scriptNameToScopeId,
        scriptNameToResourcePath
    };
}
