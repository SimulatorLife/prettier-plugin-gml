import assert from "node:assert/strict";
import test from "node:test";

import { analyseResourceFiles } from "../src/project-index/resource-analysis.js";

test("analyseResourceFiles normalizes invalid resource metadata", async () => {
    const projectRoot = "/project";
    const relativePath = "scripts/calc_damage/calc_damage.yy";
    const absolutePath = `${projectRoot}/${relativePath}`;

    const yyFiles = [
        {
            relativePath,
            absolutePath
        }
    ];

    const fsFacade = {
        async readFile(path) {
            assert.equal(
                path,
                absolutePath,
                "expected resource document to be read"
            );

            return JSON.stringify({
                name: { text: "calc_damage" },
                resourceType: "GMScript"
            });
        }
    };

    const context = await analyseResourceFiles({
        projectRoot,
        yyFiles,
        fsFacade
    });

    const resourceRecord = context.resourcesMap.get(relativePath);
    assert.ok(resourceRecord, "expected resource record to be captured");
    assert.equal(
        resourceRecord.name,
        "calc_damage",
        "expected invalid resource name to fall back to the file stem"
    );
    assert.equal(
        resourceRecord.resourceType,
        "GMScript",
        "expected resource type to remain intact"
    );

    const scopeId = context.scriptNameToScopeId.get("calc_damage");
    assert.ok(
        scopeId?.startsWith("scope:script:"),
        "expected script scope identifier to be recorded with fallback name"
    );

    const resourcePath = context.scriptNameToResourcePath.get("calc_damage");
    assert.equal(
        resourcePath,
        resourceRecord.path,
        "expected script path lookup to reuse normalized resource name"
    );
});
