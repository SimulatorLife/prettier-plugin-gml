import { normalizeLintFilePath } from "../language/path-normalization.js";
import type { GmlProjectContext, GmlProjectSettings } from "./index.js";
import { isPathWithinBoundary } from "./path-boundary.js";
import { createTextProjectAnalysisProvider, type ProjectAnalysisProvider } from "./project-analysis-provider.js";
import { resolveForcedProjectRoot, resolveNearestProjectRoot } from "./project-root.js";

export const DEFAULT_PROJECT_INDEX_EXCLUDES = Object.freeze([".git", "node_modules", "dist", "generated", "vendor"]);

type RegistryOptions = Readonly<{
    cwd: string;
    forcedProjectPath: string | null;
    indexAllowDirectories: ReadonlyArray<string>;
    analysisProvider?: ProjectAnalysisProvider;
}>;

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

function createContextFromSnapshot(snapshot: ReturnType<ProjectAnalysisProvider["buildSnapshot"]>): GmlProjectContext {
    return Object.freeze({
        capabilities: snapshot.capabilities,
        isIdentifierNameOccupiedInProject(identifierName: string): boolean {
            return snapshot.isIdentifierNameOccupiedInProject(identifierName);
        },
        listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string> {
            return snapshot.listIdentifierOccurrenceFiles(identifierName);
        },
        planFeatherRenames(
            requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>
        ): ReadonlyArray<{
            identifierName: string;
            preferredReplacementName: string;
            safe: boolean;
            reason: string | null;
        }> {
            return snapshot.planFeatherRenames(requests);
        },
        assessGlobalVarRewrite(
            filePath: string | null,
            hasInitializer: boolean
        ): { allowRewrite: boolean; reason: string | null } {
            return snapshot.assessGlobalVarRewrite(filePath, hasInitializer);
        },
        resolveLoopHoistIdentifier(preferredName: string, localIdentifierNames: ReadonlySet<string>): string | null {
            return snapshot.resolveLoopHoistIdentifier(preferredName, localIdentifierNames);
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
    const analysisProvider = options.analysisProvider ?? createTextProjectAnalysisProvider();
    const contextCache = new Map<string, GmlProjectContext>();
    const snapshotCache = new Map<string, ReturnType<ProjectAnalysisProvider["buildSnapshot"]>>();

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

            const cachedSnapshot = snapshotCache.get(cacheKey);
            const snapshot =
                cachedSnapshot ??
                analysisProvider.buildSnapshot(cacheKey, {
                    excludedDirectories,
                    allowedDirectories: normalizedAllowedDirectories
                });
            if (!cachedSnapshot) {
                snapshotCache.set(cacheKey, snapshot);
            }

            const context = createContextFromSnapshot(snapshot);
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
