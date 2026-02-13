import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { createScriptSymbolId } from "../src/commands/watch.js";

void describe("createScriptSymbolId", () => {
    void it("builds a stable id using the relative path", () => {
        const watchRoot = path.join("/project", "game");
        const filePath = path.join(
            watchRoot,
            "scripts",
            "movement",
            "player_move.gml"
        );

        const symbolId = createScriptSymbolId(watchRoot, filePath);

        assert.equal(symbolId, "gml/script/scripts/movement/player_move");
    });

    void it("keeps scripts with duplicate basenames distinct", () => {
        const watchRoot = "/project/game";
        const firstPath = path.join(watchRoot, "ui", "menu", "init.gml");
        const secondPath = path.join(watchRoot, "scripts", "init.gml");

        const firstId = createScriptSymbolId(watchRoot, firstPath);
        const secondId = createScriptSymbolId(watchRoot, secondPath);

        assert.equal(firstId, "gml/script/ui/menu/init");
        assert.equal(secondId, "gml/script/scripts/init");
        assert.notEqual(firstId, secondId);
    });
});
