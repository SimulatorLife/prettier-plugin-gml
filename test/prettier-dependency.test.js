import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const TARGET_WORKSPACES = [
    { name: "@gml-modules/core", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/parser", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/semantic", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/transpiler", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/runtime-wrapper", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/refactor", allowPrettierPeerDep: false, requirePrettierPeerDep: false },
    { name: "@gml-modules/cli", allowPrettierPeerDep: true, requirePrettierPeerDep: false },
    { name: "@gml-modules/plugin", allowPrettierPeerDep: true, requirePrettierPeerDep: true }
];

const NO_PRETTIER_SECTIONS = [
    "dependencies",
    "devDependencies",
    "optionalDependencies"
];

describe("prettier workspace dependencies", () => {
    for (const { name, allowPrettierPeerDep, requirePrettierPeerDep } of TARGET_WORKSPACES) {
        it(`${name} prettier dependency configuration`, () => {
            const packageJson = require(`${name}/package.json`);

            // prettier must never appear in non-peer dependency sections
            for (const section of NO_PRETTIER_SECTIONS) {
                const deps = packageJson[section];
                assert.ok(
                    !deps || deps.prettier === undefined,
                    `${name} must not list prettier inside ${section}`
                );
            }

            const peerDeps = packageJson.peerDependencies || {};
            const hasPrettierPeerDep = peerDeps.prettier !== undefined;

            // if not allowed as a peer dep, ensure it's absent
            if (!allowPrettierPeerDep) {
                assert.ok(
                    !hasPrettierPeerDep,
                    `${name} must not list prettier inside peerDependencies`
                );
            }

            // if required as a peer dep, ensure it's present
            if (requirePrettierPeerDep) {
                assert.ok(
                    hasPrettierPeerDep,
                    `${name} must list prettier as a peer dependency`
                );
            }
        });
    }
});
