import bpy
import sys
import argparse
import os

# ==========================================
# 1. 解析命令行传进来的参数
# ==========================================
# Blender 运行脚本时，'--' 之后的内容才是传给脚本的参数
argv = sys.argv
if "--" not in argv:
    argv = []  # 如果没有传参数，就用空列表
else:
    argv = argv[argv.index("--") + 1:]  # 截取 '--' 之后的部分

# 设置我们想要接收的参数，并设定默认值
parser = argparse.ArgumentParser()
# [PY: ARG_PARSE] 如果增加了新参数，请在这里添加对应的 add_argument
parser.add_argument("--count", type=int, default=100, help="雕塑的切片数量")
parser.add_argument("--length", type=float, default=15.0, help="雕塑的长度")
parser.add_argument("--thickness", type=float, default=0.06, help="切片的厚度")
parser.add_argument("--twist", type=int, default=90, help="雕塑的总扭曲角度")
parser.add_argument("--output", type=str, default="output_sculpture.glb", help="输出路径")

args = parser.parse_args(argv)

# ==========================================
# 2. 定位物体与修改参数
# ==========================================
# ⚠️ 注意：请确保你的物体在 Blender 右上角大纲视图里的名字叫 "Sculpture"
obj_name = "Sculpture" 

if obj_name not in bpy.data.objects:
    print(f"❌ 错误: 场景中找不到名为 '{obj_name}' 的物体！")
    # 为了防止脚本在没有该物体的场景中直接退出导致后端报错，我们可以尝试打印所有物体
    print(f"当前场景中的物体: {[o.name for o in bpy.data.objects]}")
    sys.exit(1)

obj = bpy.data.objects[obj_name]

# 获取几何节点修改器（默认名字通常是 "GeometryNodes"）
modifier = obj.modifiers.get("GeometryNodes") 

# ==========================================
# 核心修正：Blender 4.x 专用的智能参数赋值函数
# ==========================================
def set_gn_value(modifier, param_display_name, value):
    """通过面板上显示的真实名字，自动寻找底层 ID 并赋值"""
    if not modifier.node_group:
        return False
    
    # 遍历 4.x 全新的接口树
    for item in modifier.node_group.interface.items_tree:
        # 确认它是一个输入接口，并且名字对得上
        if getattr(item, "item_type", "") == 'SOCKET' and item.name == param_display_name:
            modifier[item.identifier] = value
            print(f"✅ 成功: '{param_display_name}' (底层ID: {item.identifier}) 已更新为 {value}")
            return True
            
    print(f"❌ 警告: 在修改器面板上找不到名为 '{param_display_name}' 的参数！")
    return False

if modifier:
    print(f"✅ 找到修改器，准备写入参数...")
    # [PY: GN_UPDATE] 如果增加了新参数，请在这里调用 set_gn_value
    # 注意：第二个参数必须与 Blender 几何节点面板上的显示名称完全一致
    set_gn_value(modifier, "Slice_Count", args.count)
    set_gn_value(modifier, "Twist_Angle", args.twist)
    set_gn_value(modifier, "length", args.length)
    set_gn_value(modifier, "Thickness", args.thickness)
else:
    print("❌ 错误: 找不到 GeometryNodes 修改器！")
    sys.exit(1)

# ==========================================
# 🌟 极其关键：强制 Blender 刷新依赖图（双重保险）
# ==========================================
# 1. 强制给物体打上“数据已修改”的标签，逼迫底层引擎重新计算
obj.update_tag()

# 2. 刷新整个视图层的依赖图
bpy.context.view_layer.update()

# ==========================================
# 3. 导出为 GLB (供 Three.js 使用)
# ==========================================
export_path = args.output
if not os.path.isabs(export_path):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    export_path = os.path.join(current_dir, export_path)

os.makedirs(os.path.dirname(export_path), exist_ok=True)

# 清理选择
bpy.ops.object.select_all(action='DESELECT')
# 选中模型
obj.select_set(True)

# 3. 【新增关键步骤】让系统明确知道这是“当前正在操作的激活物体”，导出插件极其依赖此项！
bpy.context.view_layer.objects.active = obj 

# 执行导出命令
bpy.ops.export_scene.gltf(
    filepath=export_path,
    use_selection=True,  
    export_format='GLB', 
    export_apply=True    
)

print(f"🎉 导出成功！模型已保存至: {export_path}")
