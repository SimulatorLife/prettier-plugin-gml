import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { normalizeLintFilePath } from "../language/path-normalization.js";
import type { ProjectCapability } from "../types/index.js";
import type { GmlProjectContext, GmlProjectSettings } from "./index.js";
import { isPathWithinBoundary } from "./path-boundary.js";
import { resolveForcedProjectRoot, resolveNearestProjectRoot } from "./project-root.js";

export const DEFAULT_PROJECT_INDEX_EXCLUDES = Object.freeze([".git", "node_modules", "dist", "generated", "vendor"]);

type RegistryOptions = Readonly<{
    cwd: string;
    forcedProjectPath: string | null;
    indexAllowDirectories: ReadonlyArray<string>;
}>;

const IDENTIFIER_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\b/gu;
const ALL_PROJECT_CAPABILITIES: ReadonlySet<ProjectCapability> = new Set<ProjectCapability>([
    "IDENTIFIER_OCCUPANCY",
    "IDENTIFIER_OCCURRENCES",
    "LOOP_HOIST_NAME_RESOLUTION",
    "RENAME_CONFLICT_PLANNING"
]);

function splitPathSegments(pathValue: string): Array<string> {
    return pathValue
        .split(/[\\/]+/u)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
}

function isHardExcludedPath(
    filePath: string,
    excludedDirectories: ReadonlySet<string>,
    allowedDirectories: ReadonlyArray<string>
): boolean {
    const isAllowedOverride = allowedDirectories.some((directory) => isPathWithinBoundary(filePath, directory));
    if (isAllowedOverride) {
        return false;
    }

    const segments = splitPathSegments(filePath);
    return segments.some((segment) => excludedDirectories.has(segment.toLowerCase()));
}

export type ProjectLintContextRegistry = Readonly<{
    getContext(filePath: string): GmlProjectContext | null;
    getForcedRoot(): string | null;
    isOutOfForcedRoot(filePath: string): boolean;
}>;

type ProjectIndex = Readonly<{
    identifierToFiles: ReadonlyMap<string, ReadonlySet<string>>;
}>;

