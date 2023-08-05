import GMLParser from "../src/gml-parser.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const testsDirectory = path.join(currentDirectory, "input");

const fp = path.join(testsDirectory, "SnowState.gml");
let input = fs.readFileSync(fp, "utf8");

console.time("cold");
GMLParser.parse(input, {getLocations: true});
console.timeEnd("cold");

console.time("warm");
const ast = GMLParser.parse(input, {getLocations: true});
console.timeEnd("warm");

const astText = JSON.stringify(ast, null, 3);

console.log("Result AST text:", astText);
