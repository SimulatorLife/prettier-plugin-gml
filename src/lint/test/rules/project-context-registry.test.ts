import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as LintWorkspace from "../../src/index.js";
import type { ProjectAnalysisProvider } from "../../src/services/index.js";

function createProject(tempRoot: string, relativePath: string, projectName: string): string {
    const projectRoot = path.join(tempRoot, relativePath);
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(path.join(projectRoot, `${projectName}.yyp`), "{}", "utf8");
    return projectRoot;
}

function createProviderWithSnapshots(
    snapshotsByRoot: ReadonlyMap<
        string,
        ReturnType<typeof LintWorkspace.Lint.services.createProjectAnalysisSnapshotFromProjectIndex>
    >
): ProjectAnalysisProvider {
    return LintWorkspace.Lint.services.createPrebuiltProjectAnalysisProvider(snapshotsByRoot);
}

function createSemanticSnapshotForIdentifier(parameters: {
    projectRoot: string;
    identifierName: string;
    filePath: string;
    allowedDirectories?: ReadonlyArray<string>;
}): ReturnType<typeof LintWorkspace.Lint.services.createProjectAnalysisSnapshotFromProjectIndex> {
    return LintWorkspace.Lint.services.createProjectAnalysisSnapshotFromProjectIndex(
        {
            identifiers: {
                locals: {
                    score: {
                        declarations: [{ name: parameters.identifierName, filePath: parameters.filePath }],
                        references: []
                    }
                }
            }
        },
        parameters.projectRoot,
        {
            excludedDirectories: new Set(
                LintWorkspace.Lint.services.defaultProjectIndexExcludes.map((directory) => directory.toLowerCase())
            ),
            allowedDirectories: parameters.allowedDirectories ?? []
        }
    );
}

void test("nearest-ancestor detection supports multi-root trees deterministically", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-root-"));
    const parentProjectRoot = createProject(tempRoot, "workspace", "workspace");
    const childProjectRoot = createProject(tempRoot, "workspace/modules/game", "game");
    const nestedFile = path.join(childProjectRoot, "objects", "o_test", "o_test.gml");

    mkdirSync(path.dirname(nestedFile), { recursive: true });
    writeFileSync(nestedFile, "", "utf8");

    const registry = LintWorkspace.Lint.services.createProjectLintContextRegistry({
        cwd: tempRoot,
        forcedProjectPath: null,
        indexAllowDirectories: [],
        analysisProvider: createProviderWithSnapshots(new Map())
    });
    const contextFromNestedFile = registry.getContext(nestedFile);
    const contextFromParentRootFile = registry.getContext(path.join(parentProjectRoot, "scripts", "parent.gml"));

    assert.ok(contextFromNestedFile);
    assert.notEqual(contextFromNestedFile, contextFromParentRootFile);

    rmSync(tempRoot, { recursive: true, force: true });
});

void test("registry builds one immutable context per normalized root", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-context-"));
    const projectRoot = createProject(tempRoot, "project", "project");
    const firstFile = path.join(projectRoot, "scripts", "a.gml");
    const secondFile = path.join(projectRoot, "scripts", "b.gml");

    mkdirSync(path.dirname(firstFile), { recursive: true });
    writeFileSync(firstFile, "", "utf8");
    writeFileSync(secondFile, "", "utf8");

    const registry = LintWorkspace.Lint.services.createProjectLintContextRegistry({
        cwd: tempRoot,
        forcedProjectPath: null,
        indexAllowDirectories: [],
        analysisProvider: createProviderWithSnapshots(new Map())
    });

    const firstContext = registry.getContext(firstFile);
    const secondContext = registry.getContext(secondFile);

    assert.ok(firstContext);
    assert.equal(firstContext, secondContext);
    assert.equal(Object.isFrozen(firstContext), true);

    rmSync(tempRoot, { recursive: true, force: true });
});

