## Autoload script that runs inside the game process.
## Provides a TCP server on port 6551 for game-specific MCP operations
## such as capturing the game window screenshot, live scene tree,
## performance metrics, property manipulation, and method calls.
## Automatically registered by the MCP Bridge editor plugin.
extends Node

## TCP server port for game bridge communication.
const PORT: int = 6551
## Maximum number of bytes to read per poll cycle.
const MAX_READ_BYTES: int = 65536
## Maximum number of log lines to keep.
const MAX_LOG_LINES: int = 2000

var _server: TCPServer = null
var _clients: Array[StreamPeerTCP] = []
## Per-client receive buffer (accumulates partial reads).
var _buffers: Array[String] = []
## Captured game log lines.
var _log_lines: PackedStringArray = PackedStringArray()


func _ready() -> void:
	_server = TCPServer.new()
	var err := _server.listen(PORT, "127.0.0.1")
	if err != OK:
		push_error("MCP Game Bridge: Failed to listen on port %d (error %d)" % [PORT, err])
		_server = null
		return
	print("MCP Game Bridge: Listening on 127.0.0.1:%d" % PORT)


func _exit_tree() -> void:
	if _server != null:
		_server.stop()
		_server = null
	for client in _clients:
		client.disconnect_from_host()
	_clients.clear()
	_buffers.clear()


func _process(_delta: float) -> void:
	if _server == null:
		return

	# Accept new connections
	while _server.is_connection_available():
		var peer := _server.take_connection()
		if peer != null:
			_clients.append(peer)
			_buffers.append("")

	# Process existing connections
	var i := 0
	while i < _clients.size():
		var client := _clients[i]
		client.poll()

		var status := client.get_status()
		if status == StreamPeerTCP.STATUS_CONNECTED:
			var available := client.get_available_bytes()
			if available > 0:
				var data := client.get_data(mini(available, MAX_READ_BYTES))
				if data[0] == OK:
					_buffers[i] += (data[1] as PackedByteArray).get_string_from_utf8()
					_process_buffer(i)
			i += 1
		elif status == StreamPeerTCP.STATUS_NONE or status == StreamPeerTCP.STATUS_ERROR:
			client.disconnect_from_host()
			_clients.remove_at(i)
			_buffers.remove_at(i)
		else:
			i += 1


## Process buffered data for a client, extracting complete JSON lines.
func _process_buffer(client_index: int) -> void:
	var buffer := _buffers[client_index]
	var newline_pos := buffer.find("\n")

	while newline_pos != -1:
		var line := buffer.substr(0, newline_pos).strip_edges()
		buffer = buffer.substr(newline_pos + 1)

		if line.length() > 0:
			_handle_request(client_index, line)

		newline_pos = buffer.find("\n")

	_buffers[client_index] = buffer


## Parse and handle a single JSON request line.
func _handle_request(client_index: int, json_line: String) -> void:
	var parsed = JSON.parse_string(json_line)
	if parsed == null or not parsed is Dictionary:
		_send_error(client_index, "", "Invalid JSON request")
		return

	var request: Dictionary = parsed
	var request_id: String = request.get("id", "")
	var action: String = request.get("action", "")
	var params: Dictionary = request.get("params", {})

	match action:
		"screenshot":
			_handle_screenshot(client_index, request_id)
		"get_scene_tree":
			_handle_get_scene_tree(client_index, request_id)
		"get_performance":
			_handle_get_performance(client_index, request_id)
		"set_property":
			_handle_set_property(client_index, request_id, params)
		"call_method":
			_handle_call_method(client_index, request_id, params)
		"get_game_logs":
			_handle_get_game_logs(client_index, request_id, params)
		_:
			_send_error(client_index, request_id, "Unknown action: %s" % action)


## Send a success response to a client.
func _send_response(client_index: int, request_id: String, data: Variant) -> void:
	_send_json(client_index, {
		"id": request_id,
		"status": "ok",
		"data": data,
	})


## Send an error response to a client.
func _send_error(client_index: int, request_id: String, message: String) -> void:
	_send_json(client_index, {
		"id": request_id,
		"status": "error",
		"message": message,
	})


## Serialize and send a JSON response line to a client.
func _send_json(client_index: int, data: Dictionary) -> void:
	if client_index < 0 or client_index >= _clients.size():
		return
	var json_str := JSON.stringify(data)
	var payload := (json_str + "\n").to_utf8_buffer()
	_clients[client_index].put_data(payload)


# ---------------------------------------------------------------------------
# Action handlers
# ---------------------------------------------------------------------------

## Capture the game window as a base64 PNG.
func _handle_screenshot(client_index: int, request_id: String) -> void:
	# Wait for the current frame to finish rendering
	await RenderingServer.frame_post_draw

	var image := get_viewport().get_texture().get_image()
	if image == null:
		_send_error(client_index, request_id, "Could not capture game viewport")
		return

	var png_data := image.save_png_to_buffer()
	var base64 := Marshalls.raw_to_base64(png_data)
	_send_response(client_index, request_id, base64)


