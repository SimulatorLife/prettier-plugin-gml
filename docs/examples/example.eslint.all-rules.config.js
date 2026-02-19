import { Lint } from "@gml-modules/lint";
import { Semantic } from "@gml-modules/semantic";

const projectRoot = process.cwd();
const projectIndex = await Semantic.buildProjectIndex(projectRoot);
const excludedDirectories = new Set(
    Lint.services.defaultProjectIndexExcludes.map((entry) =>
        entry.toLowerCase()
    )
);
const snapshot = Lint.services.createProjectAnalysisSnapshotFromProjectIndex(
    projectIndex,
    projectRoot,
    {
        excludedDirectories,
        allowedDirectories: []
    }
);
const analysisProvider = Lint.services.createPrebuiltProjectAnalysisProvider(
    new Map([[projectRoot, snapshot]])
);
const registry = Lint.services.createProjectLintContextRegistry({
    cwd: process.cwd(),
    forcedProjectPath: null,
    indexAllowDirectories: [],
    analysisProvider
});
const projectSettings =
    Lint.services.createProjectSettingsFromRegistry(registry);

const allRuleLevels = Object.freeze(
    Object.fromEntries(
        Object.values(Lint.ruleIds).map((ruleId) => [ruleId, "error"])
    )
);

export default [
    {
        files: ["**/*.gml"],
        plugins: {
            gml: Lint.plugin,
            feather: Lint.featherPlugin
        },
        language: "gml/gml",
        rules: allRuleLevels,
        settings: {
            gml: {
                project: projectSettings
            }
        }
    }
];
