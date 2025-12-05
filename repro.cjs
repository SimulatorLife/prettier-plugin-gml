
const prettier = require("prettier");
const path = require("path");

async function run() {
  const pluginPath = path.resolve("src/plugin/dist/index.js");
  const plugin = require(pluginPath).Plugin;

  const code = `
//}
//
// Make body wobble up and down // This is a trailing comment
z_wobble = ((sin(current_time * 0.004) + 1) * 2) + 2;
`;

  console.log("--- Input ---");
  console.log(code);
  console.log("-------------");

  try {
    const formatted = await prettier.format(code, {
      parser: "gml-parse",
      plugins: [plugin],
      tabWidth: 4,
    });
    console.log("--- Output ---");
    console.log(formatted);
    console.log("--------------");
    
    const lines = formatted.split('\n');
    lines.forEach((line, i) => {
        console.log(`Line ${i + 1}: '${line}'`);
    });

  } catch (e) {
    console.error(e);
  }
}

run();
