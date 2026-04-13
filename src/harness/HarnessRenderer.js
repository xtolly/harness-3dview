/**
 * HarnessRenderer — 线束渲染器
 *
 * 核心职责：将路径 + 截面组合为三维 Mesh
 *   - 圆形截面 → TubeGeometry（性能最优）
 *   - 非圆截面 → ExtrudeGeometry 沿路径挤出
 */
import * as THREE from 'three';

/** 预设配色方案 */
const COLOR_PALETTE = [
  0x38bdf8, // sky blue
  0xf87171, // coral red
  0x34d399, // emerald
  0xfbbf24, // amber
  0xa78bfa, // violet
  0xfb7185, // rose
  0x2dd4bf, // teal
  0xf97316, // orange
  0x818cf8, // indigo
  0x22d3ee, // cyan
];

let colorIndex = 0;

export class HarnessRenderer {
  constructor() {
    this._meshes = new Map(); // id → Mesh
  }

  /**
   * 创建线束 Mesh
   *
   * @param {string} id - 唯一标识
   * @param {THREE.Curve} curve - 路径曲线
   * @param {number} segments - 路径细分数
   * @param {{ type: string, shape?: THREE.Shape, radius?: number, params: Object }} crossSection
   * @param {Object} [materialOptions]
   * @param {number}  [materialOptions.color]    - 主颜色
   * @param {number}  [materialOptions.metalness=0.3]
   * @param {number}  [materialOptions.roughness=0.4]
   * @param {boolean} [materialOptions.wireframe=false]
   * @returns {THREE.Mesh}
   */
  createHarness(id, curve, segments, crossSection, materialOptions = {}) {
    // 移除旧实例
    if (this._meshes.has(id)) {
      this.removeHarness(id);
    }

    let geometry;

    if (crossSection.type === 'circular') {
      // TubeGeometry 适用于圆形截面，性能更好
      geometry = new THREE.TubeGeometry(
        curve,
        segments,
        crossSection.radius || crossSection.params.radius,
        crossSection.params.segments || 16,
        false, // closed
      );
    } else {
      // ExtrudeGeometry 用于非圆形截面沿路径挤出
      geometry = new THREE.ExtrudeGeometry(crossSection.shape, {
        steps: segments,
        bevelEnabled: false,
        extrudePath: curve,
      });
    }

    // 材质
    const defaultColor = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
    colorIndex++;

    const material = new THREE.MeshPhysicalMaterial({
      color: materialOptions.color ?? defaultColor,
      metalness: materialOptions.metalness ?? 0.3,
      roughness: materialOptions.roughness ?? 0.4,
      clearcoat: 0.3,
      clearcoatRoughness: 0.25,
      side: THREE.DoubleSide,
      wireframe: materialOptions.wireframe ?? false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.harnessId = id;
    mesh.name = `harness_${id}`;

    this._meshes.set(id, mesh);
    return mesh;
  }

  /**
   * 更新已有线束的几何体（路径/截面变更时调用）
   */
  updateHarness(id, curve, segments, crossSection) {
    const mesh = this._meshes.get(id);
    if (!mesh) return null;

    // 释放旧几何体
    mesh.geometry.dispose();

    let geometry;
    if (crossSection.type === 'circular') {
      geometry = new THREE.TubeGeometry(
        curve,
        segments,
        crossSection.radius || crossSection.params.radius,
        crossSection.params.segments || 16,
        false,
      );
    } else {
      geometry = new THREE.ExtrudeGeometry(crossSection.shape, {
        steps: segments,
        bevelEnabled: false,
        extrudePath: curve,
      });
    }

    mesh.geometry = geometry;
    return mesh;
  }

  /**
   * 移除线束
   */
  removeHarness(id) {
    const mesh = this._meshes.get(id);
    if (mesh) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
      this._meshes.delete(id);
      return mesh; // 调用方需要从 scene 移除
    }
    return null;
  }

  /**
   * 获取 Mesh by ID
   */
  getMesh(id) {
    return this._meshes.get(id) || null;
  }

  /**
   * 获取所有 Mesh
   * @returns {THREE.Mesh[]}
   */
  getAllMeshes() {
    return Array.from(this._meshes.values());
  }

  /**
   * 重置颜色计数器
   */
  static resetColorIndex() {
    colorIndex = 0;
  }

  /**
   * 销毁所有资源
   */
  dispose() {
    for (const [id] of this._meshes) {
      this.removeHarness(id);
    }
  }
}