function collectEligibleGmlFiles(rootPath: string, excludedDirectories: ReadonlySet<string>): Array<string> {
    const filePaths: Array<string> = [];
    const directories = [rootPath];

    while (directories.length > 0) {
        const currentDirectory = directories.pop();
        if (!currentDirectory) {
            continue;
        }

        let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
        try {
            entries = readdirSync(currentDirectory, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const entryPath = path.join(currentDirectory, entry.name);
            if (entry.isDirectory()) {
                if (excludedDirectories.has(entry.name.toLowerCase())) {
                    continue;
                }
                directories.push(entryPath);
                continue;
            }

            if (entry.isFile() && entry.name.toLowerCase().endsWith(".gml")) {
                filePaths.push(normalizeLintFilePath(entryPath));
            }
        }
    }

    filePaths.sort((left, right) => left.localeCompare(right));
    return filePaths;
}

function buildProjectIndex(rootPath: string, excludedDirectories: ReadonlySet<string>): ProjectIndex {
    const identifierMap = new Map<string, Set<string>>();
    const files = collectEligibleGmlFiles(rootPath, excludedDirectories);

    for (const filePath of files) {
        let sourceText: string;
        try {
            sourceText = readFileSync(filePath, "utf8");
        } catch {
            continue;
        }

        const identifiers = sourceText.match(IDENTIFIER_PATTERN) ?? [];
        for (const identifier of identifiers) {
            if (identifier.length === 0) {
                continue;
            }

            const bucket = identifierMap.get(identifier) ?? new Set<string>();
            bucket.add(filePath);
            identifierMap.set(identifier, bucket);
        }
    }

    const frozenEntries = new Map<string, ReadonlySet<string>>();
    for (const [identifier, fileSet] of identifierMap.entries()) {
        frozenEntries.set(identifier, new Set(fileSet));
    }

    return Object.freeze({
        identifierToFiles: frozenEntries
    });
}

function resolveLoopHoistIdentifierName(
    preferredName: string,
    localIdentifierNames: ReadonlySet<string>
): string | null {
    if (!preferredName || localIdentifierNames.has(preferredName)) {
        const baseName = preferredName.length > 0 ? preferredName : "len";
        for (let index = 1; index <= 1000; index += 1) {
            const candidate = `${baseName}_${index}`;
            if (!localIdentifierNames.has(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    return preferredName;
}

function createIndexedContext(index: ProjectIndex): GmlProjectContext {
    return Object.freeze({
        capabilities: ALL_PROJECT_CAPABILITIES,
        isIdentifierNameOccupiedInProject(identifierName: string): boolean {
            return index.identifierToFiles.has(identifierName);
        },
        listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string> {
            const files = index.identifierToFiles.get(identifierName);
            return files ?? new Set<string>();
        },
        planFeatherRenames(
            requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>
        ): ReadonlyArray<{
            identifierName: string;
            preferredReplacementName: string;
            safe: boolean;
            reason: string | null;
        }> {
            return requests.map((request) => {
                if (request.identifierName === request.preferredReplacementName) {
                    return {
                        identifierName: request.identifierName,
                        preferredReplacementName: request.preferredReplacementName,
                        safe: false,
                        reason: "no-op-rename"
                    };
                }

                if (index.identifierToFiles.has(request.preferredReplacementName)) {
                    return {
                        identifierName: request.identifierName,
                        preferredReplacementName: request.preferredReplacementName,
                        safe: false,
                        reason: "name-collision"
                    };
                }

                return {
                    identifierName: request.identifierName,
                    preferredReplacementName: request.preferredReplacementName,
                    safe: true,
                    reason: null
                };
            });
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
        resolveLoopHoistIdentifier(preferredName: string, localIdentifierNames: ReadonlySet<string>): string | null {
            return resolveLoopHoistIdentifierName(preferredName, localIdentifierNames);
        }
    });
}

export function createProjectLintContextRegistry(options: RegistryOptions): ProjectLintContextRegistry {
    const normalizedCwd = normalizeLintFilePath(options.cwd);
    const forcedRoot = resolveForcedProjectRoot(options.forcedProjectPath);
    const normalizedAllowedDirectories = options.indexAllowDirectories.map((directory) =>
        normalizeLintFilePath(directory)
    );
    const excludedDirectories = new Set(DEFAULT_PROJECT_INDEX_EXCLUDES.map((directory) => directory.toLowerCase()));
    const contextCache = new Map<string, GmlProjectContext>();
    const indexCache = new Map<string, ProjectIndex>();

    return Object.freeze({
        getContext(filePath: string): GmlProjectContext | null {
            const normalizedFilePath = normalizeLintFilePath(filePath);

            if (forcedRoot && !isPathWithinBoundary(normalizedFilePath, forcedRoot)) {
                return null;
            }

            if (isHardExcludedPath(normalizedFilePath, excludedDirectories, normalizedAllowedDirectories)) {
                return null;
            }

            const resolvedRoot = forcedRoot ?? resolveNearestProjectRoot(normalizedFilePath, normalizedCwd);
            const cacheKey = normalizeLintFilePath(resolvedRoot);

            const cachedContext = contextCache.get(cacheKey);
            if (cachedContext) {
                return cachedContext;
            }

            const cachedIndex = indexCache.get(cacheKey);
            const index = cachedIndex ?? buildProjectIndex(cacheKey, excludedDirectories);
            if (!cachedIndex) {
                indexCache.set(cacheKey, index);
            }

            const context = createIndexedContext(index);
            contextCache.set(cacheKey, context);
            return context;
        },
        getForcedRoot(): string | null {
            return forcedRoot;
        },
        isOutOfForcedRoot(filePath: string): boolean {
            if (!forcedRoot) {
                return false;
            }

            return !isPathWithinBoundary(normalizeLintFilePath(filePath), forcedRoot);
        }
    });
}

export function createProjectSettingsFromRegistry(registry: ProjectLintContextRegistry): GmlProjectSettings {
    return Object.freeze({
        getContext(filePath: string): GmlProjectContext | null {
            return registry.getContext(filePath);
        }
    });
}
