// This test suite verifies that the workspaces in the monorepo adhere to the intended dependency structure regarding Prettier and related formatting packages
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);

type WorkspacePolicy = {
    name: string;
    allowPrettierPeerDep: boolean;
    requirePrettierPeerDep: boolean;
};

const TARGET_WORKSPACES: Array<WorkspacePolicy> = [
    { name: "@gml-modules/core", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/lint", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/parser", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/semantic", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/transpiler", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/runtime-wrapper", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/refactor", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/cli", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/format", allowPrettierPeerDep: true, requirePrettierPeerDep: true }
];

const NO_PRETTIER_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"] as const;
const FORMATTING_DEPENDENCIES = new Set(["prettier", "eslint-config-prettier", "@prettier/plugin-xml"]);

type DependencyMap = Record<string, string>;
type PackageJsonShape = {
    dependencies?: DependencyMap;
    devDependencies?: DependencyMap;
    optionalDependencies?: DependencyMap;
    peerDependencies?: DependencyMap;
};

void describe("prettier workspace dependencies", () => {
    for (const { name, allowPrettierPeerDep, requirePrettierPeerDep } of TARGET_WORKSPACES) {
        void it(`${name} prettier dependency configuration`, () => {
            const packageJson = require(`${name}/package.json`) as PackageJsonShape;

            for (const section of NO_PRETTIER_SECTIONS) {
                const deps = packageJson[section];
                assert.ok(!deps || deps.prettier === undefined, `${name} must not list prettier inside ${section}`);
            }

            const peerDeps = packageJson.peerDependencies ?? {};
            const hasPrettierPeerDep = peerDeps.prettier !== undefined;

            if (!allowPrettierPeerDep) {
                assert.ok(!hasPrettierPeerDep, `${name} must not list prettier inside peerDependencies`);
            }

            if (requirePrettierPeerDep) {
                assert.ok(hasPrettierPeerDep, `${name} must list prettier as a peer dependency`);
            }
        });
    }

    void it("only format workspace can depend on formatting packages", () => {
        for (const { name } of TARGET_WORKSPACES) {
            const packageJson = require(`${name}/package.json`) as PackageJsonShape;
            const allSections = [
                packageJson.dependencies ?? {},
                packageJson.devDependencies ?? {},
                packageJson.optionalDependencies ?? {},
                packageJson.peerDependencies ?? {}
            ];

            for (const dependencyName of FORMATTING_DEPENDENCIES) {
                const isDeclared = allSections.some((section) => section[dependencyName] !== undefined);
                if (name === "@gml-modules/format") {
                    continue;
                }

                assert.equal(
                    isDeclared,
                    false,
                    `${name} must not depend on formatter packages like ${dependencyName}; keep formatting dependencies format-only`
                );
            }
        }
    });
});
