import GMLParser from "../gml-parser.js";
import fs from "fs";

const files = fs.readdirSync("test/input");

console.profile("benchmark");

for (const file of files) {
    console.log(`\n==== Parsing ${file} ====`);
    const input = fs.readFileSync("test/input/" + file, "utf8");
    console.time(file);
    GMLParser.parse(input);
    console.timeEnd(file);
}

for (const file of files) {
    console.log(`\n==== Parsing ${file} ====`);
    const input = fs.readFileSync("test/input/" + file, "utf8");
    console.time(file + " (warm)");
    GMLParser.parse(input);
    console.timeEnd(file + " (warm)");
}

console.profileEnd("benchmark");
