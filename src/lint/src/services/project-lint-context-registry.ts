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

export type ProjectLintContextRegistry = Readonly<{
    getContext(filePath: string): GmlProjectContext | null;
    getForcedRoot(): string | null;
    isOutOfForcedRoot(filePath: string): boolean;
}>;

export function createProjectLintContextRegistry(options: RegistryOptions): ProjectLintContextRegistry {
    const forcedRoot = resolveForcedProjectRoot(options.forcedProjectPath);
    const normalizedAllowedDirectories = options.indexAllowDirectories.map((directory) =>
        normalizeLintFilePath(directory)
    );
    const contextCache = new Map<string, GmlProjectContext>();

    return Object.freeze({
        getContext(filePath: string): GmlProjectContext | null {
            const normalizedFilePath = normalizeLintFilePath(filePath);

            if (forcedRoot && !isPathWithinBoundary(normalizedFilePath, forcedRoot)) {
                return null;
            }

            const resolvedRoot =
                forcedRoot ?? resolveNearestProjectRoot(normalizedFilePath, normalizeLintFilePath(options.cwd));
            const key = normalizeLintFilePath(resolvedRoot);

            const existing = contextCache.get(key);
            if (existing) {
                return existing;
            }

            const hasAllowedOverrides = normalizedAllowedDirectories.some((directory) =>
                isPathWithinBoundary(normalizedFilePath, directory)
            );

            const context = createEmptyContext();
            if (hasAllowedOverrides) {
                // Reserved for future capability upgrades when index-allow provides extra data.
            }

            contextCache.set(key, context);
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
