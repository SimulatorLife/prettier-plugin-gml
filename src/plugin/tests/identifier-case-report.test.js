import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
    setIdentifierCaseDryRunContext,
    clearIdentifierCaseDryRunContexts
} from "../src/reporting/identifier-case-context.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

function createSampleRenamePlan() {
    return {
        operations: [
            {
                id: "rename-calc-damage",
                kind: "identifier",
                scope: {
                    id: "scope:script:attack",
                    displayName: "script.attack"
                },
                from: { name: "calc_damage" },
                to: { name: "calcDamage" },
                references: [
                    {
                        filePath: "scripts/attack/attack.gml",
                        occurrences: 1
                    },
                    {
                        filePath: "objects/obj_enemy/obj_enemy_Create_0.gml",
                        occurrences: 2
                    }
                ]
            },
            {
                id: "rename-macro-cap",
                kind: "macro",
                scope: {
                    id: "scope:macro:damage_cap",
                    displayName: "macro.damage_cap"
                },
                from: { name: "damage_cap" },
                to: { name: "DAMAGE_CAP" },
                references: [
                    {
                        filePath: "scripts/attack/attack.gml",
                        occurrences: 1
                    }
                ]
            }
        ]
    };
}

function createSampleConflicts() {
    return [
        {
            code: "collision",
            severity: "error",
            message: "calcDamage already exists in script.attack",
            scope: {
                id: "scope:script:attack",
                displayName: "script.attack"
            },
            identifier: "calc_damage",
            suggestions: ["calcDamageAlt"]
        },
        {
            code: "ignored",
            severity: "warning",
            message: "damage_cap preserved by configuration",
            scope: {
                id: "scope:macro:damage_cap",
                displayName: "macro.damage_cap"
            },
            identifier: "damage_cap"
        }
    ];
}

async function formatWithReporter({
    source,
    renamePlan,
    conflicts,
    dryRun,
    diagnostics,
    logPath,
    logger,
    filepath
}) {
    setIdentifierCaseDryRunContext({
        filepath,
        renamePlan,
        conflicts,
        dryRun,
        logFilePath: logPath,
        logger,
        diagnostics
    });

    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        filepath,
        diagnostics,
        logger
    });
}

describe("identifier case reporting", () => {
    it("emits a dry-run summary and diagnostic report", async () => {
        const renamePlan = createSampleRenamePlan();
        const conflicts = createSampleConflicts();
        const diagnostics = [];
        const messages = [];
        const logger = {
            log(message) {
                messages.push(message);
            },
            warn(message) {
                messages.push(`WARN: ${message}`);
            }
        };

        const tempRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "gml-identifier-report-")
        );
        const logPath = path.join(tempRoot, "logs", "identifier-case.json");
        const filePath = path.join(tempRoot, "scripts", "attack", "attack.gml");

        try {
            const formatted = await formatWithReporter({
                source:
          "function attack(target) {\n    return calc_damage(target);\n}\n",
                renamePlan,
                conflicts,
                dryRun: true,
                diagnostics,
                logPath,
                logger,
                filepath: filePath
            });

            assert.match(formatted, /function attack\(target\)/);
            assert.ok(
                messages.length > 0,
                "expected dry-run reporter to emit console output"
            );

            const joinedMessages = messages.join("\n");
            assert.match(joinedMessages, /Identifier case dry-run summary/);
            assert.match(
                joinedMessages,
                /Planned renames: 2 \(4 references across 2 files\)/i
            );
            assert.match(joinedMessages, /Conflicts: 2 \(1 error, 1 warning\)/i);
            assert.match(joinedMessages, /script\.attack: calc_damage -> calcDamage/);
            assert.match(
                joinedMessages,
                /macro\.damage_cap: damage_cap -> DAMAGE_CAP/
            );
            assert.match(joinedMessages, /\[error\]\s*\[collision\]/i);

            assert.equal(diagnostics.length, 1);
            const diagnostic = diagnostics[0];
            assert.equal(
                diagnostic.code,
                "gml-identifier-case-summary",
                "expected diagnostic code to be namespaced"
            );
            assert.equal(diagnostic.summary.renameCount, 2);
            assert.equal(diagnostic.summary.conflictCount, 2);
            assert.equal(diagnostic.renames.length, 2);
            assert.equal(diagnostic.conflicts.length, 2);

            const logContents = await fs.readFile(logPath, "utf8");
            const parsedLog = JSON.parse(logContents);

            assert.equal(parsedLog.version, 1);
            assert.equal(parsedLog.summary.renameCount, 2);
            assert.equal(parsedLog.summary.conflictCount, 2);
            assert.equal(parsedLog.renames.length, 2);
            assert.equal(parsedLog.conflicts.length, 2);
            assert.ok(
                Array.isArray(parsedLog.renames[0].references),
                "expected log to include reference metadata"
            );
        } finally {
            clearIdentifierCaseDryRunContexts();
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });

    it("skips reporting when write mode is enabled", async () => {
        const renamePlan = createSampleRenamePlan();
        const conflicts = createSampleConflicts();
        const diagnostics = [];
        const messages = [];
        const logger = {
            log(message) {
                messages.push(message);
            }
        };

        try {
            const formatted = await formatWithReporter({
                source:
          "function attack(target) {\n    return calc_damage(target);\n}\n",
                renamePlan,
                conflicts,
                dryRun: false,
                diagnostics,
                logPath: null,
                logger,
                filepath: path.join(os.tmpdir(), "dry-run-write-mode", "attack.gml")
            });

            assert.match(formatted, /function attack\(target\)/);
            assert.equal(messages.length, 0, "did not expect dry-run summary");
            assert.equal(diagnostics.length, 0);
        } finally {
            clearIdentifierCaseDryRunContexts();
        }
    });
});
