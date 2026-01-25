declare module "@gml-modules/plugin" {
    export type GmlPluginFormatOptions = Record<string, unknown>;

    export interface GmlPluginFormatEntry {
        format(source: string, options?: GmlPluginFormatOptions): Promise<string>;
    }

    export const Plugin: GmlPluginFormatEntry;
    export default Plugin;
}
