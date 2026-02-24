type FormatOptions = Record<string, unknown>;

type FormatModule = {
    Format: {
        format(source: string, options?: FormatOptions): Promise<string>;
    };
};

let cachedFormatModule: Promise<FormatModule> | null = null;

function getFormatDistUrl(): string {
    return new URL("../../../format/dist/index.js", import.meta.url).href;
}

export async function getFormat(): Promise<FormatModule["Format"]> {
    if (cachedFormatModule === null) {
        cachedFormatModule = import(getFormatDistUrl()).then((formatModule) => formatModule as FormatModule);
    }

    const formatModule = await cachedFormatModule;
    return formatModule.Format;
}
