enum Fruit {
    UNKNOWN = 0,
    BANANA,
    APPLE
}

enum Vegetable {
    UNKNOWN = 0,
    CARROT  = 1,
    LETTUCE = 2
}

enum eTransitionState {
    idle = 0,
    complete = 1,
    delaying,
    in,
    out,
    partway_in,
    partway_out
}

// Define transition states (set values equal to state where applicable for easy mapping)
enum eTransitionType {
    in          = eTransitionState.in, // zoom in
    out         = eTransitionState.out, // zoom out
    partway_in  = eTransitionState.partway_in, // zoom part way in
    partway_out = eTransitionState.partway_out // zoom part way in
}
