import { describe, it, expect } from "vitest";
import {
  parseTscn,
  serializeTscn,
  buildNodeTree,
  addNodeToScene,
  removeNodeFromScene,
  updateNodeProperties,
  attachScriptToNode,
  getNodePath,
  type TscnScene,
  type NodeTreeEntry,
} from "../src/tscn-parser";

// ---- Test fixtures ----

const BASIC_SCENE = `[gd_scene format=3]

[node name="Root" type="Node2D"]
`;

const FULL_SCENE = `[gd_scene load_steps=4 format=3 uid="uid://abc123"]

[ext_resource type="Script" path="res://player.gd" id="script_1"]

[ext_resource type="Texture2D" path="res://player.png" id="texture_1"]

[sub_resource type="CapsuleShape2D" id="shape_1"]
radius = 8.0
height = 16.0

[node name="Player" type="CharacterBody2D"]
script = ExtResource("script_1")

[node name="Sprite2D" type="Sprite2D" parent="."]
texture = ExtResource("texture_1")

[node name="CollisionShape2D" type="CollisionShape2D" parent="."]
shape = SubResource("shape_1")

[node name="Area2D" type="Area2D" parent="."]

[node name="BodyShape" type="CollisionShape2D" parent="Area2D"]

[connection signal="body_entered" from="Area2D" to="." method="_on_body_entered"]
`;

const NESTED_SCENE = `[gd_scene format=3]

[node name="World" type="Node2D"]

[node name="Entities" type="Node2D" parent="."]

[node name="Player" type="CharacterBody2D" parent="Entities"]

[node name="Sprite" type="Sprite2D" parent="Entities/Player"]

[node name="UI" type="CanvasLayer" parent="."]
`;

const PROPERTIES_SCENE = `[gd_scene format=3]

[node name="Root" type="Node2D"]
position = Vector2(100, 200)
scale = Vector2(2, 2)
visible = true
modulate = Color(1, 0, 0, 1)
metadata/tags = PackedStringArray("enemy", "boss")
z_index = 5
`;

// ---- Tests ----

describe("parseTscn", () => {
  it("should parse a basic scene with root node only", () => {
    const scene = parseTscn(BASIC_SCENE);
    expect(scene.format).toBe(3);
    expect(scene.nodes).toHaveLength(1);
    expect(scene.nodes[0].name).toBe("Root");
    expect(scene.nodes[0].type).toBe("Node2D");
    expect(scene.nodes[0].parent).toBeUndefined();
    expect(scene.extResources).toHaveLength(0);
    expect(scene.subResources).toHaveLength(0);
    expect(scene.connections).toHaveLength(0);
  });

  it("should parse a scene with nested nodes", () => {
    const scene = parseTscn(NESTED_SCENE);
    expect(scene.nodes).toHaveLength(5);

    // Root
    expect(scene.nodes[0].name).toBe("World");
    expect(scene.nodes[0].parent).toBeUndefined();

    // Direct children of root
    expect(scene.nodes[1].name).toBe("Entities");
    expect(scene.nodes[1].parent).toBe(".");

    // Grandchild
    expect(scene.nodes[2].name).toBe("Player");
    expect(scene.nodes[2].parent).toBe("Entities");

    // Great-grandchild
    expect(scene.nodes[3].name).toBe("Sprite");
    expect(scene.nodes[3].parent).toBe("Entities/Player");

    // Another direct child
    expect(scene.nodes[4].name).toBe("UI");
    expect(scene.nodes[4].parent).toBe(".");
  });

  it("should parse ext_resources and sub_resources", () => {
    const scene = parseTscn(FULL_SCENE);

    expect(scene.extResources).toHaveLength(2);
    expect(scene.extResources[0]).toEqual({
      id: "script_1",
      type: "Script",
      path: "res://player.gd",
    });
    expect(scene.extResources[1]).toEqual({
      id: "texture_1",
      type: "Texture2D",
      path: "res://player.png",
    });

    expect(scene.subResources).toHaveLength(1);
    expect(scene.subResources[0].id).toBe("shape_1");
    expect(scene.subResources[0].type).toBe("CapsuleShape2D");
    expect(scene.subResources[0].properties["radius"]).toBe("8.0");
    expect(scene.subResources[0].properties["height"]).toBe("16.0");
  });

  it("should parse connections", () => {
    const scene = parseTscn(FULL_SCENE);
    expect(scene.connections).toHaveLength(1);
    expect(scene.connections[0]).toEqual({
      signal: "body_entered",
      from: "Area2D",
      to: ".",
      method: "_on_body_entered",
    });
  });

  it("should parse connections with flags", () => {
    const content = `[gd_scene format=3]

[node name="Root" type="Node2D"]

[connection signal="pressed" from="Button" to="." method="_on_pressed" flags=3]
`;
    const scene = parseTscn(content);
    expect(scene.connections[0].flags).toBe(3);
  });

  it("should parse node properties including complex values", () => {
    const scene = parseTscn(PROPERTIES_SCENE);
    const root = scene.nodes[0];
    expect(root.properties["position"]).toBe("Vector2(100, 200)");
    expect(root.properties["scale"]).toBe("Vector2(2, 2)");
    expect(root.properties["visible"]).toBe("true");
    expect(root.properties["modulate"]).toBe("Color(1, 0, 0, 1)");
    expect(root.properties["z_index"]).toBe("5");
  });

  it("should parse uid on gd_scene header", () => {
    const scene = parseTscn(FULL_SCENE);
    expect(scene.uid).toBe("uid://abc123");
    expect(scene.loadSteps).toBe(4);
  });

  it("should parse ext_resource with uid", () => {
    const content = `[gd_scene format=3]

[ext_resource type="Script" path="res://test.gd" uid="uid://xyz" id="1_abc"]

[node name="Root" type="Node2D"]
`;
    const scene = parseTscn(content);
    expect(scene.extResources[0].uid).toBe("uid://xyz");
    expect(scene.extResources[0].id).toBe("1_abc");
  });
});

