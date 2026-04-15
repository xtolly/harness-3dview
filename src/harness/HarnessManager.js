/**
 * HarnessManager — 线束集合管理
 *
 * 管理所有线束实例的生命周期：添加、删除、选中、查询
 */
import { PathBuilder } from './PathBuilder.js';
import { CrossSection } from './CrossSection.js';
import { HarnessRenderer } from './HarnessRenderer.js';
import { DensityAnalyzer } from './DensityAnalyzer.js';
import { VolumeRenderer } from './VolumeRenderer.js';

let idCounter = 0;

export class HarnessManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.renderer = new HarnessRenderer();

    /**
     * 线束配置数据存储
     * Map<id, { path, crossSection, curve, segments, options }>
     */
    this.harnessData = new Map();

    this.isHeatmapEnabled = false;
    this.lastDensityResult = null;
    this.volumeRenderer = new VolumeRenderer(scene);
  }

  /**
   * 添加线束
   *
   * @param {Object} config
   * @param {string} [config.id]          - 自定义 ID (可选，自动生成)
   * @param {string} [config.name]        - 显示名称
   * @param {Array}  config.points        - 路径控制点 [{x,y,z}, ...]
   * @param {Object} [config.pathOptions] - 路径选项 { tension, closed, segments, curveType }
   * @param {Object} config.crossSection  - 截面配置 { type, ...params }
   * @param {Object} [config.material]    - 材质选项
   * @returns {string} harnessId
   */
  addHarness(config) {
    const id = config.id || `harness_${++idCounter}`;
    const name = config.name || id;

    // 构建路径
    const { curve, segments } = PathBuilder.fromPoints(config.points, config.pathOptions);

    // 构建截面
    let crossSection;
    const cs = config.crossSection || { type: 'circular', radius: 0.3 };
    switch (cs.type) {
      case 'circular':
        crossSection = CrossSection.circular(cs.radius, cs.segments);
        break;
      case 'rectangular':
        crossSection = CrossSection.rectangular(cs.width, cs.height, cs.cornerRadius);
        break;
      case 'custom':
        crossSection = CrossSection.custom(cs.points);
        break;
      default:
        crossSection = CrossSection.circular(0.3);
    }

    // 渲染
    const mesh = this.renderer.createHarness(id, curve, segments, crossSection, config.material);
    this.scene.add(mesh);

    // 存储配置
    this.harnessData.set(id, {
      id,
      name,
      points: config.points,
      pathOptions: { ...config.pathOptions },
      crossSectionConfig: cs,
      crossSection,
      curve,
      segments,
      materialOptions: config.material || {},
    });

    return id;
  }

  /**
   * 更新线束路径选项（平滑度/细分数等）
   * @param {string} id
   * @param {Object} pathOptions - { tension?, segments?, curveType?, closed? }
   */
  updatePathOptions(id, pathOptions) {
    const data = this.harnessData.get(id);
    if (!data) return;

    Object.assign(data.pathOptions, pathOptions);
    const { curve, segments } = PathBuilder.fromPoints(data.points, data.pathOptions);
    data.curve = curve;
    data.segments = segments;

    this.renderer.updateHarness(id, curve, segments, data.crossSection);
  }

  /**
   * 更新线束截面
   * @param {string} id
   * @param {Object} crossSectionConfig
   */
  updateCrossSection(id, crossSectionConfig) {
    const data = this.harnessData.get(id);
    if (!data) return;

    let crossSection;
    switch (crossSectionConfig.type) {
      case 'circular':
        crossSection = CrossSection.circular(crossSectionConfig.radius, crossSectionConfig.segments);
        break;
      case 'rectangular':
        crossSection = CrossSection.rectangular(
          crossSectionConfig.width,
          crossSectionConfig.height,
          crossSectionConfig.cornerRadius,
        );
        break;
      case 'custom':
        crossSection = CrossSection.custom(crossSectionConfig.points);
        break;
      default:
        return;
    }

    data.crossSectionConfig = crossSectionConfig;
    data.crossSection = crossSection;
    this.renderer.updateHarness(id, data.curve, data.segments, crossSection);
  }

  /**
   * 批量更新所有线束的路径选项
   */
  updateAllPathOptions(pathOptions) {
    for (const [id] of this.harnessData) {
      this.updatePathOptions(id, pathOptions);
    }
  }

  /**
   * 删除线束
   */
  removeHarness(id) {
    const mesh = this.renderer.removeHarness(id);
    if (mesh) {
      this.scene.remove(mesh);
    }
    this.harnessData.delete(id);
  }

  /**
   * 清空所有线束
   */
  clearAll() {
    for (const [id] of this.harnessData) {
      const mesh = this.renderer.removeHarness(id);
      if (mesh) this.scene.remove(mesh);
    }
    this.harnessData.clear();
    this.isHeatmapEnabled = false;
    this.lastDensityResult = null;
    this.volumeRenderer.clear();
    HarnessRenderer.resetColorIndex();
  }

  /**
   * 开启或关闭空间三维体积热力图分析
   */
  toggleDensityHeatmap(enabled, options = { sampleStep: 0.5, voxelSize: 0.5, opacity: 0.4 }) {
    this.isHeatmapEnabled = enabled;

    if (!enabled) {
      for (const [id] of this.harnessData) {
        this.renderer.clearGhostMode(id);
      }
      this.volumeRenderer.clear();
      this.lastDensityResult = null;
      return 0;
    }

    const targetList = Array.from(this.harnessData.values()).map(data => ({
      id: data.id,
      curve: data.curve,
      length: PathBuilder.getLength(data.curve)
    }));

    const result = DensityAnalyzer.analyze(targetList, options);
    this.lastDensityResult = result;

    if (result.globalMax === 0) result.globalMax = 1;

    // 所有线束幽灵化
    for (const [id] of this.harnessData) {
      this.renderer.setGhostMode(id);
    }
    
    // 生成空间体积渲染方块
    this.volumeRenderer.createVolume(result, options.opacity);

    return result.globalMax;
  }

  updateHeatmapOpacity(opacity) {
      if (this.isHeatmapEnabled) {
          this.volumeRenderer.setOpacity(opacity);
      }
  }

  /**
   * 获取所有可选中的 Mesh 对象
   * @returns {THREE.Mesh[]}
   */
  getSelectableObjects() {
    return this.renderer.getAllMeshes();
  }

  /**
   * 获取线束数据
   * @param {string} id
   */
  getHarnessInfo(id) {
    const data = this.harnessData.get(id);
    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      pointCount: data.points.length,
      pathLength: PathBuilder.getLength(data.curve).toFixed(2),
      tension: data.pathOptions.tension ?? 0.5,
      segments: data.segments,
      crossSection: CrossSection.describe(data.crossSection),
      crossSectionConfig: data.crossSectionConfig,
    };
  }

  /**
   * 获取线束总数
   */
  get count() {
    return this.harnessData.size;
  }
}
