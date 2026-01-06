const { Parser } = require("./src/parser/dist/index");
const code = `
function handle_lighting(multiplier = undefined, light_dir = [0, 0, -1]) {
    var dir = light_dir;
}
`;
const ast = Parser.GMLParser.parse(code);
console.log(JSON.stringify(ast, null, 2));
