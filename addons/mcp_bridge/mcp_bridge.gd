@tool
extends EditorPlugin

## TCP server port for MCP bridge communication.
const PORT: int = 6550
## Maximum number of bytes to read per poll cycle.
const MAX_READ_BYTES: int = 65536

var _server: TCPServer = null
var _clients: Array[StreamPeerTCP] = []
## Per-client receive buffer (accumulates partial reads).
var _buffers: Array[String] = []
## Captured debug log lines.
var _log_lines: PackedStringArray = PackedStringArray()
## Maximum number of log lines to keep.
const MAX_LOG_LINES: int = 2000


func _enter_tree() -> void:
	_server = TCPServer.new()
	var err := _server.listen(PORT, "127.0.0.1")
	if err != OK:
		push_error("MCP Bridge: Failed to listen on port %d (error %d)" % [PORT, err])
		_server = null
		return
	print("MCP Bridge: Listening on 127.0.0.1:%d" % PORT)


func _exit_tree() -> void:
	if _server != null:
		_server.stop()
		_server = null
	for client in _clients:
		client.disconnect_from_host()
	_clients.clear()
	_buffers.clear()
	print("MCP Bridge: Stopped")


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
					# Process complete lines
					_process_buffer(i)
			i += 1
		elif status == StreamPeerTCP.STATUS_NONE or status == StreamPeerTCP.STATUS_ERROR:
			# Connection closed or errored
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
		"run_project":
			_handle_run_project(client_index, request_id)
		"stop_project":
			_handle_stop_project(client_index, request_id)
		"get_debug_log":
			_handle_get_debug_log(client_index, request_id, params)
		"get_scene_tree_live":
			_handle_get_scene_tree_live(client_index, request_id)
		_:
			_send_error(client_index, request_id, "Unknown action: %s" % action)


## Send a success response to a client.
func _send_response(client_index: int, request_id: String, data: Variant) -> void:
	var response := {
		"id": request_id,
		"status": "ok",
		"data": data,
	}
	_send_json(client_index, response)


## Send an error response to a client.
func _send_error(client_index: int, request_id: String, message: String) -> void:
	var response := {
		"id": request_id,
		"status": "error",
		"message": message,
	}
	_send_json(client_index, response)


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

## Capture the editor viewport as a base64 PNG.
func _handle_screenshot(client_index: int, request_id: String) -> void:
	var viewport := EditorInterface.get_editor_viewport_3d()
	if viewport == null:
		viewport = EditorInterface.get_editor_viewport_2d()
	if viewport == null:
		# Fallback: use the main editor viewport
		var base_control := EditorInterface.get_base_control()
		if base_control != null:
			viewport = base_control.get_viewport()

	if viewport == null:
		_send_error(client_index, request_id, "Could not get editor viewport")
		return

	var image := viewport.get_texture().get_image()
	if image == null:
		_send_error(client_index, request_id, "Could not capture viewport image")
		return

	var png_data := image.save_png_to_buffer()
	var base64 := Marshalls.raw_to_base64(png_data)
	_send_response(client_index, request_id, base64)


## Run the main scene.
func _handle_run_project(client_index: int, request_id: String) -> void:
	EditorInterface.play_main_scene()
	_send_response(client_index, request_id, null)


## Stop the running game.
func _handle_stop_project(client_index: int, request_id: String) -> void:
	EditorInterface.stop_playing_scene()
	_send_response(client_index, request_id, null)


## Get recent debug log lines.
func _handle_get_debug_log(client_index: int, request_id: String, params: Dictionary) -> void:
	var line_count: int = params.get("lines", _log_lines.size())
	var start := maxi(0, _log_lines.size() - line_count)
	var output := ""
	for idx in range(start, _log_lines.size()):
		output += _log_lines[idx] + "\n"
	_send_response(client_index, request_id, output)


## Get the live scene tree from the running game.
func _handle_get_scene_tree_live(client_index: int, request_id: String) -> void:
	if not EditorInterface.is_playing_scene():
		_send_error(client_index, request_id, "No scene is currently running")
		return

	# Use the editor debugger to get tree info
	var debugger := EditorInterface.get_script_editor()
	# Since direct tree access from the editor to the running game is limited,
	# we use EditorInterface to get the edited scene tree as a fallback.
	var edited_scene := EditorInterface.get_edited_scene_root()
	if edited_scene == null:
		_send_error(client_index, request_id, "No scene tree available")
		return

	var tree_data := _serialize_node(edited_scene)
	_send_response(client_index, request_id, tree_data)


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


# ---------------------------------------------------------------------------
# Log capture
# ---------------------------------------------------------------------------

## Capture print output. Call this from _ready or _enter_tree if needed.
## Note: In Godot 4.x, there is no built-in way to intercept print() output
## from the editor plugin. This stores messages pushed via push_error/push_warning
## or logged via this plugin's own logging.
func _log(message: String) -> void:
	_log_lines.append(message)
	if _log_lines.size() > MAX_LOG_LINES:
		_log_lines = _log_lines.slice(_log_lines.size() - MAX_LOG_LINES)
