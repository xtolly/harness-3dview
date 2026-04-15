/**
 * UIManager — UI 界面管理
 *
 * - lil-gui 参数面板（全局平滑度/截面/材质控制）
 * - 右侧属性面板（选中线束的详情）
 * - 底部状态栏
 * - 工具栏按钮事件
 */
import GUI from 'lil-gui';
import { CrossSection } from '../harness/CrossSection.js';

export class UIManager {
  /**
   * @param {import('../harness/HarnessManager.js').HarnessManager} harnessManager
   * @param {import('../core/InteractionManager.js').InteractionManager} interaction
   * @param {import('../core/SceneManager.js').SceneManager} sceneManager
   */
  constructor(harnessManager, interaction, sceneManager) {
    this.harnessManager = harnessManager;
    this.interaction = interaction;
    this.sceneManager = sceneManager;

    this._onSelectEntity = null;
    this._onDeleteEntity = null;
    this._onCollisionViewChange = null;
    this._collisionActive = false;
    this.btnCheckCollision = null;
    this.btnCheckCollisionLabel = null;

    this._fpsFrames = 0;
    this._fpsLastTime = performance.now();

    this.legendElement = null;
    this.legendMaxLabel = null;

    this._initHeatmapLegend();
    this._initGUI();
    this._initPropertiesPanel();
    this._initToolbarEvents();
    this._initSelectionEvents();
  }

  /* ============================================================
     Density Heatmap Legend
     ============================================================ */
  _initHeatmapLegend() {
    this.legendElement = document.createElement('div');
    this.legendElement.id = 'heatmap-legend';
    this.legendElement.innerHTML = `
      <div class="legend-title">空间密度 (线束分布密集度)</div>
      <div class="legend-gradient"></div>
      <div class="legend-labels">
        <span>稀疏 (0)</span>
        <span id="heatmap-legend-max">拥挤 (MAX)</span>
      </div>
    `;
    document.body.appendChild(this.legendElement);
    this.legendMaxLabel = document.getElementById('heatmap-legend-max');
  }

  showHeatmapLegend(maxDensity) {
    if (this.legendMaxLabel) {
      this.legendMaxLabel.textContent = `拥挤 (${Math.ceil(maxDensity)})`;
    }
    if (this.legendElement) {
      this.legendElement.classList.add('visible');
    }
  }

  hideHeatmapLegend() {
    if (this.legendElement) {
      this.legendElement.classList.remove('visible');
    }
  }

