import * as THREE from 'three';

export class VolumeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.volumeMesh = null;
    this.volumeHelper = null;
    this.dataTexture = null;
    this.material = null;
  }

  /**
   * 生成并显示基于光线步进 (Raymarching) 的三维体积云
   * @param {Object} densityResult
   */
  createVolume(densityResult, sceneOpacity = 0.4) {
    this.clear();

    const { volumeData, width, height, depth, bounds, voxelSize } = densityResult;

    if (!volumeData || volumeData.length === 0) return;

    // 1. Data3DTexture
    this.dataTexture = new THREE.Data3DTexture(volumeData, width, height, depth);
    this.dataTexture.format = THREE.RedFormat;
    this.dataTexture.type = THREE.UnsignedByteType;
    this.dataTexture.minFilter = THREE.LinearFilter;
    this.dataTexture.magFilter = THREE.LinearFilter;
    this.dataTexture.unpackAlignment = 1;
    this.dataTexture.needsUpdate = true;

    // 世界坐标系原点
    const vMinX = (bounds.minX - 0.5) * voxelSize;
    const vMinY = (bounds.minY - 0.5) * voxelSize;
    const vMinZ = (bounds.minZ - 0.5) * voxelSize;
    
    // 包围盒真实度量距离
    const dimX = width * voxelSize;
    const dimY = height * voxelSize;
    const dimZ = depth * voxelSize;

    const bMin = new THREE.Vector3(vMinX, vMinY, vMinZ);
    const bMax = new THREE.Vector3(vMinX + dimX, vMinY + dimY, vMinZ + dimZ);

    const vertexShader = `
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;

    const fragmentShader = `
      precision highp float;
      precision highp sampler3D;

      uniform sampler3D uData3D;
      uniform vec3 uBoundsMin;
      uniform vec3 uBoundsMax;
      uniform float uVoxelSize;
      uniform float uOpacity;

      varying vec3 vWorldPos;

      vec3 hue2rgb(float hue) {
         float R = abs(hue * 6.0 - 3.0) - 1.0;
         float G = 2.0 - abs(hue * 6.0 - 2.0);
         float B = 2.0 - abs(hue * 6.0 - 4.0);
         return clamp(vec3(R,G,B), 0.0, 1.0);
      }

      vec2 hitBox(vec3 orig, vec3 dir) {
          vec3 box_min = uBoundsMin;
          vec3 box_max = uBoundsMax;
          vec3 inv_dir = 1.0 / dir;
          vec3 tmin_tmp = (box_min - orig) * inv_dir;
          vec3 tmax_tmp = (box_max - orig) * inv_dir;
          vec3 tmin = min(tmin_tmp, tmax_tmp);
          vec3 tmax = max(tmin_tmp, tmax_tmp);
          float t0 = max(tmin.x, max(tmin.y, tmin.z));
          float t1 = min(tmax.x, min(tmax.y, tmax.z));
          return vec2(t0, t1);
      }

      void main() {
        vec3 rayDir = normalize(vWorldPos - cameraPosition);

        vec2 boundsHit = hitBox(cameraPosition, rayDir);
        // 如果不在包围盒视线范围内则丢弃
        if (boundsHit.x > boundsHit.y) discard;

        // 如果相机在盒子里，距离取0，否则从盒子表面(x)进入
        float tNear = max(0.0, boundsHit.x);
        float tFar = boundsHit.y;

        float t = tNear;
        // 追踪细分精度: 取半个网格尺寸
        float stepSize = uVoxelSize * 0.5; 
        
        vec4 accColor = vec4(0.0);
        vec3 boundsDim = uBoundsMax - uBoundsMin;

        // 执行光学射线行进累加 (限制最高运算次数以防由于缩放问题导致的极端性能消耗)
        for (int i = 0; i < 500; i++) {
            if (t > tFar || accColor.a >= 0.99) break;

            vec3 pos = cameraPosition + rayDir * t;
            vec3 uvw = (pos - uBoundsMin) / boundsDim;

            float rawDensity = texture(uData3D, uvw).r;
            
            // 没有线的地方不需要发光：绝对抛弃所有无密度的空气片段！
            if (rawDensity <= 0.01) {
                t += stepSize;
                continue;
            }

            // 放缩与提频：解决由于极个别超级密集点导致全屏都处于“稀疏状态”（即蓝色）的问题。
            float renderDensity = clamp(rawDensity * 3.0, 0.0, 1.0);

            float hue = (1.0 - renderDensity) * 0.666;
            vec3 color = hue2rgb(hue) * 1.5;

            // 让核心密集区阻力增强，稀疏发光区阻力小
            float stepAlpha = mix(0.01, 0.12, renderDensity) * uOpacity;
            
            vec3 c = color * stepAlpha;

            // 标准积分解混色 (Src OVER Dst)
            accColor.rgb += c * (1.0 - accColor.a);
            accColor.a += stepAlpha * (1.0 - accColor.a);

            t += stepSize;
        }

        if (accColor.a == 0.0) discard;
        gl_FragColor = accColor;
      }
    `;

    // 2. 将此 Shader 赋予覆盖全部空间的一个单一边框 
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uData3D: { value: this.dataTexture },
        uBoundsMin: { value: bMin },
        uBoundsMax: { value: bMax },
        uVoxelSize: { value: voxelSize },
        uOpacity: { value: sceneOpacity },
      },
      transparent: true,
      depthWrite: false, // 保证体积云被内部模型遮挡正确
      side: THREE.BackSide, 
      blending: THREE.NormalBlending
    });

    const boxGeom = new THREE.BoxGeometry(dimX, dimY, dimZ);
    this.volumeMesh = new THREE.Mesh(boxGeom, this.material);
    this.volumeMesh.position.set(bMin.x + dimX / 2, bMin.y + dimY / 2, bMin.z + dimZ / 2);
    // 渲染层级调高一点，确保实体背景线束先渲染
    this.volumeMesh.renderOrder = 100;

    // 绘制一个真实可见的深蓝色界限框 (Bounding Box 实体线框) 以标明分析界域
    this.volumeHelper = new THREE.BoxHelper(this.volumeMesh, 0x1e3a8a);
    this.volumeHelper.material.transparent = true;
    this.volumeHelper.material.opacity = 0.5;

    this.scene.add(this.volumeMesh);
    this.scene.add(this.volumeHelper);
  }

  setOpacity(opacity) {
    if (this.material) {
      this.material.uniforms.uOpacity.value = opacity;
    }
  }

  clear() {
    if (this.volumeHelper) {
      this.scene.remove(this.volumeHelper);
      this.volumeHelper.dispose();
      this.volumeHelper = null;
    }
    if (this.volumeMesh) {
      this.scene.remove(this.volumeMesh);
      this.volumeMesh.geometry.dispose();
      this.volumeMesh = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    if (this.dataTexture) {
      this.dataTexture.dispose();
      this.dataTexture = null;
    }
  }
}
