// 水碓零件：几何（只建一次）+ 位姿（状态的纯函数）+ 爆炸路径。文字在 content.ts。
import type { Kernel, Solid } from '../../kernel'
import type { PartDef } from '../../exhibit/types'
import { rotZ } from '../../kinematics/pose'
import type { Vec2 } from '../../kinematics/vec'
import { waterwheel } from '../../kit/waterwheel'
import { PART_TEXT } from './content'
import {
  BEARING_Z,
  BOWL_FLOOR_Y,
  CLEAR,
  DIM,
  LANES,
  MORTAR_X,
  N_LEVERS,
  PEG_BETA,
  PEGS_PER_LEVER,
  PESTLE_DROP,
  POST_Z,
  WHEEL,
  leverPose,
  leverRest,
  pegPose,
  pestlePose,
  pestleRest,
  shaftPose,
  wheelPose,
  type DuiState,
} from './model'

const PEG_ID = (k: number, j: number) => `peg-${k + 1}${'ab'[j]}`
export const leverId = (k: number) => `lever-${k + 1}`
export const pestleId = (k: number) => `pestle-${k + 1}`
export const mortarId = (k: number) => `mortar-${k + 1}`
export const grainId = (k: number) => `grain-${k + 1}`
export { PEG_ID }

const { shaftY: SY, shaftR: SR, pivotX: PX, pivotY: PY } = DIM

// —— 几何 ——

/** 横轴：圆柱 + 每块拨板一个卯眼（从轴心开到轴面，宽高比拨板各大 0.1 mm）。 */
function shaftSolid(k: Kernel): Solid {
  let s = k.cylinder({ r: SR, h: DIM.shaftZ1 - DIM.shaftZ0, axis: 'z', center: false, segments: 48 }).translate([0, 0, DIM.shaftZ0])
  for (let i = 0; i < N_LEVERS; i++)
    for (let j = 0; j < PEGS_PER_LEVER; j++) {
      const cutter = k
        .boxFromTo(
          [0, -DIM.pegR - CLEAR, LANES[i] - DIM.pegW / 2 - CLEAR],
          [SR + 10, DIM.pegR + CLEAR, LANES[i] + DIM.pegW / 2 + CLEAR],
        )
        .rotate([0, 0, 1], PEG_BETA[i][j])
      s = s.subtract(cutter)
    }
  return s
}

/** 拨板：局部 +X 指向板头；榫尾插进横轴的卯眼，板头是半径 pegR 的圆头（圆头圆心在 pegOrbit 处）。 */
function pegSolid(k: Kernel): Solid {
  const body = k.rect(DIM.pegOrbit - 0.5, 2 * DIM.pegR, false).translate([0.5, -DIM.pegR])
  const nose = k.circle(DIM.pegR, 48).translate([DIM.pegOrbit, 0])
  return k.regionUnion([body, nose]).extrude(DIM.pegW, 'z', true)
}

/** 轴承座：方墩上开轴孔（孔比轴大 3 mm 的间隙）。 */
function bearingSolid(k: Kernel): Solid {
  const h = SY + SR + 70
  return k
    .boxFromTo([-DIM.bearingW / 2, 0, -DIM.bearingT / 2], [DIM.bearingW / 2, h, DIM.bearingT / 2])
    .subtract(k.cylinder({ r: SR + 3, h: DIM.bearingT + 2, axis: 'z' }).translate([0, SY, 0]))
}

/** 支架：两根立柱（开支点轴孔）+ 底部地栿 + 顶部横梁。 */
function frameSolid(k: Kernel): Solid {
  const hw = DIM.postW / 2
  const top = PY + 110
  const hz = DIM.postT / 2
  const parts: Solid[] = []
  for (const z of POST_Z) {
    parts.push(
      k.boxFromTo([PX - hw, 0, z - hz], [PX + hw, top, z + hz]).subtract(k.cylinder({ r: DIM.axleR + 1, h: DIM.postT + 2, axis: 'z' }).translate([PX, PY, z])),
    )
  }
  parts.push(k.boxFromTo([PX - hw, 0, POST_Z[0] - hz], [PX + hw, 70, POST_Z[1] + hz]))
  parts.push(k.boxFromTo([PX - hw + 20, top, POST_Z[0] - hz], [PX + hw - 20, top + 60, POST_Z[1] + hz]))
  return k.union(parts)
}

/** 支点轴：一根长销，两端插在立柱孔里，碓杆套在它上面转。 */
const axleSolid = (k: Kernel): Solid =>
  k.cylinder({ r: DIM.axleR, h: POST_Z[1] - POST_Z[0] + DIM.postT + 60, axis: 'z', segments: 32 }).translate([0, 0, (POST_Z[0] + POST_Z[1]) / 2])

/** 碓杆：局部原点在支点孔心，+X 指向碓头一端，−X 是碓尾。 */
function leverSolid(k: Kernel): Solid {
  return k
    .boxFromTo([-DIM.tail, -DIM.beamHalfH, -DIM.beamHalfZ], [DIM.head, DIM.beamHalfH, DIM.beamHalfZ])
    .subtract(k.cylinder({ r: DIM.axleR + 1.5, h: 2 * DIM.beamHalfZ + 2, axis: 'z' }))
    .subtract(k.cylinder({ r: DIM.pestleStemR + 0.5, h: 2 * DIM.beamHalfH + 2, axis: 'y' }).translate([DIM.pestleX, 0, 0]))
}

