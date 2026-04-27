#!/usr/bin/env python3
import bpy
import json
import os
import sys
import traceback

print("[DAEMON] Blender daemon starting...", flush=True)

OBJ_NAME = "Sculpture"
MODIFIER_NAME = "GeometryNodes"
PROFILE_OBJECT_NAME = "ProfileScales"
PROFILE_ATTRIBUTE_NAME = "profile_scale"

if OBJ_NAME not in bpy.data.objects:
    print(f"[ERROR] Object '{OBJ_NAME}' not found", flush=True)
    sys.exit(1)

obj = bpy.data.objects[OBJ_NAME]
modifier = obj.modifiers.get(MODIFIER_NAME)

if not modifier:
    print(f"[ERROR] Modifier '{MODIFIER_NAME}' not found on '{OBJ_NAME}'", flush=True)
    sys.exit(1)

print("[DAEMON] Object and modifier loaded", flush=True)


def set_gn_value(target_modifier, param_display_name, value):
    if not target_modifier.node_group:
        print("[ERROR] Modifier has no node_group", flush=True)
        return False

    expected_name = param_display_name.strip().lower()
    for item in target_modifier.node_group.interface.items_tree:
        item_name = getattr(item, "name", "")
        if getattr(item, "item_type", "") == "SOCKET" and item_name.strip().lower() == expected_name:
            try:
                target_modifier[item.identifier] = value
                print(f"[GN] {item_name} = {value}", flush=True)
                return True
            except Exception as exc:
                print(f"[WARN] Failed to set {item_name}: {exc}", flush=True)
                return False

    print(f"[WARN] Parameter not found: {param_display_name}", flush=True)
    available = [
        getattr(item, "name", "")
        for item in target_modifier.node_group.interface.items_tree
        if getattr(item, "item_type", "") == "SOCKET"
    ]
    print(f"[WARN] Available GN parameters: {available}", flush=True)
    return False


def vector_input_matches(value, expected, tolerance=0.0001):
    try:
        return all(abs(float(value[index]) - expected[index]) <= tolerance for index in range(3))
    except Exception:
        return False


def find_mirror_transform_node(target_modifier):
    if not target_modifier.node_group:
        return None

    transform_nodes = [
        node
        for node in target_modifier.node_group.nodes
        if getattr(node, "bl_idname", "") == "GeometryNodeTransform"
    ]

    for node in transform_nodes:
        label = f"{getattr(node, 'name', '')} {getattr(node, 'label', '')}".lower()
        if "mirror" in label or "symmetry" in label or "x_axis" in label:
            return node

    for node in transform_nodes:
        scale_input = node.inputs.get("Scale")
        if scale_input and vector_input_matches(scale_input.default_value, (-1.0, 1.0, 1.0)):
            return node

    return None


def set_mirror_x_enabled(enabled):
    mirror_value = -1.0 if enabled else 1.0
    success = set_gn_value(modifier, "Mirror", mirror_value)
    print(f"[MIRROR] mirror_x={enabled}, Mirror={mirror_value}, success={success}", flush=True)
    return success


def sanitize_profile_scales(raw_scales, count):
    try:
        count = max(1, int(count))
    except Exception:
        count = 1

    if not isinstance(raw_scales, list):
        return [1.0] * count

    scales = []
    for value in raw_scales[:count]:
        try:
            scale = float(value)
            if scale != scale:
                scale = 1.0
        except Exception:
            scale = 1.0
        scales.append(max(0.05, min(10.0, scale)))

    while len(scales) < count:
        scales.append(1.0)

    return scales


