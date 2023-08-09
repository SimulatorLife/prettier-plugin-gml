// ==UserScript==
// @name        GameMaker Manual' highlighting
// @namespace   http://yal.cc
// @include     http://docs.yoyogames.com/source/*
// @include     https://docs.yoyogames.com/source/*
// @include     http://docs2.yoyogames.com/source/*
// @include     https://docs2.yoyogames.com/source/*
// @author      YellowAfterlife
// @description Various improvements for GameMaker' manual ~ http://yellowafterlife.itch.io/gamemaker-manual-hinting
// @version     1.002
// @grant       none
// ==/UserScript==
// built-in keywords:
var keywords = "globalvar var if then else for while do until repeat switch case default break continue with exit return self other noone all global local mod div not enum";
// built-in variables:
var vars = "application_surface argument argument0 argument1 argument10 argument11 argument12 argument13 argument14 argument15 argument2 argument3 argument4 argument5 argument6 argument7 argument8 argument9 argument_count argument_relative async_load background_alpha background_blend background_color background_colour background_foreground background_height background_hspeed background_htiled background_index background_showcolor background_showcolour background_visible background_vspeed background_vtiled background_width background_x background_xscale background_y background_yscale browser_height browser_width caption_health caption_lives caption_score current_day current_hour current_minute current_month current_second current_time current_weekday current_year cursor_sprite debug_mode delta_time display_aa error_last error_occurred event_action event_number event_object event_type fps fps_real game_display_name game_id game_project_name game_save_id gamemaker_pro gamemaker_registered gamemaker_version health iap_data instance_count instance_id keyboard_key keyboard_lastchar keyboard_lastkey keyboard_string lives mouse_button mouse_lastbutton mouse_x mouse_y os_browser os_device os_type os_version pointer_invalid pointer_null program_directory room room_caption room_first room_height room_last room_persistent room_speed room_width score secure_mode show_health show_lives show_score temp_directory transition_color transition_kind transition_steps undefined view_angle view_current view_enabled view_hborder view_hport view_hspeed view_hview view_object view_surface_id view_vborder view_visible view_vspeed view_wport view_wview view_xport view_xview view_yport view_yview webgl_enabled working_directory alarm bbox_bottom bbox_left bbox_right bbox_top depth direction friction gravity gravity_direction hspeed id image_alpha image_angle image_blend image_index image_number image_single image_speed image_xscale image_yscale mask_index object_index path_endaction path_index path_orientation path_position path_positionprevious path_scale path_speed persistent phy_active phy_angular_damping phy_angular_velocity phy_bullet phy_col_normal_x phy_col_normal_y phy_collision_points phy_collision_x phy_collision_y phy_com_x phy_com_y phy_dynamic phy_fixed_rotation phy_inertia phy_kinematic phy_linear_damping phy_linear_velocity_x phy_linear_velocity_y phy_mass phy_position_x phy_position_xprevious phy_position_y phy_position_yprevious phy_rotation phy_sleeping phy_speed phy_speed_x phy_speed_y solid speed sprite_height sprite_index sprite_width sprite_xoffset sprite_yoffset timeline_index timeline_loop timeline_position timeline_running timeline_speed visible vspeed x xprevious xstart y yprevious ystart";
// built-in constants:
var consts = "ANSI_CHARSET ARABIC_CHARSET BALTIC_CHARSET CHINESEBIG5_CHARSET DEFAULT_CHARSET EASTEUROPE_CHARSET GB2312_CHARSET GM_build_date GM_version GREEK_CHARSET HANGEUL_CHARSET HEBREW_CHARSET JOHAB_CHARSET MAC_CHARSET OEM_CHARSET RUSSIAN_CHARSET SHIFTJIS_CHARSET SYMBOL_CHARSET THAI_CHARSET TURKISH_CHARSET VIETNAMESE_CHARSET achievement_achievement_info achievement_challenge_completed achievement_challenge_completed_by_remote achievement_challenge_launched achievement_challenge_list_received achievement_challenge_received achievement_filter_all_players achievement_filter_favorites_only achievement_filter_friends_only achievement_friends_info achievement_leaderboard_info achievement_msg_result achievement_our_info achievement_pic_loaded achievement_player_info achievement_purchase_info achievement_show_achievement achievement_show_bank achievement_show_friend_picker achievement_show_leaderboard achievement_show_profile achievement_show_purchase_prompt achievement_show_ui achievement_type_achievement_challenge achievement_type_score_challenge all asset_background asset_font asset_object asset_path asset_room asset_script asset_sound asset_sprite asset_timeline asset_unknown audio_3d audio_falloff_exponent_distance audio_falloff_exponent_distance_clamped audio_falloff_inverse_distance audio_falloff_inverse_distance_clamped audio_falloff_linear_distance audio_falloff_linear_distance_clamped audio_falloff_none audio_mono audio_new_system audio_old_system audio_stereo bm_add bm_dest_alpha bm_dest_color bm_dest_colour bm_inv_dest_alpha bm_inv_dest_color bm_inv_dest_colour bm_inv_src_alpha bm_inv_src_color bm_inv_src_colour bm_max bm_normal bm_one bm_src_alpha bm_src_alpha_sat bm_src_color bm_src_colour bm_subtract bm_zero browser_chrome browser_firefox browser_ie browser_ie_mobile browser_not_a_browser browser_opera browser_safari browser_safari_mobile browser_tizen browser_unknown browser_windows_store buffer_bool buffer_f16 buffer_f32 buffer_f64 buffer_fast buffer_fixed buffer_generalerror buffer_grow buffer_invalidtype buffer_network buffer_outofbounds buffer_outofspace buffer_s16 buffer_s32 buffer_s8 buffer_seek_end buffer_seek_relative buffer_seek_start buffer_string buffer_text buffer_u16 buffer_u32 buffer_u64 buffer_u8 buffer_vbuffer buffer_wrap button_type c_aqua c_black c_blue c_dkgray c_fuchsia c_gray c_green c_lime c_ltgray c_maroon c_navy c_olive c_orange c_purple c_red c_silver c_teal c_white c_yellow cr_appstart cr_arrow cr_beam cr_cross cr_default cr_drag cr_handpoint cr_help cr_hourglass cr_hsplit cr_multidrag cr_no cr_nodrop cr_none cr_size_all cr_size_nesw cr_size_ns cr_size_nwse cr_size_we cr_sqlwait cr_uparrow cr_vsplit device_emulator device_ios_ipad device_ios_ipad_retina device_ios_iphone device_ios_iphone5 device_ios_iphone6 device_ios_iphone6plus device_ios_iphone_retina device_ios_unknown device_tablet display_landscape display_landscape_flipped display_portrait display_portrait_flipped dll_cdecl dll_stdcall ds_type_grid ds_type_list ds_type_map ds_type_priority ds_type_queue ds_type_stack ef_cloud ef_ellipse ef_explosion ef_firework ef_flare ef_rain ef_ring ef_smoke ef_smokeup ef_snow ef_spark ef_star ev_alarm ev_animation_end ev_boundary ev_close_button ev_collision ev_create ev_destroy ev_draw ev_draw_begin ev_draw_end ev_draw_post ev_draw_pre ev_end_of_path ev_game_end ev_game_start ev_global_left_button ev_global_left_press ev_global_left_release ev_global_middle_button ev_global_middle_press ev_global_middle_release ev_global_press ev_global_release ev_global_right_button ev_global_right_press ev_global_right_release ev_gui ev_gui_begin ev_gui_end ev_joystick1_button1 ev_joystick1_button2 ev_joystick1_button3 ev_joystick1_button4 ev_joystick1_button5 ev_joystick1_button6 ev_joystick1_button7 ev_joystick1_button8 ev_joystick1_down ev_joystick1_left ev_joystick1_right ev_joystick1_up ev_joystick2_button1 ev_joystick2_button2 ev_joystick2_button3 ev_joystick2_button4 ev_joystick2_button5 ev_joystick2_button6 ev_joystick2_button7 ev_joystick2_button8 ev_joystick2_down ev_joystick2_left ev_joystick2_right ev_joystick2_up ev_keyboard ev_keypress ev_keyrelease ev_left_button ev_left_press ev_left_release ev_middle_button ev_middle_press ev_middle_release ev_mouse ev_mouse_enter ev_mouse_leave ev_mouse_wheel_down ev_mouse_wheel_up ev_no_button ev_no_more_health ev_no_more_lives ev_other ev_outside ev_right_button ev_right_press ev_right_release ev_room_end ev_room_start ev_step ev_step_begin ev_step_end ev_step_normal ev_trigger ev_user0 ev_user1 ev_user10 ev_user11 ev_user12 ev_user13 ev_user14 ev_user15 ev_user2 ev_user3 ev_user4 ev_user5 ev_user6 ev_user7 ev_user8 ev_user9 fa_archive fa_bottom fa_center fa_directory fa_hidden fa_left fa_middle fa_readonly fa_right fa_sysfile fa_top fa_volumeid false fb_login_default fb_login_fallback_to_webview fb_login_forcing_webview fb_login_no_fallback_to_webview forcing_safari global gp_axislh gp_axislv gp_axisrh gp_axisrv gp_face1 gp_face2 gp_face3 gp_face4 gp_padd gp_padl gp_padr gp_padu gp_select gp_shoulderl gp_shoulderlb gp_shoulderr gp_shoulderrb gp_start gp_stickl gp_stickr iap_available iap_canceled iap_ev_consume iap_ev_product iap_ev_purchase iap_ev_restore iap_ev_storeload iap_failed iap_purchased iap_refunded iap_status_available iap_status_loading iap_status_processing iap_status_restoring iap_status_unavailable iap_status_uninitialised iap_storeload_failed iap_storeload_ok iap_unavailable input_type lb_disp_none lb_disp_numeric lb_disp_time_ms lb_disp_time_sec lb_sort_ascending lb_sort_descending lb_sort_none leaderboard_type_number leaderboard_type_time_mins_secs local matrix_projection matrix_view matrix_world mb_any mb_left mb_middle mb_none mb_right network_config_connect_timeout network_config_disable_reliable_udp network_config_enable_reliable_udp network_config_use_non_blocking_socket network_socket_bluetooth network_socket_tcp network_socket_udp network_type_connect network_type_data network_type_disconnect network_type_non_blocking_connect noone os_3ds os_android os_bb10 os_ios os_linux os_macosx os_ps3 os_ps4 os_psp os_psvita os_symbian os_tizen os_unknown os_uwp os_wiiu os_win32 os_win8native os_windows os_winphone os_xbox360 os_xboxone other ov_achievements ov_community ov_friends ov_gamegroup ov_players ov_settings path_action_continue path_action_restart path_action_reverse path_action_stop phy_debug_render_aabb phy_debug_render_collision_pairs phy_debug_render_coms phy_debug_render_core_shapes phy_debug_render_joints phy_debug_render_obb phy_debug_render_shapes phy_joint_anchor_1_x phy_joint_anchor_1_y phy_joint_anchor_2_x phy_joint_anchor_2_y phy_joint_angle phy_joint_angle_limits phy_joint_damping_ratio phy_joint_frequency phy_joint_length_1 phy_joint_length_2 phy_joint_lower_angle_limit phy_joint_max_force phy_joint_max_length phy_joint_max_motor_force phy_joint_max_motor_torque phy_joint_max_torque phy_joint_motor_force phy_joint_motor_speed phy_joint_motor_torque phy_joint_reaction_force_x phy_joint_reaction_force_y phy_joint_reaction_torque phy_joint_speed phy_joint_translation phy_joint_upper_angle_limit phy_particle_data_flag_category phy_particle_data_flag_colour phy_particle_data_flag_position phy_particle_data_flag_typeflags phy_particle_data_flag_velocity phy_particle_flag_colourmixing phy_particle_flag_elastic phy_particle_flag_powder phy_particle_flag_spring phy_particle_flag_tensile phy_particle_flag_viscous phy_particle_flag_wall phy_particle_flag_water phy_particle_flag_zombie phy_particle_group_flag_rigid phy_particle_group_flag_solid pi pr_linelist pr_linestrip pr_pointlist pr_trianglefan pr_trianglelist pr_trianglestrip ps_change_all ps_change_motion ps_change_shape ps_deflect_horizontal ps_deflect_vertical ps_distr_gaussian ps_distr_invgaussian ps_distr_linear ps_force_constant ps_force_linear ps_force_quadratic ps_shape_diamond ps_shape_ellipse ps_shape_line ps_shape_rectangle pt_shape_circle pt_shape_cloud pt_shape_disk pt_shape_explosion pt_shape_flare pt_shape_line pt_shape_pixel pt_shape_ring pt_shape_smoke pt_shape_snow pt_shape_spark pt_shape_sphere pt_shape_square pt_shape_star se_chorus se_compressor se_echo se_equalizer se_flanger se_gargle se_none se_reverb self text_type timezone_local timezone_utc true ty_real ty_string ugc_filetype_community ugc_filetype_microtrans ugc_list_Favorited ugc_list_Followed ugc_list_Published ugc_list_Subscribed ugc_list_UsedOrPlayed ugc_list_VotedDown ugc_list_VotedOn ugc_list_VotedUp ugc_list_WillVoteLater ugc_match_AllGuides ugc_match_Artwork ugc_match_Collections ugc_match_ControllerBindings ugc_match_IntegratedGuides ugc_match_Items ugc_match_Items_Mtx ugc_match_Items_ReadyToUse ugc_match_Screenshots ugc_match_UsableInGame ugc_match_Videos ugc_match_WebGuides ugc_query_AcceptedForGameRankedByAcceptanceDate ugc_query_CreatedByFollowedUsersRankedByPublicationDate ugc_query_CreatedByFriendsRankedByPublicationDate ugc_query_FavoritedByFriendsRankedByPublicationDate ugc_query_NotYetRated ugc_query_RankedByNumTimesReported ugc_query_RankedByPublicationDate ugc_query_RankedByTextSearch ugc_query_RankedByTotalVotesAsc ugc_query_RankedByTrend ugc_query_RankedByVote ugc_query_RankedByVotesUp ugc_result_success ugc_sortorder_CreationOrderAsc ugc_sortorder_CreationOrderDesc ugc_sortorder_ForModeration ugc_sortorder_LastUpdatedDesc ugc_sortorder_SubscriptionDateDesc ugc_sortorder_TitleAsc ugc_sortorder_VoteScoreDesc ugc_visibility_friends_only ugc_visibility_private ugc_visibility_public use_system_account vbm_compatible vbm_fast vbm_most_compatible vertex_type_colour vertex_type_float1 vertex_type_float2 vertex_type_float3 vertex_type_float4 vertex_type_ubyte4 vertex_usage_binormal vertex_usage_blendindices vertex_usage_blendweight vertex_usage_colour vertex_usage_depth vertex_usage_fog vertex_usage_normal vertex_usage_position vertex_usage_psize vertex_usage_sample vertex_usage_tangent vertex_usage_textcoord vk_add vk_alt vk_anykey vk_backspace vk_control vk_decimal vk_delete vk_divide vk_down vk_end vk_enter vk_escape vk_f1 vk_f10 vk_f11 vk_f12 vk_f2 vk_f3 vk_f4 vk_f5 vk_f6 vk_f7 vk_f8 vk_f9 vk_home vk_insert vk_lalt vk_lcontrol vk_left vk_lshift vk_multiply vk_nokey vk_numpad0 vk_numpad1 vk_numpad2 vk_numpad3 vk_numpad4 vk_numpad5 vk_numpad6 vk_numpad7 vk_numpad8 vk_numpad9 vk_pagedown vk_pageup vk_pause vk_printscreen vk_ralt vk_rcontrol vk_return vk_right vk_rshift vk_shift vk_space vk_subtract vk_tab vk_up xboxlive_fileerror_blobnotfound xboxlive_fileerror_cantopenfile xboxlive_fileerror_containernotinsync xboxlive_fileerror_containersyncfailed xboxlive_fileerror_invalidcontainername xboxlive_fileerror_noaccess xboxlive_fileerror_noerror xboxlive_fileerror_noxboxliveinfo xboxlive_fileerror_outoflocalstorage xboxlive_fileerror_outofmemory xboxlive_fileerror_providedbuffertoosmall xboxlive_fileerror_quotaexceeded xboxlive_fileerror_unknownerror xboxlive_fileerror_updatetoobig xboxlive_fileerror_usercanceled xboxlive_fileerror_usernotfound xboxlive_gamerpic_large xboxlive_gamerpic_medium xboxlive_gamerpic_small xboxlive_match_visibility_open xboxlive_match_visibility_private xboxlive_match_visibility_usetemplate xboxlive_privilege_communications xboxlive_privilege_fitness_upload xboxlive_privilege_internet_browsing xboxlive_privilege_multiplayer_sessions xboxlive_privilege_result_aborted xboxlive_privilege_result_banned xboxlive_privilege_result_no_issue xboxlive_privilege_result_purchase_required xboxlive_privilege_result_restricted xboxlive_privilege_sessions xboxlive_privilege_share_kinect_content xboxlive_privilege_social_network_sharing xboxlive_privilege_user_created_content xboxlive_privilege_video_communications";
//
var rxList = [];
function rxAdd(rx, rf) {
	rxList.push({ rx: rx, rf: rf });
}
// indentation:
function rxAddIndent(depth) {
	var ow = "", nw = "";
	var i = depth;
	while (--i >= 0) {
		ow += "   ";
		nw += "    ";
	}
	rxAdd(new RegExp("\\n" + ow + "([^ ])", "g"), function(_, post) {
		return "\n" + nw + post;
	});
}
var rxIndent = 8;
while (--rxIndent >= 0) rxAddIndent(rxIndent);
// `<thing>` -> `/* thing */`
rxAdd(/&lt;([\w_ ]+?)&gt;/g, function(_, word) {
	return "/* " + word + " */";
});
// `do something...` -> `/* do something */`
rxAdd(/do something\.\.\./g, "/* do something */");
function strUnescape(s) {
	return s
	.replace(/&amp;/g, "&")
	.replace(/&lt;/g, "<")
	.replace(/&gt;/g, ">")
}
function strEscape(s) {
	var r = "";
	s = strUnescape(s);
	for (var i = 0; i < s.length; i++) {
		var c = s.charCodeAt(i);
		if (c != 32) {
			r += "&#" + c + ";";
		} else r += " ";
	}
	return r;
}
// escape comments and strings:
rxAdd(/"([^"]*?)"/g, function(_, text) {
	return '"' + strEscape(text) + '"';
});
rxAdd(/'([^']*?)'/g, function(_, text) {
	return "'" + strEscape(text) + "'";
});
rxAdd(/(\/\/\/?) *([^\n]*)/g, function(_, start, text) {
	return start + " " +strEscape(text);
});

