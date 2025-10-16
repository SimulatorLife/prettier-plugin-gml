import { performance } from "node:perf_hooks";

function baseline(ast, enclosingNode, followingNode) {
    if (Array.isArray(ast?.body) && ast.body.length === 0) {
        return ast;
    }

    for (const node of [enclosingNode, followingNode]) {
        if (
            node?.type === "Program" &&
            Array.isArray(node.body) &&
            node.body.length === 0
        ) {
            return node;
        }
    }

    return null;
}

function optimized(ast, enclosingNode, followingNode) {
    if (Array.isArray(ast?.body) && ast.body.length === 0) {
        return ast;
    }

    const enclosingIsEmptyProgram =
        enclosingNode?.type === "Program" &&
        Array.isArray(enclosingNode.body) &&
        enclosingNode.body.length === 0;
    if (enclosingIsEmptyProgram) {
        return enclosingNode;
    }

    const followingIsEmptyProgram =
        followingNode?.type === "Program" &&
        Array.isArray(followingNode.body) &&
        followingNode.body.length === 0;
    if (followingIsEmptyProgram) {
        return followingNode;
    }

    return null;
}

const emptyProgram = { type: "Program", body: [] };
const nonEmptyProgram = { type: "Program", body: [{}] };
const unrelatedNode = { type: "BlockStatement", body: [] };

const scenarios = [
    { ast: emptyProgram, enclosing: null, following: null },
    { ast: nonEmptyProgram, enclosing: emptyProgram, following: null },
    { ast: nonEmptyProgram, enclosing: unrelatedNode, following: emptyProgram },
    { ast: nonEmptyProgram, enclosing: null, following: unrelatedNode }
];

function run(fn, iterations) {
    let result = null;
    for (let index = 0; index < iterations; index += 1) {
        const scenario = scenarios[index % scenarios.length];
        result = fn(scenario.ast, scenario.enclosing, scenario.following);
    }
    return result;
}

const iterations = 5_000_000;

run(baseline, iterations / 10);
run(optimized, iterations / 10);

const baselineStart = performance.now();
run(baseline, iterations);
const baselineDuration = performance.now() - baselineStart;

const optimizedStart = performance.now();
run(optimized, iterations);
const optimizedDuration = performance.now() - optimizedStart;

if (run(baseline, scenarios.length) !== run(optimized, scenarios.length)) {
    throw new Error("Baseline and optimized implementations diverged");
}

const improvement =
    ((baselineDuration - optimizedDuration) / baselineDuration) * 100;

console.log(
    `baseline: ${baselineDuration.toFixed(2)}ms | optimized: ${optimizedDuration.toFixed(2)}ms | delta: ${improvement.toFixed(2)}%`
);
