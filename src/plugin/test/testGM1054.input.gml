function Base(){
self.value=1;
}
function Child():Base() constructor
{
    constructor_apply();
}

function Orphan() : Missing() constructor { }
