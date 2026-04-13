# Harness 3D

一个基于 Three.js 和 Vite 的高性能 3D 线束布线与可视化系统。

## 🌟 主要特性

- **高性能 3D 渲染**：基于 Three.js 开发，支持复杂的线束路径渲染。
- **碰撞检测**：集成 `three-mesh-bvh` 实现精确的碰撞检测，确保线束路径避开障碍物。
- **CAD 模型支持**：支持导入 GLTF, OBJ, STL, STEP 等多种 3D 格式。
- **交互式编辑**：支持实时的控制点编辑和路径调整。
- **轻量化骨架**：优化的 PathBuilder 和 HarnessRenderer，确保流畅的用户体验。

## 🛠️ 技术栈

- **核心**: [Three.js](https://threejs.org/)
- **开发工具**: [Vite](https://vitejs.dev/)
- **UI 管理**: [lil-gui](https://github.com/georgealways/lil-gui)
- **几何加速**: [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)
- **CAD 导入**: `occt-import-js`

## 📁 项目结构

```text
harness/
├── src/
│   ├── core/           # 核心系统（场景管理、模型加载、交互逻辑）
│   ├── harness/        # 线束业务逻辑（路径构建、冲突检测、渲染器）
│   ├── ui/             # 用户界面组件
│   ├── data/           # 示例数据与配置
│   ├── styles/         # CSS 样式
│   └── main.js         # 应用入口
├── public/             # 静态资源（模型、纹理等）
├── index.html          # 主页面
├── package.json        # 项目配置与依赖
└── vite.config.js      # Vite 配置文件
```

## 🚀 快速开始

### 安装依赖

确保你已经安装了 [Node.js](https://nodejs.org/)。然后在项目根目录下运行：

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

## 📖 使用指南

1. **导入模型**：在界面中加载设备或支架的 3D 模型。
2. **连接路径**：定义线束的起点和终点，系统会自动生成初步路径。
3. **调整控制点**：拖动 3D 空间中的控制点以优化布线路径。
4. **碰撞验证**：运行碰撞检测以确保线束不穿过任何实体模型。

## 📄 许可

MIT License
