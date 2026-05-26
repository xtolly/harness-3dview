import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH } from 'three-mesh-bvh';

// ============================================================
//  Marching Cubes 查找表 (经典 256 条目)
// ============================================================

/**
 * 边表：根据 cube 的 8 个顶点的内外状态 (8-bit index)，
 * 查出该 cube 上哪些边被等值面穿过 (12-bit bitmask)。
 */
const EDGE_TABLE = [
  0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
  0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
  0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
  0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
  0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
  0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
  0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
  0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
  0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
  0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
  0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
  0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
  0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
  0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
  0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
  0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
  0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0
];

/**
 * 三角形表：根据 8-bit cube index 查出三角形顶点列表。
 * 每 3 个一组构成一个三角形，-1 表示结束。
 */
const TRI_TABLE = [
  [-1],
  [0, 8, 3, -1],
  [0, 1, 9, -1],
  [1, 8, 3, 9, 8, 1, -1],
  [1, 2, 10, -1],
  [0, 8, 3, 1, 2, 10, -1],
  [9, 2, 10, 0, 2, 9, -1],
  [2, 8, 3, 2, 10, 8, 10, 9, 8, -1],
  [3, 11, 2, -1],
  [0, 11, 2, 8, 11, 0, -1],
  [1, 9, 0, 2, 3, 11, -1],
  [1, 11, 2, 1, 9, 11, 9, 8, 11, -1],
  [3, 10, 1, 11, 10, 3, -1],
  [0, 10, 1, 0, 8, 10, 8, 11, 10, -1],
  [3, 9, 0, 3, 11, 9, 11, 10, 9, -1],
  [9, 8, 10, 10, 8, 11, -1],
  [4, 7, 8, -1],
  [4, 3, 0, 7, 3, 4, -1],
  [0, 1, 9, 8, 4, 7, -1],
  [4, 1, 9, 4, 7, 1, 7, 3, 1, -1],
  [1, 2, 10, 8, 4, 7, -1],
  [3, 4, 7, 3, 0, 4, 1, 2, 10, -1],
  [9, 2, 10, 9, 0, 2, 8, 4, 7, -1],
  [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1],
  [8, 4, 7, 3, 11, 2, -1],
  [11, 4, 7, 11, 2, 4, 2, 0, 4, -1],
  [9, 0, 1, 8, 4, 7, 2, 3, 11, -1],
  [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1],
  [3, 10, 1, 3, 11, 10, 7, 8, 4, -1],
  [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1],
  [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1],
  [4, 7, 11, 4, 11, 9, 9, 11, 10, -1],
  [9, 5, 4, -1],
  [9, 5, 4, 0, 8, 3, -1],
  [0, 5, 4, 1, 5, 0, -1],
  [8, 5, 4, 8, 3, 5, 3, 1, 5, -1],
  [1, 2, 10, 9, 5, 4, -1],
  [3, 0, 8, 1, 2, 10, 4, 9, 5, -1],
  [5, 2, 10, 5, 4, 2, 4, 0, 2, -1],
  [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1],
  [9, 5, 4, 2, 3, 11, -1],
  [0, 11, 2, 0, 8, 11, 4, 9, 5, -1],
  [0, 5, 4, 0, 1, 5, 2, 3, 11, -1],
  [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1],
  [10, 3, 11, 10, 1, 3, 9, 5, 4, -1],
  [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1],
  [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1],
  [5, 4, 8, 5, 8, 10, 10, 8, 11, -1],
  [9, 7, 8, 5, 7, 9, -1],
  [9, 3, 0, 9, 5, 3, 5, 7, 3, -1],
  [0, 7, 8, 0, 1, 7, 1, 5, 7, -1],
  [1, 5, 3, 3, 5, 7, -1],
  [9, 7, 8, 9, 5, 7, 10, 1, 2, -1],
  [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1],
  [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1],
  [2, 10, 5, 2, 5, 3, 3, 5, 7, -1],
  [7, 9, 5, 7, 8, 9, 3, 11, 2, -1],
  [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1],
  [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1],
  [11, 2, 1, 11, 1, 7, 7, 1, 5, -1],
  [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1],
  [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1],
  [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1],
  [11, 10, 5, 7, 11, 5, -1],
  [10, 6, 5, -1],
  [0, 8, 3, 5, 10, 6, -1],
  [9, 0, 1, 5, 10, 6, -1],
  [1, 8, 3, 1, 9, 8, 5, 10, 6, -1],
  [1, 6, 5, 2, 6, 1, -1],
  [1, 6, 5, 1, 2, 6, 3, 0, 8, -1],
  [9, 6, 5, 9, 0, 6, 0, 2, 6, -1],
  [5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1],
  [2, 3, 11, 10, 6, 5, -1],
  [11, 0, 8, 11, 2, 0, 10, 6, 5, -1],
  [0, 1, 9, 2, 3, 11, 5, 10, 6, -1],
  [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1],
  [6, 3, 11, 6, 5, 3, 5, 1, 3, -1],
  [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1],
  [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1],
  [6, 5, 9, 6, 9, 11, 11, 9, 8, -1],
  [5, 10, 6, 4, 7, 8, -1],
  [4, 3, 0, 4, 7, 3, 6, 5, 10, -1],
  [1, 9, 0, 5, 10, 6, 8, 4, 7, -1],
  [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1],
  [6, 1, 2, 6, 5, 1, 4, 7, 8, -1],
  [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1],
  [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1],
  [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1],
  [3, 11, 2, 7, 8, 4, 10, 6, 5, -1],
  [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1],
  [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1],
  [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1],
  [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1],
  [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1],
  [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1],
  [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1],
  [10, 4, 9, 6, 4, 10, -1],
  [4, 10, 6, 4, 9, 10, 0, 8, 3, -1],
  [10, 0, 1, 10, 6, 0, 6, 4, 0, -1],
  [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1],
  [1, 4, 9, 1, 2, 4, 2, 6, 4, -1],
  [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1],
  [0, 2, 4, 4, 2, 6, -1],
  [8, 3, 2, 8, 2, 4, 4, 2, 6, -1],
  [10, 4, 9, 10, 6, 4, 11, 2, 3, -1],
  [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1],
  [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1],
  [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1],
  [9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1],
  [8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1],
  [3, 11, 6, 3, 6, 0, 0, 6, 4, -1],
  [6, 4, 8, 11, 6, 8, -1],
  [7, 10, 6, 7, 8, 10, 8, 9, 10, -1],
  [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1],
  [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1],
  [10, 6, 7, 10, 7, 1, 1, 7, 3, -1],
  [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1],
  [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1],
  [7, 8, 0, 7, 0, 6, 6, 0, 2, -1],
  [7, 3, 2, 6, 7, 2, -1],
  [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1],
  [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1],
  [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1],
  [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1],
  [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1],
  [0, 9, 1, 11, 6, 7, -1],
  [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1],
  [7, 11, 6, -1],
  [7, 6, 11, -1],
  [3, 0, 8, 11, 7, 6, -1],
  [0, 1, 9, 11, 7, 6, -1],
  [8, 1, 9, 8, 3, 1, 11, 7, 6, -1],
  [10, 1, 2, 6, 11, 7, -1],
  [1, 2, 10, 3, 0, 8, 6, 11, 7, -1],
  [2, 9, 0, 2, 10, 9, 6, 11, 7, -1],
  [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1],
  [7, 2, 3, 6, 2, 7, -1],
  [7, 0, 8, 7, 6, 0, 6, 2, 0, -1],
  [2, 7, 6, 2, 3, 7, 0, 1, 9, -1],
  [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1],
  [10, 7, 6, 10, 1, 7, 1, 3, 7, -1],
  [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1],
  [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1],
  [7, 6, 10, 7, 10, 8, 8, 10, 9, -1],
  [6, 8, 4, 11, 8, 6, -1],
  [3, 6, 11, 3, 0, 6, 0, 4, 6, -1],
  [8, 6, 11, 8, 4, 6, 9, 0, 1, -1],
  [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1],
  [6, 8, 4, 6, 11, 8, 2, 10, 1, -1],
  [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1],
  [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1],
  [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1],
  [8, 2, 3, 8, 4, 2, 4, 6, 2, -1],
  [0, 4, 2, 4, 6, 2, -1],
  [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1],
  [1, 9, 4, 1, 4, 2, 2, 4, 6, -1],
  [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1],
  [10, 1, 0, 10, 0, 6, 6, 0, 4, -1],
  [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1],
  [10, 9, 4, 6, 10, 4, -1],
  [4, 9, 5, 7, 6, 11, -1],
  [0, 8, 3, 4, 9, 5, 11, 7, 6, -1],
  [5, 0, 1, 5, 4, 0, 7, 6, 11, -1],
  [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1],
  [9, 5, 4, 10, 1, 2, 7, 6, 11, -1],
  [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1],
  [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1],
  [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1],
  [7, 2, 3, 7, 6, 2, 5, 4, 9, -1],
  [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1],
  [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1],
  [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1],
  [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1],
  [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1],
  [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1],
  [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1],
  [6, 9, 5, 6, 11, 9, 11, 8, 9, -1],
  [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1],
  [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1],
  [6, 11, 3, 6, 3, 5, 5, 3, 1, -1],
  [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1],
  [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1],
  [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1],
  [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1],
  [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1],
  [9, 5, 6, 9, 6, 0, 0, 6, 2, -1],
  [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1],
  [1, 5, 6, 2, 1, 6, -1],
  [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1],
  [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1],
  [0, 3, 8, 5, 6, 10, -1],
  [10, 5, 6, -1],
  [11, 5, 10, 7, 5, 11, -1],
  [11, 5, 10, 11, 7, 5, 8, 3, 0, -1],
  [5, 11, 7, 5, 10, 11, 1, 9, 0, -1],
  [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1],
  [11, 1, 2, 11, 7, 1, 7, 5, 1, -1],
  [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1],
  [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1],
  [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1],
  [2, 5, 10, 2, 3, 5, 3, 7, 5, -1],
  [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1],
  [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1],
  [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1],
  [1, 3, 5, 3, 7, 5, -1],
  [0, 8, 7, 0, 7, 1, 1, 7, 5, -1],
  [9, 0, 3, 9, 3, 5, 5, 3, 7, -1],
  [9, 8, 7, 5, 9, 7, -1],
  [5, 8, 4, 5, 10, 8, 10, 11, 8, -1],
  [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1],
  [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1],
  [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1],
  [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1],
  [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1],
  [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1],
  [9, 4, 5, 2, 11, 3, -1],
  [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1],
  [5, 10, 2, 5, 2, 4, 4, 2, 0, -1],
  [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1],
  [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1],
  [8, 4, 5, 8, 5, 3, 3, 5, 1, -1],
  [0, 4, 5, 1, 0, 5, -1],
  [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1],
  [9, 4, 5, -1],
  [4, 11, 7, 4, 9, 11, 9, 10, 11, -1],
  [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1],
  [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1],
  [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1],
  [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1],
  [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1],
  [11, 7, 4, 11, 4, 2, 2, 4, 0, -1],
  [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1],
  [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1],
  [9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1],
  [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1],
  [1, 10, 2, 8, 7, 4, -1],
  [4, 9, 1, 4, 1, 7, 7, 1, 3, -1],
  [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1],
  [4, 0, 3, 7, 4, 3, -1],
  [4, 8, 7, -1],
  [9, 10, 8, 10, 11, 8, -1],
  [3, 0, 9, 3, 9, 11, 11, 9, 10, -1],
  [0, 1, 10, 0, 10, 8, 8, 10, 11, -1],
  [3, 1, 10, 11, 3, 10, -1],
  [1, 2, 11, 1, 11, 9, 9, 11, 8, -1],
  [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1],
  [0, 2, 11, 8, 0, 11, -1],
  [3, 2, 11, -1],
  [2, 3, 8, 2, 8, 10, 10, 8, 9, -1],
  [9, 10, 2, 0, 9, 2, -1],
  [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1],
  [1, 10, 2, -1],
  [1, 3, 8, 9, 1, 8, -1],
  [0, 9, 1, -1],
  [0, 3, 8, -1],
  [-1]
];

