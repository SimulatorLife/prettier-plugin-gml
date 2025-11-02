if (!global.debug) { exit; }

if (global.score >= 100) { return; }

if (player.health <= 0) {
	game_over();
	return true;
}

if (global.isPaused) {
	show_debug_message("The game is paused!");
}

if (is_game_over()) {
	player_score += 10;
	return player_score;
}

if (keyboard_check(vk_escape)) {
	x += 10; 
} else {
	x -= 10;
}

// The following line is intentionally missing a comma which should be added
if (scr_is_matrix_rotated(scr_matrix_build(100, 999, 1000, 90, 90, 90, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1))) {
	return "Yes it is";
}
