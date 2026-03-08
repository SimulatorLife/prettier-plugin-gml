// TODO: This file may violate the single-file responsibility principle for the lint-workspace. It should NOT do project analysis, variable renaming, or anything else that would be relevant to refactor operations; these should be in the 'refactor' workspace, which does proper codemods
import { Core } from "@gml-modules/core";

import type { ProjectCapability } from "../types/index.js";
import { isDirectoryExcludedBySegments } from "./path-boundary.js";
import { normalizeLintFilePath } from "./path-normalization.js";

const ALL_PROJECT_CAPABILITIES: ReadonlySet<ProjectCapability> = new Set<ProjectCapability>([
    "IDENTIFIER_OCCUPANCY",
    "IDENTIFIER_OCCURRENCES",
    "LOOP_HOIST_NAME_RESOLUTION"
]);

export interface ProjectAnalysisSnapshot {
    readonly capabilities: ReadonlySet<ProjectCapability>;
    isIdentifierNameOccupiedInProject(identifierName: string): boolean;
    listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string>;
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): { allowRewrite: boolean; reason: string | null };
    resolveLoopHoistIdentifier(
        preferredName: string,
        localIdentifierNames: ReadonlySet<string>,
        normalizedLocalIdentifierNames: ReadonlySet<string>
    ): string | null;
}

export interface ProjectAnalysisProvider {
    buildSnapshot(projectRoot: string, options: ProjectAnalysisBuildOptions): ProjectAnalysisSnapshot;
}

export interface ProjectAnalysisBuildOptions {
    excludedDirectories: ReadonlySet<string>;
    allowedDirectories: ReadonlyArray<string>;
}

type ProjectIndex = Readonly<{
    identifierToFiles: ReadonlyMap<string, ReadonlySet<string>>;
}>;

function isExcludedPath(
    filePath: string,
    excludedDirectories: ReadonlySet<string>,
    allowedDirectories: ReadonlyArray<string>
): boolean {
    const normalizedFilePath = normalizeLintFilePath(filePath);
    return isDirectoryExcludedBySegments(normalizedFilePath, excludedDirectories, allowedDirectories);
}

function resolveLoopHoistIdentifierName(
    preferredName: string,
    normalizedLocalIdentifierNames: ReadonlySet<string>,
    isProjectIdentifierOccupied: (identifierName: string) => boolean
): string | null {
    const normalizedPreferredName = Core.toNormalizedLowerCaseString(preferredName);
    if (
        !normalizedPreferredName ||
        normalizedLocalIdentifierNames.has(normalizedPreferredName) ||
        isProjectIdentifierOccupied(normalizedPreferredName)
    ) {
        const baseName = preferredName.length > 0 ? preferredName : "len";
        for (let index = 1; index <= 1000; index += 1) {
            const candidate = `${baseName}_${index}`;
            const normalizedCandidate = Core.toNormalizedLowerCaseString(candidate);
            if (
                !normalizedLocalIdentifierNames.has(normalizedCandidate) &&
                !isProjectIdentifierOccupied(normalizedCandidate)
            ) {
                return candidate;
            }
        }
        return null;
    }

    return preferredName;
}

function createProjectAnalysisSnapshot(index: ProjectIndex): ProjectAnalysisSnapshot {
    const identifierOccupancyCache = new Map<string, boolean>();

    const isIdentifierOccupied = (identifierName: string): boolean => {
        const normalizedIdentifierName = Core.toNormalizedLowerCaseString(identifierName);
        if (!normalizedIdentifierName) {
            return false;
        }

        const cachedOccupancy = identifierOccupancyCache.get(normalizedIdentifierName);
        if (cachedOccupancy !== undefined) {
            return cachedOccupancy;
        }

        const isOccupied = index.identifierToFiles.has(normalizedIdentifierName);
        identifierOccupancyCache.set(normalizedIdentifierName, isOccupied);
        return isOccupied;
    };

    return Object.freeze({
        capabilities: ALL_PROJECT_CAPABILITIES,
        isIdentifierNameOccupiedInProject: isIdentifierOccupied,
        listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string> {
            const files = index.identifierToFiles.get(Core.toNormalizedLowerCaseString(identifierName));
            return files ?? new Set<string>();
        },
        assessGlobalVarRewrite(
            filePath: string | null,
            hasInitializer: boolean
        ): { allowRewrite: boolean; reason: string | null } {
            if (!hasInitializer) {
                return { allowRewrite: true, reason: null };
            }

            if (!filePath) {
                return { allowRewrite: false, reason: "missing-file-path" };
            }

            return { allowRewrite: true, reason: null };
        },
        resolveLoopHoistIdentifier(
            preferredName: string,
            _localIdentifierNames: ReadonlySet<string>,
            normalizedLocalIdentifierNames: ReadonlySet<string>
        ): string | null {
            return resolveLoopHoistIdentifierName(preferredName, normalizedLocalIdentifierNames, isIdentifierOccupied);
        }
    });
}

function createMissingProjectAnalysisSnapshot(): ProjectAnalysisSnapshot {
    return Object.freeze({
        capabilities: new Set<ProjectCapability>(),
        isIdentifierNameOccupiedInProject(): boolean {
            return false;
        },
        listIdentifierOccurrenceFiles(): ReadonlySet<string> {
            return new Set<string>();
        },
        assessGlobalVarRewrite(): { allowRewrite: boolean; reason: string | null } {
            return { allowRewrite: false, reason: "missing-project-context" };
        },
        resolveLoopHoistIdentifier(): string | null {
            return null;
        }
    });
}

