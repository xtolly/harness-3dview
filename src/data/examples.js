/**
 * examples.js — 预置示例线束数据
 *
 * 每个示例包含: name, points, pathOptions, crossSection, material
 */

/** 示例线束组 1：多条不同走向的线束 */
export const EXAMPLE_SET_1 = [
  {
    name: 'S形线束',
    points: [
      { x: -8, y: 0, z: 0 },
      { x: -5, y: 3, z: 2 },
      { x: -2, y: 0, z: -1 },
      { x: 1, y: 4, z: 3 },
      { x: 4, y: 1, z: 0 },
      { x: 7, y: 3, z: -2 },
      { x: 10, y: 0, z: 1 },
    ],
    pathOptions: { tension: 0.5, segments: 80 },
    crossSection: { type: 'circular', radius: 0.25 },
  },
  {
    name: '直角弯管',
    points: [
      { x: -6, y: 0, z: -4 },
      { x: -6, y: 0, z: -1 },
      { x: -6, y: 3, z: 0 },
      { x: -3, y: 5, z: 0 },
      { x: 0, y: 5, z: 0 },
      { x: 3, y: 5, z: 0 },
      { x: 3, y: 3, z: -2 },
      { x: 3, y: 0, z: -4 },
    ],
    pathOptions: { tension: 0.4, segments: 96 },
    crossSection: { type: 'rectangular', width: 0.5, height: 0.3, cornerRadius: 0.06 },
  },
  {
    name: '螺旋上升线束',
    points: (() => {
      const pts = [];
      for (let i = 0; i <= 36; i++) {
        const t = i / 36;
        const angle = t * Math.PI * 4; // 两圈
        pts.push({
          x: Math.cos(angle) * (3 + t * 2),
          y: t * 8,
          z: Math.sin(angle) * (3 + t * 2),
        });
      }
      return pts;
    })(),
    pathOptions: { tension: 0.6, segments: 128 },
    crossSection: { type: 'circular', radius: 0.15 },
  },
  {
    name: '底部走线',
    points: [
      { x: -7, y: -0.5, z: 5 },
      { x: -4, y: -0.5, z: 5 },
      { x: -2, y: -0.5, z: 3 },
      { x: 0, y: -0.5, z: 3 },
      { x: 2, y: -0.5, z: 5 },
      { x: 5, y: -0.5, z: 5 },
      { x: 8, y: -0.5, z: 3 },
    ],
    pathOptions: { tension: 0.35, segments: 64 },
    crossSection: { type: 'rectangular', width: 1.2, height: 0.2, cornerRadius: 0.04 },
  },
];

/** 单条示例（用于"添加示例"按钮） */
export const RANDOM_EXAMPLES = [
  {
    name: '随机曲线A',
    generator: () => {
      const pts = [];
      const ox = (Math.random() - 0.5) * 10;
      const oz = (Math.random() - 0.5) * 10;
      for (let i = 0; i < 6; i++) {
        pts.push({
          x: ox + (i - 2.5) * 3,
          y: Math.random() * 5,
          z: oz + (Math.random() - 0.5) * 6,
        });
      }
      return pts;
    },
    crossSection: { type: 'circular', radius: 0.2 },
  },
  {
    name: '随机扁线B',
    generator: () => {
      const pts = [];
      const oy = Math.random() * 3;
      for (let i = 0; i < 7; i++) {
        const angle = (i / 6) * Math.PI * 1.5;
        pts.push({
          x: Math.cos(angle) * (3 + Math.random() * 2),
          y: oy + Math.sin(angle * 0.5) * 2,
          z: Math.sin(angle) * (3 + Math.random() * 2),
        });
      }
      return pts;
    },
    crossSection: { type: 'rectangular', width: 0.6, height: 0.15, cornerRadius: 0.03 },
  },
];

let randomIndex = 0;

/**
 * 获取一条随机示例线束配置
 * @param {Object} pathParams - 全局路径参数 { tension, segments, curveType }
 * @returns {Object} harness config
 */
export function getRandomExample(pathParams = {}) {
  const template = RANDOM_EXAMPLES[randomIndex % RANDOM_EXAMPLES.length];
  randomIndex++;

  const points = template.generator();

  return {
    name: `${template.name}_${Date.now().toString(36)}`,
    points,
    pathOptions: {
      tension: pathParams.tension ?? 0.5,
      segments: pathParams.segments ?? 64,
      curveType: pathParams.curveType ?? 'catmullrom',
    },
    crossSection: { ...template.crossSection },
  };
}
