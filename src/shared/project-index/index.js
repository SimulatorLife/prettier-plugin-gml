import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import GMLParser from "../../parser/gml-parser.js";
import { cloneLocation } from "../ast-locations.js";

export const PROJECT_MANIFEST_EXTENSION = ".yyp";

const defaultFsFacade = {
    async readDir(targetPath) {
        return fs.readdir(targetPath);
    },
    async stat(targetPath) {
        return fs.stat(targetPath);
    },
    async readFile(targetPath, encoding = "utf8") {
        return fs.readFile(targetPath, encoding);
    }
};

export function getDefaultFsFacade() {
    return defaultFsFacade;
}

function isManifestEntry(entry) {
    return (
        typeof entry === "string" &&
    entry.toLowerCase().endsWith(PROJECT_MANIFEST_EXTENSION)
    );
}

async function listDirectory(fsFacade, directoryPath) {
    try {
        return await fsFacade.readDir(directoryPath);
    } catch (error) {
        if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
            return [];
        }
        throw error;
    }
}

async function getFileMtime(fsFacade, filePath) {
    try {
        const stats = await fsFacade.stat(filePath);
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

export async function findProjectRoot(options, fsFacade = defaultFsFacade) {
    const filepath = options?.filepath;
    if (!filepath) {
        return null;
    }

    let current = path.dirname(path.resolve(filepath));
    const visited = new Set();

    while (!visited.has(current)) {
        visited.add(current);
        const entries = await listDirectory(fsFacade, current);
        const hasManifest = entries.some(isManifestEntry);
        if (hasManifest) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    return null;
}

export async function deriveCacheKey(
    { filepath, projectRoot, formatterVersion = "dev" },
    fsFacade = defaultFsFacade
) {
    const hash = createHash("sha256");
    hash.update(String(formatterVersion));
    hash.update("\0");

    const resolvedRoot = projectRoot ? path.resolve(projectRoot) : "";
    hash.update(resolvedRoot);
    hash.update("\0");

    if (resolvedRoot) {
        const entries = await listDirectory(fsFacade, resolvedRoot);
        const manifestNames = entries
            .filter(isManifestEntry)
            .sort((a, b) => a.localeCompare(b));

        for (const manifestName of manifestNames) {
            const manifestPath = path.join(resolvedRoot, manifestName);
            const mtime = await getFileMtime(fsFacade, manifestPath);
            if (mtime !== null) {
                hash.update(manifestName);
                hash.update("\0");
                hash.update(String(mtime));
                hash.update("\0");
            }
        }
    }

    if (filepath) {
        const resolvedFile = path.resolve(filepath);
        const mtime = await getFileMtime(fsFacade, resolvedFile);
        if (mtime !== null) {
            hash.update(
                path.relative(
                    resolvedRoot || path.parse(resolvedFile).root,
                    resolvedFile
                )
            );
            hash.update("\0");
            hash.update(String(mtime));
            hash.update("\0");
        }
    }

    return hash.digest("hex");
}

export async function loadProjectIndexCache(/* projectRoot, fsFacade = defaultFsFacade */) {
    // TODO: Load previously persisted project index metadata from disk.
    return null;
}

export async function saveProjectIndexCache(/* projectRoot, cacheData, fsFacade = defaultFsFacade */) {
    // TODO: Persist project index metadata so later formatter runs can reuse it.
}

export function createProjectIndexCoordinator() {
    // TODO: Track in-flight formatter runs so that multiple invocations can share
    // a single project index load.
    return {
        async ensureReady(/* projectRoot */) {
            // TODO: Implement coordination once the cache lifecycle is defined.
        }
    };
}

const GML_IDENTIFIER_FILE_PATH = fileURLToPath(
    new URL("../../../resources/gml-identifiers.json", import.meta.url)
);

let cachedBuiltInIdentifiers = null;

async function loadBuiltInIdentifiers(fsFacade = defaultFsFacade) {
    if (cachedBuiltInIdentifiers) {
        return cachedBuiltInIdentifiers;
    }

    try {
        const rawContents = await fsFacade.readFile(
            GML_IDENTIFIER_FILE_PATH,
            "utf8"
        );
        const parsed = JSON.parse(rawContents);
        const identifiers = parsed?.identifiers ?? {};

        const names = new Set();
        for (const name of Object.keys(identifiers)) {
            names.add(name);
        }

        cachedBuiltInIdentifiers = {
            metadata: identifiers,
            names
        };
    } catch {
        cachedBuiltInIdentifiers = {
            metadata: {},
            names: new Set()
        };
    }

    return cachedBuiltInIdentifiers;
}

function toPosixPath(inputPath) {
    if (!inputPath) {
        return "";
    }

    return inputPath.replace(/\\+/g, "/");
}

function toProjectRelativePath(projectRoot, absolutePath) {
    const relative = path.relative(projectRoot, absolutePath);
    return toPosixPath(relative);
}

function normaliseResourcePath(rawPath, { projectRoot } = {}) {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
        return null;
    }

    const normalised = toPosixPath(rawPath).replace(/^\.\//, "");
    if (!projectRoot) {
        return normalised;
    }

    const absoluteCandidate = path.isAbsolute(normalised)
        ? normalised
        : path.join(projectRoot, normalised);
    return toProjectRelativePath(projectRoot, absoluteCandidate);
}

async function scanProjectTree(projectRoot, fsFacade) {
    const yyFiles = [];
    const gmlFiles = [];
    const pending = ["."];

    while (pending.length > 0) {
        const relativeDir = pending.pop();
        const absoluteDir = path.join(projectRoot, relativeDir);
        const entries = await listDirectory(fsFacade, absoluteDir);

        for (const entry of entries) {
            const relativePath = path.join(relativeDir, entry);
            const absolutePath = path.join(projectRoot, relativePath);
            let stats;
            try {
                stats = await fsFacade.stat(absolutePath);
            } catch (error) {
                if (error && error.code === "ENOENT") {
                    continue;
                }
                throw error;
            }

            if (typeof stats?.isDirectory === "function" && stats.isDirectory()) {
                pending.push(relativePath);
                continue;
            }

            const relativePosix = toPosixPath(relativePath);
            if (relativePosix.toLowerCase().endsWith(".yy")) {
                yyFiles.push({
                    absolutePath,
                    relativePath: relativePosix
                });
            } else if (relativePosix.toLowerCase().endsWith(".gml")) {
                gmlFiles.push({
                    absolutePath,
                    relativePath: relativePosix
                });
            }
        }
    }

    yyFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    gmlFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return { yyFiles, gmlFiles };
}

function ensureResourceRecord(resourcesMap, resourcePath, resourceData = {}) {
    let record = resourcesMap.get(resourcePath);
    if (!record) {
        record = {
            path: resourcePath,
            name: resourceData.name ?? path.posix.basename(resourcePath, ".yy"),
            resourceType: resourceData.resourceType ?? "unknown",
            scopes: [],
            gmlFiles: [],
            assetReferences: []
        };
        resourcesMap.set(resourcePath, record);
    } else {
        if (resourceData.name && record.name !== resourceData.name) {
            record.name = resourceData.name;
        }
        if (
            resourceData.resourceType &&
      record.resourceType !== resourceData.resourceType
        ) {
            record.resourceType = resourceData.resourceType;
        }
    }

    return record;
}

function pushUnique(array, value) {
    if (!array.includes(value)) {
        array.push(value);
    }
}

function deriveScopeId(kind, parts) {
    const suffix = Array.isArray(parts) ? parts.join("::") : String(parts ?? "");
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

function deriveEventDisplayName(event) {
    if (event && typeof event.name === "string" && event.name.trim()) {
        return event.name;
    }

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

    if (eventType == null && eventNum == null) {
        return "event";
    }

    if (eventNum == null) {
        return String(eventType);
    }

    return `${eventType}_${eventNum}`;
}

function createObjectEventScopeDescriptor(
    resourceRecord,
    event,
    gmlRelativePath
) {
    const displayName = deriveEventDisplayName(event);
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
            eventType:
        typeof event?.eventType === "number"
            ? event.eventType
            : typeof event?.eventtype === "number"
                ? event.eventtype
                : null,
            eventNum:
        typeof event?.eventNum === "number"
            ? event.eventNum
            : typeof event?.enumb === "number"
                ? event.enumb
                : null
        }
    };
}

function createFileScopeDescriptor(relativePath) {
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
        const normalised = normaliseResourcePath(candidate);
        if (normalised) {
            return normalised;
        }
    }

    if (!resourceRecord?.name) {
        return null;
    }

    const displayName = deriveEventDisplayName(event);
    const guessed = path.posix.join(
        resourceRelativeDir,
        `${resourceRecord.name}_${displayName}.gml`
    );
    return guessed;
}

function collectAssetReferences(json, callback, pathStack = []) {
    if (Array.isArray(json)) {
        json.forEach((entry, index) => {
            collectAssetReferences(entry, callback, pathStack.concat(String(index)));
        });
        return;
    }

    if (!json || typeof json !== "object") {
        return;
    }

    if (typeof json.path === "string") {
        const propertyPath = pathStack.join(".");
        callback({
            propertyPath,
            targetPath: json.path,
            targetName: typeof json.name === "string" ? json.name : null
        });
    }

    for (const key of Object.keys(json)) {
        collectAssetReferences(json[key], callback, pathStack.concat(key));
    }
}

async function analyseResourceFiles({ projectRoot, yyFiles, fsFacade }) {
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
            if (error && error.code === "ENOENT") {
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
            pushUnique(resourceRecord.gmlFiles, gmlRelativePath);

            const descriptor = createScriptScopeDescriptor(
                resourceRecord,
                gmlRelativePath
            );
            gmlScopeMap.set(gmlRelativePath, descriptor);
            pushUnique(resourceRecord.scopes, descriptor.id);

            scriptNameToScopeId.set(resourceRecord.name, descriptor.id);
            scriptNameToResourcePath.set(resourceRecord.name, resourceRecord.path);
        }

        if (Array.isArray(parsed?.eventList) && parsed.eventList.length > 0) {
            for (const event of parsed.eventList) {
                const eventGmlPath = extractEventGmlPath(
                    event,
                    resourceRecord,
                    resourceDir
                );
                if (!eventGmlPath) {
                    continue;
                }

                pushUnique(resourceRecord.gmlFiles, eventGmlPath);
                const descriptor = createObjectEventScopeDescriptor(
                    resourceRecord,
                    event,
                    eventGmlPath
                );

                gmlScopeMap.set(eventGmlPath, descriptor);
                pushUnique(resourceRecord.scopes, descriptor.id);
            }
        }

        collectAssetReferences(
            parsed,
            ({ propertyPath, targetPath, targetName }) => {
                const normalisedTarget = normaliseResourcePath(targetPath, {
                    projectRoot
                });
                if (!normalisedTarget) {
                    return;
                }

                const referenceRecord = {
                    fromResourcePath: file.relativePath,
                    fromResourceName: resourceRecord.name,
                    propertyPath,
                    targetPath: normalisedTarget,
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

function createIdentifierRecord(node) {
    return {
        name: node?.name ?? null,
        start: cloneLocation(node?.start),
        end: cloneLocation(node?.end),
        scopeId: node?.scopeId ?? null,
        classifications: Array.isArray(node?.classifications)
            ? [...node.classifications]
            : []
    };
}

function ensureScopeRecord(scopeMap, descriptor) {
    let scopeRecord = scopeMap.get(descriptor.id);
    if (!scopeRecord) {
        scopeRecord = {
            id: descriptor.id,
            kind: descriptor.kind,
            name: descriptor.name,
            displayName: descriptor.displayName,
            resourcePath: descriptor.resourcePath,
            event: descriptor.event ?? null,
            filePaths: [],
            declarations: [],
            references: [],
            ignoredIdentifiers: [],
            scriptCalls: []
        };
        scopeMap.set(descriptor.id, scopeRecord);
    }
    return scopeRecord;
}

function ensureFileRecord(filesMap, relativePath, scopeId) {
    let fileRecord = filesMap.get(relativePath);
    if (!fileRecord) {
        fileRecord = {
            filePath: relativePath,
            scopeId,
            declarations: [],
            references: [],
            ignoredIdentifiers: [],
            scriptCalls: []
        };
        filesMap.set(relativePath, fileRecord);
    }
    return fileRecord;
}

function traverseAst(root, visitor) {
    if (!root || typeof root !== "object") {
        return;
    }

    const stack = [root];
    const seen = new Set();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object") {
            continue;
        }

        if (seen.has(node)) {
            continue;
        }
        seen.add(node);

        visitor(node);

        const values = Object.values(node);
        for (const value of values) {
            if (Array.isArray(value)) {
                for (let i = value.length - 1; i >= 0; i--) {
                    const child = value[i];
                    if (child && typeof child === "object") {
                        stack.push(child);
                    }
                }
            } else if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }
}

function analyseGmlAst({
    ast,
    builtInNames,
    scopeRecord,
    fileRecord,
    relationships,
    scriptNameToScopeId,
    scriptNameToResourcePath
}) {
    traverseAst(ast, (node) => {
        if (node?.type === "Identifier" && Array.isArray(node.classifications)) {
            const identifierRecord = createIdentifierRecord(node);
            const isBuiltIn = builtInNames.has(identifierRecord.name);
            identifierRecord.isBuiltIn = isBuiltIn;

            if (isBuiltIn) {
                identifierRecord.reason = "built-in";
                fileRecord.ignoredIdentifiers.push(identifierRecord);
                scopeRecord.ignoredIdentifiers.push(identifierRecord);
                return;
            }

            const isDeclaration =
        identifierRecord.classifications.includes("declaration");
            const isReference =
        identifierRecord.classifications.includes("reference");

            if (isDeclaration) {
                fileRecord.declarations.push(identifierRecord);
                scopeRecord.declarations.push(identifierRecord);
            }

            if (isReference) {
                fileRecord.references.push(identifierRecord);
                scopeRecord.references.push(identifierRecord);
            }
        }

        if (node?.type === "CallExpression" && node.object?.type === "Identifier") {
            const callee = node.object;
            const calleeName = callee.name;
            if (typeof calleeName !== "string") {
                return;
            }

            if (builtInNames.has(calleeName)) {
                return;
            }

            const targetScopeId = scriptNameToScopeId.get(calleeName) ?? null;
            const targetResourcePath = targetScopeId
                ? (scriptNameToResourcePath.get(calleeName) ?? null)
                : null;

            const callRecord = {
                kind: "script",
                from: {
                    filePath: fileRecord.filePath,
                    scopeId: scopeRecord.id
                },
                target: {
                    name: calleeName,
                    scopeId: targetScopeId,
                    resourcePath: targetResourcePath
                },
                isResolved: Boolean(targetScopeId),
                location: {
                    start: cloneLocation(callee.start),
                    end: cloneLocation(callee.end)
                }
            };

            fileRecord.scriptCalls.push(callRecord);
            scopeRecord.scriptCalls.push(callRecord);
            relationships.scriptCalls.push(callRecord);
        }
    });
}

function cloneAssetReference(reference) {
    return {
        fromResourcePath: reference.fromResourcePath,
        fromResourceName: reference.fromResourceName,
        propertyPath: reference.propertyPath,
        targetPath: reference.targetPath,
        targetName: reference.targetName ?? null,
        targetResourceType: reference.targetResourceType ?? null
    };
}

export async function buildProjectIndex(
    projectRoot,
    fsFacade = defaultFsFacade
) {
    if (!projectRoot) {
        throw new Error("projectRoot must be provided to buildProjectIndex");
    }

    const resolvedRoot = path.resolve(projectRoot);
    const builtInIdentifiers = await loadBuiltInIdentifiers(fsFacade);
    const builtInNames = builtInIdentifiers.names ?? new Set();

    const { yyFiles, gmlFiles } = await scanProjectTree(resolvedRoot, fsFacade);
    const resourceAnalysis = await analyseResourceFiles({
        projectRoot: resolvedRoot,
        yyFiles,
        fsFacade
    });

    const scopeMap = new Map();
    const filesMap = new Map();
    const relationships = {
        scriptCalls: [],
        assetReferences: resourceAnalysis.assetReferences.map((reference) =>
            cloneAssetReference(reference)
        )
    };

    for (const file of gmlFiles) {
        let contents;
        try {
            contents = await fsFacade.readFile(file.absolutePath, "utf8");
        } catch (error) {
            if (error && error.code === "ENOENT") {
                continue;
            }
            throw error;
        }

        const scopeDescriptor =
      resourceAnalysis.gmlScopeMap.get(file.relativePath) ??
      createFileScopeDescriptor(file.relativePath);

        const scopeRecord = ensureScopeRecord(scopeMap, scopeDescriptor);
        pushUnique(scopeRecord.filePaths, file.relativePath);

        const fileRecord = ensureFileRecord(
            filesMap,
            file.relativePath,
            scopeRecord.id
        );

        if (
            scopeDescriptor.kind === "script" &&
      !fileRecord.hasSyntheticDeclaration
        ) {
            const syntheticDeclaration = {
                name: scopeDescriptor.name,
                start: null,
                end: null,
                scopeId: scopeRecord.id,
                classifications: ["identifier", "declaration", "script"],
                isBuiltIn: false,
                isSynthetic: true
            };
            fileRecord.declarations.push({ ...syntheticDeclaration });
            scopeRecord.declarations.push({ ...syntheticDeclaration });
            fileRecord.hasSyntheticDeclaration = true;
        }

        const ast = GMLParser.parse(contents, {
            getComments: false,
            getLocations: true,
            simplifyLocations: false,
            getIdentifierMetadata: true
        });

        analyseGmlAst({
            ast,
            builtInNames,
            scopeRecord,
            fileRecord,
            relationships,
            scriptNameToScopeId: resourceAnalysis.scriptNameToScopeId,
            scriptNameToResourcePath: resourceAnalysis.scriptNameToResourcePath
        });
    }

    const resources = Object.fromEntries(
        Array.from(resourceAnalysis.resourcesMap.entries()).map(
            ([resourcePath, record]) => [
                resourcePath,
                {
                    path: record.path,
                    name: record.name,
                    resourceType: record.resourceType,
                    scopes: record.scopes.slice(),
                    gmlFiles: record.gmlFiles.slice(),
                    assetReferences: record.assetReferences.map((reference) =>
                        cloneAssetReference(reference)
                    )
                }
            ]
        )
    );

    const scopes = Object.fromEntries(
        Array.from(scopeMap.entries()).map(([scopeId, record]) => [
            scopeId,
            {
                id: record.id,
                kind: record.kind,
                name: record.name,
                displayName: record.displayName,
                resourcePath: record.resourcePath,
                event: record.event ? { ...record.event } : null,
                filePaths: record.filePaths.slice(),
                declarations: record.declarations.map((item) => ({ ...item })),
                references: record.references.map((item) => ({ ...item })),
                ignoredIdentifiers: record.ignoredIdentifiers.map((item) => ({
                    ...item
                })),
                scriptCalls: record.scriptCalls.map((call) => ({ ...call }))
            }
        ])
    );

    const files = Object.fromEntries(
        Array.from(filesMap.entries()).map(([filePath, record]) => [
            filePath,
            {
                filePath: record.filePath,
                scopeId: record.scopeId,
                declarations: record.declarations.map((item) => ({ ...item })),
                references: record.references.map((item) => ({ ...item })),
                ignoredIdentifiers: record.ignoredIdentifiers.map((item) => ({
                    ...item
                })),
                scriptCalls: record.scriptCalls.map((call) => ({ ...call }))
            }
        ])
    );

    return {
        projectRoot: resolvedRoot,
        resources,
        scopes,
        files,
        relationships
    };
}
