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
    sqrt(args) {
        if (args.length !== 1) {
            return `sqrt(${args.join(", ")})`;
        }
        return `Math.sqrt(${args[0]})`;
    },
    sqr(args) {
        if (args.length !== 1) {
            return `sqr(${args.join(", ")})`;
        }
        return `Math.pow(${args[0]}, 2)`;
    },
    power(args) {
        if (args.length !== 2) {
            return `power(${args.join(", ")})`;
        }
        return `Math.pow(${args[0]}, ${args[1]})`;
    },
    exp(args) {
        if (args.length !== 1) {
            return `exp(${args.join(", ")})`;
        }
        return `Math.exp(${args[0]})`;
    },
    ln(args) {
        if (args.length !== 1) {
            return `ln(${args.join(", ")})`;
        }
        return `Math.log(${args[0]})`;
    },
    log2(args) {
        if (args.length !== 1) {
            return `log2(${args.join(", ")})`;
        }
        return `Math.log2(${args[0]})`;
    },
    log10(args) {
        if (args.length !== 1) {
            return `log10(${args.join(", ")})`;
        }
        return `Math.log10(${args[0]})`;
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
    arcsin(args) {
        if (args.length !== 1) {
            return `arcsin(${args.join(", ")})`;
        }
        return `Math.asin(${args[0]})`;
    },
    arccos(args) {
        if (args.length !== 1) {
            return `arccos(${args.join(", ")})`;
        }
        return `Math.acos(${args[0]})`;
    },
    arctan(args) {
        if (args.length !== 1) {
            return `arctan(${args.join(", ")})`;
        }
        return `Math.atan(${args[0]})`;
    },
    arctan2(args) {
        if (args.length !== 2) {
            return `arctan2(${args.join(", ")})`;
        }
        return `Math.atan2(${args[0]}, ${args[1]})`;
    },
    degtorad(args) {
        if (args.length !== 1) {
            return `degtorad(${args.join(", ")})`;
        }
        return `((${args[0]}) * Math.PI / 180)`;
    },
    radtodeg(args) {
        if (args.length !== 1) {
            return `radtodeg(${args.join(", ")})`;
        }
        return `((${args[0]}) * 180 / Math.PI)`;
    },
    sign(args) {
        if (args.length !== 1) {
            return `sign(${args.join(", ")})`;
        }
        return `Math.sign(${args[0]})`;
    },
    clamp(args) {
        if (args.length !== 3) {
            return `clamp(${args.join(", ")})`;
        }
        return `Math.max(${args[1]}, Math.min(${args[0]}, ${args[2]}))`;
    },
    min(args) {
        return `Math.min(${args.join(", ")})`;
    },
    max(args) {
        return `Math.max(${args.join(", ")})`;
    },
    string_length(args) {
        if (args.length !== 1) {
            return `string_length(${args.join(", ")})`;
        }
        return `(${args[0]}).length`;
    },
    string_char_at(args) {
        if (args.length !== 2) {
            return `string_char_at(${args.join(", ")})`;
        }
        return `((${args[1]}) <= 0 ? (${args[0]})[0] ?? "" : (${args[0]})[(${args[1]}) - 1] ?? "")`;
    },
    string_ord_at(args) {
        if (args.length !== 2) {
            return `string_ord_at(${args.join(", ")})`;
        }
        return `(${args[0]}).charCodeAt((${args[1]}) - 1)`;
    },
    string_byte_at(args) {
        if (args.length !== 2) {
            return `string_byte_at(${args.join(", ")})`;
        }
        return `(${args[0]}).charCodeAt((${args[1]}) - 1)`;
    },
    string_byte_length(args) {
        if (args.length !== 1) {
            return `string_byte_length(${args.join(", ")})`;
        }
        return `new TextEncoder().encode(${args[0]}).length`;
    },
    string_pos(args) {
        if (args.length !== 2) {
            return `string_pos(${args.join(", ")})`;
        }
        return `((${args[1]}).indexOf(${args[0]}) + 1)`;
    },
    string_last_pos(args) {
        if (args.length !== 2) {
            return `string_last_pos(${args.join(", ")})`;
        }
        return `((${args[1]}).lastIndexOf(${args[0]}) + 1)`;
    },
    string_copy(args) {
        if (args.length !== 3) {
            return `string_copy(${args.join(", ")})`;
        }
        return `(${args[0]}).substring((${args[1]}) - 1, (${args[1]}) - 1 + (${args[2]}))`;
    },
    string_delete(args) {
        if (args.length !== 3) {
            return `string_delete(${args.join(", ")})`;
        }
        return `(${args[0]}).substring(0, (${args[1]}) - 1) + (${args[0]}).substring((${args[1]}) - 1 + (${args[2]}))`;
    },
    string_insert(args) {
        if (args.length !== 3) {
            return `string_insert(${args.join(", ")})`;
        }
        return `(${args[1]}).substring(0, (${args[2]}) - 1) + (${args[0]}) + (${args[1]}).substring((${args[2]}) - 1)`;
    },
    string_replace(args) {
        if (args.length !== 3) {
            return `string_replace(${args.join(", ")})`;
        }
        return `(${args[0]}).replace(${args[1]}, ${args[2]})`;
    },
    string_replace_all(args) {
        if (args.length !== 3) {
            return `string_replace_all(${args.join(", ")})`;
        }
        return `(${args[0]}).replaceAll(${args[1]}, ${args[2]})`;
    },
    string_count(args) {
        if (args.length !== 2) {
            return `string_count(${args.join(", ")})`;
        }
        return `((() => {
    const str = ${args[1]};
    const sub = ${args[0]};
    if (!sub) return 0;
    let count = 0;
    let pos = 0;
    while ((pos = str.indexOf(sub, pos)) !== -1) {
        count++;
        pos += sub.length;
    }
    return count;
})())`;
    },
    string_upper(args) {
        if (args.length !== 1) {
            return `string_upper(${args.join(", ")})`;
        }
        return `(${args[0]}).toUpperCase()`;
    },
    string_lower(args) {
        if (args.length !== 1) {
            return `string_lower(${args.join(", ")})`;
        }
        return `(${args[0]}).toLowerCase()`;
    },
    string_repeat(args) {
        if (args.length !== 2) {
            return `string_repeat(${args.join(", ")})`;
        }
        return `(${args[0]}).repeat(${args[1]})`;
    },
    string_letters(args) {
        if (args.length !== 1) {
            return `string_letters(${args.join(", ")})`;
        }
        return `(${args[0]}).replace(/[^A-Za-z]/g, "")`;
    },
    string_digits(args) {
        if (args.length !== 1) {
            return `string_digits(${args.join(", ")})`;
        }
        return `(${args[0]}).replace(/[^0-9]/g, "")`;
    },
    string_lettersdigits(args) {
        if (args.length !== 1) {
            return `string_lettersdigits(${args.join(", ")})`;
        }
        return `(${args[0]}).replace(/[^A-Za-z0-9]/g, "")`;
    },
    string_format(args) {
        if (args.length !== 3) {
            return `string_format(${args.join(", ")})`;
        }
        return `((() => {
    const val = ${args[0]};
    const totalWidth = ${args[1]};
    const decPlaces = ${args[2]};
    const numVal = Number(val);
    if (isNaN(numVal)) {
        return String(val).padStart(totalWidth, " ");
    }
    return numVal.toFixed(decPlaces).padStart(totalWidth, " ");
})())`;
    },
    chr(args) {
        if (args.length !== 1) {
            return `chr(${args.join(", ")})`;
        }
        return `String.fromCharCode(${args[0]})`;
    },
    ansi_char(args) {
        if (args.length !== 1) {
            return `ansi_char(${args.join(", ")})`;
        }
        return `String.fromCharCode(${args[0]})`;
    },
    ord(args) {
        if (args.length !== 1) {
            return `ord(${args.join(", ")})`;
        }
        return `(${args[0]}).charCodeAt(0)`;
    },
    real(args) {
        if (args.length !== 1) {
            return `real(${args.join(", ")})`;
        }
        return `parseFloat(${args[0]})`;
    },
    string(args) {
        if (args.length !== 1) {
            return `string(${args.join(", ")})`;
        }
        return `String(${args[0]})`;
    }
});
