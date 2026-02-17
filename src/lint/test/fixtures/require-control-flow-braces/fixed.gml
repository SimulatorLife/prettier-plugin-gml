if (should_exit()) {
    return;
}
if (ready) {
    do_it();
}
if (a > b) {
    draw_text(x, y, "ok");
}
else {
    do_other();
}
repeat (10) {
    show_debug_message("Test");
}
repeat (count) {
    step_once();
}
while (alive) {
    tick();
}
while (alive) {
    tick_once();
}
for (var i = 0; i < 10; i++) {
    sum += i;
}
for (var j = 0; j < 10; j++) {
    sum += j;
}
with (other) {
    hp -= 1;
}
with (other) {
    hp -= 1;
}
do {
    step();
} until (done);
do {
    step_once();
} until (done);
if (keep) {
    already_blocked();
}
do { already_do_braced(); } until (done);
repeat (3) { already_repeat_braced(); }
while (keyboard_check(vk_space)) { hold_jump(); }
for (var k = 0; k < 10; k++) { total += k; }
with (obj_player) { move(); }
if (keyboard_check(vk_escape)) { x += 10; } else { x -= 10; }
