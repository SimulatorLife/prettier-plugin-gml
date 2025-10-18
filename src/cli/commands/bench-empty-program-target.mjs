import { performance } from "node:perf_hooks";

import { getBodyStatements } from "../../shared/ast-node-helpers.js";

function isEmptyProgram(node) {
    if (!node || node.type !== "Program") {
        return false;
    }

    const statements = getBodyStatements(node);
    if (statements.length > 0) {
        return false;
    }

    return true;
}

function baseline(ast, enclosingNode, followingNode) {
    if (isEmptyProgram(ast)) {
        return ast;
    }

    for (const node of [enclosingNode, followingNode]) {
        if (isEmptyProgram(node)) {
            return node;
        }
    }

    return null;
}

function optimized(ast, enclosingNode, followingNode) {
    if (isEmptyProgram(ast)) {
        return ast;
    }

    const enclosingIsEmptyProgram = isEmptyProgram(enclosingNode);
    if (enclosingIsEmptyProgram) {
        return enclosingNode;
    }

    const followingIsEmptyProgram = isEmptyProgram(followingNode);
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
