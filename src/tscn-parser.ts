// ---- Types ----

export interface TscnScene {
  format: number;
  loadSteps: number;
  uid?: string;
  extResources: ExtResource[];
  subResources: SubResource[];
  nodes: TscnNode[];
  connections: Connection[];
}

export interface ExtResource {
  id: string;
  type: string;
  path: string;
  uid?: string;
}

export interface SubResource {
  id: string;
  type: string;
  properties: Record<string, string>;
}

export interface TscnNode {
  name: string;
  type?: string;
  parent?: string; // undefined for root node
  instance?: string;
  properties: Record<string, string>;
}

export interface Connection {
  signal: string;
  from: string;
  to: string;
  method: string;
  flags?: number;
}

// ---- Helpers ----

/**
 * Parse attributes from a section header line like:
 *   [node name="Player" type="CharacterBody2D" parent="."]
 * Returns a map of key -> value (unquoted).
 */
function parseSectionAttributes(header: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Match key="value" or key=value (for numeric values)
  const attrRegex = /(\w+)="([^"]*?)"|(\w+)=(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(header)) !== null) {
    if (match[1] !== undefined) {
      attrs[match[1]] = match[2];
    } else if (match[3] !== undefined) {
      attrs[match[3]] = match[4];
    }
  }
  return attrs;
}

/**
 * Extract the section type from a header line.
 * e.g. "[gd_scene ...]" -> "gd_scene", "[node ...]" -> "node"
 */
