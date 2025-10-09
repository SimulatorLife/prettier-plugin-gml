var clamp_result = clamp(lerp(start_value, end_value, 0.5), 0, 100);
var composite = process_value(lerp(current_value, target_value, weight), fallback);
