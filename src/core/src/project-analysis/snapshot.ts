export type ProjectAnalysisCapability =
    | "IDENTIFIER_OCCUPANCY"
    | "IDENTIFIER_OCCURRENCES"
    | "LOOP_HOIST_NAME_RESOLUTION"
    | "RENAME_CONFLICT_PLANNING";

export interface ProjectRenameRequest {
    identifierName: string;
    preferredReplacementName: string;
}

export interface ProjectRenamePlanEntry {
    identifierName: string;
    preferredReplacementName: string;
    safe: boolean;
    reason: string | null;
}

export interface ProjectAnalysisSnapshot {
    readonly capabilities: ReadonlySet<ProjectAnalysisCapability>;
    isIdentifierNameOccupiedInProject(identifierName: string): boolean;
    listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string>;
    planIdentifierRenames(requests: ReadonlyArray<ProjectRenameRequest>): ReadonlyArray<ProjectRenamePlanEntry>;
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): { allowRewrite: boolean; reason: string | null };
    resolveLoopHoistIdentifier(preferredName: string, localIdentifierNames: ReadonlySet<string>): string | null;
}

const ALL_PROJECT_CAPABILITIES: ReadonlySet<ProjectAnalysisCapability> = new Set<ProjectAnalysisCapability>([
    "IDENTIFIER_OCCUPANCY",
    "IDENTIFIER_OCCURRENCES",
    "LOOP_HOIST_NAME_RESOLUTION",
    "RENAME_CONFLICT_PLANNING"
]);

function normalizeIdentifierName(identifierName: string): string {
    return identifierName.trim().toLowerCase();
}

function resolveLoopHoistIdentifierName(
    preferredName: string,
    localIdentifierNames: ReadonlySet<string>,
    isProjectIdentifierOccupied: (identifierName: string) => boolean
): string | null {
    const normalizedLocalNames = new Set<string>();
    for (const name of localIdentifierNames) {
        normalizedLocalNames.add(normalizeIdentifierName(name));
    }

    const normalizedPreferredName = normalizeIdentifierName(preferredName);
    if (
        !normalizedPreferredName ||
        normalizedLocalNames.has(normalizedPreferredName) ||
        isProjectIdentifierOccupied(normalizedPreferredName)
    ) {
        const baseName = preferredName.length > 0 ? preferredName : "len";
        for (let index = 1; index <= 1000; index += 1) {
            const candidate = `${baseName}_${index}`;
            const normalizedCandidate = normalizeIdentifierName(candidate);
            if (!normalizedLocalNames.has(normalizedCandidate) && !isProjectIdentifierOccupied(normalizedCandidate)) {
                return candidate;
            }
        }

        return null;
    }

    return preferredName;
}

export function createProjectAnalysisSnapshotFromIndex(
    identifierToFiles: ReadonlyMap<string, ReadonlySet<string>>
): ProjectAnalysisSnapshot {
    const isIdentifierOccupied = (identifierName: string): boolean => {
        return identifierToFiles.has(normalizeIdentifierName(identifierName));
    };

    return Object.freeze({
        capabilities: ALL_PROJECT_CAPABILITIES,
        isIdentifierNameOccupiedInProject: isIdentifierOccupied,
        listIdentifierOccurrenceFiles(identifierName: string): ReadonlySet<string> {
            const files = identifierToFiles.get(normalizeIdentifierName(identifierName));
            return files ?? new Set<string>();
        },
        planIdentifierRenames(requests: ReadonlyArray<ProjectRenameRequest>): ReadonlyArray<ProjectRenamePlanEntry> {
            return requests.map((request) => {
                if (request.identifierName === request.preferredReplacementName) {
                    return {
                        identifierName: request.identifierName,
                        preferredReplacementName: request.preferredReplacementName,
                        safe: false,
                        reason: "no-op-rename"
                    };
                }

                const normalizedPreferredReplacementName = normalizeIdentifierName(request.preferredReplacementName);
                if (identifierToFiles.has(normalizedPreferredReplacementName)) {
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
            return resolveLoopHoistIdentifierName(preferredName, localIdentifierNames, isIdentifierOccupied);
        }
    });
}

export function createMissingProjectAnalysisSnapshot(reason: string): ProjectAnalysisSnapshot {
    return Object.freeze({
        capabilities: new Set<ProjectAnalysisCapability>(),
        isIdentifierNameOccupiedInProject(): boolean {
            return false;
        },
        listIdentifierOccurrenceFiles(): ReadonlySet<string> {
            return new Set<string>();
        },
        planIdentifierRenames(requests: ReadonlyArray<ProjectRenameRequest>): ReadonlyArray<ProjectRenamePlanEntry> {
            return requests.map((request) => ({
                identifierName: request.identifierName,
                preferredReplacementName: request.preferredReplacementName,
                safe: false,
                reason
            }));
        },
        assessGlobalVarRewrite(): { allowRewrite: boolean; reason: string | null } {
            return { allowRewrite: false, reason };
        },
        resolveLoopHoistIdentifier(): string | null {
            return null;
        }
    });
}