describe("serializeTscn", () => {
  it("should serialize a basic scene", () => {
    const scene = parseTscn(BASIC_SCENE);
    const output = serializeTscn(scene);
    expect(output).toContain("[gd_scene format=3]");
    expect(output).toContain('[node name="Root" type="Node2D"]');
    // No load_steps when no resources
    expect(output).not.toContain("load_steps");
  });

  it("should include load_steps when resources exist", () => {
    const scene = parseTscn(FULL_SCENE);
    const output = serializeTscn(scene);
    // 2 ext + 1 sub + 1 = 4
    expect(output).toContain("load_steps=4");
  });

  it("should serialize ext_resources", () => {
    const scene = parseTscn(FULL_SCENE);
    const output = serializeTscn(scene);
    expect(output).toContain(
      '[ext_resource type="Script" path="res://player.gd" id="script_1"]',
    );
    expect(output).toContain(
      '[ext_resource type="Texture2D" path="res://player.png" id="texture_1"]',
    );
  });

  it("should serialize sub_resources with properties", () => {
    const scene = parseTscn(FULL_SCENE);
    const output = serializeTscn(scene);
    expect(output).toContain(
      '[sub_resource type="CapsuleShape2D" id="shape_1"]',
    );
    expect(output).toContain("radius = 8.0");
    expect(output).toContain("height = 16.0");
  });

  it("should serialize connections", () => {
    const scene = parseTscn(FULL_SCENE);
    const output = serializeTscn(scene);
    expect(output).toContain(
      '[connection signal="body_entered" from="Area2D" to="." method="_on_body_entered"]',
    );
  });

  it("should serialize uid when present", () => {
    const scene = parseTscn(FULL_SCENE);
    const output = serializeTscn(scene);
    expect(output).toContain('uid="uid://abc123"');
  });
});

describe("parse -> serialize -> parse roundtrip", () => {
  it("should preserve basic scene through roundtrip", () => {
    const scene1 = parseTscn(BASIC_SCENE);
    const serialized = serializeTscn(scene1);
    const scene2 = parseTscn(serialized);
    expect(scene2.nodes).toEqual(scene1.nodes);
    expect(scene2.format).toBe(scene1.format);
  });

  it("should preserve full scene through roundtrip", () => {
    const scene1 = parseTscn(FULL_SCENE);
    const serialized = serializeTscn(scene1);
    const scene2 = parseTscn(serialized);

    expect(scene2.format).toBe(scene1.format);
    expect(scene2.uid).toBe(scene1.uid);
    expect(scene2.extResources).toEqual(scene1.extResources);
    expect(scene2.subResources).toEqual(scene1.subResources);
    expect(scene2.nodes).toEqual(scene1.nodes);
    expect(scene2.connections).toEqual(scene1.connections);
  });

  it("should preserve nested scene through roundtrip", () => {
    const scene1 = parseTscn(NESTED_SCENE);
    const serialized = serializeTscn(scene1);
    const scene2 = parseTscn(serialized);
    expect(scene2.nodes).toEqual(scene1.nodes);
  });
});

