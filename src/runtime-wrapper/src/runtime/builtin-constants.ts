type ConstantMap = Record<string, number>;

type RgbTuple = readonly [number, number, number];

const KEYBOARD_CONSTANTS: ConstantMap = {
    vk_nokey: 0,
    vk_anykey: 1,
    vk_backspace: 8,
    vk_tab: 9,
    vk_enter: 13,
    vk_shift: 16,
    vk_control: 17,
    vk_alt: 18,
    vk_pause: 19,
    vk_escape: 27,
    vk_space: 32,
    vk_pageup: 33,
    vk_pagedown: 34,
    vk_end: 35,
    vk_home: 36,
    vk_left: 37,
    vk_up: 38,
    vk_right: 39,
    vk_down: 40,
    vk_printscreen: 44,
    vk_insert: 45,
    vk_delete: 46,
    vk_numpad0: 96,
    vk_numpad1: 97,
    vk_numpad2: 98,
    vk_numpad3: 99,
    vk_numpad4: 100,
    vk_numpad5: 101,
    vk_numpad6: 102,
    vk_numpad7: 103,
    vk_numpad8: 104,
    vk_numpad9: 105,
    vk_multiply: 106,
    vk_add: 107,
    vk_subtract: 109,
    vk_decimal: 110,
    vk_divide: 111,
    vk_f1: 112,
    vk_f2: 113,
    vk_f3: 114,
    vk_f4: 115,
    vk_f5: 116,
    vk_f6: 117,
    vk_f7: 118,
    vk_f8: 119,
    vk_f9: 120,
    vk_f10: 121,
    vk_f11: 122,
    vk_f12: 123,
    vk_lshift: 160,
    vk_rshift: 161,
    vk_lcontrol: 162,
    vk_rcontrol: 163,
    vk_lalt: 164,
    vk_ralt: 165
};

const COLOR_RGB: Record<string, RgbTuple> = {
    c_black: [0, 0, 0],
    c_white: [255, 255, 255],
    c_red: [255, 0, 0],
    c_green: [0, 128, 0],
    c_lime: [0, 255, 0],
    c_blue: [0, 0, 255],
    c_yellow: [255, 255, 0],
    c_aqua: [0, 255, 255],
    c_fuchsia: [255, 0, 255],
    c_gray: [128, 128, 128],
    c_ltgray: [192, 192, 192],
    c_dkgray: [64, 64, 64],
    c_silver: [192, 192, 192],
    c_maroon: [128, 0, 0],
    c_navy: [0, 0, 128],
    c_olive: [128, 128, 0],
    c_teal: [0, 128, 128],
    c_purple: [128, 0, 128],
    c_orange: [255, 128, 0]
};

const MATH_CONSTANTS: ConstantMap = {
    pi: Math.PI,
    pi2: Math.PI * 2
};

type RuntimeColorFactory = (red: number, green: number, blue: number) => number;

function resolveColorFactory(
    globalScope: Record<string, unknown>
): RuntimeColorFactory {
    const makeColour = globalScope.make_colour_rgb;
    if (typeof makeColour === "function") {
        return makeColour as RuntimeColorFactory;
    }

    const makeColor = globalScope.make_color_rgb;
    if (typeof makeColor === "function") {
        return makeColor as RuntimeColorFactory;
    }

    return (red, green, blue) =>
        (red & 0xff) | ((green & 0xff) << 8) | ((blue & 0xff) << 16);
}

function buildColorConstants(
    globalScope: Record<string, unknown>
): ConstantMap {
    const makeColor = resolveColorFactory(globalScope);
    const colors: ConstantMap = {};

    for (const [name, rgb] of Object.entries(COLOR_RGB)) {
        colors[name] = makeColor(rgb[0], rgb[1], rgb[2]);
    }

    return colors;
}

export function resolveBuiltinConstants(
    globalScope: Record<string, unknown>
): ConstantMap {
    return {
        ...KEYBOARD_CONSTANTS,
        ...buildColorConstants(globalScope),
        ...MATH_CONSTANTS
    };
}
