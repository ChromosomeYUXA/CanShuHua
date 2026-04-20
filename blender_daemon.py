#!/usr/bin/env python3
"""
Blender 守护进程脚本
作用：保持 Blender 在后台运行，接收参数更新并快速导出模型
这样可以避免每次都重启 Blender，大幅减少响应时间
"""

import bpy
import sys
import json
import os

# ==========================================
# 1. 初始化：加载 .blend 文件
# ==========================================
print("[DAEMON] Blender 守护进程启动中...", flush=True)

obj_name = "Sculpture"
modifier_name = "GeometryNodes"

# 检查物体是否存在
if obj_name not in bpy.data.objects:
    print(f"[ERROR] 场景中找不到名为 '{obj_name}' 的物体！", flush=True)
    sys.exit(1)

obj = bpy.data.objects[obj_name]
modifier = obj.modifiers.get(modifier_name)

if not modifier:
    print(f"[ERROR] 物体 '{obj_name}' 上找不到修改器 '{modifier_name}'！", flush=True)
    sys.exit(1)

print("[DAEMON] 物体和修改器加载成功", flush=True)

# ==========================================
# 2. 参数赋值函数
# ==========================================
def set_gn_value(modifier, param_display_name, value):
    """通过面板上显示的真实名字，自动寻找底层 ID 并赋值（Blender 4.x）"""
    if not modifier.node_group:
        print(f"[ERROR] 修改器没有 node_group", flush=True)
        return False
    
    # 遍历 4.x 全新的接口树
    for item in modifier.node_group.interface.items_tree:
        # 确认它是一个输入接口，并且名字对得上
        if getattr(item, "item_type", "") == 'SOCKET' and item.name == param_display_name:
            try:
                modifier[item.identifier] = value
                print(f"[GN] 参数已更新: {param_display_name} = {value}", flush=True)
                return True
            except Exception as e:
                print(f"[WARN] 设置参数 {param_display_name} 失败: {e}", flush=True)
                return False
    
    print(f"[WARN] 找不到参数: {param_display_name}", flush=True)
    return False

# ==========================================
# 3. 导出模型函数
# ==========================================
def export_model(output_path):
    """导出当前模型为 GLB 格式"""
    try:
        # 确保输出目录存在
        import os
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # 清理选择
        bpy.ops.object.select_all(action='DESELECT')
        # 选中 Sculpture 和 buildings
        obj.select_set(True)
        if 'buildings' in bpy.data.objects:
            buildings_obj = bpy.data.objects['buildings']
            buildings_obj.select_set(True)
            # 设置 Sculpture 为激活对象（active）
            bpy.context.view_layer.objects.active = obj
        else:
            print("[WARN] 未找到 buildings 对象，仅导出 Sculpture", flush=True)
            bpy.context.view_layer.objects.active = obj
        # 导出为 GLTF/GLB 格式
        bpy.ops.export_scene.gltf(
            filepath=output_path,
            use_selection=True,
            export_format='GLB',
            export_apply=True
        )
        return True
    except Exception as e:
        print(f"[ERROR] 导出失败: {e}", flush=True)
        import traceback
        traceback.print_exc()
        return False

# ==========================================
# 4. 守护进程主循环：处理参数请求
# ==========================================
print("[DAEMON] 进入守护进程模式，等待参数请求...", flush=True)
print("[READY]", flush=True)  # 信号：准备好了

while True:
    try:
        # 从标准输入读取 JSON 格式的参数
        input_line = sys.stdin.readline().strip()
        
        if not input_line:
            # 如果输入为空，说明管道关闭了
            print("[DAEMON] 输入管道关闭，守护进程退出", flush=True)
            break
        
        # 解析 JSON
        request = json.loads(input_line)
        
        count = request.get("count", 100)
        length = request.get("length", 15.0)
        thickness = request.get("thickness", 0.06)
        twist = request.get("twist", 90)
        output_path = request.get("output", "output_sculpture.glb")
        
        print(f"[DAEMON] 收到请求: count={count}, length={length}, thickness={thickness}, twist={twist}", flush=True)
        
        # 更新参数（使用 Blender 修改器面板上的真实参数名）
        set_gn_value(modifier, "Slice_Count", count)
        set_gn_value(modifier, "length", length)
        set_gn_value(modifier, "Thickness", thickness)
        set_gn_value(modifier, "Twist_Angle", twist)
        
        print("[DAEMON] 参数更新完成，刷新依赖图", flush=True)
        
        # 强制刷新依赖图（关键步骤）
        obj.update_tag()
        bpy.context.view_layer.update()
        
        print("[DAEMON] 准备导出模型", flush=True)
        
        # 确保输出目录存在
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # 导出模型
        if export_model(output_path):
            print(f"[SUCCESS] 模型已导出到: {output_path}", flush=True)
        else:
            print("[ERROR] 导出失败", flush=True)
        
    except json.JSONDecodeError as e:
        print(f"[ERROR] JSON 解析失败: {e}", flush=True)
    except Exception as e:
        print(f"[ERROR] 处理请求时出错: {e}", flush=True)
    
    # 刷新输出缓冲，确保 server.ts 能读到
    sys.stdout.flush()
    sys.stderr.flush()