function parseSectionType(line: string): string | null {
  const m = line.match(/^\[(\w+)/);
  return m ? m[1] : null;
}

/**
 * Compute the full node path for a TscnNode.
 * Root node (no parent) returns its name.
 * Children with parent="." return their name.
 * Deeper children return "parent/name".
 */
export function getNodePath(node: TscnNode, rootName: string): string {
  if (node.parent === undefined) {
    return node.name; // root node
  }
  if (node.parent === ".") {
    return node.name;
  }
  return `${node.parent}/${node.name}`;
}

// ---- Core functions ----

/**
 * Parse .tscn content string into TscnScene.
 */
export function parseTscn(content: string): TscnScene {
  const scene: TscnScene = {
    format: 3,
    loadSteps: 1,
    extResources: [],
    subResources: [],
    nodes: [],
    connections: [],
  };

  const lines = content.split("\n");
  let currentSection: string | null = null;
  let currentAttrs: Record<string, string> = {};
  // Accumulate properties for sub_resource / node sections
  let currentProperties: Record<string, string> = {};

  function flushSection(): void {
    if (currentSection === "sub_resource") {
      scene.subResources.push({
        id: currentAttrs["id"] ?? "",
        type: currentAttrs["type"] ?? "",
        properties: { ...currentProperties },
      });
    } else if (currentSection === "node") {
      const node: TscnNode = {
        name: currentAttrs["name"] ?? "",
        properties: { ...currentProperties },
      };
      if (currentAttrs["type"] !== undefined) {
        node.type = currentAttrs["type"];
      }
      if (currentAttrs["parent"] !== undefined) {
        node.parent = currentAttrs["parent"];
      }
      if (currentAttrs["instance"] !== undefined) {
        node.instance = currentAttrs["instance"];
      }
      scene.nodes.push(node);
    }
    // ext_resource and connection are handled inline (no trailing properties expected normally)
    currentProperties = {};
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Skip empty lines
    if (line.trim() === "") {
      continue;
    }

    // Section header
    if (line.startsWith("[")) {
      // Flush previous section if it had properties
      flushSection();

      const sectionType = parseSectionType(line);
      const attrs = parseSectionAttributes(line);

      if (sectionType === "gd_scene") {
        scene.format = attrs["format"] ? parseInt(attrs["format"], 10) : 3;
        scene.loadSteps = attrs["load_steps"]
          ? parseInt(attrs["load_steps"], 10)
          : 1;
        if (attrs["uid"]) {
          scene.uid = attrs["uid"];
        }
        currentSection = "gd_scene";
        currentAttrs = {};
      } else if (sectionType === "ext_resource") {
        const ext: ExtResource = {
          id: attrs["id"] ?? "",
          type: attrs["type"] ?? "",
          path: attrs["path"] ?? "",
        };
        if (attrs["uid"]) {
          ext.uid = attrs["uid"];
        }
        scene.extResources.push(ext);
        currentSection = "ext_resource";
        currentAttrs = {};
      } else if (sectionType === "sub_resource") {
        currentSection = "sub_resource";
        currentAttrs = attrs;
      } else if (sectionType === "node") {
        currentSection = "node";
        currentAttrs = attrs;
      } else if (sectionType === "connection") {
        const conn: Connection = {
          signal: attrs["signal"] ?? "",
          from: attrs["from"] ?? "",
          to: attrs["to"] ?? "",
          method: attrs["method"] ?? "",
        };
        if (attrs["flags"] !== undefined) {
          conn.flags = parseInt(attrs["flags"], 10);
        }
        scene.connections.push(conn);
        currentSection = "connection";
        currentAttrs = {};
      } else {
        currentSection = sectionType;
        currentAttrs = attrs;
      }

      continue;
    }

    // Property line: key = value
    const propMatch = line.match(/^(\w+)\s*=\s*(.*)/);
    if (propMatch) {
      currentProperties[propMatch[1]] = propMatch[2];
    }
  }

  // Flush the last section
  flushSection();

  return scene;
}

/**
 * Serialize TscnScene back to .tscn format string.
 * Recalculates load_steps automatically.
 */
export function serializeTscn(scene: TscnScene): string {
  const parts: string[] = [];

  // Recalculate load_steps
  const resourceCount = scene.extResources.length + scene.subResources.length;
  const loadSteps = resourceCount > 0 ? resourceCount + 1 : 0;

  // gd_scene header
  let header = `[gd_scene`;
  if (loadSteps > 0) {
    header += ` load_steps=${loadSteps}`;
  }
  header += ` format=${scene.format}`;
  if (scene.uid) {
    header += ` uid="${scene.uid}"`;
  }
  header += `]`;
  parts.push(header);

  // ext_resources
  for (const ext of scene.extResources) {
    let line = `[ext_resource type="${ext.type}" path="${ext.path}"`;
    if (ext.uid) {
      line += ` uid="${ext.uid}"`;
    }
    line += ` id="${ext.id}"]`;
    parts.push("");
    parts.push(line);
  }

  // sub_resources
  for (const sub of scene.subResources) {
    parts.push("");
    parts.push(`[sub_resource type="${sub.type}" id="${sub.id}"]`);
    for (const [key, value] of Object.entries(sub.properties)) {
      parts.push(`${key} = ${value}`);
    }
  }

  // nodes
  for (const node of scene.nodes) {
    let line = `[node name="${node.name}"`;
    if (node.type) {
      line += ` type="${node.type}"`;
    }
    if (node.parent !== undefined) {
      line += ` parent="${node.parent}"`;
    }
    if (node.instance) {
      line += ` instance=${node.instance}`;
    }
    line += `]`;
    parts.push("");
    parts.push(line);
    for (const [key, value] of Object.entries(node.properties)) {
      parts.push(`${key} = ${value}`);
    }
  }

  // connections
  for (const conn of scene.connections) {
    let line = `[connection signal="${conn.signal}" from="${conn.from}" to="${conn.to}" method="${conn.method}"`;
    if (conn.flags !== undefined) {
      line += ` flags=${conn.flags}`;
    }
    line += `]`;
    parts.push("");
    parts.push(line);
  }

  return parts.join("\n") + "\n";
}

/**
 * Represents a node in the tree output from buildNodeTree.
 */
export interface NodeTreeEntry {
  name: string;
  type?: string;
  properties: Record<string, string>;
  children: NodeTreeEntry[];
}

/**
 * Build a JSON tree structure from flat node list.
 * Returns the root node with nested children arrays.
 */
export function buildNodeTree(scene: TscnScene): NodeTreeEntry | null {
  if (scene.nodes.length === 0) {
    return null;
  }

  const rootNode = scene.nodes.find((n) => n.parent === undefined);
  if (!rootNode) {
    return null;
  }

  const rootName = rootNode.name;

  function buildEntry(node: TscnNode): NodeTreeEntry {
    const nodePath = getNodePath(node, rootName);

    // Find direct children: nodes whose parent matches this node's path
    const children = scene.nodes.filter((n) => {
      if (n.parent === undefined) return false;
      // Direct children of root have parent="."
      if (node.parent === undefined) {
        return n.parent === ".";
      }
      return n.parent === nodePath;
    });

    return {
      name: node.name,
      type: node.type,
      properties: { ...node.properties },
      children: children.map((c) => buildEntry(c)),
    };
  }

  return buildEntry(rootNode);
}

/**
 * Resolve the parent attribute value for adding a node at a given parent path.
 * - If parentPath is the root node name (or empty), return "."
 * - Otherwise return the path relative to root.
 */
function resolveParentAttr(
  scene: TscnScene,
  parentPath: string,
): string {
  if (scene.nodes.length === 0) {
    throw new Error("Scene has no nodes");
  }
  const rootNode = scene.nodes.find((n) => n.parent === undefined);
  if (!rootNode) {
    throw new Error("Scene has no root node");
  }

  // If parentPath is the root node's name or ".", it's a direct child of root
  if (parentPath === rootNode.name || parentPath === "." || parentPath === "") {
    return ".";
  }

  // Verify the parent node exists
  const rootName = rootNode.name;
  const found = scene.nodes.some((n) => {
    return getNodePath(n, rootName) === parentPath;
  });
  if (!found) {
    throw new Error(`Parent node not found: ${parentPath}`);
  }

  return parentPath;
}

/**
 * Add a node to the scene.
 */
export function addNodeToScene(
  scene: TscnScene,
  parentPath: string,
  nodeName: string,
  nodeType: string,
  properties?: Record<string, string>,
): void {
  const parentAttr = resolveParentAttr(scene, parentPath);

  const node: TscnNode = {
    name: nodeName,
    type: nodeType,
    parent: parentAttr,
    properties: properties ? { ...properties } : {},
  };

  scene.nodes.push(node);
}

/**
 * Remove a node (and its children) from the scene.
 * Also removes connections referencing removed nodes.
 */
export function removeNodeFromScene(
  scene: TscnScene,
  nodePath: string,
): void {
  const rootNode = scene.nodes.find((n) => n.parent === undefined);
  if (!rootNode) {
    throw new Error("Scene has no root node");
  }

  if (nodePath === rootNode.name) {
    throw new Error("Cannot remove the root node");
  }

  const rootName = rootNode.name;

  // Collect all paths to remove (the target node + all descendants)
  const pathsToRemove = new Set<string>();
  pathsToRemove.add(nodePath);

  // Iteratively find descendants
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of scene.nodes) {
      const np = getNodePath(node, rootName);
      if (pathsToRemove.has(np)) continue;
      if (node.parent === undefined) continue;

      // Check if this node's parent path is in the removal set
      let parentFullPath: string;
      if (node.parent === ".") {
        parentFullPath = node.name; // direct child of root - but we need the path
        // Actually for direct children, their path IS their name, and their parent is root
        // We need to check if root is being removed (handled above) or if the parent path matches
        // For parent=".", the parent is root. So parentFullPath = rootName... no.
        // Let me reconsider: getNodePath returns just the name for parent=".".
        // The parent of such a node is the root. So the "parent path" is rootName.
        parentFullPath = rootName;
      } else {
        parentFullPath = node.parent;
      }

      // Check if the node's parent is in the removal set or the node's parent starts with a removed path
      if (pathsToRemove.has(parentFullPath)) {
        pathsToRemove.add(np);
        changed = true;
      }
    }
  }

  // Filter out removed nodes
  scene.nodes = scene.nodes.filter((n) => {
    const np = getNodePath(n, rootName);
    return !pathsToRemove.has(np);
  });

  // Filter out connections referencing removed nodes
  scene.connections = scene.connections.filter((conn) => {
    return !pathsToRemove.has(conn.from) && !pathsToRemove.has(conn.to);
  });
}