/**
 * 碓头：局部原点在它穿过碓杆处的中线上。杆身穿过碓杆上的孔，上端有挡肩（比孔大）压在碓杆上面，
 * 下端是较粗的碓头（舂头），最低点在 y = −PESTLE_DROP。revolve 的截面坐标是 (半径, 高度)。
 */
function pestleSolid(k: Kernel): Solid {
  const hr = DIM.pestleHeadR
  const sr = DIM.pestleStemR
  const y0 = -PESTLE_DROP
  const profile: Vec2[] = [
    [0, y0],
    [hr - 10, y0],
    [hr, y0 + 10],
    [hr, y0 + DIM.pestleHeadLen],
    [sr, y0 + DIM.pestleHeadLen + 40],
    [sr, DIM.beamHalfH + CLEAR],
    [sr + 16, DIM.beamHalfH + CLEAR],
    [sr + 16, DIM.beamHalfH + 60],
    [0, DIM.beamHalfH + 60],
  ]
  return k.revolve(profile, 48)
}

/** 臼的碗壁：高度 s∈[0,1]（0 = 臼底，1 = 臼口）处的半径。 */
const bowlR = (s: number) => DIM.bowlFloorR + (DIM.bowlTopR - DIM.bowlFloorR) * Math.pow(s, 1.25)

/** 臼：圆石墩，顶面凿出圆底的碗。 */
function mortarSolid(k: Kernel): Solid {
  const H = DIM.mortarH
  const pts: Vec2[] = [[0, 0], [DIM.mortarR, 0], [DIM.mortarR, H], [DIM.bowlTopR, H]]
  const n = 14
  for (let i = n; i >= 0; i--) {
    const s = i / n
    pts.push([bowlR(s), BOWL_FLOOR_Y + s * DIM.bowlDepth])
  }
  pts.push([0, BOWL_FLOOR_Y])
  return k.revolve(pts, 64)
}

/** 臼里的谷粒：贴着碗壁的一堆，离壁、离臼底各留约 0.2 mm，表面呈穹形，最高处比谷粒面基准低 0.5 mm。 */
function grainSolid(k: Kernel): Solid {
  const gap = 0.2
  const edgeH = DIM.grainTop - 5
  const n = 6
  const pts: Vec2[] = [[0, BOWL_FLOOR_Y + gap]]
  for (let i = 0; i < n; i++) {
    const s = (edgeH / DIM.bowlDepth) * (i / n)
    pts.push([bowlR(s) - gap, BOWL_FLOOR_Y + gap + s * DIM.bowlDepth])
  }
  pts.push([bowlR(edgeH / DIM.bowlDepth) - gap, BOWL_FLOOR_Y + edgeH])
  pts.push([0, BOWL_FLOOR_Y + DIM.grainTop - 0.5])
  return k.revolve(pts, 64)
}

/** 水槽：一段架空的木槽（底板 + 两侧板）+ 两副支架，槽口伸到水轮上方。 */
function flumeSolid(k: Kernel): Solid {
  const { x0, x1, y, halfW } = FLUME
  const parts: Solid[] = [
    k.boxFromTo([x0, y, -halfW], [x1, y + 20, halfW]),
    k.boxFromTo([x0, y + 20, -halfW], [x1, y + 120, -halfW + 20]),
    k.boxFromTo([x0, y + 20, halfW - 20], [x1, y + 120, halfW]),
  ]
  for (const xc of FLUME.legsAt) {
    for (const z of [-halfW + 30, halfW - 30]) parts.push(k.boxFromTo([xc - 50, 0, z - 40], [xc + 50, y, z + 40]))
    parts.push(k.boxFromTo([xc - 70, y - 70, -halfW], [xc + 70, y, halfW]))
  }
  return k.union(parts)
}

/** 水流示意：槽里的一层水 + 从槽口落到水轮叶板上的水柱。 */
function flowSolid(k: Kernel): Solid {
  const { x0, x1, y, halfW } = FLUME
  const inner = halfW - 22
  return k.union([
    k.boxFromTo([x0 - 50, y + 20.1, -inner], [x1 - 20, y + 75, inner]),
    k.boxFromTo([x0 - 50, FLUME.jetBottom, -inner], [x0 - 0.2, y + 75, inner]),
  ])
}

/** 尾水示意：水轮下面一层薄水。 */
const streamSolid = (k: Kernel): Solid => k.boxFromTo([-1100, 0.1, -250], [1100, 45, 250])

export const FLUME = {
  x0: 760,
  x1: 1500,
  y: 1990,
  halfW: 150,
  legsAt: [1180, 1440],
  /** 水柱下端 */
  jetBottom: 1870,
} as const

// —— 零件表 ——

const lane = (k: number) => LANES[k]