void test("forced root behavior and out-of-root classification are deterministic", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-forced-"));
    const forcedProjectRoot = createProject(tempRoot, "forced-root", "forced-root");
    const insideFile = path.join(forcedProjectRoot, "scripts", "inside.gml");
    const outsideProjectRoot = createProject(tempRoot, "outside", "outside");
    const outsideFile = path.join(outsideProjectRoot, "scripts", "outside.gml");

    mkdirSync(path.dirname(insideFile), { recursive: true });
    mkdirSync(path.dirname(outsideFile), { recursive: true });
    writeFileSync(insideFile, "", "utf8");
    writeFileSync(outsideFile, "", "utf8");

    const registry = LintWorkspace.Lint.services.createProjectLintContextRegistry({
        cwd: tempRoot,
        forcedProjectPath: path.join(forcedProjectRoot, "forced-root.yyp"),
        indexAllowDirectories: [],
        analysisProvider: createProviderWithSnapshots(new Map())
    });

    assert.ok(registry.getContext(insideFile));
    assert.equal(registry.getContext(outsideFile), null);
    assert.equal(registry.isOutOfForcedRoot(insideFile), false);
    assert.equal(registry.isOutOfForcedRoot(outsideFile), true);

    rmSync(tempRoot, { recursive: true, force: true });
});

void test("hard excludes apply by default and --index-allow is monotonic", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-excludes-"));
    const projectRoot = createProject(tempRoot, "project", "project");
    const excludedDirectory = path.join(projectRoot, "generated", "cache");
    const excludedFile = path.join(excludedDirectory, "generated.gml");

    mkdirSync(excludedDirectory, { recursive: true });
    writeFileSync(excludedFile, "var generated_score = 1;\n", "utf8");

    const semanticSnapshot = createSemanticSnapshotForIdentifier({
        projectRoot,
        identifierName: "generated_score",
        filePath: excludedFile,
        allowedDirectories: [excludedDirectory]
    });

    const withoutAllow = LintWorkspace.Lint.services.createProjectLintContextRegistry({
        cwd: tempRoot,
        forcedProjectPath: null,
        indexAllowDirectories: [],
        analysisProvider: createProviderWithSnapshots(new Map([[projectRoot, semanticSnapshot]]))
    });
    const withAllow = LintWorkspace.Lint.services.createProjectLintContextRegistry({
        cwd: tempRoot,
        forcedProjectPath: null,
        indexAllowDirectories: [excludedDirectory],
        analysisProvider: createProviderWithSnapshots(new Map([[projectRoot, semanticSnapshot]]))
    });

    assert.equal(withoutAllow.getContext(excludedFile), null);
    const allowedContext = withAllow.getContext(excludedFile);
    assert.ok(allowedContext);
    assert.equal(allowedContext?.isIdentifierNameOccupiedInProject("generated_score"), true);

    rmSync(tempRoot, { recursive: true, force: true });
});

void test("indexed project context exposes capability-backed identifier helpers", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-capabilities-"));
    const projectRoot = createProject(tempRoot, "project", "project");
    const scriptFile = path.join(projectRoot, "scripts", "test.gml");

    mkdirSync(path.dirname(scriptFile), { recursive: true });
    writeFileSync(scriptFile, "var player_score = 0;\nplayer_score += 1;\n", "utf8");

    const semanticSnapshot = createSemanticSnapshotForIdentifier({
        projectRoot,
        identifierName: "player_score",
        filePath: scriptFile
    });

    const registry = LintWorkspace.Lint.services.createProjectLintContextRegistry({
        cwd: tempRoot,
        forcedProjectPath: null,
        indexAllowDirectories: [],
        analysisProvider: createProviderWithSnapshots(new Map([[projectRoot, semanticSnapshot]]))
    });

    const context = registry.getContext(scriptFile);
    assert.ok(context);
    if (!context) {
        return;
    }

    assert.equal(context.capabilities.has("IDENTIFIER_OCCUPANCY"), true);
    assert.equal(context.capabilities.has("IDENTIFIER_OCCURRENCES"), true);
    assert.equal(context.isIdentifierNameOccupiedInProject("player_score"), true);
    assert.equal(context.isIdentifierNameOccupiedInProject("unknown_identifier"), false);

    const files = context.listIdentifierOccurrenceFiles("player_score");
    assert.equal(files.size > 0, true);
    assert.equal(context.resolveLoopHoistIdentifier("player_score", new Set(["player_score"])), "player_score_1");
    assert.equal(context.assessGlobalVarRewrite(path.resolve(scriptFile), true).allowRewrite, true);

    rmSync(tempRoot, { recursive: true, force: true });
});

