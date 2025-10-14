import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildProjectIndex } from "./node_modules/root/src/plugin/src/project-index/index.js";

const configFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.dirname(configFilePath);
const reportsDir = path.join(projectRoot, ".gml-reports");
const indexPath = path.join(reportsDir, "project-index.json");
const logPath = path.join(reportsDir, "identifier-case-dry-run.json");

await mkdir(reportsDir, { recursive: true });

let projectIndex;
try {
    const cachedIndex = await readFile(indexPath, "utf8");
    projectIndex = JSON.parse(cachedIndex);
} catch {
    projectIndex = await buildProjectIndex(projectRoot);
    await writeFile(indexPath, `${JSON.stringify(projectIndex, null, 2)}\n`, "utf8");
}

export default {
    plugins: ["./node_modules/root/src/plugin/src/gml.js"],
    overrides: [
        {
            files: "*.gml",
            options: {
                parser: "gml-parse"
            }
        }
    ],
    // Enable locals-first renaming while keeping other scopes in observation mode.
    gmlIdentifierCase: "camel",
    gmlIdentifierCaseLocals: "camel",
    gmlIdentifierCaseFunctions: "inherit",
    gmlIdentifierCaseStructs: "inherit",
    gmlIdentifierCaseInstance: "inherit",
    gmlIdentifierCaseGlobals: "inherit",
    gmlIdentifierCaseAssets: "off",
    gmlIdentifierCaseMacros: "inherit",
    // Persist the index and dry-run report so teammates can review the rollout.
    identifierCaseProjectIndex: projectIndex,
    identifierCaseDryRun: true,
    identifierCaseReportLogPath: logPath
};
