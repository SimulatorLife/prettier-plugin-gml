/**
 * Lightweight dependency tracker for watch command hot-reload coordination.
 *
 * Tracks file-to-symbol mappings and symbol-to-file dependencies to enable
 * intelligent invalidation when files change. This is a stepping stone toward
 * full semantic analysis integration.
 *
 * Example usage:
 * ```ts
 * const tracker = new DependencyTracker();
 *
 * // Register file definitions
 * tracker.registerFileDefines("scripts/player.gml", ["gml_Script_player_move", "gml_Script_player_jump"]);
 * tracker.registerFileReferences("scripts/enemy.gml", ["gml_Script_player_move"]);
 *
 * // When player.gml changes, get dependent files
 * const dependents = tracker.getDependentFiles("scripts/player.gml");
 * // Returns: ["scripts/enemy.gml"] - files that reference symbols from player.gml
 * ```
 */

export interface DependencyGraph {
    fileToDefs: Map<string, Set<string>>;
    fileToRefs: Map<string, Set<string>>;
    symbolToDefFile: Map<string, string>;
    symbolToRefFiles: Map<string, Set<string>>;
}

export class DependencyTracker {
    private fileToDefs: Map<string, Set<string>>;
    private fileToRefs: Map<string, Set<string>>;
    private symbolToDefFile: Map<string, string>;
    private symbolToRefFiles: Map<string, Set<string>>;

    constructor() {
        this.fileToDefs = new Map();
        this.fileToRefs = new Map();
        this.symbolToDefFile = new Map();
        this.symbolToRefFiles = new Map();
    }

    /**
     * Register symbols defined by a file.
     * @param filePath - Path to the file
     * @param symbols - Symbols defined in the file
     */
    registerFileDefines(filePath: string, symbols: ReadonlyArray<string>): void {
        if (!this.fileToDefs.has(filePath)) {
            this.fileToDefs.set(filePath, new Set());
        }

        const defs = this.fileToDefs.get(filePath);
        for (const symbol of symbols) {
            defs.add(symbol);
            this.symbolToDefFile.set(symbol, filePath);
        }
    }

    /**
     * Register symbols referenced by a file.
     * @param filePath - Path to the file
     * @param symbols - Symbols referenced in the file
     */
    registerFileReferences(filePath: string, symbols: ReadonlyArray<string>): void {
        if (!this.fileToRefs.has(filePath)) {
            this.fileToRefs.set(filePath, new Set());
        }

        const refs = this.fileToRefs.get(filePath);
        for (const symbol of symbols) {
            refs.add(symbol);

            if (!this.symbolToRefFiles.has(symbol)) {
                this.symbolToRefFiles.set(symbol, new Set());
            }
            this.symbolToRefFiles.get(symbol).add(filePath);
        }
    }

    /**
     * Get files that depend on symbols defined in the given file.
     * When a file changes, these dependent files may need re-transpilation.
     *
     * @param filePath - Path to the changed file
     * @returns Array of file paths that depend on this file
     */
    getDependentFiles(filePath: string): Array<string> {
        const defs = this.fileToDefs.get(filePath);
        if (!defs) {
            return [];
        }

        const dependents = new Set<string>();
        for (const symbol of defs) {
            const refFiles = this.symbolToRefFiles.get(symbol);
            if (refFiles) {
                for (const refFile of refFiles) {
                    if (refFile !== filePath) {
                        dependents.add(refFile);
                    }
                }
            }
        }

        return Array.from(dependents);
    }

    /**
     * Get symbols defined by a file.
     * @param filePath - Path to the file
     * @returns Array of symbols defined in the file
     */
    getFileDefinitions(filePath: string): Array<string> {
        const defs = this.fileToDefs.get(filePath);
        return defs ? Array.from(defs) : [];
    }

    /**
     * Get symbols referenced by a file.
     * @param filePath - Path to the file
     * @returns Array of symbols referenced in the file
     */
    getFileReferences(filePath: string): Array<string> {
        const refs = this.fileToRefs.get(filePath);
        return refs ? Array.from(refs) : [];
    }

    /**
     * Remove all tracking data for a file.
     * Call this when a file is deleted.
     *
     * @param filePath - Path to the file
     */
    removeFile(filePath: string): void {
        const defs = this.fileToDefs.get(filePath);
        if (defs) {
            for (const symbol of defs) {
                this.symbolToDefFile.delete(symbol);
                // Do not delete symbolToRefFiles here - other files may still reference this symbol
            }
            this.fileToDefs.delete(filePath);
        }

        const refs = this.fileToRefs.get(filePath);
        if (refs) {
            for (const symbol of refs) {
                const refFiles = this.symbolToRefFiles.get(symbol);
                if (refFiles) {
                    refFiles.delete(filePath);
                    if (refFiles.size === 0) {
                        this.symbolToRefFiles.delete(symbol);
                    }
                }
            }
            this.fileToRefs.delete(filePath);
        }
    }

    /**
     * Clear all tracking data.
     */
    clear(): void {
        this.fileToDefs.clear();
        this.fileToRefs.clear();
        this.symbolToDefFile.clear();
        this.symbolToRefFiles.clear();
    }

    /**
     * Get a snapshot of the current dependency graph.
     * Useful for debugging and testing.
     *
     * @returns Copy of the internal dependency graph
     */
    getSnapshot(): DependencyGraph {
        return {
            fileToDefs: new Map(Array.from(this.fileToDefs.entries()).map(([k, v]) => [k, new Set(v)])),
            fileToRefs: new Map(Array.from(this.fileToRefs.entries()).map(([k, v]) => [k, new Set(v)])),
            symbolToDefFile: new Map(this.symbolToDefFile),
            symbolToRefFiles: new Map(Array.from(this.symbolToRefFiles.entries()).map(([k, v]) => [k, new Set(v)]))
        };
    }

    /**
     * Get summary statistics about tracked dependencies.
     * Useful for monitoring and diagnostics.
     */
    getStatistics(): {
        totalFiles: number;
        totalSymbols: number;
        filesWithDefs: number;
        filesWithRefs: number;
        averageDefsPerFile: number;
        averageRefsPerFile: number;
    } {
        const totalFiles = new Set([...this.fileToDefs.keys(), ...this.fileToRefs.keys()]).size;

        const totalDefs = Array.from(this.fileToDefs.values()).reduce((sum, defs) => sum + defs.size, 0);
        const totalRefs = Array.from(this.fileToRefs.values()).reduce((sum, refs) => sum + refs.size, 0);

        return {
            totalFiles,
            totalSymbols: this.symbolToDefFile.size,
            filesWithDefs: this.fileToDefs.size,
            filesWithRefs: this.fileToRefs.size,
            averageDefsPerFile: this.fileToDefs.size > 0 ? totalDefs / this.fileToDefs.size : 0,
            averageRefsPerFile: this.fileToRefs.size > 0 ? totalRefs / this.fileToRefs.size : 0
        };
    }
}
