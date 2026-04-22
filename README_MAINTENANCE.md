# 🎨 AI 雕塑生成系统：扩展与维护指南（守护进程版）

本指南对应当前代码实现，核心是 Blender 守护进程常驻运行，前端参数实时变更后自动触发生成。

## 快速启动
1. 将 Blender 源文件放在项目根目录，文件名建议保持为 param.blend。
2. 在 server.ts 中修改 Blender 路径：
  const blenderPath = "E:\\Program\\Steam\\steamapps\\common\\Blender\\blender.exe";
3. 安装依赖并启动：
  npm install
  npm run dev

## 当前系统架构
- param.blend：Blender 源文件。
- blender_daemon.py：守护进程脚本，接收参数并导出 GLB（当前主流程使用）。
- server.ts：Express 服务，维护守护进程生命周期并提供 API。
- src/types.ts：前后端参数类型。
- src/App.tsx：参数状态、自动请求、防抖与耗时展示。
- src/components/Sidebar.tsx：AI 对话与参数滑块。
- export_sculpture.py：历史脚本，保留作离线/回退参考，当前服务端不直接调用。

## 运行流程（当前）
1. server.ts 启动时创建 Blender 守护进程。
2. 守护进程就绪后输出 [READY]。
3. 前端参数变化（滑块拖动或 AI 改参）触发 /api/generate。
4. server.ts 将参数写入守护进程 stdin（JSON）。
5. blender_daemon.py 更新 Geometry Nodes 参数并导出 public/models/output.glb。
6. server.ts 返回 modelUrl 与 duration，前端刷新模型并显示耗时。

## 场景一：更换 .blend 文件
1. 将新 .blend 文件放入项目根目录。
2. 修改 server.ts 中的 blendFilePath：
  const blendFilePath = path.join(process.cwd(), "param.blend");
3. 确保模型结构满足：
  - 对象名是 Sculpture
  - 修改器名是 GeometryNodes
4. 重启 npm run dev。

## 场景二：增加或修改参数（推荐按顺序）
假设新增参数 offset。

1. 修改 src/types.ts
  - 在 SculptureParams 中新增字段：offset: number

2. 修改 src/App.tsx
  - 在初始参数 state 中新增 offset 默认值。

3. 修改 src/components/Sidebar.tsx
  - 在参数区新增对应滑块 ControlItem。

4. 修改 server.ts
  - 在 /api/generate 中解构新参数。
  - 在 sendToBlenderDaemon 的 request JSON 中加入 offset。

5. 修改 blender_daemon.py
  - 从 request 中读取 offset。
  - 调用 set_gn_value(modifier, "你的Blender面板参数名", offset)。

6. 如需 AI 文本输入支持该参数，修改 src/services/aiService.ts
  - 更新 SYSTEM_PROMPT 参数列表与返回 JSON 示例。
  - 更新默认值返回对象。

## Blender 参数命名注意事项（非常重要）
blender_daemon.py 中 set_gn_value 的第二个参数，必须和 Blender Geometry Nodes 面板上的输入名称一致。

当前项目示例：
- Slice_Count
- length
- Thickness
- Twist_Angle

名称不一致会出现找不到参数或参数更新无效。

## 性能与状态检查
1. 查看守护进程状态：
  GET /api/daemon-status

2. 查看后端日志：
  - [INIT] 初始化 Blender 守护进程...
  - [READY]
  - [PERF] 生成完成 - 总耗时: xxxms

3. 前端右下角会显示最近一次生成耗时（duration）。

## 当前交互策略
- 滑块拖动过程中实时刷新。
- 自动生成防抖：80ms（在 src/App.tsx）。
- Blender 守护进程避免重复冷启动，后续请求通常稳定在子秒级。

## 常见问题
1. 守护进程无法启动
  - 检查 server.ts 的 blenderPath 是否正确。
  - 手动确认 Blender 可执行文件存在。

2. 参数更新但模型不变
  - 检查 blender_daemon.py 中参数名是否与 Blender 面板一致。
  - 检查是否打印 [GN] 参数已更新。

3. 耗时显示为 undefined
  - 已在前端做本地耗时兜底；若出现请刷新页面并看控制台 [DEBUG] 日志。

4. 改了 server.ts 或 blender_daemon.py 后不生效
  - 必须重启 npm run dev。

## 维护建议
1. 先改类型与前端，再改 server.ts 和 blender_daemon.py，最后联调。
2. 每次改参数名后，先在 Blender 面板人工核对一遍名称。
3. 大改模型结构时，优先保留 Sculpture 与 GeometryNodes 命名约定，减少联动改动。
