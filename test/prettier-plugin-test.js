// prettier-plugin-test.js

import * as prettier from "prettier";
import fs from "fs";

const fp = "test/input/loungeware.gml";
let input = fs.readFileSync(fp, "utf8");

const output = await prettier.format(input, {
    parser: "gml-parse",
    plugins: ["./src/plugin/src/gml.js"]
});

console.log(output);
