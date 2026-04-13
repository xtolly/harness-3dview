/**
 * ModelLoader — 外部三维模型导入模块
 *
 * 支持格式：GLTF/GLB, OBJ, STL
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

export class ModelLoader {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;

    this.modelsGroup = new THREE.Group();
    this.modelsGroup.name = 'imported_models';
    this.scene.add(this.modelsGroup);

    this.loadedModels = [];
    this.modelIdCounter = 0;
  }

  /**
   * 加载外部模型及其附带资源（如 MTL、贴图）
   * @param {File[]} files
   * @returns {Promise<THREE.Object3D>}
   */
  async loadFromFiles(files) {
    if (!files || files.length === 0) throw new Error('未选择任何文件');

    const mainFile = files.find(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ['gltf', 'glb', 'obj', 'stl', 'step', 'stp'].includes(ext);
    });

    if (!mainFile) {
      throw new Error('未找到支持的主模型文件');
    }

    const extension = mainFile.name.split('.').pop().toLowerCase();
    const url = URL.createObjectURL(mainFile);
    const modelId = `model_${++this.modelIdCounter}`;

    // 构建资源映射管理器，拦截所有对本地附带文件的加载请求
    const manager = new THREE.LoadingManager();
    const objectURLs = new Set();
    const fileMap = new Map();
    files.forEach(f => {
      const u = URL.createObjectURL(f);
      objectURLs.add(u);
      fileMap.set(f.name.toLowerCase(), u);
    });

    manager.setURLModifier((requestedUrl) => {
      if (requestedUrl.startsWith('blob:')) return requestedUrl;
      const fileName = requestedUrl.split('/').pop().replace(/\\/g, '/').split('/').pop().toLowerCase();
      if (fileMap.has(fileName)) {
        return fileMap.get(fileName);
      }
      return requestedUrl;
    });

    let object;
    try {
      if (['gltf', 'glb'].includes(extension)) {
        object = await this._loadGLTF(url, manager);
      } else if (extension === 'obj') {
        const baseName = mainFile.name.replace(/\.obj$/i, '');
        const mtlFile = files.find(f => f.name.toLowerCase() === `${baseName.toLowerCase()}.mtl`) ||
          files.find(f => f.name.toLowerCase().endsWith('.mtl'));
        object = await this._loadOBJ(url, manager, mtlFile ? fileMap.get(mtlFile.name.toLowerCase()) : null);
      } else if (extension === 'stl') {
        object = await this._loadSTL(url);
      } else if (['step', 'stp'].includes(extension)) {
        object = await this._loadSTEP(mainFile);
      } else {
        throw new Error(`不支持的文件格式: ${extension}`);
      }

      object.name = mainFile.name;
      object.userData.modelId = modelId;

      // 遍历设置材质、阴影和标识
      object.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // 为了复用碰撞检测逻辑，为其设置类似 harnessId 的标识
          child.userData.harnessId = `${modelId}_${child.name || child.id}`;
          child.userData.isImportedModel = true;

          // 补充缺失的法线，防止一些粗糙的 OBJ 会出现着色断层或全部黑色(面法线问题)
          if (child.geometry && !child.geometry.hasAttribute('normal')) {
            child.geometry.computeVertexNormals();
          }

          // OBJLoader 默认给缺少 mtl 的组赋予白色的 MeshPhongMaterial 导致和页面不搭或面相突兀
          const isDefaultObjMat = child.material && child.material.type === 'MeshPhongMaterial' && !child.material.map;

          // 如果没有材质，或者被赋予了默认未贴图的 phong 材质，将其替换为统一的工程级蓝灰色调物理材质
          if (!child.material || isDefaultObjMat) {
            child.material = new THREE.MeshPhysicalMaterial({
              color: 0x94a3b8,
              metalness: 0.1,
              roughness: 0.7,
              side: THREE.DoubleSide
            });
          } else {
            // 如果是材质数组，确保是双面渲染
            if (Array.isArray(child.material)) {
              child.material.forEach(m => { m.side = THREE.DoubleSide; });
            } else {
              child.material.side = THREE.DoubleSide;
            }
          }
        }
      });

      // 自适应缩放和居中
      this._centerAndScale(object);

      this.modelsGroup.add(object);
      this.loadedModels.push(object);

      return object;
    } finally {
      objectURLs.forEach(u => URL.revokeObjectURL(u));
    }
  }

  _loadGLTF(url, manager) {
    const loader = new GLTFLoader(manager);
    return new Promise((resolve, reject) => {
      loader.load(url, (gltf) => {
        resolve(gltf.scene);
      }, undefined, reject);
    });
  }

  async _loadOBJ(url, manager, mtlUrl) {
    let materials = null;
    if (mtlUrl) {
      const mtlLoader = new MTLLoader(manager);
      materials = await new Promise((resolve, reject) => {
        mtlLoader.load(mtlUrl, resolve, undefined, reject);
      });
      materials.preload();
    }

    const loader = new OBJLoader(manager);
    if (materials) {
      loader.setMaterials(materials);
    }

    return new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
  }

  _loadSTL(url) {
    const loader = new STLLoader();
    return new Promise((resolve, reject) => {
      loader.load(url, (geometry) => {
        const material = new THREE.MeshPhysicalMaterial({
          color: 0x64748b, // 默认灰蓝色
          metalness: 0.3,
          roughness: 0.6,
        });
        const mesh = new THREE.Mesh(geometry, material);
        resolve(mesh);
      }, undefined, reject);
    });
  }

  async _loadSTEP(file) {
    if (!this.occt) {
      // 动态引入并初始化 occt-import-js，指定 wasm 文件路径为根目录
      const occtimportjs = (await import('occt-import-js')).default;
      this.occt = await occtimportjs({
        locateFile: (name) => `/${name}`
      });
    }

    const buffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(buffer);

    // 解析 STEP 文件
    const result = this.occt.ReadStepFile(fileBuffer, null);

    if (!result.success || !result.meshes) {
      throw new Error('解析 STEP 文件失败，文件可能已损坏或是不支持的 STEP 版本');
    }

    const group = new THREE.Group();

    // 解析出的每个 Mesh 都转化为 Three.js 网格
    result.meshes.forEach(meshData => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(meshData.attributes.position.array, 3));
      if (meshData.attributes.normal) {
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(meshData.attributes.normal.array, 3));
      }
      if (meshData.index) {
        geometry.setIndex(new THREE.Uint32BufferAttribute(meshData.index.array, 1));
      }

      let color = 0x64748b;
      if (meshData.color) {
        color = new THREE.Color(meshData.color[0], meshData.color[1], meshData.color[2]);
      }

      const material = new THREE.MeshPhysicalMaterial({
        color: color,
        metalness: 0.3,
        roughness: 0.6,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = meshData.name || 'step_mesh';
      group.add(mesh);
    });

    return group;
  }

  _centerAndScale(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // 缩放到合理尺寸，例如最大 30 单位，避免模型过大或过小
    if (maxDim > 0) {
      const scale = 30 / maxDim;
      // 如果模型本身就很小或太大，调整其缩放比例
      if (scale < 0.1 || scale > 10) {
        object.scale.setScalar(scale);
        object.updateMatrixWorld(true);
      }
    }

    // 重新计算缩放后的包围盒并居中置底
    const scaledBox = new THREE.Box3().setFromObject(object);
    const center = scaledBox.getCenter(new THREE.Vector3());
    object.position.sub(center); // 居中到(0,0,0)
    object.position.y -= scaledBox.min.y; // 置底，基底在y=0平面上
  }

  /**
   * 获取所有导入的模型 Mesh 用于相交检测等
   * @returns {THREE.Mesh[]}
   */
  getMeshes() {
    const meshes = [];
    this.modelsGroup.traverse((child) => {
      if (child.isMesh) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  _getModelRoot(object) {
    let current = object;
    while (current && current !== this.modelsGroup) {
      if (current.userData?.modelId) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  removeModel(mesh) {
    const root = this._getModelRoot(mesh) || mesh;

    root.traverse(node => {
      if (node.isMesh) {
        node.geometry?.dispose();
        if (Array.isArray(node.material)) {
          node.material.forEach(m => m.dispose());
        } else {
          node.material?.dispose();
        }
      }
    });
    if (root.parent) root.parent.remove(root);
    this.loadedModels = this.loadedModels.filter(m => m !== root);
  }

  clearAll() {
    this.modelsGroup.children.slice().forEach(child => {
      child.traverse(node => {
        if (node.isMesh) {
          node.geometry?.dispose();
          if (Array.isArray(node.material)) {
            node.material.forEach(m => m.dispose());
          } else {
            node.material?.dispose();
          }
        }
      });
      this.modelsGroup.remove(child);
    });
    this.loadedModels = [];
  }
}
