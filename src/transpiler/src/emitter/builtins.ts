export type BuiltInEmitter = (args: ReadonlyArray<string>) => string;

export const builtInFunctions: Record<string, BuiltInEmitter> = Object.freeze({
    point_distance(args) {
        if (args.length !== 4) {
            return `point_distance(${args.join(", ")})`;
        }
        return `Math.sqrt(Math.pow(${args[2]} - ${args[0]}, 2) + Math.pow(${args[3]} - ${args[1]}, 2))`;
    },
    abs(args) {
        return `Math.abs(${args.join(", ")})`;
    },
    round(args) {
        return `Math.round(${args.join(", ")})`;
    },
    floor(args) {
        return `Math.floor(${args.join(", ")})`;
    },
    ceil(args) {
        return `Math.ceil(${args.join(", ")})`;
    },
    sin(args) {
        return `Math.sin(${args.join(", ")})`;
    },
    cos(args) {
        return `Math.cos(${args.join(", ")})`;
    },
    tan(args) {
        return `Math.tan(${args.join(", ")})`;
    },
    min(args) {
        return `Math.min(${args.join(", ")})`;
    },
    max(args) {
        return `Math.max(${args.join(", ")})`;
    }
});