  /* ============================================================
     lil-gui Parameter Panel
     ============================================================ */
  _initGUI() {
    this.gui = new GUI({
      title: '⚙ 参数控制',
      container: document.body,
    });
    this.gui.domElement.style.position = 'fixed';
    this.gui.domElement.style.top = '64px';
    this.gui.domElement.style.right = '16px';
    this.gui.domElement.style.zIndex = '90';

    // ---- 路径参数 ----
    this.pathParams = {
      tension: 0.5,
      segments: 64,
      curveType: 'catmullrom',
    };

    const pathFolder = this.gui.addFolder('路径参数');
    pathFolder
      .add(this.pathParams, 'tension', 0, 1, 0.01)
      .name('平滑度 (Tension)')
      .onChange((v) => {
        this.harnessManager.updateAllPathOptions({ tension: v });
        this._refreshSelectable();
      });
    pathFolder
      .add(this.pathParams, 'segments', 8, 256, 1)
      .name('细分数 (Segments)')
      .onChange((v) => {
        this.harnessManager.updateAllPathOptions({ segments: v });
        this._refreshSelectable();
      });
    pathFolder
      .add(this.pathParams, 'curveType', ['catmullrom', 'centripetal', 'chordal'])
      .name('曲线类型')
      .onChange((v) => {
        this.harnessManager.updateAllPathOptions({ curveType: v });
        this._refreshSelectable();
      });

    // ---- 显示参数 ----
    this.displayParams = {
      wireframe: false,
    };
    this.collisionViewParams = {
      showNonCollidingEntities: false,
    };

    const displayFolder = this.gui.addFolder('显示选项');
    displayFolder
      .add(this.displayParams, 'wireframe')
      .name('线框模式')
      .onChange((v) => {
        this._setSceneWireframe(v);
      });
    displayFolder
      .add(this.collisionViewParams, 'showNonCollidingEntities')
      .name('显示未干涉实体')
      .onChange((value) => {
        if (this._onCollisionViewChange) {
          this._onCollisionViewChange(value);
        }
      });

    // ---- 空间密度分析参数 ----
    this.densityParams = {
      enabled: false,
      sampleStep: 0.5,
      voxelSize: 0.5,
      opacity: 0.6,
    };
    this._onDensityToggle = null;
    this._onDensityOpacityChange = null;

    const densityFolder = this.gui.addFolder('空间密度分析');
    densityFolder
      .add(this.densityParams, 'enabled')
      .name('开启密度热力图')
      .onChange((v) => {
        if (this._onDensityToggle) this._onDensityToggle(v, this.densityParams);
      });
    densityFolder
      .add(this.densityParams, 'sampleStep', 0.1, 2, 0.1)
      .name('采样精度(约小越精)')
      .onChange(() => { if(this.densityParams.enabled && this._onDensityToggle) this._onDensityToggle(true, this.densityParams); });
    densityFolder
      .add(this.densityParams, 'voxelSize', 0.1, 2, 0.1)
      .name('散列网格边长大小')
      .onChange(() => { if(this.densityParams.enabled && this._onDensityToggle) this._onDensityToggle(true, this.densityParams); });
    densityFolder
      .add(this.densityParams, 'opacity', 0.1, 1.0, 0.05)
      .name('体积云透明程度')
      .onChange((v) => { if(this._onDensityOpacityChange) this._onDensityOpacityChange(v); });

    const initialRenderSettings = this.sceneManager.getRenderSettings();
    this.renderParams = {
      ambientIntensity: initialRenderSettings.ambientIntensity,
      hemisphereIntensity: initialRenderSettings.hemisphereIntensity,
      keyLightIntensity: initialRenderSettings.keyLightIntensity,
      fillLightIntensity: initialRenderSettings.fillLightIntensity,
      rimLightIntensity: initialRenderSettings.rimLightIntensity,
      shadowsEnabled: initialRenderSettings.shadowsEnabled,
      shadowBias: initialRenderSettings.shadowBias,
      shadowNormalBias: initialRenderSettings.shadowNormalBias,
      toneMapping: initialRenderSettings.toneMapping,
      exposure: initialRenderSettings.exposure,
      fogEnabled: initialRenderSettings.fogEnabled,
      fogDensity: initialRenderSettings.fogDensity,
      background: `#${initialRenderSettings.background.toString(16).padStart(6, '0')}`,
      gridOpacity: initialRenderSettings.gridOpacity,
    };

    const lightingFolder = this.gui.addFolder('灯光控制');
    lightingFolder
      .add(this.renderParams, 'ambientIntensity', 0, 2, 0.01)
      .name('环境光')
      .onChange((v) => this._applyRenderSettings({ ambientIntensity: v }));
    lightingFolder
      .add(this.renderParams, 'hemisphereIntensity', 0, 2, 0.01)
      .name('半球光')
      .onChange((v) => this._applyRenderSettings({ hemisphereIntensity: v }));
    lightingFolder
      .add(this.renderParams, 'keyLightIntensity', 0, 3, 0.01)
      .name('主光')
      .onChange((v) => this._applyRenderSettings({ keyLightIntensity: v }));
    lightingFolder
      .add(this.renderParams, 'fillLightIntensity', 0, 2, 0.01)
      .name('补光')
      .onChange((v) => this._applyRenderSettings({ fillLightIntensity: v }));
    lightingFolder
      .add(this.renderParams, 'rimLightIntensity', 0, 2, 0.01)
      .name('轮廓光')
      .onChange((v) => this._applyRenderSettings({ rimLightIntensity: v }));

    const shadowFolder = this.gui.addFolder('阴影控制');
    shadowFolder
      .add(this.renderParams, 'shadowsEnabled')
      .name('启用阴影')
      .onChange((v) => this._applyRenderSettings({ shadowsEnabled: v }));
    shadowFolder
      .add(this.renderParams, 'shadowBias', -0.01, 0, 0.0001)
      .name('阴影偏移')
      .onChange((v) => this._applyRenderSettings({ shadowBias: v }));
    shadowFolder
      .add(this.renderParams, 'shadowNormalBias', 0, 0.2, 0.001)
      .name('法线偏移')
      .onChange((v) => this._applyRenderSettings({ shadowNormalBias: v }));

    const renderFolder = this.gui.addFolder('渲染控制');
    renderFolder
      .add(this.renderParams, 'toneMapping', ['None', 'Linear', 'Reinhard', 'Cineon', 'ACESFilmic', 'Neutral'])
      .name('色调映射')
      .onChange((v) => this._applyRenderSettings({ toneMapping: v }));
    renderFolder
      .add(this.renderParams, 'exposure', 0.1, 3, 0.01)
      .name('曝光')
      .onChange((v) => this._applyRenderSettings({ exposure: v }));
    renderFolder
      .add(this.renderParams, 'fogEnabled')
      .name('雾效')
      .onChange((v) => this._applyRenderSettings({ fogEnabled: v }));
    renderFolder
      .add(this.renderParams, 'fogDensity', 0, 0.05, 0.0005)
      .name('雾密度')
      .onChange((v) => this._applyRenderSettings({ fogDensity: v }));
    renderFolder
      .add(this.renderParams, 'gridOpacity', 0, 1, 0.01)
      .name('网格透明度')
      .onChange((v) => this._applyRenderSettings({ gridOpacity: v }));
    renderFolder
      .addColor(this.renderParams, 'background')
      .name('背景色')
      .onChange((v) => this._applyRenderSettings({ background: this._parseColor(v) }));
  }