// ============================================================
//  Marching Cubes 边的顶点对 (12条边)
// ============================================================
const EDGE_VERTEX_PAIRS = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
];

// 体素顶点的局部偏移 (cube 8个角)
const CORNER_OFFSETS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
];

// ============================================================
//  EnvelopeManager — SDF 体素化 + Marching Cubes 实现
// ============================================================

export class EnvelopeManager {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.envelopesGroup = new THREE.Group();
    this.envelopesGroup.name = 'envelopes_group';
    this.scene.add(this.envelopesGroup);

    this.envelopes = [];
    this.envelopeIdCounter = 0;
    this.opacity = 0.35;
  }

  // ============================================================
  //  Step 1: 合并模型的所有子 Mesh 几何体到模型局部空间
  // ============================================================

  /**
   * 将模型内所有子 Mesh 的几何体合并为一个 BufferGeometry。
   * 所有子 Mesh 的世界矩阵相对于 model 的世界矩阵做变换，
   * 确保合并后的几何体处于 model 的局部坐标空间。
   *
   * @param {THREE.Object3D} model
   * @returns {THREE.BufferGeometry | null}
   */
  _mergeModelGeometries(model) {
    model.updateMatrixWorld(true);
    const modelWorldMatrixInv = model.matrixWorld.clone().invert();
    const geometries = [];

    model.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;

      const geo = child.geometry.clone();

      // 计算子 Mesh 相对于 model 的变换矩阵
      const relativeMatrix = new THREE.Matrix4()
        .copy(modelWorldMatrixInv)
        .multiply(child.matrixWorld);

      geo.applyMatrix4(relativeMatrix);

      // 确保有 index，否则 mergeGeometries 可能出错
      if (!geo.index) {
        const posCount = geo.attributes.position.count;
        const indices = [];
        for (let i = 0; i < posCount; i++) indices.push(i);
        geo.setIndex(indices);
      }

      // 只保留 position 属性，移除其余属性以避免合并冲突
      const keys = Object.keys(geo.attributes);
      for (const key of keys) {
        if (key !== 'position') geo.deleteAttribute(key);
      }

      geometries.push(geo);
    });

    if (geometries.length === 0) return null;

    try {
      const merged = mergeGeometries(geometries, false);
      // 清理临时几何体
      geometries.forEach(g => g.dispose());
      return merged;
    } catch (e) {
      console.error('[EnvelopeManager] 几何体合并失败:', e);
      geometries.forEach(g => g.dispose());
      return null;
    }
  }

  // ============================================================
  //  Step 2: SDF 体素化采样
  // ============================================================

  /**
   * 在 AABB 范围内对 3D 网格进行 SDF 采样。
   * 对每个体素中心，使用 BVH 的 closestPointToPoint 计算到表面的距离，
   * 并通过 raycast 判断内/外（负/正）。
   *
   * @param {MeshBVH} bvh - 合并几何体的 BVH
   * @param {THREE.BufferGeometry} geometry - 合并后的几何体（用于 raycast 内外判定）
   * @param {THREE.Box3} bounds - 采样范围 (已含 padding)
   * @param {number[]} resolution - [nx, ny, nz] 网格分辨率
   * @param {number} distance - 偏移距离（用于 maxThreshold 剪枝）
   * @returns {Float32Array} SDF 标量场 (nx * ny * nz)
   */
  _buildSDF(bvh, geometry, bounds, resolution, distance) {
    const [nx, ny, nz] = resolution;
    const sdf = new Float32Array(nx * ny * nz);

    const min = bounds.min;
    const size = new THREE.Vector3();
    bounds.getSize(size);

    const stepX = size.x / (nx - 1);
    const stepY = size.y / (ny - 1);
    const stepZ = size.z / (nz - 1);

    const point = new THREE.Vector3();
    const closestTarget = {};

    // 用于内外判定的 ray（沿 +X 方向发射）
    const ray = new THREE.Ray();
    const rayDir = new THREE.Vector3(1, 0, 0);

    // maxThreshold 剪枝：超过此距离的体素不需要精确计算
    const maxThreshold = distance * 2.5;

    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          point.set(
            min.x + ix * stepX,
            min.y + iy * stepY,
            min.z + iz * stepZ
          );

          // BVH 加速最近点查询
          const result = bvh.closestPointToPoint(point, closestTarget, 0, maxThreshold);

          let dist;
          if (result === null) {
            // 超出 maxThreshold，赋一个大距离值
            dist = maxThreshold;
          } else {
            dist = result.distance;
          }

          // 内外判定：从该点沿 +X 射线，统计交点数（奇数 = 内部 → 负值）
          ray.origin.copy(point);
          ray.direction.copy(rayDir);
          const hits = bvh.raycast(ray, THREE.DoubleSide);
          const isInside = (hits.length % 2) === 1;

          sdf[iz * ny * nx + iy * nx + ix] = isInside ? -dist : dist;
        }
      }
    }

    return sdf;
  }

  // ============================================================
  //  Step 3: Marching Cubes 等值面提取
  // ============================================================

  /**
   * 经典 Marching Cubes 算法：从 SDF 标量场提取等值面。
   *
   * @param {Float32Array} sdf - SDF 标量场
   * @param {THREE.Box3} bounds - 采样范围
   * @param {number[]} resolution - [nx, ny, nz]
   * @param {number} isoLevel - 等值面阈值（偏移距离）
   * @returns {THREE.BufferGeometry}
   */
  _marchingCubes(sdf, bounds, resolution, isoLevel) {
    const [nx, ny, nz] = resolution;
    const min = bounds.min;
    const size = new THREE.Vector3();
    bounds.getSize(size);

    const stepX = size.x / (nx - 1);
    const stepY = size.y / (ny - 1);
    const stepZ = size.z / (nz - 1);

    const vertices = [];

    // 辅助函数：获取 SDF 值
    const getSDF = (ix, iy, iz) => sdf[iz * ny * nx + iy * nx + ix];

    // 【优化】预分配 cube 角点数组，避免内层循环中频繁 new Array / new Vector3
    const cornerValues = new Float32Array(8);
    const cornerPositions = [
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
    ];

    // 【优化】预分配边插值点数组和临时向量
    const edgeVertices = new Array(12);
    const edgeVecs = [];
    for (let i = 0; i < 12; i++) edgeVecs.push(new THREE.Vector3());

    // 插值辅助函数：将结果写入预分配的 target 向量，避免 new / clone
    const interpolate = (p1, p2, v1, v2, target) => {
      if (Math.abs(isoLevel - v1) < 1e-10) { target.copy(p1); return; }
      if (Math.abs(isoLevel - v2) < 1e-10) { target.copy(p2); return; }
      if (Math.abs(v1 - v2) < 1e-10) { target.copy(p1); return; }
      const t = (isoLevel - v1) / (v2 - v1);
      target.set(
        p1.x + t * (p2.x - p1.x),
        p1.y + t * (p2.y - p1.y),
        p1.z + t * (p2.z - p1.z)
      );
    };

    // 遍历所有体素
    for (let iz = 0; iz < nz - 1; iz++) {
      for (let iy = 0; iy < ny - 1; iy++) {
        for (let ix = 0; ix < nx - 1; ix++) {
          // 获取 cube 的 8 个角点的 SDF 值和坐标（复用预分配对象）
          for (let c = 0; c < 8; c++) {
            const [dx, dy, dz] = CORNER_OFFSETS[c];
            const ci = ix + dx;
            const cj = iy + dy;
            const ck = iz + dz;
            cornerValues[c] = getSDF(ci, cj, ck);
            cornerPositions[c].set(
              min.x + ci * stepX,
              min.y + cj * stepY,
              min.z + ck * stepZ
            );
          }

          // 计算 cube index (8-bit)
          let cubeIndex = 0;
          for (let c = 0; c < 8; c++) {
            if (cornerValues[c] < isoLevel) {
              cubeIndex |= (1 << c);
            }
          }

          // 跳过完全在内部或外部的 cube
          const edgeBits = EDGE_TABLE[cubeIndex];
          if (edgeBits === 0) continue;

          // 计算每条边上的插值点（复用预分配向量）
          for (let e = 0; e < 12; e++) {
            if (edgeBits & (1 << e)) {
              const [v1, v2] = EDGE_VERTEX_PAIRS[e];
              interpolate(
                cornerPositions[v1], cornerPositions[v2],
                cornerValues[v1], cornerValues[v2],
                edgeVecs[e]
              );
              edgeVertices[e] = edgeVecs[e];
            } else {
              edgeVertices[e] = null;
            }
          }

          // 查表生成三角形
          const triList = TRI_TABLE[cubeIndex];
          for (let t = 0; t < triList.length; t += 3) {
            if (triList[t] === -1) break;
            const a = edgeVertices[triList[t]];
            const b = edgeVertices[triList[t + 1]];
            const c = edgeVertices[triList[t + 2]];
            if (a && b && c) {
              vertices.push(a.x, a.y, a.z);
              vertices.push(b.x, b.y, b.z);
              vertices.push(c.x, c.y, c.z);
            }
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    if (vertices.length > 0) {
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(new Float32Array(vertices), 3)
      );
      geometry.computeVertexNormals();
    }
    return geometry;
  }

  // ============================================================
  //  Step 4: 主流程 — 对单个模型生成包络
  // ============================================================

  /**
   * @param {THREE.Object3D} model
   * @param {number} distance - 偏移距离
   * @returns {THREE.Mesh | null}
   */
  _generateForModel(model, distance) {
    // 1. 合并几何体
    const mergedGeometry = this._mergeModelGeometries(model);
    if (!mergedGeometry) {
      console.warn(`[EnvelopeManager] 模型 "${model.name}" 无有效几何体可用于生成包络`);
      return null;
    }

    // 2. 构建 BVH
    console.time(`[Envelope] BVH 构建 (${model.name})`);
    const bvh = new MeshBVH(mergedGeometry);
    mergedGeometry.boundsTree = bvh;
    console.timeEnd(`[Envelope] BVH 构建 (${model.name})`);

    // 3. 计算采样范围：AABB + padding
    mergedGeometry.computeBoundingBox();
    const bbox = mergedGeometry.boundingBox.clone();
    const padding = distance * 1.5; // 多留 50% 余量确保包络不被裁剪
    bbox.expandByScalar(padding);

    // 4. 计算自适应体素分辨率
    const bboxSize = new THREE.Vector3();
    bbox.getSize(bboxSize);

    // 体素边长 = 偏移距离的一半，但不小于 bbox 最长边 / 200
    const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);
    let voxelSize = Math.max(distance / 2, maxDim / 200);

    // 计算初始分辨率
    let nx = Math.ceil(bboxSize.x / voxelSize) + 1;
    let ny = Math.ceil(bboxSize.y / voxelSize) + 1;
    let nz = Math.ceil(bboxSize.z / voxelSize) + 1;

    // 硬限制体素总数，防止浏览器卡死
    const MAX_VOXELS = 5_000_000;
    const totalVoxels = nx * ny * nz;
    if (totalVoxels > MAX_VOXELS) {
      const scale = Math.cbrt(MAX_VOXELS / totalVoxels);
      nx = Math.max(3, Math.ceil(nx * scale));
      ny = Math.max(3, Math.ceil(ny * scale));
      nz = Math.max(3, Math.ceil(nz * scale));
      voxelSize = maxDim / Math.max(nx, ny, nz);
      console.warn(
        `[EnvelopeManager] 体素数超限 (${totalVoxels.toLocaleString()} > ${MAX_VOXELS.toLocaleString()})，` +
        `降低分辨率至 ${nx}×${ny}×${nz} = ${(nx * ny * nz).toLocaleString()}`
      );
    }

    const resolution = [nx, ny, nz];
    console.log(`[Envelope] 分辨率: ${nx}×${ny}×${nz} = ${(nx * ny * nz).toLocaleString()} 体素, voxelSize=${voxelSize.toFixed(4)}`);

    // 5. SDF 采样
    console.time(`[Envelope] SDF 采样 (${model.name})`);
    const sdf = this._buildSDF(bvh, mergedGeometry, bbox, resolution, distance);
    console.timeEnd(`[Envelope] SDF 采样 (${model.name})`);

    // 6. Marching Cubes 等值面提取
    console.time(`[Envelope] Marching Cubes (${model.name})`);
    const envelopeGeometry = this._marchingCubes(sdf, bbox, resolution, distance);
    console.timeEnd(`[Envelope] Marching Cubes (${model.name})`);

    if (envelopeGeometry.attributes.position === undefined ||
      envelopeGeometry.attributes.position.count === 0) {
      console.warn(`[EnvelopeManager] 模型 "${model.name}" 包络提取结果为空`);
      mergedGeometry.dispose();
      envelopeGeometry.dispose();
      return null;
    }

    // 7. 创建包络 Mesh
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: this.opacity,
      roughness: 0.2,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const envelopeMesh = new THREE.Mesh(envelopeGeometry, material);
    envelopeMesh.name = `[包络] ${model.name || '模型'}`;
    envelopeMesh.raycast = () => { };

    // 将包络放置到模型的世界矩阵位置
    envelopeMesh.matrix.copy(model.matrixWorld);
    envelopeMesh.matrixAutoUpdate = false;

    // 清理合并的临时几何体
    mergedGeometry.dispose();

    return envelopeMesh;
  }

  // ============================================================
  //  公开 API（兼容旧接口）
  // ============================================================

  /**
   * 生成包络外壳
   * @param {THREE.Object3D[]} loadedModels
   * @param {number} distance
   */
  async generate(loadedModels, distance) {
    this.clear();

    if (!loadedModels || loadedModels.length === 0) {
      console.warn('没有加载的非线束模型可用于生成包络。');
      return;
    }

    // 强制自上而下更新场景中所有物体最新的世界矩阵
    this.scene.updateMatrixWorld(true);

    for (const model of loadedModels) {
      const envelopeMesh = this._generateForModel(model, distance);
      if (envelopeMesh) {
        const id = `envelope_${++this.envelopeIdCounter}`;
        envelopeMesh.userData.harnessId = id;
        envelopeMesh.userData.isEnvelope = true;
        envelopeMesh.userData.modelId = model.userData.modelId;

        this.envelopesGroup.add(envelopeMesh);
        this.envelopes.push(envelopeMesh);
      }
    }
  }

  /**
   * 获取所有的包络网格
   * @returns {THREE.Mesh[]}
   */
  getMeshes() {
    return this.envelopes;
  }

  /**
   * 设置包络的透明度
   * @param {number} opacity
   */
  setOpacity(opacity) {
    this.opacity = opacity;
    this.envelopes.forEach((mesh) => {
      if (mesh.material) {
        mesh.material.opacity = opacity;
        mesh.material.needsUpdate = true;
      }
    });
  }

  /**
   * 删除特定的包络网格
   */
  removeEnvelope(mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    this.envelopesGroup.remove(mesh);
    this.envelopes = this.envelopes.filter(m => m !== mesh);
  }

  /**
   * 清除所有的包络网格
   */
  clear() {
    this.envelopes.forEach((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
      this.envelopesGroup.remove(mesh);
    });
    this.envelopes = [];
    this.envelopeIdCounter = 0;
  }
}
