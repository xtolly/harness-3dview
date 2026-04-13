/**
 * main.js — 3D Harness Routing System 入口
 *
 * 功能集成：
 *   - WebGPU 自动检测 (URL ?webgpu=1 启用)
 *   - 干涉检查 + 去色/恢复
 *   - 性能测试 (1000 根线)
 *   - 控制点拖拽编辑
 */
import './styles/index.css';

import { SceneManager } from './core/SceneManager.js';
import { InteractionManager } from './core/InteractionManager.js';
import { HarnessManager } from './harness/HarnessManager.js';
import { CollisionDetector } from './harness/CollisionDetector.js';
import { ControlPointEditor } from './harness/ControlPointEditor.js';
import { ModelLoader } from './core/ModelLoader.js';
import { UIManager } from './ui/UIManager.js';
import { EXAMPLE_SET_1, getRandomExample } from './data/examples.js';

/* ============================================================
   Bootstrap (异步 — 支持 WebGPU 初始化)
   ============================================================ */
async function main() {
  const container = document.getElementById('canvas-container');

  // 异步创建场景管理器（自动检测 WebGPU → WebGL fallback）
  const sceneManager = await SceneManager.create(container);

  const interaction = new InteractionManager(sceneManager.camera, sceneManager.renderer);
  const harnessManager = new HarnessManager(sceneManager.scene);
  const collisionDetector = new CollisionDetector(sceneManager.scene);
  const modelLoader = new ModelLoader(sceneManager.scene);
  
  const controlPointEditor = new ControlPointEditor(
    sceneManager.scene,
    sceneManager.camera,
    sceneManager.renderer,
    interaction,
    harnessManager,
  );
  const ui = new UIManager(harnessManager, interaction, sceneManager);

  // 显示渲染器类型
  ui.updateRendererType(sceneManager.rendererType);

  /* ============================================================
     Load Default Examples
     ============================================================ */
  function loadExampleSet() {
    const globalParams = ui.getPathParams();

    EXAMPLE_SET_1.forEach((cfg) => {
      harnessManager.addHarness({
        name: cfg.name,
        points: cfg.points,
        pathOptions: {
          ...cfg.pathOptions,
          tension: globalParams.tension,
          curveType: globalParams.curveType,
        },
        crossSection: cfg.crossSection,
        material: cfg.material,
      });
    });

    refreshScene();
  }

  function refreshScene() {
    const allMeshes = [
      ...harnessManager.getSelectableObjects(),
      ...modelLoader.getMeshes()
    ];
    interaction.setSelectableObjects(allMeshes);
    ui.updateNavigatorTree(allMeshes);
    ui.updateStatus();
  }

  function getAllMeshes() {
    return [
      ...harnessManager.getSelectableObjects(),
      ...modelLoader.getMeshes()
    ];
  }

  function getCollidingIds() {
    const collidingIds = new Set();
    for (const result of collisionDetector.results) {
      collidingIds.add(result.idA);
      collidingIds.add(result.idB);
    }
    return collidingIds;
  }

  function syncCollisionVisibility() {
    const allMeshes = getAllMeshes();
    collisionDetector.restoreVisibility(allMeshes);

    if (!ui.isCollisionActive()) {
      return;
    }

    const { showNonCollidingEntities } = ui.getCollisionViewParams();
    const collidingIds = getCollidingIds();

    if (!showNonCollidingEntities) {
      collisionDetector.isolateCollidingMeshes(allMeshes, collidingIds);
    }

    interaction.clearMaterialCache();

    if (interaction.selectedObject && !interaction.selectedObject.visible) {
      interaction.selectedObject = null;
      interaction.dispatchEvent(new CustomEvent('deselect'));
    }
  }

  // 初始加载
  loadExampleSet();
  // 首次适配视图
  interaction.fitToObjects(harnessManager.getSelectableObjects());

  /* ============================================================
     Toolbar Callbacks
     ============================================================ */
  ui._onAddExample = () => {
    for (let i = 0; i < 1; ++i) {
      const globalParams = ui.getPathParams();
      const cfg = getRandomExample(globalParams);
      harnessManager.addHarness(cfg);
    }
    refreshScene();
  };

  ui._onClearScene = () => {
    controlPointEditor.hide();
    collisionDetector.clearVisuals();
    
    const allMeshes = [
      ...harnessManager.getSelectableObjects(),
      ...modelLoader.getMeshes()
    ];
    collisionDetector.restoreMeshes(allMeshes);
    collisionDetector.restoreVisibility(allMeshes);
    
    harnessManager.clearAll();
    modelLoader.clearAll();
    
    interaction.setSelectableObjects([]);
    ui.updateNavigatorTree([]);
    ui.updateStatus();
    ui.setCollisionButtonState(false, null);
  };
  
  ui._onDeleteEntity = (mesh, isModel) => {
    if (isModel) {
      modelLoader.removeModel(mesh);
    } else {
      harnessManager.removeHarness(mesh.userData.harnessId);
    }
    collisionDetector.clearVisuals();
    controlPointEditor.hide();
    interaction.selectedObject = null;
    interaction.clearMaterialCache();
    ui.hideProperties();
    ui.setCollisionButtonState(false, null);
    refreshScene();
  };

  ui._onSelectEntity = (mesh) => {
    // Navigator tree selection => Scene selection
    if (interaction.selectedObject && interaction.selectedObject !== mesh) {
      interaction._restoreMaterial(interaction.selectedObject);
    }
    interaction.selectedObject = mesh;
    interaction._applySelectMaterial(mesh);
    interaction.dispatchEvent(new CustomEvent('select', { detail: { object: mesh, harnessId: mesh.userData.harnessId } }));
  };

  ui._onImportModel = async (files) => {
    try {
      const mainFile = files.find(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return ['gltf', 'glb', 'obj', 'stl', 'step', 'stp'].includes(ext);
      });
      if (!mainFile) throw new Error('未找到主模型文件 (GLTF, OBJ, STL, STEP)');

      console.log(`正在导入模型: ${mainFile.name}...`);
      const model = await modelLoader.loadFromFiles(files);
      console.log(`模型导入成功:`, model);
      refreshScene();
      
      const allMeshes = [
        ...harnessManager.getSelectableObjects(),
        ...modelLoader.getMeshes()
      ];
      interaction.fitToObjects(allMeshes);
    } catch (err) {
      console.error('导入模型失败:', err);
      alert(`导入模型失败: ${err.message}`);
    }
  };

  /* ============================================================
     Collision Detection Callbacks
     ============================================================ */
  ui._onCheckCollision = () => {
    const allMeshes = getAllMeshes();
    
    if (allMeshes.length < 2) {
      console.log('至少需要 2 个对象才能进行干涉检查');
      ui.updateCollisionStatus(0);
      return 0;
    }

    console.time('干涉检查');
    const results = collisionDetector.checkAll(allMeshes);
    console.timeEnd('干涉检查');

    const collidingIds = getCollidingIds();

    // 去色：非干涉线束变灰，干涉线束变红
    collisionDetector.desaturateMeshes(allMeshes, collidingIds);
    syncCollisionVisibility();

    if (results.length > 0) {
      console.log(`发现 ${results.length} 对干涉:`);
      collisionDetector.getReport().forEach((r) => console.log(`  ▸ ${r}`));
    } else {
      console.log('✓ 未发现干涉');
    }

    return results.length;
  };

  ui._onClearCollision = () => {
    // 恢复原始颜色
    const allMeshes = [
      ...harnessManager.getSelectableObjects(),
      ...modelLoader.getMeshes()
    ];
    collisionDetector.restoreMeshes(allMeshes);
    collisionDetector.restoreVisibility(allMeshes);
    collisionDetector.clearVisuals();
    interaction.clearMaterialCache();
    ui.setCollisionButtonState(false, null);
  };

  ui._onCollisionViewChange = () => {
    syncCollisionVisibility();
  };

  /* ============================================================
     Performance Test Callback (1000 harnesses)
     ============================================================ */
  ui._onPerfTest = () => {
    // 先清空场景
    controlPointEditor.hide();
    collisionDetector.clearVisuals();
    const allMeshes = [
      ...harnessManager.getSelectableObjects(),
      ...modelLoader.getMeshes()
    ];
    collisionDetector.restoreMeshes(allMeshes);
    collisionDetector.restoreVisibility(allMeshes);
    ui.setCollisionButtonState(false, null);
    harnessManager.clearAll();

    const COUNT = 5000;
    const globalParams = ui.getPathParams();

    // 基础路径（S形曲线）
    const basePoints = [
      { x: -6, y: 0, z: 0 },
      { x: -3, y: 2, z: 1 },
      { x: 0, y: 0, z: -1 },
      { x: 3, y: 2, z: 1 },
      { x: 6, y: 0, z: 0 },
    ];

    console.log(`%c⚡ 性能测试：添加 ${COUNT} 根线束...`, 'color:#fbbf24;font-weight:bold;');

    const t0 = performance.now();

    // 生成 1000 根线束，水平间距错开
    const cols = 50;  // 50 列
    const rows = COUNT / cols; // 20 行
    const spacingX = 0.35;
    const spacingZ = 0.35;

    for (let i = 0; i < COUNT; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const offsetX = (col - cols / 2) * spacingX;
      const offsetZ = (row - rows / 2) * spacingZ;

      const points = basePoints.map((p) => ({
        x: p.x,
        y: p.y + offsetZ,
        z: p.z + offsetX,
      }));

      harnessManager.addHarness({
        name: `perf_${i}`,
        points,
        pathOptions: {
          tension: globalParams.tension,
          segments: 24, // 低细分提升性能
          curveType: globalParams.curveType,
        },
        crossSection: { type: 'circular', radius: 0.06, segments: 6 },
      });
    }

    const t1 = performance.now();
    const geometryTime = (t1 - t0).toFixed(1);

    // 强制一次渲染以测量渲染时间
    sceneManager.renderer.render(sceneManager.scene, sceneManager.camera);
    const t2 = performance.now();
    const renderTime = (t2 - t1).toFixed(1);
    const totalTime = (t2 - t0).toFixed(1);

    refreshScene();
    interaction.fitToObjects(harnessManager.getSelectableObjects());

    console.log(
      `%c⚡ 性能测试完成\n` +
      `  线束数量: ${COUNT}\n` +
      `  几何体构建: ${geometryTime}ms\n` +
      `  首次渲染: ${renderTime}ms\n` +
      `  总耗时: ${totalTime}ms`,
      'color:#34d399;font-weight:bold;',
    );

    // 在状态栏也显示
    alert(
      `⚡ 性能测试完成\n\n` +
      `线束数量: ${COUNT}\n` +
      `几何体构建: ${geometryTime} ms\n` +
      `首次渲染: ${renderTime} ms\n` +
      `总耗时: ${totalTime} ms`,
    );
  };

  /* ============================================================
     Selection → Control Point Editor & Navigator
     ============================================================ */
  interaction.addEventListener('select', (e) => {
    const { harnessId, object } = e.detail;
    // 树状图同步
    ui.syncNavigatorSelection(harnessId);
    // 判断如果是线束则显示控制点并加载右侧属性面板，否则（外部模型）只显示选中状态
    if (!object.userData.isImportedModel) {
       controlPointEditor.show(harnessId);
       ui.showProperties(harnessId);
    } else {
       controlPointEditor.hide();
       ui.hideProperties();
    }
  });

  interaction.addEventListener('deselect', () => {
    controlPointEditor.hide();
    ui.hideProperties();
    ui.syncNavigatorSelection(null);
  });

  /* ============================================================
     Render Loop
     ============================================================ */
  sceneManager.onUpdate((delta, elapsed) => {
    interaction.update();
    ui.updateFPS();
  });

  sceneManager.start();

  /* ============================================================
     Dev Info
     ============================================================ */
  console.log(
    '%c🔌 HARNESS3D %c 3D Harness Routing System v0.1.0',
    'background:#38bdf8;color:#0a0e17;padding:2px 8px;border-radius:3px;font-weight:bold;',
    'color:#94a3b8;',
  );
  console.log(
    `%c渲染器: ${sceneManager.rendererType.toUpperCase()}`,
    `color:${sceneManager.rendererType === 'webgpu' ? '#34d399' : '#fbbf24'};font-weight:bold;`,
  );
}

// 启动
main().catch((err) => {
  console.error('应用启动失败:', err);
});
