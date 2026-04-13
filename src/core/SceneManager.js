/**
 * SceneManager — Three.js 场景、相机、渲染器、灯光的统一管理
 *
 * 支持 WebGPU 自动检测：
 *   - 浏览器支持 WebGPU → 使用 WebGPURenderer（更高性能）
 *   - 不支持 → 自动降级为 WebGLRenderer
 */
import * as THREE from 'three';

export class SceneManager {
  /**
   * 使用静态工厂方法 create() 来创建实例（处理 WebGPU 异步初始化）
   * @param {HTMLElement} container - canvas 挂载容器
   */
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.callbacks = [];
    this.rendererType = 'webgl'; // 'webgl' | 'webgpu'
    this.backgroundColor = 0xf1f5f9;
    this.renderSettings = {
      ambientIntensity: 0.4,
      hemisphereIntensity: 0.5,
      keyLightIntensity: 1.2,
      fillLightIntensity: 0.4,
      rimLightIntensity: 0.3,
      shadowsEnabled: true,
      shadowBias: -0.0005,
      shadowNormalBias: 0.02,
      toneMapping: 'ACESFilmic',
      exposure: 1.2,
      fogEnabled: true,
      fogDensity: 0.008,
      background: this.backgroundColor,
      gridOpacity: 0.6,
    };
  }

  /**
   * 异步工厂方法 — 自动检测 WebGPU 支持并初始化
   * @param {HTMLElement} container
   * @returns {Promise<SceneManager>}
   */
  static async create(container) {
    const manager = new SceneManager(container);
    await manager._initRenderer();
    manager._initScene();
    manager._initCamera();
    manager._initLights();
    manager._initGrid();
    manager._initResize();
    return manager;
  }

  /* ---- Renderer (WebGPU → WebGL fallback) ---- */
  async _initRenderer() {
    let useWebGPU = false;

    // WebGPU 默认不启用（MeshPhysicalMaterial 兼容性问题）
    // 通过 URL 参数 ?webgpu=1 手动启用
    const params = new URLSearchParams(window.location.search);
    const preferWebGPU = params.get('webgpu') === '1';

    if (preferWebGPU && navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          useWebGPU = true;
        }
      } catch (e) {
        console.warn('WebGPU adapter 请求失败，降级为 WebGL:', e);
      }
    }

    if (useWebGPU) {
      try {
        // Three.js v0.170+ 通过 'three/webgpu' 导出 WebGPURenderer
        const THREE_WEBGPU = await import('three/webgpu');
        this.renderer = new THREE_WEBGPU.WebGPURenderer({
          antialias: true,
          powerPreference: 'high-performance',
        });
        await this.renderer.init();
        this.rendererType = 'webgpu';
        console.log('%c✓ WebGPU 渲染器已启用', 'color:#34d399;font-weight:bold;');
      } catch (e) {
        console.warn('WebGPU 渲染器初始化失败，降级为 WebGL:', e);
        useWebGPU = false;
      }
    }

    if (!useWebGPU) {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.rendererType = 'webgl';
      console.log('%c✓ WebGL 渲染器已启用', 'color:#fbbf24;font-weight:bold;');
    }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setClearColor(this.backgroundColor, 1);
    this.container.appendChild(this.renderer.domElement);
  }

  /* ---- Scene ---- */
  _initScene() {
    this.scene = new THREE.Scene();

    // 添加淡淡的雾效增强纵深感
    this.scene.fog = new THREE.FogExp2(this.backgroundColor, this.renderSettings.fogDensity);
  }

  /* ---- Camera ---- */
  _initCamera() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    this.camera.position.set(15, 12, 15);
    this.camera.lookAt(0, 0, 0);
  }

  /* ---- Lights ---- */
  _initLights() {
    // Ambient — 低强度环境光
    const ambient = new THREE.AmbientLight(0x4488cc, this.renderSettings.ambientIntensity);
    this.scene.add(ambient);
    this.ambientLight = ambient;

    // Hemisphere — 天空/地面双色光
    const hemi = new THREE.HemisphereLight(0x88ccff, 0x443322, this.renderSettings.hemisphereIntensity);
    this.scene.add(hemi);
    this.hemiLight = hemi;

    // Key light — 主方向光
    const keyLight = new THREE.DirectionalLight(0xffffff, this.renderSettings.keyLightIntensity);
    keyLight.position.set(10, 15, 10);
    keyLight.castShadow = this.renderSettings.shadowsEnabled;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 60;
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 30;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    
    // 关键修正：加入阴影偏移配置，防止由于精度问题导致大面积微小阴影痘（Shadow acne）
    keyLight.shadow.bias = this.renderSettings.shadowBias;
    keyLight.shadow.normalBias = this.renderSettings.shadowNormalBias;

    this.scene.add(keyLight);
    this.keyLight = keyLight;

    // Fill light — 补光
    const fillLight = new THREE.DirectionalLight(0x88aaff, this.renderSettings.fillLightIntensity);
    fillLight.position.set(-8, 6, -4);
    this.scene.add(fillLight);
    this.fillLight = fillLight;

    // Rim/back light — 轮廓光
    const rimLight = new THREE.DirectionalLight(0x38bdf8, this.renderSettings.rimLightIntensity);
    rimLight.position.set(-5, 8, -10);
    this.scene.add(rimLight);
    this.rimLight = rimLight;

    this.applyRenderSettings(this.renderSettings);
  }

  /* ---- Grid Helper ---- */
  _initGrid() {
    // 浅色主题网格
    this.gridHelper = new THREE.GridHelper(50, 50, 0x94a3b8, 0xcbd5e1);
    this.gridHelper.material.opacity = this.renderSettings.gridOpacity;
    this.gridHelper.material.transparent = true;
    this.scene.add(this.gridHelper);

    // 中心坐标轴
    const axesHelper = new THREE.AxesHelper(3);
    axesHelper.setColors(
      new THREE.Color(0xf87171), // X — 红
      new THREE.Color(0x34d399), // Y — 绿
      new THREE.Color(0x38bdf8), // Z — 蓝
    );
    this.scene.add(axesHelper);
    this.axesHelper = axesHelper;
  }

  /* ---- Resize ---- */
  _initResize() {
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);
  }

  /* ---- Grid Visibility ---- */
  toggleGrid() {
    this.gridHelper.visible = !this.gridHelper.visible;
    this.axesHelper.visible = !this.axesHelper.visible;
    return this.gridHelper.visible;
  }

  getRenderSettings() {
    return { ...this.renderSettings };
  }

  applyRenderSettings(nextSettings = {}) {
    this.renderSettings = { ...this.renderSettings, ...nextSettings };

    const toneMappingModes = {
      None: THREE.NoToneMapping,
      Linear: THREE.LinearToneMapping,
      Reinhard: THREE.ReinhardToneMapping,
      Cineon: THREE.CineonToneMapping,
      ACESFilmic: THREE.ACESFilmicToneMapping,
      Neutral: THREE.NeutralToneMapping,
    };

    if (this.ambientLight) {
      this.ambientLight.intensity = this.renderSettings.ambientIntensity;
    }
    if (this.hemiLight) {
      this.hemiLight.intensity = this.renderSettings.hemisphereIntensity;
    }
    if (this.keyLight) {
      this.keyLight.intensity = this.renderSettings.keyLightIntensity;
      this.keyLight.castShadow = this.renderSettings.shadowsEnabled;
      this.keyLight.shadow.bias = this.renderSettings.shadowBias;
      this.keyLight.shadow.normalBias = this.renderSettings.shadowNormalBias;
    }
    if (this.fillLight) {
      this.fillLight.intensity = this.renderSettings.fillLightIntensity;
    }
    if (this.rimLight) {
      this.rimLight.intensity = this.renderSettings.rimLightIntensity;
    }

    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.enabled = this.renderSettings.shadowsEnabled;
    }

    if (this.renderer) {
      const toneMapping = toneMappingModes[this.renderSettings.toneMapping] ?? THREE.ACESFilmicToneMapping;
      this.renderer.toneMapping = toneMapping;
      this.renderer.toneMappingExposure = this.renderSettings.exposure;
      this.renderer.setClearColor(this.renderSettings.background, 1);
    }

    if (this.scene) {
      if (this.renderSettings.fogEnabled) {
        if (!this.scene.fog) {
          this.scene.fog = new THREE.FogExp2(this.renderSettings.background, this.renderSettings.fogDensity);
        }
        this.scene.fog.color.setHex(this.renderSettings.background);
        this.scene.fog.density = this.renderSettings.fogDensity;
      } else {
        this.scene.fog = null;
      }
    }

    if (this.gridHelper?.material) {
      this.gridHelper.material.opacity = this.renderSettings.gridOpacity;
      this.gridHelper.material.needsUpdate = true;
    }
  }

  /* ---- Animation Loop ---- */
  onUpdate(callback) {
    this.callbacks.push(callback);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const delta = this.clock.getDelta();
      const elapsed = this.clock.getElapsedTime();
      for (const cb of this.callbacks) {
        cb(delta, elapsed);
      }
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  /* ---- Cleanup ---- */
  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