// // Formatting // //
// move opening brackets to same line:
rxAdd(/( *\/\/[^\n]+)?\n +{/g, function(_, comment) {
	return " {" + (comment || "");
});
// unindent closing brackets:
rxAdd(/    ( *)}/g, function(_, indent) {
	return indent + "}";
});
rxAdd(/}\n *else/g, "} else");
rxAdd(/([^\n {]);? *\}/g, function(_, pre) {
	return pre + "; }";
});

// add missing semicolons before "else":
rxAdd(/([^} ]) *else/g, function(_, pre) {
	return pre + "; else";
});
// `a ,b` -> `a, b`
rxAdd(/ *,([^ ])/g, function(_, post) {
	return ", " + post;
});
// `if cond {` -> `if (cond) {`
rxAdd(/if +([^\( ][^\n{]+){/g, function(_, cond) {
	return "if (" + cond.trimRight() + ") {";
});
// `if cond thing` -> `if (cond) thing`
rxAdd(/if ([^\( ].+?[\w_'")]) +([\w])/g, function(_, cond, post) {
	return "if (" + cond.trimRight() + ") " + post;
});
// `( thing)` -> `(thing)`
rxAdd(/\( +/g, "(");
// `(thing )` -> `(thing)`
rxAdd(/([^\n ]) +\)/g, function(_, prefix) {
	return prefix + ")";
});
// `repeat(` -> `repeat (`
rxAdd(/repeat\(/g, "repeat (");

// `a%=b` -> `a -= b`
rxAdd(/([^\n ]) *((%|\|{1,2}|\^{1,2})=?) */g, function(_, prefix, operator) {
	return prefix + " " + operator + " ";
});
// `a==b` -> `a == b`
rxAdd(/([^\n ]) *== */g, function(_, pre) {
	return pre + " == ";
});
// `a+=b` -> `a += b` (increment omission)
rxAdd(/([^\n+]) *(\+=?) *([^+])/g, function(_, pre, op, post) {
	return pre + " " + op + " " + post;
});
// `a-=b` -> `a -= b` (decrement omission)
rxAdd(/([^\n=+\-*\/%; ]) *(\-=?) *([^-])/g, function(_, pre, op, post) {
	return pre + " " + op + " " + post;
});
// `a*b` -> `a * b` (comment omission)
rxAdd(/([^\n\/ ]) *(\*=?) *([^\/*])/g, function(_, prefix, operator, post) {
	return prefix + " " + operator + " " + post;
});
// `a/b` -> `a / b` (comment omission)
rxAdd(/([^\n\/* ]) *(\/=?) *([^\/*])/g, function(_, prefix, operator, post) {
	return prefix + " " + operator + " " + post;
});
// `a<<b` -> `a << b`
rxAdd(/([^; ]) *((&lt;|&gt;){1,2}=?) *([^& ])/g, function(_, pre, op, _1, post) {
	return pre + " " + op + " " + post;
});
// `//coment` -> `// comment`
rxAdd(/(\/\/\/?) */g, function(_, start) {
	return start + " ";
});
// `thing//` -> `thing //`
rxAdd(/([^\n \/])\/\//g, function(_, prefix) {
	return prefix + " //";
});
// `;)` -> `)`
rxAdd(/; *\)/g, ")");
// ` ;` -> `;`
rxAdd(/ *;/g, ";");

// // Local variable searching // //
var scope;
function scopeAdd(name) {
	if (scope.indexOf(name) < 0) scope.push(name);
}
function scopeHint(_, pre, name, post) {
	return pre + '<span class="code-local">' + name + '</span>' + post;
}
rxAdd(/([^\w_])var +([\w_]+) *=/g, function(out, _, name) {
	scopeAdd(name);
	return out;
});
rxAdd(/([^\w_])var +([\w_]+)((, *[\w_]+)*);/g, function(out, _, first, rest) {
	scopeAdd(first);
	rest.replace(/, *([\w_]+)/g, function(out, name) {
		scopeAdd(name);
		return out;
	});
	return out;
});

// // Syntax highlighting // //
// strings:
rxAdd(/"[^"]*"/g, function(val) {
	return '<span class="code-string">' + val + '</span>';
});
rxAdd(/'[^']*'/g, function(val) {
	return '<span class="code-string">' + val + '</span>';
});
// keywords:
rxAdd(new RegExp("([^\\w])(" + keywords.replace(/ /g, "|") + ")([^\\w])", "g"), function(_, pre, kw, post) {
	return pre + '<span class="code-keyword">' + kw + '</span>' + post;
});
// function calls:
rxAdd(/(\w+)\(/g, function(_, name) {
	return '<span class="code-function">' + name + '</span>(';
});
// variables:
rxAdd(new RegExp("([^\\w])(" + vars.replace(/ /g, "|") + ")([^\\w])", "g"), function(_, pre, kw, post) {
	return pre + '<span class="code-variable">' + kw + '</span>' + post;
});
// constants:
rxAdd(new RegExp("([^\\w])(" + consts.replace(/ /g, "|") + ")([^\\w])", "g"), function(_, pre, kw, post) {
	return pre + '<span class="code-constant">' + kw + '</span>' + post;
});
// numbers:
rxAdd(/\$[0-9A-Fa-f]+/g, function(val) {
	return '<span class="code-number-hex">' + val + '</span>';
});
rxAdd(/([^\w_$#])(\d+(\.\d*)?)/g, function(_, pre, val) { // dec
	return pre + '<span class="code-number">' + val + '</span>';
});
// resources:
rxAdd(/([^\w])(obj_)([\w_]+)([^\w])/g, function(_, pre, type, name, post) {
	return pre + '<span class="code-resource">' + type + name + '</span>' + post;
});
// single-line comment:
rxAdd(/\/\/([^\n]+)/g, function(comment, text) {
	if (text.charAt(0) == "/") {
		return '<span class="code-comment-doc">' + comment + '</span>';
	} else return '<span class="code-comment">' + comment + '</span>';
});
// multi-line comment:
rxAdd(/\/\*(.*?)(\n.*)*?\*\//g, function(comment, text) {
	if (text.charAt(0) == "*") {
		return '<span class="code-comment-multiline-doc">' + comment + '</span>';
	} else return '<span class="code-comment-multiline">' + comment + '</span>';
});
// brackets:
rxAdd(/{|}/g, function(s) {
	return '<span class="code-keyword">' + s + '</span>';
});
//
var codeNodes = document.getElementsByClassName("code");
var debug = false;
for (var i = 0; i < codeNodes.length; i++) {
	var node = codeNodes[i];
	var html = node.innerHTML;
	html = html.replace(/\s+/g, " ");
	html = html.replace(/<br> /g, "\n");
	html = html.replace(/<br>$/g, "");
	html = html.replace(/&nbsp;/g, " ");
	html = html.replace(/<\/?.+?>/g, "");
	html = html.trim();
	if (html.charAt(0) == "{") {
		var htmln = html.length;
		if (html.charAt(html.length - 1) == "}") {
			html = html.substring(1, htmln - 1);
		}
	}
	html = "\n" + html + "\n";
	scope = [];
	var last = debug && html;
	for (var k = 0; k < rxList.length; k++) {
		html = html.replace(rxList[k].rx, rxList[k].rf);
		if (debug && last != html) { console.log(rxList[k].rx); console.log(html); last = html; }
	}
	for (var scopeId = 0; scopeId < scope.length; scopeId++) {
		var scopeRx = new RegExp("([^\\w])(" + scope[scopeId] + ")([^\\w])", "g");
		html = html.replace(scopeRx, scopeHint);
	}
	node.innerHTML = html.trim();
}
//
var styleCSS = function() {/*
	.code { white-space: pre-wrap }
	.code a { color: inherit }
	.code a:hover { text-decoration: underline }
	.code .code-dropdown {
		position: absolute;
		left: 0;
		background: #000;
		z-index: 1;
		padding: 2px 4px;
		white-space: nowrap;
		font: 12px Verdana,Helvetica,Arial,sans-serif;
		line-height: 1.5;
	}
	.code .code-dropdown a {
		display: block;
	}
	.code > .code-comment { color: #80FF80 }
	.code > .code-comment-doc { color: #80FFB0 }
	.code > .code-comment-multiline { color: #80FF80 }
	.code > .code-comment-multiline-doc { color: #80FFB0 }
	.code > .code-keyword { color: rgb(255, 184, 113); font-weight: bold }
	.code > .code-function { color: rgb(255, 184, 113) }
	.code > .code-number { color: rgb(255, 128, 128) }
	.code > .code-number-hex { color: rgb(255, 128, 128) }
	.code > .code-string { color: rgb(255, 128, 128) }
	.code > .code-variable { color: rgb(255, 128, 128) }
	.code > .code-constant { color: rgb(255, 128, 128) }
	.code > .code-resource { color: #8080FF }
	.code > .code-local { color: rgb(255, 192, 255) }
*/} + "";
styleCSS = styleCSS.substring(styleCSS.indexOf("/*") + 2);
styleCSS = styleCSS.substring(0, styleCSS.lastIndexOf("*/"));
var style = document.createElement("style");
style.type = "text/css";
style.innerHTML = styleCSS;
document.body.appendChild(style);
//
var indexShowDialog = null;
var indexData = null;
var indexCache = { };
function indexSeek(path) {
	for (var i = 0; i < indexData.length; i++) {
		var item = indexData[i];
		if (item[0] == path) {
			var result = item[1];
			indexCache[path] = result;
			return result;
		}
	}
	indexCache[path] = null;
	return null;
}
function indexLink(node, path) {
	var link = document.createElement("a");
	link.innerHTML = node.innerHTML;
	node.innerHTML = "";
	if (typeof path == "string") {
		link.href = "/" + path;
	} else { // needs a drop-down menu
		var menu = document.createElement("div");
		menu.className = "code-dropdown"
		for (var i = 0; i < path.length; i++) {
			var sub = document.createElement("a");
			sub.href = "/" + path[i][1];
			sub.appendChild(document.createTextNode(path[i][0]));
			menu.appendChild(sub);
		}
		menu.style.display = "none";
		node.appendChild(menu);
		node.style.position = "relative";
		link.href = "javascript:void(0);";
		var onHideMenu = null;
		onHideMenu = function() {
			menu.style.display = "none";
			document.removeEventListener("click", onHideMenu);
		}
		link.onclick = function(_) {
			menu.style.display = "";
			setTimeout(function() {
				document.addEventListener("click", onHideMenu);
			}, 0);
		}
	}
	node.appendChild(link);
}
function indexCheck(parent, className) {
	var nodes = parent.getElementsByClassName(className);
	for (var k = 0; k < nodes.length; k++) {
		var node = nodes[k];
		var text = node.textContent;
		var path = indexCache[text];
		if (path === undefined) path = indexSeek(text);
		if (path != null) indexLink(node, path);
	}
}
var indexScript = document.createElement("script");
indexScript.type = "text/javascript";
indexScript.onload = function(_) {
	indexData = window.HelpIndex;
	for (var i = 0; i < codeNodes.length; i++) {
		var node = codeNodes[i];
		indexCheck(node, "code-function");
		indexCheck(node, "code-variable");
		indexCheck(node, "code-constant");
	}
}
indexScript.src = "/files/helpindexdat.js";
document.body.appendChild(indexScript);
//