describe("addNodeToScene", () => {
  it("should add a child to root", () => {
    const scene = parseTscn(BASIC_SCENE);
    addNodeToScene(scene, "Root", "Child1", "Sprite2D");
    expect(scene.nodes).toHaveLength(2);
    expect(scene.nodes[1].name).toBe("Child1");
    expect(scene.nodes[1].type).toBe("Sprite2D");
    expect(scene.nodes[1].parent).toBe(".");
  });

  it("should add a child to an existing child node", () => {
    const scene = parseTscn(NESTED_SCENE);
    addNodeToScene(scene, "Entities", "Enemy", "CharacterBody2D");
    const added = scene.nodes.find((n) => n.name === "Enemy");
    expect(added).toBeDefined();
    expect(added!.parent).toBe("Entities");
  });

  it("should add a grandchild node", () => {
    const scene = parseTscn(NESTED_SCENE);
    addNodeToScene(scene, "Entities/Player", "Weapon", "Node2D");
    const added = scene.nodes.find((n) => n.name === "Weapon");
    expect(added).toBeDefined();
    expect(added!.parent).toBe("Entities/Player");
  });

  it("should add a node with properties", () => {
    const scene = parseTscn(BASIC_SCENE);
    addNodeToScene(scene, "Root", "Child1", "Sprite2D", {
      position: "Vector2(10, 20)",
      visible: "false",
    });
    expect(scene.nodes[1].properties["position"]).toBe("Vector2(10, 20)");
    expect(scene.nodes[1].properties["visible"]).toBe("false");
  });

  it("should throw when parent does not exist", () => {
    const scene = parseTscn(BASIC_SCENE);
    expect(() => {
      addNodeToScene(scene, "NonExistent", "Child", "Node2D");
    }).toThrow("Parent node not found");
  });

  it("should handle adding to root via '.' path", () => {
    const scene = parseTscn(BASIC_SCENE);
    addNodeToScene(scene, ".", "Child1", "Node2D");
    expect(scene.nodes[1].parent).toBe(".");
  });
});

describe("removeNodeFromScene", () => {
  it("should remove a leaf node", () => {
    const scene = parseTscn(NESTED_SCENE);
    removeNodeFromScene(scene, "UI");
    expect(scene.nodes.find((n) => n.name === "UI")).toBeUndefined();
    expect(scene.nodes).toHaveLength(4);
  });

  it("should remove a node and all its children", () => {
    const scene = parseTscn(NESTED_SCENE);
    // Remove Entities - should also remove Player and Sprite
    removeNodeFromScene(scene, "Entities");
    expect(scene.nodes).toHaveLength(2); // World + UI
    expect(scene.nodes.map((n) => n.name)).toEqual(["World", "UI"]);
  });

  it("should remove associated connections", () => {
    const scene = parseTscn(FULL_SCENE);
    removeNodeFromScene(scene, "Area2D");
    expect(scene.connections).toHaveLength(0);
    // Also BodyShape (child of Area2D) should be removed
    expect(scene.nodes.find((n) => n.name === "BodyShape")).toBeUndefined();
  });

  it("should throw when trying to remove root", () => {
    const scene = parseTscn(BASIC_SCENE);
    expect(() => {
      removeNodeFromScene(scene, "Root");
    }).toThrow("Cannot remove the root node");
  });
});

describe("updateNodeProperties", () => {
  it("should update properties on a node", () => {
    const scene = parseTscn(PROPERTIES_SCENE);
    updateNodeProperties(scene, "Root", {
      position: "Vector2(0, 0)",
      z_index: "10",
    });
    expect(scene.nodes[0].properties["position"]).toBe("Vector2(0, 0)");
    expect(scene.nodes[0].properties["z_index"]).toBe("10");
    // Unchanged properties should remain
    expect(scene.nodes[0].properties["visible"]).toBe("true");
  });

  it("should add new properties to a node", () => {
    const scene = parseTscn(BASIC_SCENE);
    updateNodeProperties(scene, "Root", {
      position: "Vector2(50, 50)",
    });
    expect(scene.nodes[0].properties["position"]).toBe("Vector2(50, 50)");
  });

  it("should update properties on child nodes by path", () => {
    const scene = parseTscn(NESTED_SCENE);
    updateNodeProperties(scene, "Entities/Player", {
      speed: "200.0",
    });
    const player = scene.nodes.find((n) => n.name === "Player");
    expect(player!.properties["speed"]).toBe("200.0");
  });

  it("should throw when node not found", () => {
    const scene = parseTscn(BASIC_SCENE);
    expect(() => {
      updateNodeProperties(scene, "NonExistent", { x: "1" });
    }).toThrow("Node not found");
  });
});

