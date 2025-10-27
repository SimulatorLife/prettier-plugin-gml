function rename_write_demo(value) {
    var should_rename = value + 1;
    var retained = should_rename * value;

    should_rename += retained;
    return should_rename;
}
