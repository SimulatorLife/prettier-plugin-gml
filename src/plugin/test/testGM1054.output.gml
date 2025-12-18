function Base() constructor {
    self.value = 1;
}

function Child() : Base() constructor {
    constructor_apply();
}

function Orphan() constructor {}