describe("attachScriptToNode", () => {
  it("should attach a new script to a node", () => {
    const scene = parseTscn(BASIC_SCENE);
    attachScriptToNode(scene, "Root", "res://root.gd");
    expect(scene.extResources).toHaveLength(1);
    expect(scene.extResources[0].type).toBe("Script");
    expect(scene.extResources[0].path).toBe("res://root.gd");
    expect(scene.nodes[0].properties["script"]).toBe(
      `ExtResource("${scene.extResources[0].id}")`,
    );
  });

  it("should reuse existing ext_resource for same script", () => {
    const scene = parseTscn(FULL_SCENE);
    // player.gd is already in ext_resources as script_1
    attachScriptToNode(scene, "Sprite2D", "res://player.gd");
    // Should NOT add a new ext_resource
    const scriptResources = scene.extResources.filter(
      (e) => e.path === "res://player.gd",
    );
    expect(scriptResources).toHaveLength(1);
    const sprite = scene.nodes.find((n) => n.name === "Sprite2D");
    expect(sprite!.properties["script"]).toBe('ExtResource("script_1")');
  });

  it("should generate unique id when script_1 is taken", () => {
    const scene = parseTscn(FULL_SCENE);
    attachScriptToNode(scene, "Sprite2D", "res://sprite.gd");
    const spriteExt = scene.extResources.find(
      (e) => e.path === "res://sprite.gd",
    );
    expect(spriteExt).toBeDefined();
    // script_1 is taken, so it should be script_2
    expect(spriteExt!.id).toBe("script_2");
  });

  it("should throw when node not found", () => {
    const scene = parseTscn(BASIC_SCENE);
    expect(() => {
      attachScriptToNode(scene, "NonExistent", "res://test.gd");
    }).toThrow("Node not found");
  });
});

describe("buildNodeTree", () => {
  it("should return null for empty scene", () => {
    const scene: TscnScene = {
      format: 3,
      loadSteps: 1,
      extResources: [],
      subResources: [],
      nodes: [],
      connections: [],
    };
    expect(buildNodeTree(scene)).toBeNull();
  });

  it("should build tree for basic scene", () => {
    const scene = parseTscn(BASIC_SCENE);
    const tree = buildNodeTree(scene)!;
    expect(tree.name).toBe("Root");
    expect(tree.type).toBe("Node2D");
    expect(tree.children).toHaveLength(0);
  });

  it("should build nested tree structure", () => {
    const scene = parseTscn(NESTED_SCENE);
    const tree = buildNodeTree(scene)!;

    expect(tree.name).toBe("World");
    expect(tree.children).toHaveLength(2); // Entities, UI

    const entities = tree.children.find((c) => c.name === "Entities")!;
    expect(entities).toBeDefined();
    expect(entities.children).toHaveLength(1); // Player

    const player = entities.children[0];
    expect(player.name).toBe("Player");
    expect(player.children).toHaveLength(1); // Sprite

    const sprite = player.children[0];
    expect(sprite.name).toBe("Sprite");
    expect(sprite.children).toHaveLength(0);

    const ui = tree.children.find((c) => c.name === "UI")!;
    expect(ui).toBeDefined();
    expect(ui.children).toHaveLength(0);
  });

  it("should include properties in tree nodes", () => {
    const scene = parseTscn(PROPERTIES_SCENE);
    const tree = buildNodeTree(scene)!;
    expect(tree.properties["position"]).toBe("Vector2(100, 200)");
    expect(tree.properties["visible"]).toBe("true");
  });

  it("should build tree for full scene with deep nesting", () => {
    const scene = parseTscn(FULL_SCENE);
    const tree = buildNodeTree(scene)!;

    expect(tree.name).toBe("Player");
    expect(tree.children).toHaveLength(3); // Sprite2D, CollisionShape2D, Area2D

    const area = tree.children.find((c) => c.name === "Area2D")!;
    expect(area.children).toHaveLength(1); // BodyShape
    expect(area.children[0].name).toBe("BodyShape");
  });
});

describe("getNodePath", () => {
  it("should return name for root node", () => {
    const node = { name: "Root", type: "Node2D", properties: {} };
    expect(getNodePath(node, "Root")).toBe("Root");
  });

  it("should return name for direct child of root", () => {
    const node = {
      name: "Child",
      type: "Node2D",
      parent: ".",
      properties: {},
    };
    expect(getNodePath(node, "Root")).toBe("Child");
  });

  it("should return full path for deeper nodes", () => {
    const node = {
      name: "Sprite",
      type: "Sprite2D",
      parent: "Entities/Player",
      properties: {},
    };
    expect(getNodePath(node, "World")).toBe("Entities/Player/Sprite");
  });
});
