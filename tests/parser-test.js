import GMLParser from "../src/parser/gml-parser.js";
import fs from "fs";

const fp = "test/large-files/SnowState.gml";
let input = fs.readFileSync(fp, "utf8");

console.time("cold");
GMLParser.parse(input, {getLocations: true});
console.timeEnd("cold");

console.time("warm");
const ast = GMLParser.parse(input, {getLocations: true});
console.timeEnd("warm");

const astText = JSON.stringify(ast, null, 3);

console.log("Result AST text:", astText);
