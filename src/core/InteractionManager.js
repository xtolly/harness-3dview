/**
 * InteractionManager — OrbitControls + Raycaster 拾取选中
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class InteractionManager extends EventTarget {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.WebGLRenderer} renderer
   */
  constructor(camera, renderer) {
    super();
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = renderer.domElement;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    /** @type {THREE.Mesh | null} */
    this.hoveredObject = null;
    /** @type {THREE.Mesh | null} */
    this.selectedObject = null;

    /** @type {THREE.Object3D[]} 可选中对象列表 */
    this.selectableObjects = [];

    // 高亮材质缓存
    this._originalMaterials = new WeakMap();

    this._initControls();
    this._initEvents();
  }

  /* ---- OrbitControls ---- */
  _initControls() {
    this.controls = new OrbitControls(this.camera, this.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 100;
    this.controls.maxPolarAngle = Math.PI * 0.9;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  /* ---- Events ---- */
  _initEvents() {
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onClick = (e) => this._handleClick(e);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('click', this._onClick);
  }

  /**
   * 更新可选中对象列表
   * @param {THREE.Object3D[]} objects
   */
  setSelectableObjects(objects) {
    this.selectableObjects = objects;
  }

  _isObjectVisibleForRaycast(object) {
    let current = object;
    while (current) {
      if (current.visible === false) {
        return false;
      }
      current = current.parent;
    }
    return true;
  }

  _intersectSelectableObjects() {
    const visibleObjects = this.selectableObjects.filter((object) => this._isObjectVisibleForRaycast(object));
    return this.raycaster.intersectObjects(visibleObjects, false);
  }

  /* ---- Pointer Move → Hover ---- */
  _handlePointerMove(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
  const intersects = this._intersectSelectableObjects();

    const hit = intersects.length > 0 ? intersects[0].object : null;

    // 离开上一个 hover
    if (this.hoveredObject && this.hoveredObject !== hit && this.hoveredObject !== this.selectedObject) {
      this._restoreMaterial(this.hoveredObject);
    }

    // 进入新 hover
    if (hit && hit !== this.hoveredObject && hit !== this.selectedObject) {
      this._applyHoverMaterial(hit);
    }

    this.hoveredObject = hit;

    // 光标样式
    document.body.classList.toggle('cursor-pointer', !!hit);
  }

  /* ---- Click → Select ---- */
  _handleClick(event) {
    // 排除 UI 元素上的点击
    if (event.target !== this.domElement) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);
  const intersects = this._intersectSelectableObjects();

    const hit = intersects.length > 0 ? intersects[0].object : null;

    // 取消上一个选中
    if (this.selectedObject && this.selectedObject !== hit) {
      this._restoreMaterial(this.selectedObject);
      this.selectedObject = null;
    }

    if (hit) {
      this.selectedObject = hit;
      this._applySelectMaterial(hit);
      this.dispatchEvent(new CustomEvent('select', { detail: { object: hit, harnessId: hit.userData.harnessId } }));
    } else {
      this.selectedObject = null;
      this.dispatchEvent(new CustomEvent('deselect'));
    }
  }

  /* ---- Material Swap Helpers ---- */
  _saveMaterial(obj) {
    if (!obj || !obj.material) return;
    if (!this._originalMaterials.has(obj)) {
      this._originalMaterials.set(obj, obj.material);
    }
  }

  _restoreMaterial(obj) {
    if (!obj) return;
    const original = this._originalMaterials.get(obj);
    if (original) {
      obj.material = original;
    }
  }

  clearMaterialCache() {
    // 给选取状态下的对象恢复到最新材质（如果被外部强制更改了原本材质，可以直接重置）
    if (this.selectedObject) {
      this._restoreMaterial(this.selectedObject);
    }
    if (this.hoveredObject) {
      this._restoreMaterial(this.hoveredObject);
    }
    this._originalMaterials = new WeakMap();
  }

  _applyHoverMaterial(obj) {
    this._saveMaterial(obj);
    const hoverMat = obj.material.clone();
    hoverMat.emissive = new THREE.Color(0x38bdf8);
    hoverMat.emissiveIntensity = 0.15;
    obj.material = hoverMat;
  }

  _applySelectMaterial(obj) {
    this._saveMaterial(obj);
    const selectMat = obj.material.clone();
    selectMat.emissive = new THREE.Color(0x38bdf8);
    selectMat.emissiveIntensity = 0.35;
    obj.material = selectMat;
  }

  /* ---- Per-frame update ---- */
  update() {
    this.controls.update();
  }

  /* ---- Fit camera to bounds ---- */
  fitToObjects(objects) {
    if (!objects || objects.length === 0) return;

    const box = new THREE.Box3();
    for (const obj of objects) {
      box.expandByObject(obj);
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let distance = maxDim / (2 * Math.tan(fov / 2));
    distance *= 1.8; // 留出边距

    const direction = new THREE.Vector3(1, 0.7, 1).normalize();
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.controls.target.copy(center);
    this.controls.update();
  }

  /* ---- Cleanup ---- */
  dispose() {
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('click', this._onClick);
    this.controls.dispose();
  }
}
