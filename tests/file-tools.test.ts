import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  findProjectRoot,
  resToAbsolute,
  absoluteToRes,
  normalizePath,
} from "../src/path-utils.js";

import {
  readScene,
  createScene,
  addNode,
  removeNode,
  updateSceneNode,
  attachScript,
  readProjectSettings,
} from "../src/file-tools.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MINIMAL_PROJECT_GODOT = `; Engine configuration file.
; It's best edited using the editor UI and not directly.

[application]

config/name="TestProject"
config/features=PackedStringArray("4.3", "Forward Plus")
run/main_scene="res://scenes/main.tscn"

[rendering]

renderer/rendering_method="forward_plus"
`;

const MINIMAL_TSCN = `[gd_scene format=3]

[node name="Main" type="Node2D"]

[node name="Player" type="CharacterBody2D" parent="."]

[node name="Sprite" type="Sprite2D" parent="Player"]
position = Vector2(0, -16)
`;

const PLAYER_SCRIPT = `extends CharacterBody2D

var speed = 200.0

func _physics_process(delta):
\tvelocity = Input.get_vector("left", "right", "up", "down") * speed
\tmove_and_slide()
`;

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "godot-mcp-test-"));

  // Create project structure
  await mkdir(path.join(tmpDir, "scenes"), { recursive: true });
  await mkdir(path.join(tmpDir, "scripts"), { recursive: true });

  await writeFile(path.join(tmpDir, "project.godot"), MINIMAL_PROJECT_GODOT);
  await writeFile(path.join(tmpDir, "scenes", "main.tscn"), MINIMAL_TSCN);
  await writeFile(path.join(tmpDir, "scripts", "player.gd"), PLAYER_SCRIPT);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// path-utils tests
// ---------------------------------------------------------------------------

describe("findProjectRoot", () => {
  it("finds project.godot from the project root directory", () => {
    const result = findProjectRoot(tmpDir);
    expect(result).toBe(tmpDir);
  });

  it("finds project.godot from a subdirectory", () => {
    const result = findProjectRoot(path.join(tmpDir, "scenes"));
    expect(result).toBe(tmpDir);
  });

  it("finds project.godot from a deeply nested subdirectory", () => {
    const result = findProjectRoot(path.join(tmpDir, "scenes"));
    expect(result).toBe(tmpDir);
  });

  it("returns null when project.godot is not found", () => {
    const result = findProjectRoot(tmpdir());
    expect(result).toBeNull();
  });
});

describe("resToAbsolute", () => {
  it("converts res:// path to absolute path", () => {
    const result = resToAbsolute("res://scenes/main.tscn", tmpDir);
    expect(result).toBe(path.join(tmpDir, "scenes", "main.tscn"));
  });

  it("handles root-level file", () => {
    const result = resToAbsolute("res://project.godot", tmpDir);
    expect(result).toBe(path.join(tmpDir, "project.godot"));
  });

  it("throws for non-res:// paths", () => {
    expect(() => resToAbsolute("scenes/main.tscn", tmpDir)).toThrow(
      "Not a res:// path",
    );
  });
});

describe("absoluteToRes", () => {
  it("converts absolute path to res:// path", () => {
    const absPath = path.join(tmpDir, "scenes", "main.tscn");
    const result = absoluteToRes(absPath, tmpDir);
    expect(result).toBe("res://scenes/main.tscn");
  });

  it("handles root-level file", () => {
    const absPath = path.join(tmpDir, "project.godot");
    const result = absoluteToRes(absPath, tmpDir);
    expect(result).toBe("res://project.godot");
  });

  it("throws for paths outside project root", () => {
    expect(() => absoluteToRes("/tmp/outside/file.gd", tmpDir)).toThrow(
      "outside project root",
    );
  });
});

describe("normalizePath", () => {
  it("normalizes res:// paths to absolute", () => {
    const result = normalizePath("res://scenes/main.tscn", tmpDir);
    expect(result).toBe(path.join(tmpDir, "scenes", "main.tscn"));
  });

  it("normalizes relative paths to absolute", () => {
    const result = normalizePath("scenes/main.tscn", tmpDir);
    expect(result).toBe(path.join(tmpDir, "scenes", "main.tscn"));
  });
});

// ---------------------------------------------------------------------------
// file-tools tests
// ---------------------------------------------------------------------------

describe("readProjectSettings", () => {
  it("reads all settings", async () => {
    const settings = await readProjectSettings(tmpDir);
    expect(settings).toHaveProperty("application");
    expect(settings).toHaveProperty("rendering");
  });

  it("reads a specific section", async () => {
    const section = await readProjectSettings(tmpDir, "application");
    expect(section).toHaveProperty("config/name");
    expect((section as Record<string, string>)["config/name"]).toBe(
      '"TestProject"',
    );
  });

  it("reads a specific key from a section", async () => {
    const result = await readProjectSettings(tmpDir, "application", "config/name");
    expect(result).toEqual({ value: '"TestProject"' });
  });

  it("throws for non-existent section", async () => {
    await expect(
      readProjectSettings(tmpDir, "nonexistent"),
    ).rejects.toThrow("Section not found");
  });

  it("throws for non-existent key", async () => {
    await expect(
      readProjectSettings(tmpDir, "application", "nonexistent"),
    ).rejects.toThrow("Key not found");
  });
});

describe("createScene", () => {
  it("creates a valid .tscn file with root node", async () => {
    await createScene(tmpDir, "res://scenes/level.tscn", "Node2D", "Level");

    const content = await readFile(
      path.join(tmpDir, "scenes", "level.tscn"),
      "utf-8",
    );
    expect(content).toContain("[gd_scene");
    expect(content).toContain('name="Level"');
    expect(content).toContain('type="Node2D"');
  });

  it("defaults root name to filename without extension", async () => {
    await createScene(tmpDir, "res://scenes/menu.tscn", "Control");

    const content = await readFile(
      path.join(tmpDir, "scenes", "menu.tscn"),
      "utf-8",
    );
    expect(content).toContain('name="menu"');
    expect(content).toContain('type="Control"');
  });

  it("creates parent directories", async () => {
    await createScene(
      tmpDir,
      "res://scenes/levels/forest.tscn",
      "Node3D",
      "Forest",
    );

    const content = await readFile(
      path.join(tmpDir, "scenes", "levels", "forest.tscn"),
      "utf-8",
    );
    expect(content).toContain('name="Forest"');
  });
});

describe("readScene", () => {
  it("returns a node tree from a .tscn file", async () => {
    const tree = await readScene(tmpDir, "res://scenes/main.tscn");

    expect(tree).not.toBeNull();
    expect(tree!.name).toBe("Main");
    expect(tree!.type).toBe("Node2D");
    expect(tree!.children).toHaveLength(1);

    const player = tree!.children[0];
    expect(player.name).toBe("Player");
    expect(player.type).toBe("CharacterBody2D");
    expect(player.children).toHaveLength(1);

    const sprite = player.children[0];
    expect(sprite.name).toBe("Sprite");
    expect(sprite.type).toBe("Sprite2D");
  });
});

describe("addNode", () => {
  it("adds a node to the scene", async () => {
    await addNode(tmpDir, "res://scenes/main.tscn", ".", "Camera", "Camera2D");

    const tree = await readScene(tmpDir, "res://scenes/main.tscn");
    const camera = tree!.children.find((c) => c.name === "Camera");
    expect(camera).toBeDefined();
    expect(camera!.type).toBe("Camera2D");
  });

  it("adds a node with properties", async () => {
    await addNode(tmpDir, "res://scenes/main.tscn", ".", "Label", "Label", {
      text: '"Hello"',
    });

    const tree = await readScene(tmpDir, "res://scenes/main.tscn");
    const label = tree!.children.find((c) => c.name === "Label");
    expect(label).toBeDefined();
    expect(label!.properties["text"]).toBe('"Hello"');
  });

  it("adds a child to a non-root node", async () => {
    await addNode(
      tmpDir,
      "res://scenes/main.tscn",
      "Player",
      "CollisionShape",
      "CollisionShape2D",
    );

    const tree = await readScene(tmpDir, "res://scenes/main.tscn");
    const player = tree!.children.find((c) => c.name === "Player");
    const collision = player!.children.find((c) => c.name === "CollisionShape");
    expect(collision).toBeDefined();
    expect(collision!.type).toBe("CollisionShape2D");
  });
});

describe("removeNode", () => {
  it("removes a node from the scene", async () => {
    await removeNode(tmpDir, "res://scenes/main.tscn", "Player");

    const tree = await readScene(tmpDir, "res://scenes/main.tscn");
    expect(tree!.children).toHaveLength(0);
  });

  it("removes a nested node", async () => {
    await removeNode(tmpDir, "res://scenes/main.tscn", "Player/Sprite");

    const tree = await readScene(tmpDir, "res://scenes/main.tscn");
    const player = tree!.children.find((c) => c.name === "Player");
    expect(player).toBeDefined();
    expect(player!.children).toHaveLength(0);
  });
});

describe("updateSceneNode", () => {
  it("updates properties on a node", async () => {
    await updateSceneNode(
      tmpDir,
      "res://scenes/main.tscn",
      "Player/Sprite",
      { position: "Vector2(10, 20)" },
    );

    const tree = await readScene(tmpDir, "res://scenes/main.tscn");
    const sprite = tree!.children[0].children[0];
    expect(sprite.properties["position"]).toBe("Vector2(10, 20)");
  });

  it("adds new properties to a node", async () => {
    await updateSceneNode(
      tmpDir,
      "res://scenes/main.tscn",
      "Player",
      { collision_layer: "2" },
    );

    const tree = await readScene(tmpDir, "res://scenes/main.tscn");
    const player = tree!.children[0];
    expect(player.properties["collision_layer"]).toBe("2");
  });
});

describe("attachScript", () => {
  it("attaches a script to a node", async () => {
    await attachScript(
      tmpDir,
      "res://scenes/main.tscn",
      "Player",
      "res://scripts/player.gd",
    );

    const content = await readFile(
      path.join(tmpDir, "scenes", "main.tscn"),
      "utf-8",
    );
    expect(content).toContain('type="Script"');
    expect(content).toContain('path="res://scripts/player.gd"');
    expect(content).toContain('script = ExtResource("script_1")');
  });
});