  _getSceneMeshes() {
    const meshes = [];
    this.sceneManager.scene.traverse((child) => {
      if (child.isMesh) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  _setSceneWireframe(enabled) {
    const meshes = this._getSceneMeshes();
    meshes.forEach((mesh) => {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => {
          material.wireframe = enabled;
        });
      } else if (mesh.material) {
        mesh.material.wireframe = enabled;
      }
    });
  }

  _parseColor(value) {
    if (typeof value === 'number') return value;
    return Number.parseInt(String(value).replace('#', ''), 16);
  }

  _applyRenderSettings(settings) {
    this.sceneManager.applyRenderSettings(settings);
  }

  /* ============================================================
     Properties Panel (Right Side)
     ============================================================ */
  _initPropertiesPanel() {
    this.propsPanel = document.getElementById('properties-panel');
    this.propsContent = document.getElementById('properties-content');
    this.btnCloseProps = document.getElementById('btn-close-props');

    this.btnCloseProps.addEventListener('click', () => {
      this.hideProperties();
      // 取消选中
      if (this.interaction.selectedObject) {
        this.interaction._restoreMaterial(this.interaction.selectedObject);
        this.interaction.selectedObject = null;
        this.interaction.dispatchEvent(new CustomEvent('deselect'));
      }
    });
  }

  showProperties(harnessId) {
    const info = this.harnessManager.getHarnessInfo(harnessId);
    if (!info) return;

    this.propsContent.innerHTML = `
      <div class="prop-group">
        <div class="prop-group-title">基本信息</div>
        <div class="prop-row">
          <span class="prop-label">ID</span>
          <span class="prop-value">${info.id}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">名称</span>
          <span class="prop-value">${info.name}</span>
        </div>
      </div>
      <div class="prop-group">
        <div class="prop-group-title">路径属性</div>
        <div class="prop-row">
          <span class="prop-label">控制点数</span>
          <span class="prop-value accent">${info.pointCount}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">路径长度</span>
          <span class="prop-value accent">${info.pathLength}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">平滑度</span>
          <span class="prop-value">${info.tension.toFixed(2)}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">细分数</span>
          <span class="prop-value">${info.segments}</span>
        </div>
      </div>
      <div class="prop-group">
        <div class="prop-group-title">截面属性</div>
        <div class="prop-row">
          <span class="prop-label">截面类型</span>
          <span class="prop-value accent">${info.crossSection}</span>
        </div>
      </div>
    `;

    this.propsPanel.classList.remove('hidden');
  }

  hideProperties() {
    this.propsPanel.classList.add('hidden');
  }

  /* ============================================================
     Navigator Tree Panel (Left Side)
     ============================================================ */
  updateNavigatorTree(meshes) {
    const tree = document.getElementById('entity-tree');
    if (!tree) return;
    tree.innerHTML = '';
    
    meshes.forEach(mesh => {
      const isModel = mesh.userData.isImportedModel;
      const id = mesh.userData.harnessId || mesh.name;
      const name = mesh.name || id;
      
      const li = document.createElement('li');
      li.className = 'entity-item';
      li.dataset.harnessId = id;
      
      const icon = isModel 
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>` 
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
      
      li.innerHTML = `
        <div class="entity-item-name">
          ${icon}
          <span>${name}</span>
        </div>
        <div class="entity-item-actions">
          <button class="entity-action-btn toggle-vis" title="显隐" data-id="${id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="entity-action-btn danger delete-entity" title="删除" data-id="${id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;
      
      li.addEventListener('click', (e) => {
          if (e.target.closest('.entity-item-actions')) return;
          if (this._onSelectEntity) this._onSelectEntity(mesh);
      });
      
      const btnVis = li.querySelector('.toggle-vis');
      btnVis.addEventListener('click', () => {
          mesh.visible = !mesh.visible;
          btnVis.style.opacity = mesh.visible ? '1' : '0.4';

          if (!mesh.visible && this.interaction.selectedObject === mesh) {
            this.interaction._restoreMaterial(mesh);
            this.interaction.selectedObject = null;
            this.interaction.dispatchEvent(new CustomEvent('deselect'));
          }
      });
      
      if (!mesh.visible) {
          btnVis.style.opacity = '0.4';
      }

      const btnDel = li.querySelector('.delete-entity');
      btnDel.addEventListener('click', () => {
          if (this._onDeleteEntity) this._onDeleteEntity(mesh, isModel);
      });
      
      tree.appendChild(li);
    });
  }

  syncNavigatorSelection(harnessId) {
    const tree = document.getElementById('entity-tree');
    if (!tree) return;
    const items = tree.querySelectorAll('.entity-item');
    items.forEach(li => {
      if (harnessId && li.dataset.harnessId === harnessId) {
        li.classList.add('selected');
        li.scrollIntoView({ block: 'nearest' });
      } else {
        li.classList.remove('selected');
      }
    });
  }

  /* ============================================================
     Toolbar Events
     ============================================================ */
  _initToolbarEvents() {
    // 这些回调会在 main.js 中被外部设置
    this._onAddExample = null;
    this._onClearScene = null;
    this._onCheckCollision = null;
    this._onClearCollision = null;
    this._onImportModel = null;

    document.getElementById('btn-add-example').addEventListener('click', () => {
      if (this._onAddExample) this._onAddExample();
    });

    const fileInput = document.getElementById('file-import-model');
    document.getElementById('btn-import-model').addEventListener('click', () => {
       fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
       const files = Array.from(e.target.files);
       if (files.length > 0 && this._onImportModel) {
           this._onImportModel(files);
       }
       // 清空 value 使得同名文件也能再次触发 change
       fileInput.value = '';
    });

    document.getElementById('btn-clear-scene').addEventListener('click', () => {
      if (this._onClearScene) this._onClearScene();
      this.hideProperties();
      this.updateStatus();
    });

    document.getElementById('btn-fit-view').addEventListener('click', () => {
      const objects = this.harnessManager.getSelectableObjects();
      this.interaction.fitToObjects(objects);
    });

    const btnGrid = document.getElementById('btn-toggle-grid');
    btnGrid.addEventListener('click', () => {
      const visible = this.sceneManager.toggleGrid();
      btnGrid.classList.toggle('active', visible);
    });

    // 干涉检查
    this.btnCheckCollision = document.getElementById('btn-check-collision');
    this.btnCheckCollisionLabel = this.btnCheckCollision.querySelector('span');
    this.btnCheckCollision.addEventListener('click', () => {
      if (this._collisionActive) {
        if (this._onClearCollision) this._onClearCollision();
        this.setCollisionButtonState(false, null);
        return;
      }

      if (this._onCheckCollision) {
        const count = this._onCheckCollision();
        this.setCollisionButtonState(true, count);
      }
    });

    // 性能测试
    this._onPerfTest = null;
    document.getElementById('btn-perf-test').addEventListener('click', () => {
      if (this._onPerfTest) this._onPerfTest();
    });
  }

  /* ============================================================
     Selection Events
     ============================================================ */
  _initSelectionEvents() {
    this.interaction.addEventListener('select', (e) => {
      const { harnessId } = e.detail;
      this.showProperties(harnessId);
      document.getElementById('status-selected').textContent = `选中: ${harnessId}`;
    });

    this.interaction.addEventListener('deselect', () => {
      this.hideProperties();
      document.getElementById('status-selected').textContent = '未选中';
    });
  }

  /* ============================================================
     Status Bar
     ============================================================ */
  updateStatus() {
    document.getElementById('status-harness-count').textContent =
      `线束: ${this.harnessManager.count}`;
  }

  updateCollisionStatus(count) {
    const el = document.getElementById('status-collision');
    if (count === null || count === undefined) {
      el.textContent = '干涉: --';
      el.style.color = '';
    } else if (count === 0) {
      el.textContent = '干涉: 0 ✓';
      el.style.color = 'var(--accent-success)';
    } else {
      el.textContent = `干涉: ${count} ⚠`;
      el.style.color = 'var(--accent-danger)';
    }
  }

  setCollisionButtonState(active, count = null) {
    this._collisionActive = active;
    this.updateCollisionStatus(active ? count : null);

    if (!this.btnCheckCollision) return;

    this.btnCheckCollision.classList.toggle('active', active);
    this.btnCheckCollision.classList.toggle('collision-found', active && (count ?? 0) > 0);
  }

  isCollisionActive() {
    return this._collisionActive;
  }

  updateRendererType(type) {
    const el = document.getElementById('status-renderer');
    el.textContent = `渲染器: ${type.toUpperCase()}`;
    el.style.color = type === 'webgpu' ? 'var(--accent-success)' : 'var(--accent-warning)';
  }

  updateFPS() {
    this._fpsFrames++;
    const now = performance.now();
    if (now - this._fpsLastTime >= 1000) {
      const fps = Math.round((this._fpsFrames * 1000) / (now - this._fpsLastTime));
      document.getElementById('status-fps').textContent = `FPS: ${fps}`;
      this._fpsFrames = 0;
      this._fpsLastTime = now;
    }
  }

  /* ============================================================
     Helpers
     ============================================================ */
  _refreshSelectable() {
    this.interaction.setSelectableObjects(this.harnessManager.getSelectableObjects());
  }

  /**
   * 获取当前全局路径参数
   */
  getPathParams() {
    return { ...this.pathParams };
  }

  getCollisionViewParams() {
    return { ...this.collisionViewParams };
  }

  dispose() {
    this.gui.destroy();
  }
}
