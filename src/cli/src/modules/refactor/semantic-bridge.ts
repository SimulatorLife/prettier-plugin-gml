import * as fs from "node:fs";
import path from "node:path";

import { Core } from "@gmloop/core";
import { Parser } from "@gmloop/parser";
import { Semantic } from "@gmloop/semantic";

import { collectImplicitInstanceVariableTargets } from "./implicit-instance-variable-targets.js";
import { listMacroExpansionDependencies } from "./macro-expansion-dependencies.js";
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
    enumName?: string;
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
type IndexedSymbolLookupEntry = {
    name: string;
    scopeId?: string;
};
type IndexedUnresolvedFileReference = {
    filePath: string;
    reference: Record<string, unknown>;
};
type SemanticBridgeIndexes = {
    entriesByIdentifierId: Map<string, SemanticIdentifierEntry>;
    entriesByRelatedName: Map<string, Set<SemanticIdentifierEntry>>;
    entriesByScipId: Map<string, SemanticIdentifierEntry>;
    exactResolveSymbolIds: Map<string, string>;
    lowerResolveSymbolIds: Map<string, string>;
    resourcesByExactName: Map<string, SemanticResourceRecord>;
    resourcesByLowerName: Map<string, SemanticResourceRecord>;
    scriptCallsByTargetName: Map<string, Array<SemanticScriptCallRecord>>;
    symbolLookupsByExactName: Map<string, Array<IndexedSymbolLookupEntry>>;
    unresolvedReferencesByExactName: Map<string, Array<IndexedUnresolvedFileReference>>;
};

