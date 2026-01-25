type PluginFormatOptions = Record<string, unknown>;

type PluginModule = {
    Plugin: {
        format(source: string, options?: PluginFormatOptions): Promise<string>;
    };
};

let cachedPluginModule: Promise<PluginModule> | null = null;

function getPluginDistUrl(): string {
    return new URL("../../../plugin/dist/index.js", import.meta.url).href;
}

export async function getPlugin(): Promise<PluginModule["Plugin"]> {
    if (!cachedPluginModule) {
        cachedPluginModule = import(getPluginDistUrl()) as Promise<PluginModule>;
    }

    const pluginModule = await cachedPluginModule;
    return pluginModule.Plugin;
}
