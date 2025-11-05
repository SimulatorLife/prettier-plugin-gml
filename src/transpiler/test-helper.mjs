import GMLParser from "gamemaker-language-parser";
import { emitJavaScript } from "./src/emitter.js";

// Test expressions that work
const tests = [
    "x = arr[0]",
    "y = obj.prop",
    "result = func()",
    "if (x > 0) { y = 1; }"
];

for (const test of tests) {
    console.log(`\n=== Testing: ${test} ===`);
    try {
        const parser = new GMLParser(test);
        const ast = parser.parse();
        console.log("AST:", JSON.stringify(ast, null, 2).slice(0, 500));
        const js = emitJavaScript(ast);
        console.log("JS:", js);
    } catch (error) {
        console.error("Error:", error.message);
    }
}
