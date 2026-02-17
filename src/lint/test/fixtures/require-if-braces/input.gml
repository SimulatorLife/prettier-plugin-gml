if should_exit() return;
if (ready) do_it();
if (a > b)
    draw_text(x, y, "ok");
else
    do_other();
if (keep) {
    already_blocked();
}
if (keyboard_check(vk_escape)) { x += 10; } else { x -= 10; }
