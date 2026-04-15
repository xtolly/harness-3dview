import * as THREE from 'three';

/**
 * HeatmapGenerator - 生成及管理线束的 1D 热力带纹理
 */
export class HeatmapGenerator {
  /**
   * 将数值数组映射并绘制生成一维渐变纹理 (CanvasTexture)
   *
   * @param {number[]} values 沿路径分布的热力值
   * @param {number} globalMin 全局最小值
   * @param {number} globalMax 全局最大值
   * @returns {THREE.CanvasTexture}
   */
  static generateTexture(values, globalMin = 0, globalMax = 100) {
    if (!values || values.length === 0) {
      values = [globalMin];
    }

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // 由于 TubeGeometry 中 u 或者 v 可能代表长度，为了兼容，
    // 这里我们直接画一个横着的线性渐变，并保证两维度的填充
    const gradient = ctx.createLinearGradient(0, 0, size, 0);

    const count = values.length;
    for (let i = 0; i < count; i++) {
      let val = values[i];
      let normalized = (val - globalMin) / (globalMax - globalMin || 1); 
      normalized = Math.max(0, Math.min(1, normalized)); // Clamp 至 [0, 1]

      const pos = count > 1 ? i / (count - 1) : 0;
      const color = this.getColorForValue(normalized);
      gradient.addColorStop(pos, color);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size); 

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    // clamp to edge 防止两端值异常
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    
    return texture;
  }

  /**
   * 将 0~1 的规范化值转换为冷暖颜色
   * 0.0 -> Blue, 0.5 -> Green, 1.0 -> Red
   * @param {number} val 规范化数据 (0.0 到 1.0)
   * @returns {string} 色彩格式为 HSL 字符串
   */
  static getColorForValue(val) {
    val = Math.max(0, Math.min(1, val));
    // 240 是蓝色，0 是红色
    const hue = (1.0 - val) * 240;
    return `hsl(${Math.round(hue)}, 100%, 50%)`;
  }
}