type SemanticProjectIndexLike = {
    identifiers?: Record<string, unknown> | null;
    identifierCollections?: Record<string, unknown> | null;
    relationships?: {
        scriptCalls?: Array<{
            from?: { filePath?: string | null } | null;
            target?: { name?: string | null } | null;
        }>;
    } | null;
};

function normalizeProjectEntryFilePath(projectRoot: string, rawPath: unknown): string | null {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
        return null;
    }

    const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(projectRoot, rawPath);
    return normalizeLintFilePath(resolvedPath);
}

function addIdentifierFile(
    identifierToFiles: Map<string, Set<string>>,
    identifierName: string,
    filePath: string,
    options: ProjectAnalysisBuildOptions
): void {
    const normalizedIdentifierName = Core.toNormalizedLowerCaseString(identifierName);
    if (
        !normalizedIdentifierName ||
        isExcludedPath(filePath, options.excludedDirectories, options.allowedDirectories)
    ) {
        return;
    }

    const files = identifierToFiles.get(normalizedIdentifierName) ?? new Set<string>();
    files.add(filePath);
    identifierToFiles.set(normalizedIdentifierName, files);
}

function addIdentifierOccurrencesFromCollectionEntry(parameters: {
    projectRoot: string;
    entry: unknown;
    options: ProjectAnalysisBuildOptions;
    identifierToFiles: Map<string, Set<string>>;
}): void {
    if (!parameters.entry || typeof parameters.entry !== "object") {
        return;
    }

    const entryRecord = parameters.entry as {
        declarations?: Array<{ name?: string; filePath?: string }>;
        references?: Array<{ name?: string; targetName?: string; filePath?: string }>;
    };

    for (const declaration of entryRecord.declarations ?? []) {
        if (typeof declaration?.name !== "string") {
            continue;
        }

        const declarationPath = normalizeProjectEntryFilePath(parameters.projectRoot, declaration.filePath);
        if (!declarationPath) {
            continue;
        }

        addIdentifierFile(parameters.identifierToFiles, declaration.name, declarationPath, parameters.options);
    }

    for (const reference of entryRecord.references ?? []) {
        const referenceName = typeof reference?.targetName === "string" ? reference.targetName : reference?.name;
        if (typeof referenceName !== "string") {
            continue;
        }

        const referencePath = normalizeProjectEntryFilePath(parameters.projectRoot, reference.filePath);
        if (!referencePath) {
            continue;
        }

        addIdentifierFile(parameters.identifierToFiles, referenceName, referencePath, parameters.options);
    }
}

function getIdentifierCollections(projectIndex: SemanticProjectIndexLike): Record<string, unknown> {
    if (projectIndex.identifiers && typeof projectIndex.identifiers === "object") {
        return projectIndex.identifiers;
    }

    if (projectIndex.identifierCollections && typeof projectIndex.identifierCollections === "object") {
        return projectIndex.identifierCollections;
    }

    return {};
}

function buildSemanticIdentifierIndex(
    projectIndex: SemanticProjectIndexLike,
    projectRoot: string,
    options: ProjectAnalysisBuildOptions
): ProjectIndex {
    const identifierToFiles = new Map<string, Set<string>>();
    const identifierCollections = getIdentifierCollections(projectIndex);

    for (const collection of Object.values(identifierCollections)) {
        if (!collection || typeof collection !== "object") {
            continue;
        }

        for (const entry of Object.values(collection as Record<string, unknown>)) {
            addIdentifierOccurrencesFromCollectionEntry({
                projectRoot,
                entry,
                options,
                identifierToFiles
            });
        }
    }

    for (const scriptCall of projectIndex.relationships?.scriptCalls ?? []) {
        const targetName = scriptCall?.target?.name;
        const fromFilePath = normalizeProjectEntryFilePath(projectRoot, scriptCall?.from?.filePath);
        if (!targetName || !fromFilePath) {
            continue;
        }

        addIdentifierFile(identifierToFiles, targetName, fromFilePath, options);
    }

    return Object.freeze({
        identifierToFiles: new Map<string, ReadonlySet<string>>(
            [...identifierToFiles.entries()].map(([name, files]) => [name, new Set(files)])
        )
    });
}

export function createProjectAnalysisSnapshotFromProjectIndex(
    projectIndex: unknown,
    projectRoot: string,
    options: ProjectAnalysisBuildOptions
): ProjectAnalysisSnapshot {
    const normalizedRoot = normalizeLintFilePath(projectRoot);
    const index = buildSemanticIdentifierIndex(projectIndex as SemanticProjectIndexLike, normalizedRoot, options);
    return createProjectAnalysisSnapshot(index);
}

export function createPrebuiltProjectAnalysisProvider(
    snapshotsByRoot: ReadonlyMap<string, ProjectAnalysisSnapshot>
): ProjectAnalysisProvider {
    const missingSnapshot = createMissingProjectAnalysisSnapshot();
    const normalizedSnapshotsByRoot = new Map<string, ProjectAnalysisSnapshot>();
    for (const [projectRoot, snapshot] of snapshotsByRoot.entries()) {
        normalizedSnapshotsByRoot.set(normalizeLintFilePath(projectRoot), snapshot);
    }

    return Object.freeze({
        buildSnapshot(projectRoot: string): ProjectAnalysisSnapshot {
            const normalizedRoot = normalizeLintFilePath(projectRoot);
            return normalizedSnapshotsByRoot.get(normalizedRoot) ?? missingSnapshot;
        }
    });
}
