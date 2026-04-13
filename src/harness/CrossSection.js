/**
 * CrossSection — 截面定义
 *
 * 生成用于挤出的 Shape 对象，支持：
 *   - 圆形截面
 *   - 矩形截面（可选圆角）
 *   - 自定义多边形截面
 */
import * as THREE from 'three';

export class CrossSection {
  /**
   * 圆形截面
   * @param {number} radius - 半径
   * @param {number} [segmentsCount=16] - 圆周细分数
   * @returns {{ type: 'circular', shape: THREE.Shape, radius: number, params: Object }}
   */
  static circular(radius = 0.3, segmentsCount = 16) {
    const shape = new THREE.Shape();
    const angleStep = (Math.PI * 2) / segmentsCount;

    shape.moveTo(radius, 0);
    for (let i = 1; i <= segmentsCount; i++) {
      const angle = i * angleStep;
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

    return {
      type: 'circular',
      shape,
      radius,
      params: { radius, segments: segmentsCount },
    };
  }

  /**
   * 矩形截面（可选圆角）
   * @param {number} width
   * @param {number} height
   * @param {number} [cornerRadius=0] - 圆角半径
   * @returns {{ type: 'rectangular', shape: THREE.Shape, params: Object }}
   */
  static rectangular(width = 0.6, height = 0.3, cornerRadius = 0) {
    const shape = new THREE.Shape();
    const hw = width / 2;
    const hh = height / 2;
    const cr = Math.min(cornerRadius, Math.min(hw, hh));

    if (cr > 0) {
      // 圆角矩形
      shape.moveTo(-hw + cr, -hh);
      shape.lineTo(hw - cr, -hh);
      shape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
      shape.lineTo(hw, hh - cr);
      shape.quadraticCurveTo(hw, hh, hw - cr, hh);
      shape.lineTo(-hw + cr, hh);
      shape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
      shape.lineTo(-hw, -hh + cr);
      shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
    } else {
      // 直角矩形
      shape.moveTo(-hw, -hh);
      shape.lineTo(hw, -hh);
      shape.lineTo(hw, hh);
      shape.lineTo(-hw, hh);
      shape.lineTo(-hw, -hh);
    }

    return {
      type: 'rectangular',
      shape,
      params: { width, height, cornerRadius: cr },
    };
  }

  /**
   * 自定义多边形截面
   * @param {Array<{x:number, y:number}>} points - 2D 点集（顺时针或逆时针）
   * @returns {{ type: 'custom', shape: THREE.Shape, params: Object }}
   */
  static custom(points) {
    const shape = new THREE.Shape();
    if (points.length < 3) {
      throw new Error('自定义截面至少需要 3 个点');
    }

    shape.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x, points[i].y);
    }
    shape.lineTo(points[0].x, points[0].y); // 闭合

    return {
      type: 'custom',
      shape,
      params: { pointCount: points.length },
    };
  }

  /**
   * 获取截面的可读描述
   * @param {{ type: string, params: Object }} crossSection
   * @returns {string}
   */
  static describe(crossSection) {
    switch (crossSection.type) {
      case 'circular':
        return `圆形 R=${crossSection.params.radius.toFixed(2)}`;
      case 'rectangular': {
        const { width, height, cornerRadius } = crossSection.params;
        const base = `矩形 ${width.toFixed(2)}×${height.toFixed(2)}`;
        return cornerRadius > 0 ? `${base} R${cornerRadius.toFixed(2)}` : base;
      }
      case 'custom':
        return `自定义 (${crossSection.params.pointCount}点)`;
      default:
        return '未知截面';
    }
  }
}