## Get the live scene tree from the running game.
func _handle_get_scene_tree(client_index: int, request_id: String) -> void:
	var root := get_tree().root
	if root == null:
		_send_error(client_index, request_id, "No scene tree available")
		return

	var tree_data := _serialize_node(root)
	_send_response(client_index, request_id, tree_data)


## Get performance metrics from the running game.
func _handle_get_performance(client_index: int, request_id: String) -> void:
	var metrics := {
		"fps": Performance.get_monitor(Performance.TIME_FPS),
		"frame_time": Performance.get_monitor(Performance.TIME_PROCESS),
		"physics_frame_time": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS),
		"idle_time": Performance.get_monitor(Performance.TIME_NAVIGATION_PROCESS),
		"objects": Performance.get_monitor(Performance.OBJECT_COUNT),
		"resources": Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),
		"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"orphan_nodes": Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT),
		"memory_static": Performance.get_monitor(Performance.MEMORY_STATIC),
		"memory_static_max": Performance.get_monitor(Performance.MEMORY_STATIC_MAX),
		"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		"objects_in_frame": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
		"vertices_in_frame": Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
		"physics_2d_active_objects": Performance.get_monitor(Performance.PHYSICS_2D_ACTIVE_OBJECTS),
		"physics_3d_active_objects": Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS),
	}
	_send_response(client_index, request_id, metrics)


## Set a property on a node in the running game.
func _handle_set_property(client_index: int, request_id: String, params: Dictionary) -> void:
	var node_path_str: String = params.get("node_path", "")
	var property_name: String = params.get("property", "")
	var value = params.get("value")

	if node_path_str.is_empty() or property_name.is_empty():
		_send_error(client_index, request_id, "node_path and property are required")
		return

	var node := get_tree().root.get_node_or_null(NodePath(node_path_str))
	if node == null:
		_send_error(client_index, request_id, "Node not found: %s" % node_path_str)
		return

	if not property_name in node:
		_send_error(client_index, request_id, "Property not found: %s on %s" % [property_name, node_path_str])
		return

	node.set(property_name, value)
	_send_response(client_index, request_id, {
		"node": node_path_str,
		"property": property_name,
		"value": node.get(property_name),
	})


## Call a method on a node in the running game.
func _handle_call_method(client_index: int, request_id: String, params: Dictionary) -> void:
	var node_path_str: String = params.get("node_path", "")
	var method_name: String = params.get("method", "")
	var args: Array = params.get("args", [])

	if node_path_str.is_empty() or method_name.is_empty():
		_send_error(client_index, request_id, "node_path and method are required")
		return

	var node := get_tree().root.get_node_or_null(NodePath(node_path_str))
	if node == null:
		_send_error(client_index, request_id, "Node not found: %s" % node_path_str)
		return

	if not node.has_method(method_name):
		_send_error(client_index, request_id, "Method not found: %s on %s" % [method_name, node_path_str])
		return

	var result = node.callv(method_name, args)
	# Convert result to something JSON-serializable
	var serialized_result = _serialize_variant(result)
	_send_response(client_index, request_id, serialized_result)


## Get captured game log output.
func _handle_get_game_logs(client_index: int, request_id: String, params: Dictionary) -> void:
	var line_count: int = params.get("lines", _log_lines.size())
	var start := maxi(0, _log_lines.size() - line_count)
	var output := ""
	for idx in range(start, _log_lines.size()):
		output += _log_lines[idx] + "\n"
	_send_response(client_index, request_id, output)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

## Recursively serialize a node tree into a dictionary.
func _serialize_node(node: Node) -> Dictionary:
	var data := {
		"name": node.name,
		"type": node.get_class(),
		"children": [],
	}

	for child in node.get_children():
		(data["children"] as Array).append(_serialize_node(child))

	return data


## Convert a Variant to a JSON-serializable value.
func _serialize_variant(value: Variant) -> Variant:
	if value == null:
		return null
	if value is bool or value is int or value is float or value is String:
		return value
	if value is Vector2:
		return {"x": value.x, "y": value.y}
	if value is Vector3:
		return {"x": value.x, "y": value.y, "z": value.z}
	if value is Color:
		return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
	if value is Array:
		var arr := []
		for item in value:
			arr.append(_serialize_variant(item))
		return arr
	if value is Dictionary:
		var dict := {}
		for key in value:
			dict[str(key)] = _serialize_variant(value[key])
		return dict
	# Fallback: convert to string
	return str(value)


# ---------------------------------------------------------------------------
# Log capture
# ---------------------------------------------------------------------------

## Store a log message. Game scripts can call MCPGameBridge._log("message")
## to capture output for retrieval via get_game_logs.
func _log(message: String) -> void:
	_log_lines.append(message)
	if _log_lines.size() > MAX_LOG_LINES:
		_log_lines = _log_lines.slice(_log_lines.size() - MAX_LOG_LINES)
