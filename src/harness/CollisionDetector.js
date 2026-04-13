/**
 * CollisionDetector — 干涉检查模块
 *
 * 基于 three-mesh-bvh 的 BVH 加速碰撞检测：
 *   1. 为每个线束 Mesh 构建 BVH
 *   2. AABB 粗筛排除不可能相交的对
 *   3. BVH 精确 mesh-mesh 三角面相交检测
 *   4. 可视化干涉区域（高亮 + 标记点）
 */
import * as THREE from 'three';
import {
  MeshBVH,
  MeshBVHHelper,
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from 'three-mesh-bvh';

// 为 Three.js 注入 BVH 加速方法
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * 干涉检测结果
 * @typedef {Object} CollisionResult
 * @property {string} idA - 线束 A 的 ID
 * @property {string} idB - 线束 B 的 ID
 * @property {boolean} intersects - 是否干涉
 * @property {THREE.Vector3[]} contactPoints - 接触点（世界坐标）
 */

export class CollisionDetector {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    /** @type {Map<string, MeshBVH>} 线束 ID → BVH */
    this._bvhCache = new Map();

    /** @type {THREE.Group} 干涉可视化组 */
    this.visualGroup = new THREE.Group();
    this.visualGroup.name = 'collision_visuals';
    this.scene.add(this.visualGroup);

    // 干涉高亮材质
    this._collisionMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.6,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    // 接触点标记材质
    this._contactPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdd00,
    });

    /** @type {CollisionResult[]} 上次检测结果 */
    this.results = [];

    /** @type {Map<string, boolean>} 记录干涉检查前的可见性 */
    this._savedVisibility = new Map();
  }

  _cloneMaterialWithTransparency(material, options = {}) {
    const {
      color,
      emissive,
      emissiveIntensity,
      opacity,
      isImportedModel = false,
    } = options;

    const nextMaterial = material.clone();
    if (color !== undefined && nextMaterial.color) {
      nextMaterial.color.set(color);
    }
    if (emissive !== undefined && nextMaterial.emissive) {
      nextMaterial.emissive.set(emissive);
    }
    if (emissiveIntensity !== undefined && 'emissiveIntensity' in nextMaterial) {
      nextMaterial.emissiveIntensity = emissiveIntensity;
    }

    nextMaterial.transparent = opacity < 1;
    nextMaterial.opacity = opacity;
    nextMaterial.depthTest = true;

    // 透明模型在多层壳体/薄板场景中如果继续写深度，容易产生自遮挡闪烁。
    if (nextMaterial.transparent) {
      nextMaterial.depthWrite = false;
      nextMaterial.alphaTest = 0.001;
      if (isImportedModel && nextMaterial.side === THREE.DoubleSide) {
        nextMaterial.forceSinglePass = true;
      }
    } else {
      nextMaterial.depthWrite = true;
    }

    nextMaterial.needsUpdate = true;
    return nextMaterial;
  }

  _createCollisionMaterial(originalMaterial, options = {}) {
    if (Array.isArray(originalMaterial)) {
      return originalMaterial.map((material) => this._cloneMaterialWithTransparency(material, options));
    }
    return this._cloneMaterialWithTransparency(originalMaterial, options);
  }

  _disposeMaterial(material) {
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
      return;
    }
    material.dispose();
  }

  /**
   * 为线束 Mesh 构建/更新 BVH
   * @param {THREE.Mesh} mesh
   */
  buildBVH(mesh) {
    const id = mesh.userData.harnessId;
    if (!id) return;

    // 释放旧的 BVH
    if (mesh.geometry.boundsTree) {
      mesh.geometry.disposeBoundsTree();
    }

    // 构建新的 BVH
    mesh.geometry.computeBoundsTree();
    this._bvhCache.set(id, mesh.geometry.boundsTree);
  }

  /**
   * 为所有线束构建 BVH
   * @param {THREE.Mesh[]} meshes
   */
  buildAllBVH(meshes) {
    this._bvhCache.clear();
    for (const mesh of meshes) {
      this.buildBVH(mesh);
    }
  }

  /**
   * 执行全量干涉检查
   * 对所有线束两两进行碰撞检测
   *
   * @param {THREE.Mesh[]} meshes - 所有线束 Mesh
   * @returns {CollisionResult[]} 干涉结果列表
   */
  checkAll(meshes) {
    // 清除旧的可视化
    this.clearVisuals();
    this.results = [];

    // 确保所有 Mesh 都有 BVH
    for (const mesh of meshes) {
      if (!mesh.geometry.boundsTree) {
        this.buildBVH(mesh);
      }
    }

    // 两两检测
    for (let i = 0; i < meshes.length; i++) {
      for (let j = i + 1; j < meshes.length; j++) {
        // 跳过：外部模型与外部模型之间不进行干涉检查
        const isModelA = meshes[i].userData.isImportedModel;
        const isModelB = meshes[j].userData.isImportedModel;
        if (isModelA && isModelB) {
          continue;
        }

        const result = this._checkPair(meshes[i], meshes[j]);
        if (result.intersects) {
          this.results.push(result);
        }
      }
    }

    // 可视化干涉
    this._visualizeResults();

    return this.results;
  }

  /**
   * 检查两个 Mesh 是否干涉
   * @param {THREE.Mesh} meshA
   * @param {THREE.Mesh} meshB
   * @returns {CollisionResult}
   */
  _checkPair(meshA, meshB) {
    const idA = meshA.userData.harnessId;
    const idB = meshB.userData.harnessId;

    const result = {
      idA,
      idB,
      intersects: false,
      contactPoints: [],
    };

    // Step 1: AABB 粗筛
    const boxA = new THREE.Box3().setFromObject(meshA);
    const boxB = new THREE.Box3().setFromObject(meshB);

    if (!boxA.intersectsBox(boxB)) {
      return result; // AABB 不相交，不可能干涉
    }

    // Step 2: BVH 精确检测 — 三角面-三角面相交
    const bvhA = meshA.geometry.boundsTree;
    const bvhB = meshB.geometry.boundsTree;

    if (!bvhA || !bvhB) return result;

    // 获取变换矩阵：将 B 的坐标变换到 A 的局部空间
    const matrixBtoA = new THREE.Matrix4()
      .copy(meshA.matrixWorld)
      .invert()
      .multiply(meshB.matrixWorld);

    const intersectionPoints = [];

    // 用于精确三角面相交测试的临时交线对象
    const intersectionLine = new THREE.Line3();

    // bvhcast: BVH A 与 BVH B 的相交检测
    bvhA.bvhcast(bvhB, matrixBtoA, {
      intersectsTriangles(triA, triB, iA, iB) {
        // 精确的三角面-三角面相交测试
        // triA 在 A 的局部空间，triB 已通过 matrixBtoA 变换到 A 的局部空间
        const doesIntersect = triA.intersectsTriangle(triB, intersectionLine);

        if (doesIntersect) {
          // 取交线中点作为接触点（此时在 A 的局部空间）
          const midpoint = new THREE.Vector3();
          intersectionLine.getCenter(midpoint);

          // 变换到世界坐标
          midpoint.applyMatrix4(meshA.matrixWorld);
          intersectionPoints.push(midpoint);

          // 收集到足够多的接触点后提前退出
          if (intersectionPoints.length >= 50) return true;
        }

        return false; // 继续检测
      },
    });

    if (intersectionPoints.length > 0) {
      result.intersects = true;
      result.contactPoints = intersectionPoints;
    }

    return result;
  }

  /**
   * 可视化干涉结果
   */
  _visualizeResults() {
    for (const result of this.results) {
      // 对接触点做采样，避免标记过密
      const points = result.contactPoints;
      const step = Math.max(1, Math.floor(points.length / 15)); // 最多15个标记
      const sampled = points.filter((_, i) => i % step === 0);

      for (const point of sampled) {
        // 黄色发光球体标记真实接触点
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 12, 10),
          this._contactPointMaterial.clone(),
        );
        marker.position.copy(point);
        marker.userData.isCollisionMarker = true;
        this.visualGroup.add(marker);
      }
    }
  }

  /**
   * 清除干涉可视化
   */
  clearVisuals() {
    while (this.visualGroup.children.length > 0) {
      const child = this.visualGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      this.visualGroup.remove(child);
    }
    this.results = [];
  }

  /**
   * 去色：将所有线束变为灰色半透明（突出干涉区域）
   * @param {THREE.Mesh[]} meshes
   * @param {Set<string>} [collidingIds] - 参与干涉的线束 ID 集合
   */
  desaturateMeshes(meshes, collidingIds = new Set()) {
    for (const mesh of meshes) {
      const id = mesh.userData.harnessId;
      const isImportedModel = !!mesh.userData.isImportedModel;
      // 保存原始材质
      if (!this._savedMaterials) this._savedMaterials = new Map();
      if (!this._savedMaterials.has(id)) {
        this._savedMaterials.set(id, mesh.material);
      }

      const originalMaterial = this._savedMaterials.get(id);

      if (collidingIds.has(id)) {
        mesh.material = this._createCollisionMaterial(originalMaterial, {
          color: 0xff3355,
          emissive: 0xff2244,
          emissiveIntensity: 0.3,
          opacity: isImportedModel ? 0.55 : 0.7,
          isImportedModel,
        });
      } else {
        mesh.material = this._createCollisionMaterial(originalMaterial, {
          color: isImportedModel ? 0x7c8798 : 0x555566,
          emissive: 0x000000,
          emissiveIntensity: 0,
          opacity: isImportedModel ? 0.18 : 0.25,
          isImportedModel,
        });
      }

      // 让透明对象排序更稳定，减少同一模型不同零件之间的闪烁。
      mesh.renderOrder = isImportedModel ? 10 : 0;
    }
  }

  isolateCollidingMeshes(meshes, collidingIds = new Set()) {
    this._savedVisibility.clear();

    for (const mesh of meshes) {
      const id = mesh.userData.harnessId;
      if (id) {
        this._savedVisibility.set(id, mesh.visible);
      }
    }

    if (collidingIds.size === 0) {
      return;
    }

    for (const mesh of meshes) {
      const id = mesh.userData.harnessId;
      mesh.visible = collidingIds.has(id);
    }
  }

  restoreVisibility(meshes) {
    if (this._savedVisibility.size === 0) return;

    for (const mesh of meshes) {
      const id = mesh.userData.harnessId;
      if (this._savedVisibility.has(id)) {
        mesh.visible = this._savedVisibility.get(id);
      }
    }

    this._savedVisibility.clear();
  }

  /**
   * 恢复所有线束的原始材质颜色
   * @param {THREE.Mesh[]} meshes
   */
  restoreMeshes(meshes) {
    if (!this._savedMaterials) return;

    for (const mesh of meshes) {
      const id = mesh.userData.harnessId;
      const saved = this._savedMaterials.get(id);
      if (saved) {
        // 释放临时材质
        if (mesh.material !== saved) {
          this._disposeMaterial(mesh.material);
        }
        mesh.material = saved;
        mesh.renderOrder = 0;
      }
    }
    this._savedMaterials.clear();
  }

  /**
   * 释放所有 BVH 资源
   * @param {THREE.Mesh[]} meshes
   */
  disposeAllBVH(meshes) {
    for (const mesh of meshes) {
      if (mesh.geometry.boundsTree) {
        mesh.geometry.disposeBoundsTree();
      }
    }
    this._bvhCache.clear();
  }

  /**
   * 获取干涉数量
   */
  get collisionCount() {
    return this.results.length;
  }

  /**
   * 获取可读的干涉报告
   * @returns {string[]}
   */
  getReport() {
    return this.results.map(r =>
      `${r.idA} ⟷ ${r.idB}: ${r.contactPoints.length} 个接触点`
    );
  }

  dispose() {
    this.clearVisuals();
    this.scene.remove(this.visualGroup);
    this._savedVisibility.clear();
    this._collisionMaterial.dispose();
    this._contactPointMaterial.dispose();
  }
}
