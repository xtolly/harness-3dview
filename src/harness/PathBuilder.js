/**
 * PathBuilder — 路径构建器
 *
 * 从控制点数组创建 Three.js 曲线路径，支持：
 *   - CatmullRom 样条曲线（默认）
 *   - 折线（tension = 0 时退化）
 *   - 闭合路径
 *   - 平滑度 (tension) 与细分数 (segments) 控制
 */
import * as THREE from 'three';

export class PathBuilder {
  /**
   * 从三维控制点数组创建路径
   *
   * @param {Array<{x:number, y:number, z:number}>} points - 控制点
   * @param {Object} [options]
   * @param {number}  [options.tension=0.5]   - 平滑度 0~1 (0=折线, 1=最平滑)
   * @param {boolean} [options.closed=false]  - 是否闭合
   * @param {number}  [options.segments=64]   - 曲线细分数
   * @param {'catmullrom'|'centripetal'|'chordal'} [options.curveType='catmullrom']
   * @returns {{ curve: THREE.CatmullRomCurve3, segments: number }}
   */
  static fromPoints(points, options = {}) {
    const {
      tension = 0.5,
      closed = false,
      segments = 64,
      curveType = 'catmullrom',
    } = options;

    const vectors = points.map(p => new THREE.Vector3(p.x, p.y, p.z));

    const curve = new THREE.CatmullRomCurve3(vectors, closed, curveType, tension);

    return { curve, segments };
  }

  /**
   * 从 JSON 数据创建路径
   *
   * @param {Object} json
   * @param {Array<{x:number, y:number, z:number}>} json.points
   * @param {number} [json.tension]
   * @param {boolean} [json.closed]
   * @param {number} [json.segments]
   * @param {string} [json.curveType]
   * @returns {{ curve: THREE.CatmullRomCurve3, segments: number }}
   */
  static fromJSON(json) {
    return PathBuilder.fromPoints(json.points, {
      tension: json.tension,
      closed: json.closed,
      segments: json.segments,
      curveType: json.curveType,
    });
  }

  /**
   * 从直线段连接的点集创建分段线性路径
   * （使用极低 tension 的 CatmullRom 近似折线）
   *
   * @param {Array<{x:number, y:number, z:number}>} points
   * @param {number} [segments=32]
   * @returns {{ curve: THREE.CatmullRomCurve3, segments: number }}
   */
  static fromLinearPoints(points, segments = 32) {
    return PathBuilder.fromPoints(points, { tension: 0, segments });
  }

  /**
   * 获取路径的总长度
   * @param {THREE.Curve} curve
   * @returns {number}
   */
  static getLength(curve) {
    return curve.getLength();
  }

  /**
   * 获取路径上均匀采样的点
   * @param {THREE.Curve} curve
   * @param {number} count
   * @returns {THREE.Vector3[]}
   */
  static samplePoints(curve, count) {
    return curve.getSpacedPoints(count);
  }
}
