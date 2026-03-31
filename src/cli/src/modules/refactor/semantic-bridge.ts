import * as fs from "node:fs";
import path from "node:path";

import { Core } from "@gmloop/core";
import { Semantic } from "@gmloop/semantic";

import { ParsedLocalNamingCategoryResolver } from "./parsed-local-naming-categories.js";

type ResourceAssetReferenceRecord = {
    propertyPath: string;
    targetPath: string;
};

type ResourceMetadataRecord = {
    assetReferences: Array<ResourceAssetReferenceRecord>;
    path: string;
};

type SemanticResourceRecord = {
    name?: string;
    path?: string;
    resourceType?: string;
};

type SemanticIdentifierEntry = {
    declarationKinds?: Array<unknown>;
    declarations?: Array<Record<string, unknown>>;
    identifierId?: string;
    key?: string;
    name?: string;
    references?: Array<Record<string, unknown>>;
    resourcePath?: string;
    scopeId?: string;
};

type SemanticFileRecord = {
    declarations?: Array<Record<string, unknown>>;
    references?: Array<Record<string, unknown>>;
};

type SemanticIdentifierCollections = {
    enumMembers?: Record<string, SemanticIdentifierEntry>;
    enums?: Record<string, SemanticIdentifierEntry>;
    globalVariables?: Record<string, SemanticIdentifierEntry>;
    instanceVariables?: Record<string, SemanticIdentifierEntry>;
    macros?: Record<string, SemanticIdentifierEntry>;
    scripts?: Record<string, SemanticIdentifierEntry>;
};

type SemanticScopeRecord = {
    kind?: string;
};

type SemanticScriptCallRecord = {
    from?: {
        filePath?: string;
        scopeId?: string;
    };
    location?: {
        end?: {
            index?: number;
        };
        start?: {
            index?: number;
        };
    };
    target?: {
        name?: string;
    };
};

type MaybePromise<T> = T | Promise<T>;

type SymbolLookupResult = {
    name: string;
};

type SymbolOccurrence = {
    end: number;
    kind?: "definition" | "reference";
    path: string;
    scopeId?: string;
    start: number;
};

type FileSymbol = {
    id: string;
};

type DependentSymbol = {
    filePath: string;
    symbolId: string;
};

type BridgeNamingConventionCategory =
    | "resource"
    | "scriptResourceName"
    | "objectResourceName"
    | "roomResourceName"
    | "spriteResourceName"
    | "audioResourceName"
    | "timelineResourceName"
    | "shaderResourceName"
    | "fontResourceName"
    | "pathResourceName"
    | "animationCurveResourceName"
    | "sequenceResourceName"
    | "tilesetResourceName"
    | "particleSystemResourceName"
    | "noteResourceName"
    | "extensionResourceName"
    | "localVariable"
    | "staticVariable"
    | "globalVariable"
    | "instanceVariable"
    | "argument"
    | "catchArgument"
    | "loopIndexVariable"
    | "function"
    | "constructorFunction"
    | "structDeclaration"
    | "enum"
    | "enumMember"
    | "macro";

type BridgeNamingConventionTarget = {
    category: BridgeNamingConventionCategory;
    name: string;
    occurrences: Array<SymbolOccurrence>;
    path: string;
    scopeId: string | null;
    symbolId: string | null;
};

type WorkspaceEdit = {
    addEdit: (path: string, start: number, end: number, newText: string) => void;
    addFileRename: (oldPath: string, newPath: string) => void;
    addMetadataEdit: (path: string, content: string) => void;
    edits: Array<{ end: number; newText: string; path: string; start: number }>;
    fileRenames: Array<{ newPath: string; oldPath: string }>;
    metadataEdits: Array<{ content: string; path: string }>;
    groupByFile: () => BridgeGroupedTextEdits;
};

type BridgeTextEdit = {
    end: number;
    newText: string;
    start: number;
};

type BridgeGroupedTextEdits = Map<string, Array<BridgeTextEdit>>;
type NamingTargetPathPredicate = (candidatePath: string | null | undefined) => boolean;
type NamingTargetSink = (target: BridgeNamingConventionTarget) => void;

function toExclusiveEndIndex(endIndex: number): number {
    return endIndex + 1;
}

function resolveOccurrenceEndIndex(endIndex: unknown): number | null {
    return typeof endIndex === "number" ? toExclusiveEndIndex(endIndex) : null;
}

function createWorkspaceEdit(): WorkspaceEdit {
    const workspace = {
        edits: [] as Array<{ end: number; newText: string; path: string; start: number }>,
        fileRenames: [] as Array<{ newPath: string; oldPath: string }>,
        metadataEdits: [] as Array<{ content: string; path: string }>,
        addEdit(filePath: string, start: number, end: number, newText: string) {
            workspace.edits.push({ path: filePath, start, end, newText });
        },
        addFileRename(oldPath: string, newPath: string) {
            workspace.fileRenames.push({ oldPath, newPath });
        },
        addMetadataEdit(filePath: string, content: string) {
            workspace.metadataEdits.push({ path: filePath, content });
        },
        groupByFile() {
            const grouped: BridgeGroupedTextEdits = new Map();
            for (const edit of workspace.edits) {
                const fileEdits = grouped.get(edit.path) ?? [];
                fileEdits.push({
                    start: edit.start,
                    end: edit.end,
                    newText: edit.newText
                });
                grouped.set(edit.path, fileEdits);
            }

            for (const [groupPath, fileEdits] of grouped.entries()) {
                grouped.set(
                    groupPath,
                    fileEdits.toSorted((left, right) => right.start - left.start)
                );
            }

            return grouped;
        }
    };

    return workspace satisfies WorkspaceEdit;
}

