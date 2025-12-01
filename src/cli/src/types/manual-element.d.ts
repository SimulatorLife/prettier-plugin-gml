interface ManualElement extends Element {
    children?: Iterable<ManualElement> | ArrayLike<ManualElement>;
    classList?: DOMTokenList;
    querySelector?(selector: string): ManualElement | null;
    querySelectorAll(selector: string): Array<ManualElement>;
    getAttribute?(name: string): string | null;
    setAttribute?(name: string, value: string): void;
}
