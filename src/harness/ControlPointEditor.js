/**
 * ControlPointEditor — 控制点可视化 + 拖拽编辑
 *
 * 选中线束后：
 *   1. 在路径控制点位置显示可交互的球体
 *   2. 支持拖拽球体来调整路径
 *   3. 拖拽过程中实时更新线束几何体
 */
import * as THREE from 'three';
import { DragControls } from 'three/addons/controls/DragControls.js';

const POINT_RADIUS = 0.22;
const POINT_COLOR_NORMAL = 0x38bdf8;
const POINT_COLOR_HOVER = 0xfbbf24;
const POINT_COLOR_DRAG = 0xf87171;
const LINE_COLOR = 0x38bdf8;

export class ControlPointEditor {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('../core/InteractionManager.js').InteractionManager} interaction
   * @param {import('../harness/HarnessManager.js').HarnessManager} harnessManager
   */
  constructor(scene, camera, renderer, interaction, harnessManager) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.interaction = interaction;
    this.harnessManager = harnessManager;

    /** @type {THREE.Group} 控制点组 */
    this.cpGroup = new THREE.Group();
    this.cpGroup.name = 'control_points';
    this.scene.add(this.cpGroup);

    /** @type {THREE.Mesh[]} 当前显示的控制点球体 */
    this.pointMeshes = [];

    /** @type {THREE.Line | null} 连接线 */
    this.connectingLine = null;

    /** @type {string | null} 当前编辑的线束 ID */
    this.activeHarnessId = null;

    /** @type {DragControls | null} */
    this.dragControls = null;

    // 共享几何体和材质
    this._pointGeometry = new THREE.SphereGeometry(POINT_RADIUS, 16, 12);
    this._pointMaterial = new THREE.MeshStandardMaterial({
      color: POINT_COLOR_NORMAL,
      emissive: POINT_COLOR_NORMAL,
      emissiveIntensity: 0.3,
      metalness: 0.5,
      roughness: 0.3,
    });
    this._lineMaterial = new THREE.LineBasicMaterial({
      color: LINE_COLOR,
      transparent: true,
      opacity: 0.5,
      linewidth: 1,
    });
  }

  /**
   * 显示指定线束的控制点
   * @param {string} harnessId
   */
  show(harnessId) {
    // 先清除旧的
    this.hide();

    const data = this.harnessManager.harnessData.get(harnessId);
    if (!data) return;

    this.activeHarnessId = harnessId;
    const points = data.points;

    // 创建控制点球体
    for (let i = 0; i < points.length; i++) {
      const mesh = new THREE.Mesh(
        this._pointGeometry,
        this._pointMaterial.clone(),
      );
      mesh.position.set(points[i].x, points[i].y, points[i].z);
      mesh.userData.controlPointIndex = i;
      mesh.userData.harnessId = harnessId;
      mesh.userData.isControlPoint = true;
      mesh.name = `cp_${harnessId}_${i}`;
      this.cpGroup.add(mesh);
      this.pointMeshes.push(mesh);
    }

    // 创建连接线
    this._updateConnectingLine();

    // 初始化拖拽控制
    this._initDragControls();
  }

  /**
   * 隐藏控制点
   */
  hide() {
    // 销毁拖拽控制器
    if (this.dragControls) {
      this.dragControls.dispose();
      this.dragControls = null;
    }

    // 清除球体
    for (const mesh of this.pointMeshes) {
      mesh.material.dispose();
      this.cpGroup.remove(mesh);
    }
    this.pointMeshes = [];

    // 清除连接线
    if (this.connectingLine) {
      this.connectingLine.geometry.dispose();
      this.cpGroup.remove(this.connectingLine);
      this.connectingLine = null;
    }

    this.activeHarnessId = null;
  }

  /**
   * 初始化拖拽控制
   */
  _initDragControls() {
    if (this.dragControls) {
      this.dragControls.dispose();
    }

    this.dragControls = new DragControls(
      this.pointMeshes,
      this.camera,
      this.renderer.domElement,
    );

    // 拖拽开始 — 禁用 OrbitControls + 变色
    this.dragControls.addEventListener('dragstart', (event) => {
      this.interaction.controls.enabled = false;
      event.object.material.color.set(POINT_COLOR_DRAG);
      event.object.material.emissive.set(POINT_COLOR_DRAG);
      event.object.material.emissiveIntensity = 0.5;
    });

    // 拖拽中 — 实时更新路径
    this.dragControls.addEventListener('drag', (event) => {
      this._onPointDragged(event.object);
    });

    // 拖拽结束 — 恢复 OrbitControls + 恢复颜色
    this.dragControls.addEventListener('dragend', (event) => {
      this.interaction.controls.enabled = true;
      event.object.material.color.set(POINT_COLOR_NORMAL);
      event.object.material.emissive.set(POINT_COLOR_NORMAL);
      event.object.material.emissiveIntensity = 0.3;
    });

    // 悬停效果
    this.dragControls.addEventListener('hoveron', (event) => {
      event.object.material.color.set(POINT_COLOR_HOVER);
      event.object.material.emissive.set(POINT_COLOR_HOVER);
      document.body.classList.add('cursor-pointer');
    });

    this.dragControls.addEventListener('hoveroff', (event) => {
      if (event.object.material.color.getHex() !== POINT_COLOR_DRAG) {
        event.object.material.color.set(POINT_COLOR_NORMAL);
        event.object.material.emissive.set(POINT_COLOR_NORMAL);
      }
      document.body.classList.remove('cursor-pointer');
    });
  }

  /**
   * 控制点被拖拽时更新路径
   * @param {THREE.Mesh} pointMesh
   */
  _onPointDragged(pointMesh) {
    const idx = pointMesh.userData.controlPointIndex;
    const id = pointMesh.userData.harnessId;

    const data = this.harnessManager.harnessData.get(id);
    if (!data) return;

    // 更新控制点数据
    data.points[idx] = {
      x: pointMesh.position.x,
      y: pointMesh.position.y,
      z: pointMesh.position.z,
    };

    // 重建路径和几何体
    this.harnessManager.updatePathOptions(id, {});

    // 更新选中对象列表（几何体已变）
    this.interaction.setSelectableObjects(
      this.harnessManager.getSelectableObjects(),
    );

    // 更新连接线
    this._updateConnectingLine();
  }

  /**
   * 更新控制点之间的连接线
   */
  _updateConnectingLine() {
    if (this.connectingLine) {
      this.connectingLine.geometry.dispose();
      this.cpGroup.remove(this.connectingLine);
    }

    if (this.pointMeshes.length < 2) return;

    const linePoints = this.pointMeshes.map((m) => m.position.clone());
    const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    this.connectingLine = new THREE.Line(geometry, this._lineMaterial);
    this.connectingLine.name = 'cp_connecting_line';
    this.cpGroup.add(this.connectingLine);
  }

  /**
   * 当前是否有活动的控制点编辑
   */
  get isActive() {
    return this.activeHarnessId !== null;
  }

  /**
   * 释放资源
   */
  dispose() {
    this.hide();
    this._pointGeometry.dispose();
    this._pointMaterial.dispose();
    this._lineMaterial.dispose();
    this.scene.remove(this.cpGroup);
  }
}