def update_profile_carrier(profile_scales):
    """Write profile scales to a mesh object GN can read via Object Info + attributes."""
    mesh = bpy.data.meshes.get(PROFILE_OBJECT_NAME)
    if mesh is None:
        mesh = bpy.data.meshes.new(PROFILE_OBJECT_NAME)

    carrier = bpy.data.objects.get(PROFILE_OBJECT_NAME)
    if carrier is None:
        carrier = bpy.data.objects.new(PROFILE_OBJECT_NAME, mesh)
        bpy.context.collection.objects.link(carrier)
    elif carrier.data != mesh:
        carrier.data = mesh

    count = max(1, len(profile_scales))
    vertices = []
    edges = []
    for index, scale in enumerate(profile_scales):
        t = 0 if count == 1 else index / (count - 1)
        vertices.append((t, float(scale), 0.0))
        if index > 0:
            edges.append((index - 1, index))

    mesh.clear_geometry()
    mesh.from_pydata(vertices, edges, [])
    mesh.update()

    attribute = mesh.attributes.get(PROFILE_ATTRIBUTE_NAME)
    if attribute is None or attribute.domain != "POINT" or attribute.data_type != "FLOAT":
        if attribute is not None:
            mesh.attributes.remove(attribute)
        attribute = mesh.attributes.new(PROFILE_ATTRIBUTE_NAME, "FLOAT", "POINT")

    for index, scale in enumerate(profile_scales):
        attribute.data[index].value = float(scale)

    carrier.hide_select = True
    carrier.display_type = "WIRE"
    carrier["profile_scales_json"] = json.dumps(profile_scales)
    carrier["profile_count"] = count
    obj["profile_count"] = count
    obj["profile_scales_json"] = json.dumps(profile_scales)

    print(f"[PROFILE] Updated {PROFILE_OBJECT_NAME} with {count} values", flush=True)
    return carrier


def export_model(output_path):
    try:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        if "buildings" in bpy.data.objects:
            bpy.data.objects["buildings"].select_set(True)
        else:
            print("[WARN] Object 'buildings' not found; exporting sculpture only", flush=True)

        bpy.ops.export_scene.gltf(
            filepath=output_path,
            use_selection=True,
            export_format="GLB",
            export_apply=True,
        )
        return True
    except Exception as exc:
        print(f"[ERROR] Export failed: {exc}", flush=True)
        traceback.print_exc()
        return False


print("[DAEMON] Ready for parameter requests", flush=True)
print("[READY]", flush=True)

while True:
    try:
        input_line = sys.stdin.readline().strip()

        if not input_line:
            print("[DAEMON] stdin closed; exiting", flush=True)
            break

        request = json.loads(input_line)

        count = request.get("count", 100)
        length = request.get("length", 15.0)
        wave = request.get("wave", 1.0)
        thickness = request.get("thickness", 0.06)
        twist = request.get("twist", 90)
        incline = request.get("incline", 0.0)
        raw_mirror_x = request.get("mirror_x", True)
        if isinstance(raw_mirror_x, str):
            mirror_x = raw_mirror_x.strip().lower() not in ("false", "0", "off", "no")
        else:
            mirror_x = bool(raw_mirror_x)
        output_path = request.get("output", "output_sculpture.glb")
        profile_scales = sanitize_profile_scales(request.get("profile_scales"), count)

        print(
            f"[DAEMON] Request: count={count}, length={length}, wave={wave}, "
            f"thickness={thickness}, twist={twist}, incline={incline}, mirror_x={mirror_x}, "
            f"profile_scales={len(profile_scales)}",
            flush=True,
        )

        set_gn_value(modifier, "Slice_Count", count)
        set_gn_value(modifier, "Length", length)
        set_gn_value(modifier, "Wave", wave)
        set_gn_value(modifier, "Thickness", thickness)
        set_gn_value(modifier, "Twist_Angle", twist)
        set_gn_value(modifier, "Incline", incline)
        set_mirror_x_enabled(mirror_x)
        update_profile_carrier(profile_scales)

        obj.update_tag()
        bpy.context.view_layer.update()

        print("[DAEMON] Exporting model", flush=True)
        if export_model(output_path):
            print(f"[SUCCESS] Model exported to: {output_path}", flush=True)
        else:
            print("[ERROR] Export failed", flush=True)

    except json.JSONDecodeError as exc:
        print(f"[ERROR] JSON parse failed: {exc}", flush=True)
    except Exception as exc:
        print(f"[ERROR] Request failed: {exc}", flush=True)
        traceback.print_exc()

    sys.stdout.flush()
    sys.stderr.flush()