function toExclusiveEndIndex(endIndex: number): number {
    // The semantic index stores end offsets as the final character position.
    // Refactor text edits use one-past-the-end (exclusive) indexes.
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
    private readonly sourceTextByPath = new Map<string, string | null>();
    private constructorStaticMemberNameCounts: Map<string, number> | null = null;
    private indexes: SemanticBridgeIndexes | null = null;

    constructor(projectIndex: unknown, projectRoot: string = process.cwd()) {
        this.projectIndex = Core.isObjectLike(projectIndex) ? (projectIndex as Record<string, unknown>) : {};
        this.projectRoot = projectRoot;
        this.localNamingCategoryResolver = new ParsedLocalNamingCategoryResolver(projectRoot);
    }

    /**
     * Update the underlying project index in place. Useful after codemod passes
     * when the engine updates the project tree to evaluate the next sequence.
     */
    updateProjectIndex(projectIndex: unknown): void {
        this.projectIndex = Core.isObjectLike(projectIndex) ? (projectIndex as Record<string, unknown>) : {};
        this.indexes = null;
        this.sourceTextByPath.clear();
        this.constructorStaticMemberNameCounts = null;
        this.clearWorkspaceOverlay();
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

    private getIndexes(): SemanticBridgeIndexes {
        const existingIndexes = this.indexes;
        if (existingIndexes) {
            return existingIndexes;
        }

        const createdIndexes = this.buildIndexes();
        this.indexes = createdIndexes;
        return createdIndexes;
    }

    private buildIndexes(): SemanticBridgeIndexes {
        const entriesByIdentifierId = new Map<string, SemanticIdentifierEntry>();
        const entriesByRelatedName = new Map<string, Set<SemanticIdentifierEntry>>();
        const entriesByScipId = new Map<string, SemanticIdentifierEntry>();
        const exactResolveSymbolIds = new Map<string, string>();
        const lowerResolveSymbolIds = new Map<string, string>();
        const resourcesByExactName = new Map<string, SemanticResourceRecord>();
        const resourcesByLowerName = new Map<string, SemanticResourceRecord>();
        const scriptCallsByTargetName = new Map<string, Array<SemanticScriptCallRecord>>();
        const symbolLookupsByExactName = new Map<string, Array<IndexedSymbolLookupEntry>>();
        const unresolvedReferencesByExactName = new Map<string, Array<IndexedUnresolvedFileReference>>();
        const priorityCollections: Array<keyof SemanticIdentifierCollections> = [
            "scripts",
            "macros",
            "globalVariables",
            "enums",
            "enumMembers",
            "instanceVariables"
        ];

        const appendRelatedEntry = (name: string, entry: SemanticIdentifierEntry): void => {
            if (!Core.isNonEmptyString(name)) {
                return;
            }

            const existingEntries = entriesByRelatedName.get(name);
            if (existingEntries) {
                existingEntries.add(entry);
                return;
            }

            entriesByRelatedName.set(name, new Set([entry]));
        };

        const appendLookupEntry = (name: string, scopeId: string | undefined): void => {
            if (!Core.isNonEmptyString(name)) {
                return;
            }

            const existingEntries = symbolLookupsByExactName.get(name);
            if (!existingEntries) {
                symbolLookupsByExactName.set(name, [{ name, scopeId }]);
                return;
            }

            if (!existingEntries.some((entry) => entry.scopeId === scopeId)) {
                existingEntries.push({ name, scopeId });
            }
        };

        const registerResolveSymbolId = (name: string, symbolId: string): void => {
            if (!Core.isNonEmptyString(name) || !Core.isNonEmptyString(symbolId)) {
                return;
            }

            if (!exactResolveSymbolIds.has(name)) {
                exactResolveSymbolIds.set(name, symbolId);
            }

            const lowerName = name.toLowerCase();
            if (!lowerResolveSymbolIds.has(lowerName)) {
                lowerResolveSymbolIds.set(lowerName, symbolId);
            }
        };

        const indexEntry = (entry: SemanticIdentifierEntry): void => {
            if (Core.isNonEmptyString(entry.identifierId)) {
                entriesByIdentifierId.set(entry.identifierId, entry);
            }

            if (Core.isNonEmptyString(entry.name)) {
                const entryScipId = this.generateScipId(entry);
                appendRelatedEntry(entry.name, entry);
                appendLookupEntry(entry.name, entry.scopeId);
                registerResolveSymbolId(entry.name, entryScipId);
                entriesByScipId.set(entryScipId, entry);
            }

            for (const declaration of entry.declarations ?? []) {
                if (typeof declaration.name !== "string") {
                    continue;
                }

                const declarationScopeId =
                    typeof declaration.scopeId === "string" ? declaration.scopeId : entry.scopeId;
                const declarationScipId = this.generateScipId(entry, declaration.name);
                appendRelatedEntry(declaration.name, entry);
                appendLookupEntry(declaration.name, declarationScopeId);
                registerResolveSymbolId(declaration.name, declarationScipId);
                entriesByScipId.set(declarationScipId, entry);
            }

            for (const reference of entry.references ?? []) {
                if (typeof reference.targetName === "string") {
                    appendRelatedEntry(reference.targetName, entry);
                }

                if (typeof reference.name === "string") {
                    appendRelatedEntry(reference.name, entry);
                }
            }
        };

        for (const collectionName of priorityCollections) {
            const collection = this.identifiers[collectionName];
            if (!collection) {
                continue;
            }

            for (const entry of Object.values(collection)) {
                indexEntry(entry);
            }
        }

        for (const [resourcePath, resource] of Object.entries(this.resources)) {
            if (!Core.isNonEmptyString(resource?.name)) {
                continue;
            }

            const resourceScipId = this.generateResourceScipId(resource);
            resourcesByExactName.set(resource.name, resource);
            resourcesByLowerName.set(resource.name.toLowerCase(), resource);
            appendLookupEntry(resource.name, undefined);
            registerResolveSymbolId(resource.name, resourceScipId);

            if (!Core.isNonEmptyString(resource.path)) {
                resource.path = resourcePath;
            }
        }

        const relationships = this.projectIndex.relationships as
            | { scriptCalls?: Array<SemanticScriptCallRecord> }
            | undefined;
        for (const call of relationships?.scriptCalls ?? []) {
            const targetName = call.target?.name;
            if (!Core.isNonEmptyString(targetName)) {
                continue;
            }

            const existingCalls = scriptCallsByTargetName.get(targetName);
            if (existingCalls) {
                existingCalls.push(call);
            } else {
                scriptCallsByTargetName.set(targetName, [call]);
            }
        }

        for (const [filePath, fileRecord] of Object.entries(this.projectIndex.files ?? {})) {
            const typedFileRecord = fileRecord as SemanticFileRecord;

            for (const reference of typedFileRecord.references ?? []) {
                if (!Core.isObjectLike(reference) || Core.isObjectLike(reference.declaration)) {
                    continue;
                }

                const referenceName = typeof reference.name === "string" ? reference.name : null;
                if (!Core.isNonEmptyString(referenceName)) {
                    continue;
                }

                const existingReferences = unresolvedReferencesByExactName.get(referenceName);
                if (existingReferences) {
                    existingReferences.push({
                        filePath,
                        reference
                    });
                } else {
                    unresolvedReferencesByExactName.set(referenceName, [
                        {
                            filePath,
                            reference
                        }
                    ]);
                }
            }
        }

        return {
            entriesByIdentifierId,
            entriesByRelatedName,
            entriesByScipId,
            exactResolveSymbolIds,
            lowerResolveSymbolIds,
            resourcesByExactName,
            resourcesByLowerName,
            scriptCallsByTargetName,
            symbolLookupsByExactName,
            unresolvedReferencesByExactName
        };
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
        const indexes = this.getIndexes();
        return indexes.exactResolveSymbolIds.get(name) ?? indexes.lowerResolveSymbolIds.get(name.toLowerCase()) ?? null;
    }

    /**
     * Find all occurrences of a symbol by its base name.
     */
    getSymbolOccurrences(symbolName: string, symbolId: string | null = null): Array<SymbolOccurrence> {
        const occurrences: Array<SymbolOccurrence> = [];
        const symbolEntry = Core.isNonEmptyString(symbolId) ? this.findSymbolInCollections(symbolId) : null;
        if (symbolEntry) {
            this.collectOccurrencesFromExactSymbolEntry(symbolEntry, symbolName, symbolId, occurrences);
        } else {
            const candidateEntries = this.getIndexes().entriesByRelatedName.get(symbolName);
            if (candidateEntries) {
                for (const entry of candidateEntries) {
                    this.collectOccurrencesFromEntry(entry, symbolName, symbolId, occurrences);
                }
            }
        }

        // 2. Search through general relationships for any script calls that matched the name
        // but weren't resolved to a specific identifier entry (useful for modern GML functions)
        if (!this.isIndependentMultiFunctionScriptResourceSymbolId(symbolId)) {
            this.collectOccurrencesFromRelationships(symbolName, occurrences);
        }

        this.collectUnresolvedProjectFileReferenceOccurrences(symbolName, symbolId, occurrences);

        // Fallback to file-system scanning only when indexed structures produced
        // no hits and the symbol is a known resource. This avoids repeated full
        // project scans during large rename batches while preserving support for
        // resource-name references that may not be fully indexed.
        if (occurrences.length === 0 && this.shouldCollectDiskOccurrences(symbolName, symbolId)) {
            this.collectOccurrencesFromGmlFiles(symbolName, occurrences);
        }

        return this.deduplicateOccurrences(occurrences);
    }

    private collectOccurrencesFromExactSymbolEntry(
        entry: SemanticIdentifierEntry,
        symbolName: string,
        symbolId: string,
        occurrences: Array<SymbolOccurrence>
    ): void {
        if (symbolId.startsWith("gml/scripts/")) {
            const resource = this.findResourceBySymbol(entry, symbolId);
            if (resource?.resourceType === "GMScript") {
                const coupledDeclarations = this.getScriptCallableDeclarationsForResource(resource.path).filter(
                    ({ declaration }) => declaration.name === symbolName
                );

                if (coupledDeclarations.length === 1) {
                    this.collectOccurrencesFromEntry(coupledDeclarations[0].entry, symbolName, symbolId, occurrences);
                }

                return;
            }
        }

        this.collectOccurrencesFromEntry(entry, symbolName, symbolId, occurrences);
    }

    private shouldCollectDiskOccurrences(symbolName: string, symbolId: string | null): boolean {
        if (!Core.isNonEmptyString(symbolName)) {
            return false;
        }

        if (this.isIndependentMultiFunctionScriptResourceSymbolId(symbolId)) {
            return false;
        }

        const resource = this.findResourceByName(symbolName, true);
        if (resource === null) {
            return false;
        }

        return this.shouldResourceRenameCollectDiskOccurrences(resource);
    }

    private shouldCollectUnresolvedProjectFileReferences(
        entry: unknown,
        symbolId: string
    ): entry is SemanticIdentifierEntry {
        if (!Core.isObjectLike(entry)) {
            return false;
        }

        const typedEntry = entry as { identifierId?: unknown };

        if (symbolId.startsWith("gml/enum/") || symbolId.startsWith("gml/macro/")) {
            return true;
        }

        return (
            typeof typedEntry.identifierId === "string" &&
            (typedEntry.identifierId.startsWith("enum:") || typedEntry.identifierId.startsWith("macro:"))
        );
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

        this.addResourceMetadataEdits(edit, resource, oldName, newName);

        return edit;
    }

    private addResourceMetadataEdits(edit: WorkspaceEdit, resource: any, oldName: string, newName: string): void {
        const resources = this.resources;
        if (!resources || !resource?.path) {
            return;
        }

        const resourceDirName = path.posix.basename(path.posix.dirname(resource.path));
        const newResourceDir =
            resourceDirName === oldName
                ? path.posix.join(path.posix.dirname(path.posix.dirname(resource.path)), newName)
                : path.posix.dirname(resource.path);
        const newResourcePath = path.posix.join(newResourceDir, `${newName}.yy`);

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

                if (Object.hasOwn(parsed, "resourcePath")) {
                    const currentResourcePath = typeof parsed.resourcePath === "string" ? parsed.resourcePath : null;
                    if (currentResourcePath !== newResourcePath) {
                        parsed.resourcePath = newResourcePath;
                        changed = true;
                    }
                }
            }

            // Ensure project manifest entries are updated directly in addition to
            // transform-by-asset-reference, in case the asset reference map is stale or
            // misses this resource path. This prevents stale old entries from remaining
            // in the resources list and causing GameMaker to crash on load.
            if (Semantic.isProjectManifestPath(resourceEntry.path) && Array.isArray(parsed.resources)) {
                for (const manifestEntry of parsed.resources) {
                    if (!Core.isObjectLike(manifestEntry)) {
                        continue;
                    }

                    const idNode = manifestEntry.id;
                    if (!Core.isObjectLike(idNode)) {
                        continue;
                    }

                    const entryPath = typeof idNode.path === "string" ? idNode.path : null;
                    if (entryPath !== resource.path) {
                        continue;
                    }

                    if (idNode.name !== newName) {
                        idNode.name = newName;
                        changed = true;
                    }

                    if (entryPath !== newResourcePath) {
                        idNode.path = newResourcePath;
                        changed = true;
                    }
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

            const canonicalContent = Semantic.stringifyProjectMetadataDocument(parsed, resourceEntry.path);
            if (!changed && canonicalContent !== rawContent) {
                changed = true;
            }

            if (!changed) {
                continue;
            }

            if (canonicalContent === rawContent) {
                continue;
            }

            edit.addMetadataEdit(resourceEntry.path, canonicalContent);
        }
    }

    private findResourceBySymbol(entry: any, symbolId: string): any {
        const match = symbolId.match(/^gml\/([^/]+)\/(.+)$/);
        if (!match) {
            return null;
        }

        const kind = match[1];
        const name = match[2];
        if (
            ![
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
            return null;
        }

        if (entry.resourcePath) {
            const resource = this.resources[entry.resourcePath];
            if (resource) {
                return resource;
            }
        }

        return this.findResourceByName(name);
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
    private findIdentifierOccurrencesInAst(content: string, name: string): Array<{ start: number; end: number }> {
        const results: Array<{ start: number; end: number }> = [];

        try {
            const program = Parser.GMLParser.parse(content, { getComments: false });

            const traverse = (node: unknown): void => {
                if (!Core.isObjectLike(node)) {
                    return;
                }

                const candidate = node as Record<string, unknown>;
                if (candidate.type === "Identifier" && candidate.name === name) {
                    const start = candidate.start as number | undefined;
                    const end = candidate.end as number | undefined;

                    if (typeof start === "number" && typeof end === "number" && end >= start) {
                        // Skip identifiers originating from quoted literals (e.g. case 'x').
                        const before = start > 0 ? content[start - 1] : "";
                        const after = end + 1 < content.length ? content[end + 1] : "";
                        if ((before === '"' && after === '"') || (before === "'" && after === "'")) {
                            return;
                        }

                        // Parser end positions are exclusive.
                        results.push({ start, end });
                    }
                }

                for (const [key, value] of Object.entries(candidate)) {
                    if (key === "start" || key === "end" || key === "type" || key === "name") {
                        continue;
                    }

                    if (Array.isArray(value)) {
                        for (const child of value) {
                            traverse(child);
                        }
                    } else if (Core.isObjectLike(value)) {
                        traverse(value);
                    }
                }
            };

            traverse(program);
        } catch (error) {
            console.error(`Failed to parse content for identifier '${name}':`, error);
        }

        return results;
    }

    private findStringLiteralRangesInAst(content: string): Array<{ start: number; end: number }> {
        const ranges: Array<{ start: number; end: number }> = [];

        try {
            const program = Parser.GMLParser.parse(content, { getComments: false });

            const traverse = (node: unknown): void => {
                if (!Core.isObjectLike(node)) {
                    return;
                }

                const candidate = node as Record<string, unknown>;
                if (candidate.type === "Literal" && typeof candidate.value === "string") {
                    const literalValue = candidate.value;
                    const isQuotedLiteral =
                        (literalValue.startsWith('"') && literalValue.endsWith('"')) ||
                        (literalValue.startsWith("'") && literalValue.endsWith("'"));

                    if (isQuotedLiteral) {
                        const start = candidate.start as number | undefined;
                        const end = candidate.end as number | undefined;
                        if (typeof start === "number" && typeof end === "number" && end >= start) {
                            ranges.push({ start, end });
                        }
                    }
                }

                for (const [key, value] of Object.entries(candidate)) {
                    if (key === "start" || key === "end" || key === "type" || key === "name" || key === "value") {
                        continue;
                    }

                    if (Array.isArray(value)) {
                        for (const child of value) {
                            traverse(child);
                        }
                    } else if (Core.isObjectLike(value)) {
                        traverse(value);
                    }
                }
            };

            traverse(program);
        } catch {
            // Silently ignore parse failures; fallback regex should still run.
        }

        return ranges;
    }

    private isWithinRanges(start: number, end: number, ranges: Array<{ start: number; end: number }>): boolean {
        return ranges.some((range) => start >= range.start && end <= range.end);
    }

    private findIdentifierOccurrences(relativePath: string, name: string): Array<{ start: number; end: number }> {
        const results: Array<{ start: number; end: number }> = [];
        try {
            const absolutePath = path.resolve(this.projectRoot, relativePath);
            if (!fs.existsSync(absolutePath)) return results;

            const content = fs.readFileSync(absolutePath, "utf8");
            const astResults = this.findIdentifierOccurrencesInAst(content, name);
            if (astResults.length > 0) {
                return astResults;
            }

            const stringLiteralRanges = this.findStringLiteralRangesInAst(content);
            const escaped = Core.escapeRegExp(name);
            // Use word boundaries or non-identifier characters to ensure we don't match substrings
            // GML identifiers are [a-zA-Z_][a-zA-Z0-9_]*
            const regex = new RegExp(`(?<=^|[^a-zA-Z0-9_])${escaped}(?=[^a-zA-Z0-9_]|$)`, "g");

            let match;
            while ((match = regex.exec(content)) !== null) {
                const start = match.index;
                const end = match.index + name.length;

                if (this.isWithinRanges(start, end, stringLiteralRanges)) {
                    continue;
                }

                results.push({
                    start,
                    end
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
    private collectOccurrencesFromEntry(
        entry: any,
        symbolName: string,
        symbolId: string | null,
        occurrences: Array<SymbolOccurrence>
    ): void {
        const skipEntryOccurrences = this.isIndependentMultiFunctionScriptResourceSymbol(entry, symbolId);
        if (skipEntryOccurrences) {
            return;
        }

        // Case A: The entry contains declaration(s) matching the target name.
        // This takes priority over the entry-level name so multi-function script
        // entries can rename individual declarations independently.
        let matchedDeclaration = false;
        if (Array.isArray(entry.declarations)) {
            for (const decl of entry.declarations) {
                if (decl.name === symbolName) {
                    matchedDeclaration = true;
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

        if (matchedDeclaration) {
            if (Array.isArray(entry.references)) {
                for (const ref of entry.references) {
                    if (ref.targetName !== symbolName && ref.name !== symbolName) {
                        continue;
                    }

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

            return;
        }
        // Case B: The entry name itself matches (e.g. macro name, enum name, or script resource name)
        if (entry.name === symbolName) {
            this.collectAllFromEntry(entry, occurrences);
            return;
        }

        // Case C: The entry has references that match the target name.
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
        for (const call of this.getIndexes().scriptCallsByTargetName.get(symbolName) ?? []) {
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

    private collectUnresolvedProjectFileReferenceOccurrences(
        symbolName: string,
        symbolId: string | null,
        occurrences: Array<SymbolOccurrence>
    ): void {
        if (!Core.isNonEmptyString(symbolId) || !Core.isNonEmptyString(symbolName)) {
            return;
        }

        const symbolEntry = this.findSymbolInCollections(symbolId);
        if (!this.shouldCollectUnresolvedProjectFileReferences(symbolEntry, symbolId)) {
            return;
        }

        for (const [filePath, fileRecord] of Object.entries(this.projectIndex.files ?? {})) {
            const typedFileRecord = fileRecord as SemanticFileRecord;
            for (const reference of typedFileRecord.references ?? []) {
                if (!Core.isObjectLike(reference) || Core.isObjectLike(reference.declaration)) {
                    continue;
                }

                const typedReference = reference as {
                    end?: { index?: number };
                    location?: { end?: { index?: number }; start?: { index?: number } };
                    name?: unknown;
                    scopeId?: unknown;
                    start?: { index?: number };
                    targetName?: unknown;
                };

                const referenceName =
                    typeof typedReference.targetName === "string"
                        ? typedReference.targetName
                        : typeof typedReference.name === "string"
                          ? typedReference.name
                          : null;
                if (referenceName !== symbolName) {
                    continue;
                }

                const start = typedReference.start?.index ?? typedReference.location?.start?.index ?? 0;
                const end = resolveOccurrenceEndIndex(typedReference.end?.index ?? typedReference.location?.end?.index);
                if (!Core.isNonEmptyString(filePath) || end === null || end <= start) {
                    continue;
                }

                occurrences.push({
                    path: filePath,
                    start,
                    end,
                    scopeId: typeof typedReference.scopeId === "string" ? typedReference.scopeId : undefined,
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
        this.collectImplicitInstanceNamingTargets(shouldIncludePath, pushTarget);
        this.collectLocalNamingConventionTargets(shouldIncludePath, pushTarget);

        return targets;
    }

    listMacroExpansionDependencies(filePaths?: Array<string>) {
        return listMacroExpansionDependencies({
            files: (this.projectIndex.files ?? {}) as Record<string, SemanticFileRecord>,
            macros: this.identifiers.macros ?? {},
            projectRoot: this.projectRoot,
            selectedFilePaths: filePaths
        });
    }

    private collectResourceNamingConventionTargets(
        shouldIncludePath: NamingTargetPathPredicate,
        pushTarget: NamingTargetSink
    ): void {
        for (const resource of Object.values(this.resources)) {
            if (!resource?.name || !shouldIncludePath(resource.path)) {
                continue;
            }

            const category = this.getResourceNamingCategory(resource);
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
            for (const declaration of this.getScriptCallableDeclarations(entry)) {
                if (
                    !shouldIncludePath(declaration.filePath) ||
                    this.isCoupledSingleFunctionScriptCallable(entry, declaration.name)
                ) {
                    continue;
                }

                pushTarget({
                    category: this.getScriptCallableNamingCategory(entry, declaration),
                    name: declaration.name,
                    occurrences: [],
                    path: declaration.filePath,
                    scopeId: entry.scopeId ?? null,
                    symbolId: this.generateScipId(entry, declaration.name)
                });
            }
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

    private collectImplicitInstanceNamingTargets(
        shouldIncludePath: NamingTargetPathPredicate,
        pushTarget: NamingTargetSink
    ): void {
        const knownNamesByObjectDirectory = new Map<string, Set<string>>();

        for (const entry of Object.values(this.identifiers.instanceVariables ?? {})) {
            const declarationFilePath = this.getDeclarationFilePath(entry);
            const entryName = typeof entry?.name === "string" ? entry.name : entry?.key;
            if (!shouldIncludePath(declarationFilePath) || typeof entryName !== "string") {
                continue;
            }

            const objectDirectory = path.posix.dirname(declarationFilePath.replaceAll("\\", "/"));
            const knownNames = knownNamesByObjectDirectory.get(objectDirectory) ?? new Set<string>();
            knownNames.add(entryName);
            knownNamesByObjectDirectory.set(objectDirectory, knownNames);
        }

        for (const target of collectImplicitInstanceVariableTargets({
            files: (this.projectIndex.files ?? {}) as Record<string, SemanticFileRecord>,
            knownNamesByObjectDirectory,
            projectRoot: this.projectRoot,
            shouldIncludePath
        })) {
            pushTarget(target);
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
                const occurrences = this.collectLocalOccurrences(
                    filePath,
                    declaration,
                    category === "staticVariable" &&
                        this.isUniqueConstructorStaticMemberDeclaration(filePath, declaration)
                );

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
        for (const entry of this.getIndexes().symbolLookupsByExactName.get(name) ?? []) {
            if (!scopeId || entry.scopeId === scopeId) {
                return { name: entry.name };
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
        const indexes = this.getIndexes();
        const directEntry = indexes.entriesByIdentifierId.get(symbolId) ?? indexes.entriesByScipId.get(symbolId);
        if (directEntry) {
            return directEntry;
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

            const resolvedScipId = indexes.exactResolveSymbolIds.get(name);
            if (resolvedScipId) {
                const resolvedEntry = indexes.entriesByScipId.get(resolvedScipId);
                if (resolvedEntry) {
                    return resolvedEntry;
                }
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

    private getScriptCallableDeclarations(
        entry: SemanticIdentifierEntry
    ): Array<Record<string, unknown> & { filePath: string; name: string }> {
        const declarations: Array<Record<string, unknown> & { filePath: string; name: string }> = [];

        for (const declaration of entry?.declarations ?? []) {
            if (
                declaration?.isSynthetic === true ||
                typeof declaration?.name !== "string" ||
                typeof declaration?.filePath !== "string"
            ) {
                continue;
            }

            declarations.push(declaration as Record<string, unknown> & { filePath: string; name: string });
        }

        return declarations;
    }

    private getScriptCallableDeclarationsForResource(
        resourcePath: string
    ): Array<{ declaration: Record<string, unknown>; entry: SemanticIdentifierEntry }> {
        const declarations: Array<{ declaration: Record<string, unknown>; entry: SemanticIdentifierEntry }> = [];

        for (const entry of Object.values(this.identifiers.scripts ?? {})) {
            if (entry?.resourcePath !== resourcePath) {
                continue;
            }

            for (const declaration of entry?.declarations ?? []) {
                if (
                    declaration?.isSynthetic === true ||
                    typeof declaration?.name !== "string" ||
                    typeof declaration?.filePath !== "string"
                ) {
                    continue;
                }

                declarations.push({
                    entry,
                    declaration
                });
            }
        }

        return declarations;
    }

    private hasScriptEntryForResource(resourcePath: string): boolean {
        for (const entry of Object.values(this.identifiers.scripts ?? {})) {
            if (entry?.resourcePath === resourcePath) {
                return true;
            }
        }

        return false;
    }

    private isCoupledSingleFunctionScriptCallable(entry: SemanticIdentifierEntry, declarationName: string): boolean {
        if (typeof entry?.resourcePath !== "string") {
            return false;
        }

        const resource = this.resources?.[entry.resourcePath];
        if (resource?.resourceType !== "GMScript" || resource?.name !== declarationName) {
            return false;
        }

        const declarations = this.getScriptCallableDeclarationsForResource(entry.resourcePath);
        return declarations.length === 1 && declarations[0]?.declaration?.name === declarationName;
    }

    private hasSingleCallableDeclaration(entry: SemanticIdentifierEntry): boolean {
        return this.getScriptCallableDeclarations(entry).length === 1;
    }

    private shouldResourceRenameCollectDiskOccurrences(resource: SemanticResourceRecord): boolean {
        if (resource.resourceType !== "GMScript" || typeof resource.path !== "string") {
            return true;
        }

        const declarations = this.getScriptCallableDeclarationsForResource(resource.path);
        if (
            declarations.length === 1 &&
            typeof resource.name === "string" &&
            declarations[0]?.declaration?.name === resource.name
        ) {
            return true;
        }

        return !this.hasScriptEntryForResource(resource.path);
    }

    private isIndependentMultiFunctionScriptResourceSymbol(
        entry: SemanticIdentifierEntry,
        symbolId: string | null
    ): boolean {
        if (!this.isIndependentMultiFunctionScriptResourceSymbolId(symbolId)) {
            return false;
        }

        return this.getScriptCallableDeclarations(entry).length > 1;
    }

    private isIndependentMultiFunctionScriptResourceSymbolId(symbolId: string | null): boolean {
        if (!Core.isNonEmptyString(symbolId) || !symbolId.startsWith("gml/scripts/")) {
            return false;
        }

        const symbolEntry = this.findSymbolInCollections(symbolId);
        const resource = symbolEntry ? this.findResourceBySymbol(symbolEntry, symbolId) : null;
        if (resource?.resourceType !== "GMScript" || typeof resource.path !== "string") {
            return false;
        }

        const declarations = this.getScriptCallableDeclarationsForResource(resource.path);
        return declarations.length > 1;
    }

    private getScriptCallableNamingCategory(
        entry: SemanticIdentifierEntry,
        declaration: Record<string, unknown>
    ): Extract<BridgeNamingConventionTarget["category"], "constructorFunction" | "structDeclaration" | "function"> {
        const declarationKinds = new Set<string>();

        for (const classification of Core.asArray(declaration.classifications)) {
            if (typeof classification === "string") {
                declarationKinds.add(classification);
            }
        }

        if (declarationKinds.has("constructor")) {
            return "constructorFunction";
        }

        if (declarationKinds.has("struct")) {
            return "structDeclaration";
        }

        if (!this.hasSingleCallableDeclaration(entry)) {
            return "function";
        }

        const entryKinds = this.extractDeclarationKinds(entry);
        if (entryKinds.has("constructor")) {
            return "constructorFunction";
        }

        if (entryKinds.has("struct")) {
            return "structDeclaration";
        }

        return "function";
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
        resource: { path?: string | null; resourceType?: string | null } | null | undefined
    ): BridgeNamingConventionTarget["category"] | null {
        const resourceType = resource?.resourceType;
        switch (resourceType) {
            case "GMScript": {
                const declarationCategory = this.getScriptResourceDeclarationNamingCategory(resource?.path);
                if (declarationCategory !== null) {
                    return declarationCategory;
                }
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

    private getScriptResourceDeclarationNamingCategory(
        resourcePath: string | null | undefined
    ): Extract<BridgeNamingConventionTarget["category"], "constructorFunction" | "structDeclaration"> | null {
        if (!Core.isNonEmptyString(resourcePath)) {
            return null;
        }

        const declarations = this.getScriptCallableDeclarationsForResource(resourcePath);
        if (declarations.length !== 1) {
            return null;
        }

        for (const entry of Object.values(this.identifiers.scripts ?? {})) {
            if (entry?.resourcePath !== resourcePath) {
                continue;
            }

            const declarationKinds = this.extractDeclarationKinds(entry);
            if (declarationKinds.has("constructor")) {
                return "constructorFunction";
            }

            if (declarationKinds.has("struct")) {
                return "structDeclaration";
            }
        }

        return null;
    }

    private collectLocalOccurrences(
        filePath: string,
        declaration: any,
        includeConstructorMemberPropertyReferences = false
    ): Array<SymbolOccurrence> {
        const fileRecord = this.projectIndex.files?.[filePath];
        if (!fileRecord) {
            return [];
        }

        const declarationStartIndex = declaration?.start?.index ?? null;
        const declarationScopeId = declaration?.scopeId ?? null;
        const occurrences: Array<SymbolOccurrence> = [];
        const absolutePath = path.resolve(this.projectRoot, filePath);
        const fileContents = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : null;

        const isMemberAccessReference = (startIndex: number): boolean => {
            if (fileContents === null || startIndex <= 0) {
                return false;
            }

            for (let cursor = startIndex - 1; cursor >= 0; cursor -= 1) {
                const character = fileContents[cursor];
                if (character === undefined) {
                    return false;
                }

                if (!/\s/u.test(character)) {
                    return character === ".";
                }
            }

            return false;
        };

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

            if (isMemberAccessReference(reference.start?.index ?? -1)) {
                continue;
            }

            const referenceClassifications = Core.asArray(reference.classifications).filter(
                (classification): classification is string => typeof classification === "string"
            );
            if (
                referenceClassifications.length > 0 &&
                (!referenceClassifications.some(
                    (classification) => classification === "variable" || classification === "parameter"
                ) ||
                    referenceClassifications.some(
                        (classification) =>
                            classification === "enum-member" ||
                            classification === "member" ||
                            classification === "property"
                    ))
            ) {
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

        if (includeConstructorMemberPropertyReferences && typeof declaration.name === "string") {
            this.collectUnresolvedPropertyOccurrences(declaration.name, occurrences);
        }

        return this.deduplicateOccurrences(occurrences);
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

        this.collectUnresolvedEnumMemberOccurrences(entry, occurrences);

        return occurrences.filter((occurrence) => occurrence.path.length > 0);
    }

    private collectUnresolvedEnumMemberOccurrences(
        entry: SemanticIdentifierEntry,
        occurrences: Array<SymbolOccurrence>
    ): void {
        if (!entry.identifierId?.startsWith("enum-member:")) {
            return;
        }

        if (!Core.isNonEmptyString(entry.name) || !Core.isNonEmptyString(entry.enumName)) {
            return;
        }

        for (const unresolvedReference of this.getIndexes().unresolvedReferencesByExactName.get(entry.name) ?? []) {
            const classifications = Core.asArray(unresolvedReference.reference.classifications);
            if (!classifications.includes("property")) {
                continue;
            }

            const startRecord = Core.isObjectLike(unresolvedReference.reference.start)
                ? (unresolvedReference.reference.start as Record<string, unknown>)
                : null;
            const endRecord = Core.isObjectLike(unresolvedReference.reference.end)
                ? (unresolvedReference.reference.end as Record<string, unknown>)
                : null;
            const start = typeof startRecord?.index === "number" ? startRecord.index : null;
            const end = typeof endRecord?.index === "number" ? toExclusiveEndIndex(endRecord.index) : null;

            if (start === null || end === null || end <= start) {
                continue;
            }

            if (!this.isEnumMemberReferenceSourceMatch(unresolvedReference.filePath, start, entry.enumName)) {
                continue;
            }

            occurrences.push({
                path: unresolvedReference.filePath,
                start,
                end,
                scopeId:
                    typeof unresolvedReference.reference.scopeId === "string"
                        ? unresolvedReference.reference.scopeId
                        : undefined,
                kind: "reference"
            });
        }
    }

    private collectUnresolvedPropertyOccurrences(symbolName: string, occurrences: Array<SymbolOccurrence>): void {
        for (const unresolvedReference of this.getIndexes().unresolvedReferencesByExactName.get(symbolName) ?? []) {
            const classifications = Core.asArray(unresolvedReference.reference.classifications);
            if (!classifications.includes("property")) {
                continue;
            }

            const startRecord = Core.isObjectLike(unresolvedReference.reference.start)
                ? (unresolvedReference.reference.start as Record<string, unknown>)
                : null;
            const endRecord = Core.isObjectLike(unresolvedReference.reference.end)
                ? (unresolvedReference.reference.end as Record<string, unknown>)
                : null;
            const start = typeof startRecord?.index === "number" ? startRecord.index : null;
            const end = typeof endRecord?.index === "number" ? toExclusiveEndIndex(endRecord.index) : null;

            if (start === null || end === null || end <= start) {
                continue;
            }

            occurrences.push({
                path: unresolvedReference.filePath,
                start,
                end,
                scopeId:
                    typeof unresolvedReference.reference.scopeId === "string"
                        ? unresolvedReference.reference.scopeId
                        : undefined,
                kind: "reference"
            });
        }
    }

    private isEnumMemberReferenceSourceMatch(filePath: string, startIndex: number, enumName: string): boolean {
        const sourceText = this.readProjectSourceText(filePath);
        if (sourceText === null || startIndex <= 0 || startIndex > sourceText.length) {
            return false;
        }

        let cursor = startIndex - 1;
        while (cursor >= 0 && /\s/u.test(sourceText[cursor] ?? "")) {
            cursor -= 1;
        }

        if (cursor < 0 || sourceText[cursor] !== ".") {
            return false;
        }

        cursor -= 1;
        while (cursor >= 0 && /\s/u.test(sourceText[cursor] ?? "")) {
            cursor -= 1;
        }

        const objectEnd = cursor + 1;
        while (cursor >= 0 && /[A-Za-z0-9_]/u.test(sourceText[cursor] ?? "")) {
            cursor -= 1;
        }

        const objectName = sourceText.slice(cursor + 1, objectEnd);
        return objectName === enumName;
    }

    private readProjectSourceText(filePath: string): string | null {
        if (this.sourceTextByPath.has(filePath)) {
            return this.sourceTextByPath.get(filePath) ?? null;
        }

        const absolutePath = path.resolve(this.projectRoot, filePath);
        if (!fs.existsSync(absolutePath)) {
            this.sourceTextByPath.set(filePath, null);
            return null;
        }

        try {
            const sourceText = fs.readFileSync(absolutePath, "utf8");
            this.sourceTextByPath.set(filePath, sourceText);
            return sourceText;
        } catch {
            this.sourceTextByPath.set(filePath, null);
            return null;
        }
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

    private isUniqueConstructorStaticMemberDeclaration(
        filePath: string,
        declaration: Record<string, unknown>
    ): boolean {
        const declarationStart = Core.isObjectLike(declaration.start)
            ? (declaration.start as Record<string, unknown>)
            : null;
        const startIndex = typeof declarationStart?.index === "number" ? declarationStart.index : null;
        if (typeof declaration.name !== "string" || startIndex === null) {
            return false;
        }

        if (!this.localNamingCategoryResolver.isConstructorStaticMember(filePath, declaration.name, startIndex)) {
            return false;
        }

        return (this.getConstructorStaticMemberNameCounts().get(declaration.name) ?? 0) === 1;
    }

    private getConstructorStaticMemberNameCounts(): Map<string, number> {
        const existingCounts = this.constructorStaticMemberNameCounts;
        if (existingCounts) {
            return existingCounts;
        }

        const counts = new Map<string, number>();
        for (const [filePath, fileRecord] of Object.entries(
            (this.projectIndex.files ?? {}) as Record<string, SemanticFileRecord>
        )) {
            for (const declaration of fileRecord.declarations ?? []) {
                const declarationStart = Core.isObjectLike(declaration.start)
                    ? (declaration.start as Record<string, unknown>)
                    : null;
                const startIndex = typeof declarationStart?.index === "number" ? declarationStart.index : null;
                if (typeof declaration.name !== "string" || startIndex === null) {
                    continue;
                }

                if (
                    !this.localNamingCategoryResolver.isConstructorStaticMember(filePath, declaration.name, startIndex)
                ) {
                    continue;
                }

                counts.set(declaration.name, (counts.get(declaration.name) ?? 0) + 1);
            }
        }

        this.constructorStaticMemberNameCounts = counts;
        return counts;
    }

    private findResourceByName(name: string, caseInsensitive = false): any {
        const indexes = this.getIndexes();
        if (caseInsensitive) {
            return indexes.resourcesByLowerName.get(name.toLowerCase()) ?? null;
        }

        return indexes.resourcesByExactName.get(name) ?? null;
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

    private testNameMatch(symbolIds: Set<string>, name: string): boolean {
        for (const id of symbolIds) {
            if (id.endsWith(`/${name}`)) return true;
        }
        return false;
    }
}