export const parts: PartDef<DuiState>[] = [
  {
    id: 'bed',
    ...PART_TEXT.bed,
    group: 'base',
    material: 'earth',
    solid: (k) => k.boxFromTo([-1150, -100, -460], [1700, 0, 1950]),
    rest: { p: [0, 0, 0] },
    explode: { dir: [0, 1, 0], distance: 0, order: 0 },
  },
  {
    id: 'stream',
    ...PART_TEXT.stream,
    group: 'subject',
    material: 'water',
    solid: streamSolid,
    rest: { p: [0, 0, 0] },
    visible: (s) => s.showWater,
    explode: { dir: [0, 1, 0], distance: 0, order: 0, hide: true },
  },
  {
    id: 'bearing',
    ...PART_TEXT.bearing,
    group: 'structure',
    material: 'wood-dark',
    solid: bearingSolid,
    copies: BEARING_Z.length,
    rest: { p: [0, 0, BEARING_Z[0]] },
    pose: (_s, i) => ({ p: [0, 0, BEARING_Z[i]] }),
    explode: { dir: [0, 1, 0], distance: 200, order: 1 },
  },
  {
    id: 'frame',
    ...PART_TEXT.frame,
    group: 'structure',
    material: 'wood-dark',
    solid: frameSolid,
    rest: { p: [0, 0, 0] },
    explode: { dir: [0, 1, 0], distance: 200, order: 1 },
  },
  ...LANES.map<PartDef<DuiState>>((_, k) => ({
    id: mortarId(k),
    ...PART_TEXT.mortar(k),
    group: 'structure',
    material: 'stone',
    solid: mortarSolid,
    rest: { p: [MORTAR_X, 0, lane(k)] },
    explode: { dir: [0, 1, 0], distance: 200, order: 1 },
  })),
  ...LANES.map<PartDef<DuiState>>((_, k) => ({
    id: grainId(k),
    ...PART_TEXT.grain(k),
    group: 'subject',
    material: 'grain',
    solid: grainSolid,
    rest: { p: [MORTAR_X, 0, lane(k)] },
    explode: { dir: [0, 1, 0], distance: 0, order: 1, with: mortarId(k) },
  })),
  {
    id: 'shaft',
    ...PART_TEXT.shaft,
    group: 'mechanism',
    material: 'wood-dark',
    solid: shaftSolid,
    rest: { p: [0, SY, 0] },
    pose: shaftPose,
    explode: { dir: [0, 1, 0], distance: 450, order: 2 },
  },
  {
    id: 'axle',
    ...PART_TEXT.axle,
    group: 'structure',
    material: 'iron',
    solid: axleSolid,
    rest: { p: [PX, PY, 0] },
    explode: { dir: [0, 1, 0], distance: 450, order: 2 },
  },
  {
    id: 'wheel',
    ...PART_TEXT.wheel,
    group: 'mechanism',
    material: 'wood-light',
    solid: (k) => waterwheel(k, WHEEL),
    rest: { p: [0, SY, DIM.wheelZ] },
    pose: wheelPose,
    explode: { dir: [0, 0, -1], distance: 700, order: 5, with: 'shaft' },
  },
  ...LANES.flatMap((_, kk) =>
    PEG_BETA[kk].map<PartDef<DuiState>>((beta, j) => ({
      id: PEG_ID(kk, j),
      ...PART_TEXT.peg(kk, j),
      group: 'mechanism',
      material: 'wood-light',
      solid: pegSolid,
      rest: { p: [0, SY, lane(kk)], q: rotZ(beta) },
      pose: (s) => pegPose(kk, j, s),
      explode: { dir: [1, 0, 0], distance: 260, order: 3, frame: 'local', with: 'shaft' },
    })),
  ),
  ...LANES.map<PartDef<DuiState>>((_, k) => ({
    id: leverId(k),
    ...PART_TEXT.lever(k),
    group: 'mechanism',
    material: 'wood-light',
    solid: leverSolid,
    rest: leverRest(k),
    pose: (s) => leverPose(k, s),
    explode: { dir: [0, 1, 0], distance: 700, order: 4 },
  })),
  ...LANES.map<PartDef<DuiState>>((_, k) => ({
    id: pestleId(k),
    ...PART_TEXT.pestle(k),
    group: 'mechanism',
    material: 'wood-dark',
    solid: pestleSolid,
    rest: pestleRest(k),
    pose: (s) => pestlePose(k, s),
    explode: { dir: [0, 1, 0], distance: 320, order: 5, frame: 'local', with: leverId(k) },
  })),
  {
    id: 'flume',
    ...PART_TEXT.flume,
    group: 'structure',
    material: 'wood-light',
    solid: flumeSolid,
    rest: { p: [0, 0, 0] },
    explode: { dir: [1, 0, 0], distance: 700, order: 6 },
  },
  {
    id: 'flow',
    ...PART_TEXT.flow,
    group: 'subject',
    material: 'water',
    solid: flowSolid,
    rest: { p: [0, 0, 0] },
    visible: (s) => s.showWater,
    explode: { dir: [1, 0, 0], distance: 0, order: 6, with: 'flume', hide: true },
  },
]
