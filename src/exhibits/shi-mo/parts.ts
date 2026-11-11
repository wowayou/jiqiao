// 石磨零件：几何（只建一次）+ 位姿（状态的纯函数）+ 爆炸路径。文字在 content.ts。
import type { Kernel } from '../../kernel'
import { disc, eyeRing, fourLegStand, handle, millstone, pole, shaft, trough, type GroovePattern } from '../../kit'
import type { PartDef } from '../../exhibit/types'
import { PART_TEXT } from './content'
import { DIM, GRAIN_COUNT, Y, grainPose, rodPose, upperPose, type MillState } from './model'

/** 八区斜齿：分区数、齿距、齿宽、深度与斜度都是本站设定（原文只说「利齒」）。 */
export const GROOVES: GroovePattern = {
  zones: 8,
  rIn: 70,
  rOut: DIM.stoneR + 2,
  pitch: 26,
  width: 9,
  depth: 6,
  slant: (30 * Math.PI) / 180,
}

const CLEAR = 0.3
/** 磨拐的横木：上扇局部坐标 */
const ARM = { x0: 265, x1: 395, y0: 70, y1: 130, halfZ: 25 }

const upperStone = (k: Kernel) =>
  millstone(k, {
    radius: DIM.stoneR,
    thickness: DIM.upperT,
    face: 'bottom',
    pattern: GROOVES,
    centerHole: { r: DIM.spindleR + 1, depth: 55 },
    eye: { r: DIM.eyeR, at: DIM.eyeAt },
    hollow: { r: DIM.hollowR, depth: DIM.hollowDepth },
    dish: { r: DIM.dishR, depth: DIM.dishDepth },
  }).subtract(
    // 侧面凿出的方孔，装磨拐横木
    k.boxFromTo([ARM.x0 - CLEAR, ARM.y0 - CLEAR, -ARM.halfZ - CLEAR], [DIM.stoneR + 20, ARM.y1 + CLEAR, ARM.halfZ + CLEAR]),
  )

const crank = (k: Kernel) => {
  const arm = k.boxFromTo([ARM.x0, ARM.y0, -ARM.halfZ], [ARM.x1, ARM.y1, ARM.halfZ])
  const peg = handle(k, { r: 18, length: DIM.rodLocalY + 40 - (ARM.y1 - 20), knob: 0 }).translate([DIM.crankR, ARM.y1 - 20, 0])
  return arm.add(peg)
}

const pushRod = (k: Kernel) => {
  const ring = eyeRing(k, { holeR: 20.5, outerR: 34, thickness: 36 })
  const shaftPart = pole(k, { from: [30, 0, 0], to: [DIM.rodLen, 0, 0], r: DIM.rodR })
  const crossbar = shaft(k, { r: 16, length: 440, axis: 'z', chamfer: 3 }).translate([DIM.rodLen + 4, 0, 0])
  return k.union([ring, shaftPart, crossbar])
}

const flourHeap = (k: Kernel) =>
  k
    .revolve(
      [
        [DIM.stoneR + 12, 0],
        [DIM.trayR - DIM.trayRim - 3, 0],
        [DIM.trayR - DIM.trayRim - 3, 4],
        [400, 15],
        [350, 13],
        [DIM.stoneR + 16, 5],
      ],
      96,
    )
    .translate([0, Y.trayFloorTop, 0])

export const parts: PartDef<MillState>[] = [
  {
    id: 'stand',
    ...PART_TEXT.stand,
    group: 'base',
    material: 'wood-dark',
    solid: (k) => fourLegStand(k, { width: DIM.standWidth, depth: DIM.standWidth, height: DIM.standHeight, leg: 70, apron: 90, stretcherAt: 110 }),
    rest: { p: [0, 0, 0] },
    explode: { dir: [0, 1, 0], distance: 0, order: 0 },
  },
  {
    id: 'tray',
    ...PART_TEXT.tray,
    group: 'base',
    material: 'stone-dark',
    solid: (k) => trough(k, { r: DIM.trayR, rim: DIM.trayRim, floor: DIM.trayFloor, height: DIM.trayHeight }),
    rest: { p: [0, Y.trayBase, 0] },
    explode: { dir: [0, 1, 0], distance: 110, order: 1 },
  },
  {
    id: 'flour',
    ...PART_TEXT.flour,
    group: 'subject',
    material: 'flour',
    solid: flourHeap,
    rest: { p: [0, 0, 0] },
    visible: (s) => s.showGrain,
    explode: { dir: [0, 1, 0], distance: 0, order: 1, with: 'tray' },
  },
  {
    id: 'lower-stone',
    ...PART_TEXT['lower-stone'],
    group: 'structure',
    material: 'stone',
    solid: (k) =>
      millstone(k, {
        radius: DIM.stoneR,
        thickness: DIM.lowerT,
        face: 'top',
        pattern: GROOVES,
        centerHole: { r: DIM.spindleR + 0.3, depth: 60 },
      }),
    rest: { p: [0, Y.lowerBase, 0] },
    explode: { dir: [0, 1, 0], distance: 270, order: 2 },
  },
  {
    id: 'spindle',
    ...PART_TEXT.spindle,
    group: 'mechanism',
    material: 'iron',
    solid: (k) => shaft(k, { r: DIM.spindleR, length: DIM.spindleLen, center: false, chamfer: 2 }),
    rest: { p: [0, Y.lowerTop - 60, 0] },
    explode: { dir: [0, 1, 0], distance: 440, order: 3 },
  },
  {
    id: 'upper-stone',
    ...PART_TEXT['upper-stone'],
    group: 'mechanism',
    material: 'stone',
    solid: upperStone,
    rest: { p: [0, Y.upperBase, 0] },
    pose: upperPose,
    explode: { dir: [0, 1, 0], distance: 680, order: 4 },
  },
  {
    id: 'crank',
    ...PART_TEXT.crank,
    group: 'mechanism',
    material: 'wood-light',
    solid: crank,
    rest: { p: [0, Y.upperBase, 0] },
    pose: upperPose,
    explode: { dir: [1, 0, 0], distance: 170, order: 5, frame: 'local', with: 'upper-stone' },
  },
  {
    id: 'push-rod',
    ...PART_TEXT['push-rod'],
    group: 'control',
    material: 'wood-light',
    solid: pushRod,
    rest: { p: [DIM.crankR, Y.rod, 0] },
    pose: rodPose,
    explode: { dir: [0, 1, 0], distance: 150, order: 6, with: 'crank' },
  },
  {
    id: 'grain',
    ...PART_TEXT.grain,
    group: 'subject',
    material: 'grain',
    solid: (k) => disc(k, { r: DIM.grainR, h: DIM.grainR * 1.2, chamfer: 2.5, segments: 16, base: 'center' }),
    copies: GRAIN_COUNT,
    rest: { p: [0, Y.upperTop, 0] },
    pose: grainPose,
    visible: (s, i) => s.showGrain && s.grains[i].phase < 0.985,
    explode: { dir: [0, 1, 0], distance: 0, order: 0, hide: true },
  },
]
