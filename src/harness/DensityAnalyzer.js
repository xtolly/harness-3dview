import * as THREE from 'three';

export class DensityAnalyzer {
  /**
   * 计算指定线束列表的全局 3D 空间密度场
   * @param {Array<{id: string, curve: THREE.Curve, length: number}>} harnessList 
   * @param {Object} options 
   * @param {number} options.sampleStep 采样步长（模型单位）
   * @param {number} options.voxelSize 哈希网格尺寸
   * @returns {Object} { volumeData: Uint8Array, width, height, depth, bounds, occupiedVoxels, globalMax }
   */
  static analyze(harnessList, options = {}) {
    const {
      sampleStep = 0.5,
      voxelSize = 0.5,
    } = options;

    const grid = new Map();

    const getGridKey = (ix, iy, iz) => `${ix},${iy},${iz}`;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    // 1. 第一遍分布采样
    for (const harness of harnessList) {
      if (!harness.curve) continue;

      const length = harness.length || harness.curve.getLength();
      const numPoints = Math.max(2, Math.ceil(length / sampleStep) + 1);
      const points = harness.curve.getSpacedPoints(numPoints - 1);

      for (const p of points) {
        const ix = Math.floor(p.x / voxelSize);
        const iy = Math.floor(p.y / voxelSize);
        const iz = Math.floor(p.z / voxelSize);
        
        minX = Math.min(minX, ix); minY = Math.min(minY, iy); minZ = Math.min(minZ, iz);
        maxX = Math.max(maxX, ix); maxY = Math.max(maxY, iy); maxZ = Math.max(maxZ, iz);

        const key = getGridKey(ix, iy, iz);
        grid.set(key, (grid.get(key) || 0) + 1);
      }
    }

    if (grid.size === 0) {
       return { volumeData: new Uint8Array(0), width: 0, height: 0, depth: 0, globalMax: 0, occupiedVoxels: [] };
    }

    // 限定最大边界以免内存溢出 (Limit max volume size to prevent OOM)
    // 假设场景非常大，限制单边最大 256
    const MAX_DIM = 256;
    let width = maxX - minX + 1;
    let height = maxY - minY + 1;
    let depth = maxZ - minZ + 1;

    // Safety checks
    if (width > MAX_DIM) { width = MAX_DIM; maxX = minX + MAX_DIM - 1; }
    if (height > MAX_DIM) { height = MAX_DIM; maxY = minY + MAX_DIM - 1; }
    if (depth > MAX_DIM) { depth = MAX_DIM; maxZ = minZ + MAX_DIM - 1; }

    const volumeSize = width * height * depth;
    const volumeData = new Float32Array(volumeSize);
    
    // WebGL Data3DTexture Indexing: x + y*w + z*w*h
    const getIndex = (x, y, z) => x + (y * width) + (z * width * height);

    let globalMax = 0;
    const occupiedVoxels = [];

    // 2. 第二次遍历：计算密度 (3x3x3 neighborhood) 并写入三维数组
    // 为了性能，我们只计算非空网格的邻域膨胀
    const processedVoxels = new Set();
    
    for (const [key, _] of grid.entries()) {
      const [sx, sy, sz] = key.split(',').map(Number);
      
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const tx = sx + dx;
            const ty = sy + dy;
            const tz = sz + dz;
            
            // Check bounds
            if (tx < minX || tx > maxX || ty < minY || ty > maxY || tz < minZ || tz > maxZ) continue;
            
            const targetKey = getGridKey(tx, ty, tz);
            if (processedVoxels.has(targetKey)) continue;
            processedVoxels.add(targetKey);

            // Calculate density
            let density = 0;
            for (let nx = -1; nx <= 1; nx++) {
              for (let ny = -1; ny <= 1; ny++) {
                for (let nz = -1; nz <= 1; nz++) {
                  const nKey = getGridKey(tx + nx, ty + ny, tz + nz);
                  if (grid.has(nKey)) {
                    density += grid.get(nKey);
                  }
                }
              }
            }

            if (density > 0) {
              const lx = tx - minX;
              const ly = ty - minY;
              const lz = tz - minZ;
              const idx = getIndex(lx, ly, lz);
              volumeData[idx] = density;
              if (density > globalMax) globalMax = density;

              occupiedVoxels.push({ ix: tx, iy: ty, iz: tz, density });
            }
          }
        }
      }
    }

    // 3. 把 Float32Array 转成 Uint8Array (Data3DTexture 支持更广，且内存更小)
    // 核心修改：为了【统一标准】，我们不能再用场景最大的密度线算相对归一化！
    // 计算单条线束跨越 3x3x3 邻域时预计会产生的基准密度点数
    const pointsPerUnit = 1.0 / sampleStep;
    const neighborhoodSize = 3.0 * voxelSize; 
    const singleWireDensity = neighborhoodSize * pointsPerUnit; // 标准化大约为 3
    
    // 统一定义极限重叠根数(比如 12 根算最大阈值，配合后期的 clamp*3 实际达到 4根 即报高危红警)
    const CONGESTION_WIRES = 12;
    const absoluteMax = singleWireDensity * CONGESTION_WIRES;

    const uint8Volume = new Uint8Array(volumeSize);
    for (let i = 0; i < volumeSize; i++) {
      uint8Volume[i] = Math.max(0, Math.min(255, Math.floor((volumeData[i] / absoluteMax) * 255)));
    }

    return {
      volumeData: uint8Volume,
      width,
      height,
      depth,
      bounds: { minX, minY, minZ, maxX, maxY, maxZ },
      voxelSize,
      globalMax,
      occupiedVoxels
    };
  }
}
