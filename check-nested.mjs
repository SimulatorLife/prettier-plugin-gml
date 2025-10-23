import { parse } from "./src/parser/src/index.js";

const code = `
function Line() constructor {
    function set_points(x1, y1, x2, y2) {
        self.x1 = x1;
    }
}
`;

try {
    const ast = parse(code);
    console.log(JSON.stringify(ast, null, 2));
} catch (error) {
    console.error("Parse error:", error.message);
}
