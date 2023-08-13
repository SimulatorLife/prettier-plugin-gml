function needsParentheses(innerNode, outerNode) {
    const precedence = {
        "and": 0,
        "&&": 0,
        "or": 1,
        "||": 1,
        "|": 2,
        "^^": 3,
        "xor": 3,
        "&": 4,
        "=": 5,
        "<": 5,
        ">": 5,
        "<=": 5,
        ">=": 5,
        "<>": 5,
        "!=": 5,
        "+": 6,
        "-": 6,
        "*": 7,
        "/": 7,
        "mod": 7
    };

    const LOGICAL_OPERATORS = ["and", "&&", "or", "||", "|", "^^", "xor", "&"];
    const COMPARISON_OPERATORS = ["=", "<", ">", "<=", ">=", "<>", "!=", "=="];
    const ARITHMETIC_OPERATORS = ["+", "-", "*", "/", "mod"];

    // if (ARITHMETIC_OPERATORS.includes(outerNode.operator) && COMPARISON_OPERATORS.includes(innerNode.operator)) {
    //     return false;
    // }

    const innerPrecedence = precedence[innerNode.operator] || 100;
    const outerPrecedence = precedence[outerNode.operator] || 100;

    // For arithmetic outer operators
    if (ARITHMETIC_OPERATORS.includes(outerNode.operator)) {
        if (innerPrecedence > outerPrecedence) {
            return true;
        }
        if (innerPrecedence === outerPrecedence && ["-", "/"].includes(outerNode.operator)) {
            return false;
        }
    }

    // For comparison outer operators
    if (COMPARISON_OPERATORS.includes(outerNode.operator)) {
        if (ARITHMETIC_OPERATORS.includes(innerNode.operator)) {
            return true;
        }
    }

    // For logical outer operators
    if (LOGICAL_OPERATORS.includes(outerNode.operator)) {
        if (COMPARISON_OPERATORS.includes(innerNode.operator) || LOGICAL_OPERATORS.includes(innerNode.operator)) {
            return true;
        }
        if (COMPARISON_OPERATORS.includes(outerNode.operator) && COMPARISON_OPERATORS.includes(innerNode.operator)) {
            return false;
        }
    }

    return false;
}

function runTests() {
    let passCount = 0;
    let failCount = 0;

    function assert(condition, testName) {
        if (condition) {
            console.log(`✅ ${testName} passed`);
            passCount++;
        } else {
            console.log(`❌ ${testName} failed`);
            failCount++;
        }
    }

    // Test cases
    assert(needsParentheses({ operator: "*" }, { operator: "+" }), "Test 1: + outer, * inner");
    assert(needsParentheses({ operator: "/" }, { operator: "+" }), "Test 2: + outer, / inner");
    assert(!needsParentheses({ operator: "+" }, { operator: "*" }), "Test 3: * outer, + inner");
    assert(needsParentheses({ operator: "<" }, { operator: "or" }), "Test 4: or outer, < inner");
    assert(needsParentheses({ operator: "!=" }, { operator: "or" }), "Test 5: or outer, != inner");
    assert(needsParentheses({ operator: "+" }, { operator: "==" }), "Test 6: == outer, + inner");
    assert(!needsParentheses({ operator: "==" }, { operator: "+" }), "Test 7: + outer, == inner");
    assert(!needsParentheses({ operator: "<" }, { operator: "and" }), "Test 8: and outer, < inner");
    assert(needsParentheses({ operator: "or" }, { operator: "and" }), "Test 9: and outer, or inner");
    assert(!needsParentheses({ operator: "+" }, { operator: "-" }), "Test 10: - outer, + inner");
    assert(!needsParentheses({ operator: "-" }, { operator: "-" }), "Test 11: - outer, - inner");
    assert(!needsParentheses({ operator: "*" }, { operator: "*" }), "Test 12: * outer, * inner");
    assert(!needsParentheses({ operator: "*" }, { operator: "/" }), "Test 13: / outer, * inner");
    assert(needsParentheses({ operator: "+" }, { operator: "!=" }), "Test 14: != outer, + inner");
    assert(!needsParentheses({ operator: "==" }, { operator: "!=" }), "Test 15: != outer, == inner");

    console.log(`\n${passCount} tests passed.`);
    console.log(`${failCount} tests failed.`);
}

runTests();

const operators = {
    "^": {
        prec: 4,
        assoc: "right"
    },
    "*": {
        prec: 3,
        assoc: "left"
    },
    "/": {
        prec: 3,
        assoc: "left"
    },
    "+": {
        prec: 2,
        assoc: "left"
    },
    "-": {
        prec: 2,
        assoc: "left"
    },
    "=": { prec: 6, assoc: "left" },
};

const assert = (predicate) => {
    if (predicate) return;
    throw new Error("Assertion failed due to invalid token");
};

const toRPN = (input) => {
    // Shunting Yard Algorithm
    const opSymbols = Object.keys(operators);
    const stack = [];
    let output = "";

    const peek = () => {
        return stack.at(-1);
    };

    const addToOutput = (token) => {
        output += " " + token;
    };

    const handlePop = () => {
        return stack.pop();
    };

    const handleToken = (token) => {
        switch (true) {
            case !isNaN(parseFloat(token)):
                addToOutput(token);
                break;
            case opSymbols.includes(token):
                const o1 = token;
                let o2 = peek();

                while (
                    o2 !== undefined &&
                    o2 !== "(" &&
                    (operators[o2].prec > operators[o1].prec ||
                        (operators[o2].prec === operators[o1].prec &&
                            operators[o1].assoc === "left"))
                ) {
                    addToOutput(handlePop());
                    o2 = peek();
                }
                stack.push(o1);
                break;
            case token === "(":
                stack.push(token);
                break;
            case token === ")":
                let topOfStack = peek();
                while (topOfStack !== "(") {
                    assert(stack.length !== 0);
                    addToOutput(handlePop());
                    topOfStack = peek();
                }
                assert(peek() === "(");
                handlePop();
                break;
            default:
                throw new Error(`Invalid token: ${token}`);
        }
    };

    for (let i of input) {
        if (i === " ") continue;

        handleToken(i);
    }

    while (stack.length !== 0) {
        assert(peek() !== "(");
        addToOutput(stack.pop());
    }

    return output.trim();
};

const testCases = [
    { input: "1 + 2", expected: "1 2 +" },
    { input: "1 + 2 * 3", expected: "1 2 3 * +" },
    { input: "1 + 2 * 3 - 4", expected: "1 2 3 * + 4 -" },
    { input: "( 1 + 2 ) * 3", expected: "1 2 + 3 *" },
    { input: "(1 + 2 * (4 / 2) ^ 2 ^ 3) - 1", expected: "1 2 4 2 / 2 3 ^ ^ * + 1 -" },
    { input: "1 = 2 + 3", expected: "" }
    // ... (add other test cases here)
];

function testShuntingYard() {
    let allPassed = true;
    for (let testCase of testCases) {
        const result = toRPN(testCase.input);
        if (result !== testCase.expected) {
            allPassed = false;
            console.error(`For input "${testCase.input}", expected "${testCase.expected}" but got "${result}"`);
        }
    }
    if (allPassed) {
        console.log("All Shunting Yard tests passed!");
    }
}

// Run the tests
testShuntingYard();