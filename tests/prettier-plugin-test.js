// prettier-plugin-test.js

import * as prettier from "prettier";
import fs from "fs";

const fp = "test/input/loungeware.gml";
let input = fs.readFileSync(fp, "utf8");

const output = prettier.format(input, {
    parser: "gml-parse",
    // plugins: ["./src/plugin/src/gml.js"]
    pluginSearchDirs: ["../gamemaker-language-parser"],
    plugins: ["prettier-plugin-gamemaker"],
});

console.log(output);