function isResourceAssetReferenceRecord(value: unknown): value is ResourceAssetReferenceRecord {
    if (!Core.isObjectLike(value)) {
        return false;
    }
    const reference = value as Record<string, unknown>;

    return typeof reference.propertyPath === "string" && typeof reference.targetPath === "string";
}

function isResourceMetadataRecord(value: unknown): value is ResourceMetadataRecord {
    if (!Core.isObjectLike(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;

    if (typeof record.path !== "string") {
        return false;
    }

    if (!Array.isArray(record.assetReferences)) {
        return false;
    }

    return record.assetReferences.every((reference) => isResourceAssetReferenceRecord(reference));
}

/**
 * Semantic bridge that adapts @gmloop/semantic ProjectIndex to the refactor engine.
 */
export class GmlSemanticBridge {
    private readonly localNamingCategoryResolver: ParsedLocalNamingCategoryResolver;
    private projectIndex: Record<string, unknown>;
    private projectRoot: string;
    private readonly stagedMetadataContents = new Map<string, string>();

    constructor(projectIndex: unknown, projectRoot: string = process.cwd()) {
        this.projectIndex = Core.isObjectLike(projectIndex) ? (projectIndex as Record<string, unknown>) : {};
        this.projectRoot = projectRoot;
        this.localNamingCategoryResolver = new ParsedLocalNamingCategoryResolver(projectRoot);
    }

    /**
     * Reset the staged workspace overlay used while composing batch rename plans.
     */
    clearWorkspaceOverlay(): void {
        this.stagedMetadataContents.clear();
    }

    /**
     * Stage metadata rewrites from a planned workspace edit so subsequent rename
     * planning can build on the already-planned metadata state.
     */
    stageWorkspaceEdit(workspace: { metadataEdits?: Array<{ content: string; path: string }> }): void {
        if (!Array.isArray(workspace.metadataEdits)) {
            return;
        }

        for (const metadataEdit of workspace.metadataEdits) {
            if (typeof metadataEdit.path !== "string" || typeof metadataEdit.content !== "string") {
                continue;
            }

            this.stagedMetadataContents.set(metadataEdit.path, metadataEdit.content);
        }
    }

    /**
     * Get the resources map from the project index.
     */
    private get resources(): Record<string, SemanticResourceRecord> {
        return (this.projectIndex.resources ?? {}) as Record<string, SemanticResourceRecord>;
    }

    /**
     * Get the identifiers map, handling structural differences in the project index.
     */
    private get identifiers(): SemanticIdentifierCollections {
        return (this.projectIndex.identifiers ??
            this.projectIndex.identifierCollections ??
            {}) as SemanticIdentifierCollections;
    }

    /**
     * Check if a symbol exists in the project index.
     */
    hasSymbol(symbolId: string): boolean {
        return Boolean(this.findSymbolInCollections(symbolId));
    }

    /**
     * Try to find the most appropriate symbol ID for a given name.
     * Searches all collections and returns a SCIP-style symbol ID.
     */
    resolveSymbolId(name: string): string | null {
        const identifiers = this.identifiers;
        if (!identifiers) return null;

        // Search collections in priority order
        const priorityCollections = [
            "scripts",
            "macros",
            "globalVariables",
            "enums",
            "enumMembers",
            "instanceVariables"
        ];

        // 1. Try exact match first in identifiers
        for (const collectionName of priorityCollections) {
            const collection = identifiers[collectionName];
            if (!collection) continue;

            for (const key of Object.keys(collection)) {
                const entry = collection[key];

                // Check if entry itself matches
                if (entry.name === name) {
                    return this.generateScipId(entry);
                }

                // Check for nested declarations
                if (Array.isArray(entry.declarations)) {
                    for (const decl of entry.declarations) {
                        if (decl.name === name) {
                            return this.generateScipId(entry, name);
                        }
                    }
                }
            }
        }

        // 2. Try exact match in resources
        const resource = this.findResourceByName(name);
        if (resource) {
            return this.generateResourceScipId(resource);
        }

        // 3. Try case-insensitive match as valid fallback
        const lowerName = name.toLowerCase();

        // 3a. Check identifiers case-insensitive
        for (const collectionName of priorityCollections) {
            const collection = identifiers[collectionName];
            if (!collection) continue;

            for (const key of Object.keys(collection)) {
                const entry = collection[key];

                if (entry.name && entry.name.toLowerCase() === lowerName) {
                    return this.generateScipId(entry);
                }

                if (Array.isArray(entry.declarations)) {
                    for (const decl of entry.declarations) {
                        if (decl.name && decl.name.toLowerCase() === lowerName) {
                            return this.generateScipId(entry, decl.name);
                        }
                    }
                }
            }
        }

        // 3b. Check resources case-insensitive
        const resourceCaseInsensitive = this.findResourceByName(name, true);
        if (resourceCaseInsensitive) {
            return this.generateResourceScipId(resourceCaseInsensitive);
        }

        return null;
    }

    /**
     * Find all occurrences of a symbol by its base name.
     */
    getSymbolOccurrences(symbolName: string): Array<SymbolOccurrence> {
        const occurrences: Array<SymbolOccurrence> = [];
        const identifiers = this.identifiers;

        if (!identifiers) {
            return occurrences;
        }

        // 1. Search through all identifier collections in the index
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            if (!collection) continue;

            for (const key of Object.keys(collection)) {
                this.collectOccurrencesFromEntry(collection[key], symbolName, occurrences);
            }
        }

        // 2. Search through general relationships for any script calls that matched the name
        // but weren't resolved to a specific identifier entry (useful for modern GML functions)
        this.collectOccurrencesFromRelationships(symbolName, occurrences);

        // Fallback to file-system scanning only when indexed structures produced
        // no hits and the symbol is a known resource. This avoids repeated full
        // project scans during large rename batches while preserving support for
        // resource-name references that may not be fully indexed.
        if (occurrences.length === 0 && this.shouldCollectDiskOccurrences(symbolName)) {
            this.collectOccurrencesFromGmlFiles(symbolName, occurrences);
        }

        return this.deduplicateOccurrences(occurrences);
    }

    private shouldCollectDiskOccurrences(symbolName: string): boolean {
        if (!Core.isNonEmptyString(symbolName)) {
            return false;
        }

        return this.findResourceByName(symbolName, true) !== null;
    }

    /**
     * Get additional edits (like file renames) for a symbol.
     */
    getAdditionalSymbolEdits(symbolId: string, newName: string): WorkspaceEdit | null {
        const entry = this.findSymbolInCollections(symbolId);
        if (!entry) return null;

        // Check if this is a resource rename (based on kind or path)
        const resource = this.findResourceBySymbol(entry, symbolId);
        if (!resource) return null;

        const edit = createWorkspaceEdit();
        const oldName = entry.name;
        const oldPath = resource.path;

        // Typical GM structure: objects/oPlayer/oPlayer.yy
        const resourceDir = path.dirname(oldPath);
        const resourceDirName = path.basename(resourceDir);
        const parentDir = path.dirname(resourceDir);

        // 1. Rename files inside the directory that match the old name.
        // We do this BEFORE renaming the directory because GameMaker assets keep
        // the file basename in sync with the enclosing folder name (e.g., `obj.yy`
        // lives under `objects/obj/`). If we rename the folder first, subsequent
        // file renames would resolve against a path that no longer exists, and
        // we risk emitting a WorkspaceEdit that can't be applied cleanly. Keeping
        // the on-disk paths stable until the inner files are updated prevents
        // partial refactors and aligns with the refactor flow described in
        // docs/hot-reload.md (see the refactor pipeline section).
        const extensionsToRename = [".yy"];
        if (resource.resourceType === "GMScript") {
            extensionsToRename.push(".gml");
        } else if (resource.resourceType === "GMShader") {
            extensionsToRename.push(".fsh", ".vsh");
        }

        for (const ext of extensionsToRename) {
            const oldFilePath = path.join(resourceDir, `${oldName}${ext}`);
            const newFilePath = path.join(resourceDir, `${newName}${ext}`);

            // Check if file exists before adding rename (using absolute path for check)
            const absoluteOldPath = path.resolve(this.projectRoot, oldFilePath);
            if (fs.existsSync(absoluteOldPath)) {
                edit.addFileRename(oldFilePath, newFilePath);
            }
        }

        // 2. Rename the directory itself if it matches the resource name.
        if (resourceDirName === oldName) {
            const newResourceDir = path.join(parentDir, newName);
            edit.addFileRename(resourceDir, newResourceDir);
        }

        this.addResourceMetadataEdits(edit, resource, newName);

        return edit;
    }

    private addResourceMetadataEdits(edit: WorkspaceEdit, resource: any, newName: string): void {
        const resources = this.resources;
        if (!resources || !resource?.path) {
            return;
        }

        const newResourcePath = path.posix.join(path.posix.dirname(resource.path), `${newName}.yy`);

        for (const resourceEntry of Object.values(resources)) {
            if (!isResourceMetadataRecord(resourceEntry)) {
                continue;
            }

            const isResourceMetadataPath =
                Semantic.isProjectResourceMetadataPath(resourceEntry.path) ||
                Semantic.isProjectManifestPath(resourceEntry.path);
            if (!isResourceMetadataPath) {
                continue;
            }

            const absolutePath = path.resolve(this.projectRoot, resourceEntry.path);
            const stagedRawContent = this.stagedMetadataContents.get(resourceEntry.path);
            let rawContent: string;
            if (stagedRawContent === undefined) {
                if (!fs.existsSync(absolutePath)) {
                    continue;
                }

                try {
                    rawContent = fs.readFileSync(absolutePath, "utf8");
                } catch {
                    continue;
                }
            } else {
                rawContent = stagedRawContent;
            }

            let parsed: Record<string, unknown>;
            try {
                parsed = Semantic.parseProjectMetadataDocumentForMutation(rawContent, absolutePath).document;
            } catch {
                continue;
            }

            let changed = false;

            if (resourceEntry.path === resource.path) {
                if (parsed.name !== newName) {
                    parsed.name = newName;
                    changed = true;
                }

                if (Core.isNonEmptyString(newResourcePath) && parsed.resourcePath !== newResourcePath) {
                    parsed.resourcePath = newResourcePath;
                    changed = true;
                }
            }

            for (const reference of resourceEntry.assetReferences) {
                if (reference.targetPath !== resource.path) {
                    continue;
                }

                const updated = Semantic.updateProjectMetadataReferenceByPath({
                    document: parsed,
                    propertyPath: reference.propertyPath,
                    newResourcePath,
                    newName
                });
                if (updated) {
                    changed = true;
                }
            }

            if (!changed) {
                continue;
            }

            const updatedContent = Semantic.stringifyProjectMetadataDocument(parsed, resourceEntry.path);
            if (updatedContent === rawContent) {
                continue;
            }

            edit.addMetadataEdit(resourceEntry.path, updatedContent);
        }
    }

    private findResourceBySymbol(entry: any, symbolId: string): any {
        // Direct path from entry
        if (entry.resourcePath) {
            const res = this.resources[entry.resourcePath];
            if (res) return res;
        }

        // Try to infer from name and kind in symbolId
        const match = symbolId.match(/^gml\/([^/]+)\/(.+)$/);
        if (match) {
            const name = match[2];
            return this.findResourceByName(name);
        }

        return null;
    }

    private collectOccurrencesFromGmlFiles(symbolName: string, occurrences: Array<SymbolOccurrence>): void {
        const files = this.projectIndex.files;
        if (!files) return;

        for (const filePath of Object.keys(files)) {
            if (filePath.endsWith(".gml")) {
                const hits = this.findIdentifierOccurrences(filePath, symbolName);
                for (const hit of hits) {
                    occurrences.push({
                        path: filePath,
                        start: hit.start,
                        end: hit.end,
                        kind: "reference"
                    });
                }
            }
        }
    }

    /**
     * Find identifier occurrences in a file (respecting boundary characters).
     */
    private findIdentifierOccurrences(relativePath: string, name: string): Array<{ start: number; end: number }> {
        const results: Array<{ start: number; end: number }> = [];
        try {
            const absolutePath = path.resolve(this.projectRoot, relativePath);
            if (!fs.existsSync(absolutePath)) return results;

            const content = fs.readFileSync(absolutePath, "utf8");
            const escaped = Core.escapeRegExp(name);
            // Use word boundaries or non-identifier characters to ensure we don't match substrings
            // GML identifiers are [a-zA-Z_][a-zA-Z0-9_]*
            const regex = new RegExp(`(?<=^|[^a-zA-Z0-9_])${escaped}(?=[^a-zA-Z0-9_]|$)`, "g");

            let match;
            while ((match = regex.exec(content)) !== null) {
                results.push({
                    start: match.index,
                    end: match.index + name.length
                });
            }
        } catch {
            /* ignore */
        }
        return results;
    }

    /**
     * Collect occurrences from an entry.
     */
    private collectOccurrencesFromEntry(entry: any, symbolName: string, occurrences: Array<SymbolOccurrence>): void {
        // Case A: The entry name itself matches (e.g. macro name, enum name, or script resource name)
        if (entry.name === symbolName) {
            this.collectAllFromEntry(entry, occurrences);
            return;
        }

        // Case B: The entry name differs but it contains a declaration with the target name
        // (e.g. a script file containing multiple named functions)
        if (Array.isArray(entry.declarations)) {
            for (const decl of entry.declarations) {
                if (decl.name === symbolName) {
                    const end = resolveOccurrenceEndIndex(decl.end?.index);
                    if (end === null) {
                        continue;
                    }

                    occurrences.push({
                        path: decl.filePath,
                        start: decl.start?.index ?? 0,
                        end,
                        scopeId: decl.scopeId,
                        kind: "definition"
                    });
                }
            }
        }

        // Case C: The entry has references that match the target name
        if (Array.isArray(entry.references)) {
            for (const ref of entry.references) {
                if (ref.targetName === symbolName) {
                    const start = ref.start?.index ?? ref.location?.start?.index ?? 0;
                    const end = resolveOccurrenceEndIndex(ref.end?.index ?? ref.location?.end?.index);
                    const filePath = typeof ref.filePath === "string" ? ref.filePath : "";

                    if (!Core.isNonEmptyString(filePath) || end === null || end <= start) {
                        continue;
                    }

                    occurrences.push({
                        path: filePath,
                        start,
                        end,
                        scopeId: ref.scopeId,
                        kind: "reference"
                    });
                }
            }
        }
    }

    /**
     * Collect occurrences from project relationships (script calls).
     */
    private collectOccurrencesFromRelationships(symbolName: string, occurrences: Array<SymbolOccurrence>): void {
        const relationships = this.projectIndex.relationships as
            | { scriptCalls?: Array<SemanticScriptCallRecord> }
            | undefined;
        const scriptCalls = relationships?.scriptCalls;
        if (!Array.isArray(scriptCalls)) {
            return;
        }

        for (const call of scriptCalls) {
            if (call.target?.name === symbolName) {
                const start = call.location?.start?.index ?? 0;
                const end = resolveOccurrenceEndIndex(call.location?.end?.index);
                const filePath = call.from?.filePath ?? "";

                if (!Core.isNonEmptyString(filePath) || end === null || end <= start) {
                    continue;
                }

                occurrences.push({
                    path: filePath,
                    start,
                    end,
                    scopeId: call.from?.scopeId,
                    kind: "reference"
                });
            }
        }
    }

    /**
     * Collect all declarations and references from an entry into the occurrences array.
     */
    private collectAllFromEntry(entry: any, occurrences: Array<SymbolOccurrence>): void {
        // Add declarations
        if (Array.isArray(entry.declarations)) {
            for (const decl of entry.declarations) {
                const end = resolveOccurrenceEndIndex(decl.end?.index);
                if (end === null) {
                    continue;
                }

                occurrences.push({
                    path: decl.filePath,
                    start: decl.start?.index ?? 0,
                    end,
                    scopeId: decl.scopeId,
                    kind: "definition"
                });
            }
        }

        // Add references
        if (Array.isArray(entry.references)) {
            for (const ref of entry.references) {
                const start = ref.start?.index ?? ref.location?.start?.index ?? 0;
                const end = resolveOccurrenceEndIndex(ref.end?.index ?? ref.location?.end?.index);
                const filePath = typeof ref.filePath === "string" ? ref.filePath : "";

                if (!Core.isNonEmptyString(filePath) || end === null || end <= start) {
                    continue;
                }

                occurrences.push({
                    path: filePath,
                    start,
                    end,
                    scopeId: ref.scopeId,
                    kind: "reference"
                });
            }
        }
    }

    /**
     * Deduplicate occurrences by path and range.
     */
    private deduplicateOccurrences(occurrences: Array<SymbolOccurrence>): Array<SymbolOccurrence> {
        const seen = new Set<string>();
        return occurrences.filter((occ) => {
            if (!Core.isNonEmptyString(occ.path) || occ.end <= occ.start) {
                return false;
            }

            const key = `${occ.path}:${occ.start}:${occ.end}:${occ.kind}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Get symbols defined in a specific file.
     */
    getFileSymbols(filePath: string): MaybePromise<Array<FileSymbol>> {
        const symbols: Array<FileSymbol> = [];
        const fileRecord = this.projectIndex.files?.[filePath];

        if (fileRecord && Array.isArray(fileRecord.declarations)) {
            // This is a bit complex as we need to map back to symbol IDs
            // For now, we'll return what we can find
            for (const decl of fileRecord.declarations) {
                if (decl.name) {
                    symbols.push({
                        id: decl.identifierId || `gml/unknown/${decl.name}`
                    });
                }
            }
        }

        return symbols;
    }

    /**
     * Get symbols that depend on the given symbols.
     */
    getDependents(symbolIds: Array<string>): MaybePromise<Array<DependentSymbol>> {
        const dependents: Array<DependentSymbol> = [];

        // This requires traversing references in the index
        const identifiers = this.identifiers;
        if (!identifiers) return dependents;

        const symbolIdSet = new Set(symbolIds);

        // We check which symbols reference any of the target symbolNames
        // Note: This is an approximation as ProjectIndex might not have perfect symbolId-to-symbolId mapping yet
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            for (const key of Object.keys(collection)) {
                const entry = collection[key];

                // If this entry references any of our target symbols
                if (Array.isArray(entry.references)) {
                    for (const ref of entry.references) {
                        if (
                            symbolIdSet.has(ref.targetSymbolId) ||
                            (ref.targetName && this.testNameMatch(symbolIdSet, ref.targetName))
                        ) {
                            dependents.push({
                                symbolId: entry.identifierId || key,
                                filePath: entry.resourcePath || ""
                            });
                            break;
                        }
                    }
                }
            }
        }

        return dependents;
    }

    listNamingConventionTargets(filePaths?: Array<string>): MaybePromise<Array<BridgeNamingConventionTarget>> {
        const targets: Array<BridgeNamingConventionTarget> = [];
        const includedFiles = filePaths === undefined ? new Set<string>() : new Set(filePaths);
        const shouldFilterByFile = includedFiles.size > 0;

        const shouldIncludePath = (candidatePath: string | null | undefined): boolean => {
            if (!candidatePath) {
                return false;
            }

            return !shouldFilterByFile || includedFiles.has(candidatePath);
        };

        const pushTarget = (target: BridgeNamingConventionTarget): void => {
            targets.push(target);
        };

        this.collectResourceNamingConventionTargets(shouldIncludePath, pushTarget);
        this.collectScriptCallableNamingConventionTargets(shouldIncludePath, pushTarget);
        this.collectExactIdentifierNamingTargets(this.identifiers.macros ?? {}, "macro", shouldIncludePath, pushTarget);
        this.collectExactIdentifierNamingTargets(this.identifiers.enums ?? {}, "enum", shouldIncludePath, pushTarget);
        this.collectEnumMemberNamingConventionTargets(shouldIncludePath, pushTarget);
        this.collectGlobalAndInstanceNamingTargets(shouldIncludePath, pushTarget);
        this.collectLocalNamingConventionTargets(shouldIncludePath, pushTarget);

        return targets;
    }

    private collectResourceNamingConventionTargets(
        shouldIncludePath: NamingTargetPathPredicate,
        pushTarget: NamingTargetSink
    ): void {
        for (const resource of Object.values(this.resources)) {
            if (!resource?.name || !shouldIncludePath(resource.path)) {
                continue;
            }

            const category = this.getResourceNamingCategory(resource.resourceType);
            if (!category) {
                continue;
            }

            pushTarget({
                category,
                name: resource.name,
                occurrences: [],
                path: resource.path,
                scopeId: null,
                symbolId: this.generateResourceScipId(resource)
            });
        }
    }

    private collectScriptCallableNamingConventionTargets(
        shouldIncludePath: NamingTargetPathPredicate,
        pushTarget: NamingTargetSink
    ): void {
        for (const entry of Object.values(this.identifiers.scripts ?? {})) {
            const declarationFilePath = this.getDeclarationFilePath(entry);
            if (!shouldIncludePath(declarationFilePath) || typeof entry?.name !== "string") {
                continue;
            }

            const isScriptResource =
                typeof entry.resourcePath === "string" &&
                entry.name === this.resources?.[entry.resourcePath]?.name &&
                this.resources?.[entry.resourcePath]?.resourceType === "GMScript";
            if (isScriptResource) {
                continue;
            }

            const declarationKinds = this.extractDeclarationKinds(entry);
            const category = declarationKinds.has("constructor")
                ? "constructorFunction"
                : declarationKinds.has("struct")
                  ? "structDeclaration"
                  : "function";

            pushTarget({
                category,
                name: entry.name,
                occurrences: [],
                path: declarationFilePath,
                scopeId: entry.scopeId ?? null,
                symbolId: this.generateScipId(entry)
            });
        }
    }

    private collectExactIdentifierNamingTargets(
        entries: Record<string, SemanticIdentifierEntry>,
        category: BridgeNamingConventionTarget["category"],
        shouldIncludePath: NamingTargetPathPredicate,
        pushTarget: NamingTargetSink
    ): void {
        for (const entry of Object.values(entries)) {
            const declarationFilePath = this.getDeclarationFilePath(entry);
            if (!shouldIncludePath(declarationFilePath) || typeof entry?.name !== "string") {
                continue;
            }

            pushTarget({
                category,
                name: entry.name,
                occurrences: [],
                path: declarationFilePath,
                scopeId: entry.scopeId ?? null,
                symbolId: this.generateScipId(entry)
            });
        }
    }

    private collectEnumMemberNamingConventionTargets(
        shouldIncludePath: NamingTargetPathPredicate,
        pushTarget: NamingTargetSink
    ): void {
        for (const entry of Object.values(this.identifiers.enumMembers ?? {})) {
            const declarationFilePath = this.getDeclarationFilePath(entry);
            if (!shouldIncludePath(declarationFilePath) || typeof entry?.name !== "string") {
                continue;
            }

            pushTarget({
                category: "enumMember",
                name: entry.name,
                occurrences: this.collectEntryOccurrences(entry),
                path: declarationFilePath,
                scopeId: entry.scopeId ?? null,
                symbolId: null
            });
        }
    }

    private collectGlobalAndInstanceNamingTargets(
        shouldIncludePath: NamingTargetPathPredicate,
        pushTarget: NamingTargetSink
    ): void {
        this.collectExactIdentifierNamingTargets(
            this.identifiers.globalVariables ?? {},
            "globalVariable",
            shouldIncludePath,
            pushTarget
        );

        for (const entry of Object.values(this.identifiers.instanceVariables ?? {})) {
            const declarationFilePath = this.getDeclarationFilePath(entry);
            const entryName = typeof entry?.name === "string" ? entry.name : entry?.key;
            if (!shouldIncludePath(declarationFilePath) || typeof entryName !== "string") {
                continue;
            }

            pushTarget({
                category: "instanceVariable",
                name: entryName,
                occurrences: [],
                path: declarationFilePath,
                scopeId: entry.scopeId ?? null,
                symbolId: this.generateScipId(entry, entryName)
            });
        }
    }

    private collectLocalNamingConventionTargets(
        shouldIncludePath: NamingTargetPathPredicate,
        pushTarget: NamingTargetSink
    ): void {
        const scopes = (this.projectIndex.scopes ?? {}) as Record<string, SemanticScopeRecord>;
        const files = (this.projectIndex.files ?? {}) as Record<string, SemanticFileRecord>;

        for (const [filePath, fileRecord] of Object.entries(files)) {
            if (!shouldIncludePath(filePath)) {
                continue;
            }

            for (const declaration of fileRecord?.declarations ?? []) {
                if (!declaration || declaration.isBuiltIn || typeof declaration.name !== "string") {
                    continue;
                }

                const classifications = Core.asArray(declaration.classifications);
                if (
                    (!classifications.includes("variable") && !classifications.includes("parameter")) ||
                    classifications.includes("global")
                ) {
                    continue;
                }

                const scopeId = typeof declaration.scopeId === "string" ? declaration.scopeId : null;
                const scopeRecord = scopeId ? scopes[scopeId] : null;
                const category = classifications.includes("parameter")
                    ? scopeRecord?.kind === "catch"
                        ? "catchArgument"
                        : "argument"
                    : this.resolveLocalNamingConventionCategory(filePath, declaration);
                const occurrences = this.collectLocalOccurrences(filePath, declaration);

                if (occurrences.length === 0) {
                    continue;
                }

                pushTarget({
                    category,
                    name: declaration.name,
                    occurrences,
                    path: filePath,
                    scopeId,
                    symbolId: null
                });
            }
        }
    }

    /**
     * Perform a scope-aware lookup for a name.
     */
    lookup(name: string, scopeId?: string): MaybePromise<SymbolLookupResult | null> {
        // Basic implementation: find if name exists in the requested scope or globally
        const identifiers = this.identifiers;
        if (!identifiers) return null;

        // Check if it exists in any collection
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            for (const key of Object.keys(collection)) {
                const entry = collection[key];
                if (
                    entry.name === name && // If scopeId matches or is global
                    (!scopeId || entry.scopeId === scopeId)
                ) {
                    return { name: entry.name };
                }
            }
        }

        // Also check resources
        const resource = this.findResourceByName(name);
        if (resource) {
            return { name: resource.name };
        }

        return null;
    }

    private findSymbolInCollections(symbolId: string): any {
        const identifiers = this.identifiers;
        if (!identifiers) return null;

        // 1. Direct match by key or identifierId (fast path)
        for (const collectionName of Object.keys(identifiers)) {
            const collection = identifiers[collectionName];
            if (collection[symbolId]) return collection[symbolId];

            // Also try searching by identifierId property
            for (const key of Object.keys(collection)) {
                const entry = collection[key];
                if (entry.identifierId === symbolId) return entry;
            }
        }

        // 2. Map SCIP-style ID to internal indexer ID and try again
        const scipMatch = symbolId.match(/^gml\/([^/]+)\/(.+)$/);
        if (scipMatch) {
            const kind = scipMatch[1];
            const name = scipMatch[2];

            // Special handling for resource kinds
            if (
                [
                    "objects",
                    "sprites",
                    "sounds",
                    "rooms",
                    "paths",
                    "curves",
                    "sequences",
                    "scripts",
                    "shaders",
                    "fonts",
                    "timelines",
                    "tilesets",
                    "particlesystems",
                    "notes",
                    "extensions"
                ].includes(kind)
            ) {
                const resource = this.findResourceByName(name);
                if (resource) {
                    // Create a synthetic symbol entry for the resource
                    return this.createSyntheticResourceEntry(resource, symbolId);
                }
            }

            const indexerKind = this.mapToIndexerKind(kind);
            const indexerId = `${indexerKind}:${name}`;

            for (const collectionName of Object.keys(identifiers)) {
                const collection = identifiers[collectionName];
                for (const key of Object.keys(collection)) {
                    const entry = collection[key];
                    if (entry.identifierId === indexerId) return entry;
                }
            }

            // 3. Search deeper for nested symbols using the name from SCIP ID
            // We search in ALL collections that might contain these declarations
            for (const collectionName of Object.keys(identifiers)) {
                const collection = identifiers[collectionName];
                const entry = this.findMatchingEntryInCollection(collection, name);
                if (entry) return entry;
            }

            // 4. Case-insensitive resource fallback for manual ID inputs
            const resourceLower = this.findResourceByName(name, true);
            if (resourceLower) {
                return this.createSyntheticResourceEntry(resourceLower, `gml/${kind}/${resourceLower.name}`);
            }
        }

        return null;
    }

    private getDeclarationFilePath(entry: any): string | null {
        for (const declaration of entry?.declarations ?? []) {
            if (typeof declaration?.filePath === "string") {
                return declaration.filePath;
            }
        }

        if (typeof entry?.resourcePath === "string") {
            return entry.resourcePath;
        }

        return null;
    }

    private extractDeclarationKinds(entry: any): Set<string> {
        const declarationKinds = new Set<string>();

        for (const declaration of entry?.declarations ?? []) {
            for (const classification of Core.asArray(declaration?.classifications)) {
                if (typeof classification === "string") {
                    declarationKinds.add(classification);
                }
            }
        }

        for (const declarationKind of Core.asArray(entry?.declarationKinds)) {
            if (typeof declarationKind === "string") {
                declarationKinds.add(declarationKind);
            }
        }

        return declarationKinds;
    }

    private getResourceNamingCategory(
        resourceType: string | null | undefined
    ): BridgeNamingConventionTarget["category"] | null {
        switch (resourceType) {
            case "GMScript": {
                return "scriptResourceName";
            }
            case "GMObject": {
                return "objectResourceName";
            }
            case "GMRoom": {
                return "roomResourceName";
            }
            case "GMSprite": {
                return "spriteResourceName";
            }
            case "GMAudio": {
                return "audioResourceName";
            }
            case "GMSound": {
                return "audioResourceName";
            }
            case "GMTimeline": {
                return "timelineResourceName";
            }
            case "GMShader": {
                return "shaderResourceName";
            }
            case "GMFont": {
                return "fontResourceName";
            }
            case "GMPath": {
                return "pathResourceName";
            }
            case "GMAnimCurve":
            case "GMAnimationCurve": {
                return "animationCurveResourceName";
            }
            case "GMSequence": {
                return "sequenceResourceName";
            }
            case "GMTileSet": {
                return "tilesetResourceName";
            }
            case "GMParticleSystem": {
                return "particleSystemResourceName";
            }
            case "GMNote":
            case "GMNotes": {
                return "noteResourceName";
            }
            case "GMExtension": {
                return "extensionResourceName";
            }
            default: {
                return null;
            }
        }
    }

    private collectLocalOccurrences(filePath: string, declaration: any): Array<SymbolOccurrence> {
        const fileRecord = this.projectIndex.files?.[filePath];
        if (!fileRecord) {
            return [];
        }

        const declarationStartIndex = declaration?.start?.index ?? null;
        const declarationScopeId = declaration?.scopeId ?? null;
        const occurrences: Array<SymbolOccurrence> = [];

        const matchesDeclaration = (candidate: any): boolean => {
            if (!candidate) {
                return false;
            }

            const candidateDeclaration = candidate.declaration ?? null;
            return (
                candidateDeclaration?.scopeId === declarationScopeId &&
                candidateDeclaration?.start?.index === declarationStartIndex &&
                candidate.name === declaration.name
            );
        };

        occurrences.push({
            path: filePath,
            start: declaration.start?.index ?? 0,
            end: resolveOccurrenceEndIndex(declaration.end?.index) ?? 0,
            scopeId: declaration.scopeId ?? undefined,
            kind: "definition"
        });

        for (const reference of fileRecord.references ?? []) {
            if (!matchesDeclaration(reference)) {
                continue;
            }

            occurrences.push({
                path: filePath,
                start: reference.start?.index ?? 0,
                end: resolveOccurrenceEndIndex(reference.end?.index) ?? 0,
                scopeId: reference.scopeId ?? undefined,
                kind: "reference"
            });
        }

        return occurrences;
    }

    private collectEntryOccurrences(entry: SemanticIdentifierEntry): Array<SymbolOccurrence> {
        const occurrences: Array<SymbolOccurrence> = [];

        for (const declaration of entry.declarations ?? []) {
            const declarationStartRecord = Core.isObjectLike(declaration.start)
                ? (declaration.start as Record<string, unknown>)
                : null;
            const declarationEndRecord = Core.isObjectLike(declaration.end)
                ? (declaration.end as Record<string, unknown>)
                : null;
            const declarationStart =
                typeof declarationStartRecord?.index === "number" ? declarationStartRecord.index : 0;
            const declarationEnd =
                typeof declarationEndRecord?.index === "number" ? toExclusiveEndIndex(declarationEndRecord.index) : 0;

            occurrences.push({
                path: typeof declaration.filePath === "string" ? declaration.filePath : "",
                start: declarationStart,
                end: declarationEnd,
                scopeId: typeof declaration.scopeId === "string" ? declaration.scopeId : undefined,
                kind: "definition"
            });
        }

        for (const reference of entry.references ?? []) {
            const referenceStartRecord = Core.isObjectLike(reference.start)
                ? (reference.start as Record<string, unknown>)
                : null;
            const referenceEndRecord = Core.isObjectLike(reference.end)
                ? (reference.end as Record<string, unknown>)
                : null;
            const referenceLocationRecord = Core.isObjectLike(reference.location)
                ? (reference.location as Record<string, unknown>)
                : null;
            const locationStartRecord = Core.isObjectLike(referenceLocationRecord?.start)
                ? (referenceLocationRecord.start as Record<string, unknown>)
                : null;
            const locationEndRecord = Core.isObjectLike(referenceLocationRecord?.end)
                ? (referenceLocationRecord.end as Record<string, unknown>)
                : null;
            const referenceStart = typeof referenceStartRecord?.index === "number" ? referenceStartRecord.index : 0;
            const referenceEnd =
                typeof referenceEndRecord?.index === "number" ? toExclusiveEndIndex(referenceEndRecord.index) : 0;
            const locationStart = typeof locationStartRecord?.index === "number" ? locationStartRecord.index : 0;
            const locationEnd =
                typeof locationEndRecord?.index === "number" ? toExclusiveEndIndex(locationEndRecord.index) : 0;

            occurrences.push({
                path: typeof reference.filePath === "string" ? reference.filePath : "",
                start: referenceStart || locationStart,
                end: referenceEnd || locationEnd,
                scopeId: typeof reference.scopeId === "string" ? reference.scopeId : undefined,
                kind: "reference"
            });
        }

        return occurrences.filter((occurrence) => occurrence.path.length > 0);
    }

    private resolveLocalNamingConventionCategory(
        filePath: string,
        declaration: Record<string, unknown>
    ): Extract<BridgeNamingConventionCategory, "localVariable" | "loopIndexVariable" | "staticVariable"> {
        const declarationStart = Core.isObjectLike(declaration.start)
            ? (declaration.start as Record<string, unknown>)
            : null;
        const startIndex = typeof declarationStart?.index === "number" ? declarationStart.index : null;
        if (typeof declaration.name !== "string" || startIndex === null) {
            return "localVariable";
        }

        return (
            this.localNamingCategoryResolver.resolveCategory(filePath, declaration.name, startIndex) ?? "localVariable"
        );
    }

    private findResourceByName(name: string, caseInsensitive = false): any {
        const resources = this.resources;
        if (!resources) {
            return null;
        }

        const keys = Object.keys(resources);
        if (caseInsensitive) {
            const lowerName = name.toLowerCase();
            for (const key of keys) {
                const res = resources[key];
                if (res.name?.toLowerCase() === lowerName) return res;
            }
        } else {
            for (const key of keys) {
                const res = resources[key];
                if (res.name === name) return res;
            }
        }
        return null;
    }

    private generateResourceScipId(resource: any): string {
        // e.g. gml/objects/obj_player
        let kind = "resource";
        switch (resource.resourceType) {
            case "GMObject": {
                kind = "objects";
                break;
            }
            case "GMSprite": {
                kind = "sprites";
                break;
            }
            case "GMRoom": {
                kind = "rooms";
                break;
            }
            case "GMScript": {
                kind = "scripts";
                break;
            }
            case "GMAudio": {
                {
                    kind = "sounds";
                    // No default
                }
                break;
            }
            case "GMSound": {
                kind = "sounds";
                break;
            }
            case "GMPath": {
                kind = "paths";
                break;
            }
            case "GMAnimCurve":
            case "GMAnimationCurve": {
                kind = "curves";
                break;
            }
            case "GMShader": {
                kind = "shaders";
                break;
            }
            case "GMFont": {
                kind = "fonts";
                break;
            }
            case "GMTimeline": {
                kind = "timelines";
                break;
            }
            case "GMTileSet": {
                kind = "tilesets";
                break;
            }
            case "GMSequence": {
                kind = "sequences";
                break;
            }
            case "GMParticleSystem": {
                kind = "particlesystems";
                break;
            }
            case "GMNote":
            case "GMNotes": {
                kind = "notes";
                break;
            }
            case "GMExtension": {
                kind = "extensions";
                break;
            }
        }
        // fallback mapping

        return `gml/${kind}/${resource.name}`;
    }

    private createSyntheticResourceEntry(resource: any, symbolId: string): any {
        return {
            identifierId: symbolId,
            name: resource.name,
            kind: resource.resourceType,
            declarations: [
                {
                    filePath: resource.path,
                    start: { index: 0, line: 0, column: 0 },
                    end: { index: 0, line: 0, column: 0 },
                    kind: "definition"
                }
            ],
            references: [], // We'd need to populate this via asset scan if we want references visible here
            resourcePath: resource.path
        };
    }

    private mapToIndexerKind(scipKind: string): string {
        switch (scipKind) {
            case "script": {
                return "script";
            }
            case "macro": {
                return "macro";
            }
            case "enum": {
                return "enum";
            }
            case "var": {
                return "global"; // Default for generic var in SCIP scale
            }
            default: {
                return scipKind;
            }
        }
    }

    private generateScipId(entry: any, nestedName?: string): string {
        const name = nestedName ?? entry.name;
        let scipKind = "var";

        // Infer SCIP kind from identifierId or entry metadata
        const id = entry.identifierId ?? "";
        if (id.startsWith("script:")) {
            scipKind = "script";
        } else if (id.startsWith("macro:")) {
            scipKind = "macro";
        } else if (id.startsWith("enum:")) {
            scipKind = "enum";
        } else if (id.startsWith("global:") || id.startsWith("instance:")) {
            scipKind = "var";
        }

        return `gml/${scipKind}/${name}`;
    }

    /**
     * Search for an entry in a collection that contains a declaration with the given name.
     */
    private findMatchingEntryInCollection(collection: any, name: string): any {
        for (const key of Object.keys(collection)) {
            const entry = collection[key];
            if (Array.isArray(entry.declarations)) {
                for (const decl of entry.declarations) {
                    if (decl.name === name) return entry;
                }
            }
        }
        return null;
    }

    private testNameMatch(symbolIds: Set<string>, name: string): boolean {
        for (const id of symbolIds) {
            if (id.endsWith(`/${name}`)) return true;
        }
        return false;
    }
}
