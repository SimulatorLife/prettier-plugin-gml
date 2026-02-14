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

function createEmptyContext(): GmlProjectContext {
    return Object.freeze({
        capabilities: new Set<ProjectCapability>()
    });
}

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

export function createProjectLintContextRegistry(options: RegistryOptions): ProjectLintContextRegistry {
    const normalizedCwd = normalizeLintFilePath(options.cwd);
    const forcedRoot = resolveForcedProjectRoot(options.forcedProjectPath);
    const normalizedAllowedDirectories = options.indexAllowDirectories.map((directory) =>
        normalizeLintFilePath(directory)
    );
    const excludedDirectories = new Set(DEFAULT_PROJECT_INDEX_EXCLUDES.map((directory) => directory.toLowerCase()));
    const contextCache = new Map<string, GmlProjectContext>();

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

            const context = createEmptyContext();
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
