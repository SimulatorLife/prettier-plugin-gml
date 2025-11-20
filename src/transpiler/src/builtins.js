/**
 * Mappings for GML built-in functions to JavaScript.
 */
export const builtInFunctions = {
    // Math Functions
    point_distance: (args) => {
        if (args.length !== 4) {
            // Or throw a runtime error
            return `point_distance(${args.join(", ")})`;
        }
        return `Math.sqrt(Math.pow(${args[2]} - ${args[0]}, 2) + Math.pow(${args[3]} - ${args[1]}, 2))`;
    },
    abs: (args) => `Math.abs(${args.join(", ")})`,
    round: (args) => `Math.round(${args.join(", ")})`,
    floor: (args) => `Math.floor(${args.join(", ")})`,
    ceil: (args) => `Math.ceil(${args.join(", ")})`,
    sin: (args) => `Math.sin(${args.join(", ")})`,
    cos: (args) => `Math.cos(${args.join(", ")})`,
    tan: (args) => `Math.tan(${args.join(", ")})`,
    min: (args) => `Math.min(${args.join(", ")})`,
    max: (args) => `Math.max(${args.join(", ")})`
};
//# sourceMappingURL=builtins.js.map