/**
 * Update node properties (merge).
 */
export function updateNodeProperties(
  scene: TscnScene,
  nodePath: string,
  properties: Record<string, string>,
): void {
  const rootNode = scene.nodes.find((n) => n.parent === undefined);
  if (!rootNode) {
    throw new Error("Scene has no root node");
  }
  const rootName = rootNode.name;

  const node = scene.nodes.find(
    (n) => getNodePath(n, rootName) === nodePath,
  );
  if (!node) {
    // Also check if nodePath matches root name
    const target = scene.nodes.find(
      (n) => n.parent === undefined && n.name === nodePath,
    );
    if (!target) {
      throw new Error(`Node not found: ${nodePath}`);
    }
    Object.assign(target.properties, properties);
    return;
  }

  Object.assign(node.properties, properties);
}

/**
 * Generate a unique ext_resource id for a script.
 */
function generateScriptResourceId(scene: TscnScene): string {
  const existingIds = new Set(scene.extResources.map((e) => e.id));
  let counter = 1;
  while (existingIds.has(`script_${counter}`)) {
    counter++;
  }
  return `script_${counter}`;
}

/**
 * Attach a script to a node (adds ext_resource if needed).
 */
export function attachScriptToNode(
  scene: TscnScene,
  nodePath: string,
  scriptPath: string,
): void {
  // Check if the script is already in ext_resources
  let ext = scene.extResources.find(
    (e) => e.type === "Script" && e.path === scriptPath,
  );

  if (!ext) {
    const id = generateScriptResourceId(scene);
    ext = {
      id,
      type: "Script",
      path: scriptPath,
    };
    scene.extResources.push(ext);
  }

  // Find the node and set script property
  const rootNode = scene.nodes.find((n) => n.parent === undefined);
  if (!rootNode) {
    throw new Error("Scene has no root node");
  }
  const rootName = rootNode.name;

  const node = scene.nodes.find((n) => {
    if (n.parent === undefined && n.name === nodePath) return true;
    return getNodePath(n, rootName) === nodePath;
  });

  if (!node) {
    throw new Error(`Node not found: ${nodePath}`);
  }

  node.properties["script"] = `ExtResource("${ext.id}")`;
}
