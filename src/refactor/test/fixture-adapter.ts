import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Refactor } from "../index.js";

async function collectGmlFiles(projectRoot: string): Promise<Array<string>> {
    const relativePaths: Array<string> = [];

    async function walk(currentPath: string): Promise<void> {
        const entries = await readdir(currentPath, { withFileTypes: true });
        await Promise.all(
            entries.map(async (entry) => {
                const entryPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    await walk(entryPath);
                    return;
                }
                if (!entry.isFile() || !entry.name.endsWith(".gml")) {
                    return;
                }
                relativePaths.push(path.relative(projectRoot, entryPath).split(path.sep).join("/"));
            })
        );
    }

    await walk(projectRoot);
    return relativePaths.sort((left, right) => left.localeCompare(right));
}

export function createRefactorFixtureAdapter() {
    return Object.freeze({
        workspaceName: "refactor",
        suiteName: "refactor fixtures",
        supports(kind: string) {
            return kind === "refactor";
        },
        async run({ config, tempProjectDirectoryPath, runProfiledStage }) {
            const normalizedConfig = Refactor.normalizeRefactorProjectConfig(config.refactor);
            const projectRoot = tempProjectDirectoryPath ?? "";
            const gmlFilePaths = await collectGmlFiles(projectRoot);
            const engine = new Refactor.RefactorEngine();
            await runProfiledStage("refactor", async () => {
                await engine.executeConfiguredCodemods({
                    projectRoot,
                    targetPaths: [projectRoot],
                    gmlFilePaths,
                    config: normalizedConfig,
                    readFile: async (filePath) =>
                        await readFile(path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath), "utf8"),
                    writeFile: async (filePath, content) =>
                        await writeFile(
                            path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath),
                            content,
                            "utf8"
                        ),
                    dryRun: false
                });
            });

            return {
                resultKind: "project-tree" as const,
                outputDirectoryPath: projectRoot,
                changed: true
            };
        }
    });
}
