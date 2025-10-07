function make_struct(value) {
var foo = {};
foo.alpha = 1;
foo["beta"] = value;
foo.gamma = call();
return foo;
}

function reuse_struct() {
instance = {};
instance.name = "example";
instance["score"] = 42;
do_something(instance);
}

function assign_then_extend() {
data = {};
data.label = "ok";
data["value"] = 123;
return data;
}