void test("registry requires an explicit analysis provider", () => {
    assert.throws(
        () =>
            LintWorkspace.Lint.services.createProjectLintContextRegistry({
                cwd: process.cwd(),
                forcedProjectPath: null,
                indexAllowDirectories: []
            } as unknown as Parameters<typeof LintWorkspace.Lint.services.createProjectLintContextRegistry>[0]),
        /requires an injected project analysis provider/i
    );
});

void test("registry delegates snapshot construction to the configured analysis provider", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-provider-"));
    const projectRoot = createProject(tempRoot, "project", "project");
    const scriptFile = path.join(projectRoot, "scripts", "test.gml");

    mkdirSync(path.dirname(scriptFile), { recursive: true });
    writeFileSync(scriptFile, "var score = 0;\n", "utf8");

    const observedRoots: Array<string> = [];
    const analysisProvider: ProjectAnalysisProvider = {
        buildSnapshot(projectRootPath, _options) {
            observedRoots.push(projectRootPath);
            return {
                capabilities: new Set([
                    "IDENTIFIER_OCCUPANCY",
                    "IDENTIFIER_OCCURRENCES",
                    "LOOP_HOIST_NAME_RESOLUTION",
                    "RENAME_CONFLICT_PLANNING"
                ]),
                isIdentifierNameOccupiedInProject(identifierName: string): boolean {
                    return identifierName === "score";
                },
                listIdentifierOccurrenceFiles(): ReadonlySet<string> {
                    return new Set([scriptFile]);
                },
                planFeatherRenames(requests) {
                    return requests.map((request) => ({
                        identifierName: request.identifierName,
                        preferredReplacementName: request.preferredReplacementName,
                        safe: true,
                        reason: null
                    }));
                },
                assessGlobalVarRewrite(_filePath, _hasInitializer) {
                    return { allowRewrite: true, reason: null };
                },
                resolveLoopHoistIdentifier(preferredName, _localIdentifierNames) {
                    return preferredName;
                }
            };
        }
    };

    const registry = LintWorkspace.Lint.services.createProjectLintContextRegistry({
        cwd: tempRoot,
        forcedProjectPath: null,
        indexAllowDirectories: [],
        analysisProvider
    });

    const firstContext = registry.getContext(scriptFile);
    const secondContext = registry.getContext(scriptFile);
    assert.ok(firstContext);
    assert.equal(firstContext, secondContext);
    assert.equal(observedRoots.length, 1);
    assert.equal(LintWorkspace.Lint.services.isPathWithinBoundary(scriptFile, observedRoots[0] ?? ""), true);
    assert.equal(firstContext?.isIdentifierNameOccupiedInProject("score"), true);
    assert.equal(firstContext?.isIdentifierNameOccupiedInProject("other"), false);

    rmSync(tempRoot, { recursive: true, force: true });
});

void test("identical project roots return consistent project-aware answers", () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), "lint-root-consistency-"));
    const projectRoot = createProject(tempRoot, "project", "project");
    const firstFile = path.join(projectRoot, "scripts", "a.gml");
    const secondFile = path.join(projectRoot, "scripts", "b.gml");

    mkdirSync(path.dirname(firstFile), { recursive: true });
    writeFileSync(firstFile, "", "utf8");
    writeFileSync(secondFile, "", "utf8");

    const semanticSnapshot = createSemanticSnapshotForIdentifier({
        projectRoot,
        identifierName: "shared_score",
        filePath: firstFile
    });

    const registry = LintWorkspace.Lint.services.createProjectLintContextRegistry({
        cwd: tempRoot,
        forcedProjectPath: null,
        indexAllowDirectories: [],
        analysisProvider: createProviderWithSnapshots(new Map([[projectRoot, semanticSnapshot]]))
    });

    const firstContext = registry.getContext(firstFile);
    const secondContext = registry.getContext(secondFile);

    assert.ok(firstContext);
    assert.ok(secondContext);
    assert.equal(firstContext?.isIdentifierNameOccupiedInProject("shared_score"), true);
    assert.equal(secondContext?.isIdentifierNameOccupiedInProject("shared_score"), true);
    assert.deepEqual(
        [...(firstContext?.listIdentifierOccurrenceFiles("shared_score") ?? new Set<string>())],
        [...(secondContext?.listIdentifierOccurrenceFiles("shared_score") ?? new Set<string>())]
    );

    rmSync(tempRoot, { recursive: true, force: true });
});
