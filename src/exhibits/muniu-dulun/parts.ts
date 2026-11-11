// 独轮车零件：几何（只建一次）+ 位姿（状态的纯函数）+ 爆炸路径。文字在 content.ts。
// 车架及固定在它上面的零件，几何都建在「车架局部坐标」里（原点 = 轮轴，x 向前），位姿 = 车架绕轮轴转 β。
import type { Kernel, Solid } from '../../kernel'
import type { PartDef } from '../../exhibit/types'
import { PART_TEXT } from './content'
import {
  AXLE_HALF,
  AXLE_R,
  AXLE_Y,
  BETA0,
  FRAME,
  FRONT_END_X,
  GRIP,
  GROUND_HALF,
  HANDLE_START_X,
  LEG,
  LEG_GAP,
  LEG_XW,
  MARK,
  N_MARKS,
  SACK,
  WHEEL,
  WHEEL_R,
  axlePose,
  frameRest,
  framePose,
  gripWorld,
  markVisible,
  markX,
  sackPose,
  sackRest,
  wheelPose,
  type DulunState,
} from './model'

const { zi, zo, zc, railH } = FRAME
const sides = [1, -1] as const

// —— 几何 ——

/** 独轮：外圈（轮辋）+ 轮毂 + 四根过心的辐条（共 8 辐）；轮轴孔比轴大 2.5 mm。绕 Z 转。 */
function wheelSolid(k: Kernel): Solid {
  const rim = k
    .cylinder({ r: WHEEL_R, h: 2 * WHEEL.rimHalfW, axis: 'z', segments: 96 })
    .subtract(k.cylinder({ r: WHEEL_R - WHEEL.rimT, h: 2 * WHEEL.rimHalfW + 2, axis: 'z', segments: 96 }))
  const hub = k.cylinder({ r: WHEEL.hubR, h: 2 * WHEEL.hubHalfW, axis: 'z', segments: 48 })
  const bars: Solid[] = []
  for (let i = 0; i < 4; i++)
    bars.push(k.box([2 * (WHEEL_R - 20), WHEEL.barW, WHEEL.barT]).rotate([0, 0, 1], (i * Math.PI) / 4))
  return k
    .union([rim, hub, ...bars])
    .subtract(k.cylinder({ r: WHEEL.bore, h: 2 * WHEEL.hubHalfW + 2, axis: 'z', segments: 48 }))
}

/** 轮轴：一根圆轴，两端插进两根纵梁的盲孔，轮毂套在它中间转。 */
const axleSolid = (k: Kernel): Solid => k.cylinder({ r: AXLE_R, h: 2 * AXLE_HALF, axis: 'z', segments: 48 })

/** 车架：两根纵梁（轮子夹在中间，轴孔是盲孔）+ 横档 + 两块货板（粮袋压在上面）；两端各开卯眼接车把与前辕。 */
function frameSolid(k: Kernel): Solid {
  const parts: Solid[] = []
  for (const sz of sides) {
    const [z0, z1] = sz > 0 ? [zi, zo] : [-zo, -zi]
    parts.push(k.boxFromTo([FRAME.rearX, -railH, z0], [FRAME.frontX, railH, z1]))
    // 货板：压在纵梁外侧，顶面与纵梁顶面齐平
    const [p0, p1] = sz > 0 ? [zo - 5, FRAME.shelfZ1] : [-FRAME.shelfZ1, -(zo - 5)]
    parts.push(k.boxFromTo([FRAME.shelfX0, 10, p0], [FRAME.shelfX1, railH, p1]))
  }
  // 横档：夹在两根纵梁之间，避开车轮（轮缘在 x = ±360）
  for (const [x0, x1] of [[-560, -500], [-780, -720], [390, 440]] as const)
    parts.push(k.boxFromTo([x0, -30, -(zi + 5)], [x1, 30, zi + 5]))
  let f = k.union(parts)
  for (const sz of sides) {
    // 轴孔：从内侧面开到离外侧面 9 mm 处的盲孔
    const [a, b] = sz > 0 ? [zi - 1, AXLE_HALF + 1] : [-(AXLE_HALF + 1), -(zi - 1)]
    f = f.subtract(k.cylinder({ r: FRAME.holeR, h: b - a, axis: 'z', segments: 48 }).translate([0, 0, (a + b) / 2]))
    const m = FRAME.mortiseHalf
    f = f.subtract(k.boxFromTo([FRAME.rearX - 1, -m, sz * zc - m], [-780, m, sz * zc + m]))
    f = f.subtract(k.boxFromTo([332 - 2, -m, sz * zc - m], [FRAME.frontX + 1, m, sz * zc + m]))
  }
  return f
}

/** 车把：两根从纵梁后端起翘的圆杆，榫头插进纵梁后端的卯眼，末端一根横木。 */
function handleSolid(k: Kernel): Solid {
  const t = FRAME.tenonHalf
  const parts: Solid[] = []
  for (const sz of sides) {
    parts.push(k.boxFromTo([HANDLE_START_X, -t, sz * zc - t], [-782, t, sz * zc + t]))
    parts.push(k.rod([HANDLE_START_X, 0, sz * zc], [GRIP[0], GRIP[1], sz * zc], 28, 32))
  }
  parts.push(k.rod([GRIP[0], GRIP[1], -zc - 30], [GRIP[0], GRIP[1], zc + 30], 24, 32))
  return k.union(parts)
}

/** 前辕：两根略向内收的圆杆，榫头插进纵梁前端的卯眼，前端一根横木。 */
function frontSolid(k: Kernel): Solid {
  const t = FRAME.tenonHalf
  const parts: Solid[] = []
  for (const sz of sides) {
    parts.push(k.boxFromTo([332, -t, sz * zc - t], [FRAME.frontX + 14, t, sz * zc + t]))
    parts.push(k.rod([FRAME.frontX + 14, 0, sz * zc], [FRONT_END_X, 0, sz * 85], 26, 32))
  }
  parts.push(k.rod([FRONT_END_X, 0, -85 - 26], [FRONT_END_X, 0, 85 + 26], 26, 32))
  return k.union(parts)
}

/** 支脚：两根立在地上的短柱 + 一道横木。先按「停车姿态里竖直、底面平放在地上」建好，再转回车架局部坐标。 */
function legsSolid(k: Kernel): Solid {
  const bottom = -AXLE_Y + LEG_GAP
  const w = LEG.halfW
  const parts: Solid[] = []
  for (const sz of sides) parts.push(k.boxFromTo([LEG_XW - w, bottom, sz * zc - w], [LEG_XW + w, bottom + 320, sz * zc + w]))
  parts.push(k.boxFromTo([LEG_XW - w + 5, bottom + LEG.tieLow, -zc], [LEG_XW + w - 5, bottom + LEG.tieHigh, zc]))
  return k
    .union(parts)
    .rotate([0, 0, 1], -BETA0)
    .intersect(k.boxFromTo([-3000, -3000, -3000], [3000, -(railH + 0.2), 3000]))
}

/** 粮袋：椭球削平底面，局部原点在椭球中心。 */
const sackSolid = (k: Kernel): Solid =>
  k
    .sphere(1, 64)
    .scale([SACK.a, SACK.b, SACK.c])
    .intersect(k.boxFromTo([-400, -SACK.base, -400], [400, 400, 400]))

const groundSolid = (k: Kernel): Solid => k.boxFromTo([-GROUND_HALF, -80, -600], [GROUND_HALF, 0, 600])

/** 地面标记：一道横在路上的石条，左右各一段（中间让开车轮与支脚）。 */
function markSolid(k: Kernel): Solid {
  const a = k.boxFromTo([-MARK.halfW, 0, MARK.z0], [MARK.halfW, MARK.h, MARK.z1])
  return k.union([a, a.mirror([0, 0, 1])])
}

/** 人手施力点：竖直向上的小箭头，局部原点在箭头尖。 */
function arrowSolid(k: Kernel): Solid {
  const shaft = k.cylinder({ r: 9, h: 70, axis: 'y', center: false, segments: 24 }).translate([0, -110, 0])
  const head = k.cylinder({ r: 24, r2: 0, h: 40, axis: 'y', center: false, segments: 24 }).translate([0, -40, 0])
  return shaft.add(head)
}

// —— 零件 ——

const T = PART_TEXT
const framePart = <P extends Pick<PartDef<DulunState>, 'id' | 'name' | 'group' | 'material' | 'solid' | 'explode'>>(
  p: P,
  txt: { role: string; claims?: PartDef<DulunState>['claims']; features?: PartDef<DulunState>['features'] },
): PartDef<DulunState> => ({ ...p, ...txt, rest: frameRest, pose: framePose })

export const parts: PartDef<DulunState>[] = [
  {
    id: 'ground',
    name: '地面',
    group: 'base',
    material: 'earth',
    solid: groundSolid,
    rest: { p: [0, 0, 0] },
    explode: { dir: [0, -1, 0], distance: 520, order: 1 },
    ...T.ground,
  },
  {
    id: 'marks',
    name: '地面标记',
    group: 'base',
    material: 'stone',
    solid: markSolid,
    rest: { p: [0, 0, 0] },
    copies: N_MARKS,
    pose: (s, i) => ({ p: [markX(s, i), 0, 0] }),
    visible: (s, i) => markVisible(s, i),
    explode: { dir: [0, -1, 0], distance: 0, order: 1, with: 'ground' },
    ...T.marks,
  },
  framePart(
    {
      id: 'frame',
      name: '车架',
      group: 'structure',
      material: 'wood-light',
      solid: frameSolid,
      explode: { dir: [0, 1, 0], distance: 0, order: 2 },
    },
    T.frame,
  ),
  {
    id: 'axle',
    name: '轮轴',
    group: 'mechanism',
    material: 'iron',
    solid: axleSolid,
    rest: axlePose,
    explode: { dir: [0, 0, 1], distance: 760, order: 3 },
    ...T.axle,
  },
  {
    id: 'wheel',
    name: '独轮',
    group: 'mechanism',
    material: 'wood-dark',
    solid: wheelSolid,
    rest: { p: [0, AXLE_Y, 0] },
    pose: wheelPose,
    explode: { dir: [0, 0, -1], distance: 700, order: 4 },
    ...T.wheel,
  },
  framePart(
    {
      id: 'legs',
      name: '支脚',
      group: 'structure',
      material: 'wood-dark',
      solid: legsSolid,
      explode: { dir: [0, -1, 0], distance: 240, order: 5 },
    },
    T.legs,
  ),
  framePart(
    {
      id: 'handle',
      name: '车把',
      group: 'control',
      material: 'wood-light',
      solid: handleSolid,
      explode: { dir: [-1, 0, 0], distance: 420, order: 6, frame: 'local' },
    },
    T.handle,
  ),
  framePart(
    {
      id: 'front',
      name: '前辕',
      group: 'structure',
      material: 'wood-light',
      solid: frontSolid,
      explode: { dir: [1, 0, 0], distance: 420, order: 7, frame: 'local' },
    },
    T.front,
  ),
  {
    id: 'sack',
    name: '粮袋',
    group: 'subject',
    material: 'cloth',
    solid: sackSolid,
    rest: sackRest(),
    copies: 2,
    pose: sackPose,
    explode: { dir: [0, 1, 0], distance: 480, order: 8 },
    ...T.sack,
  },
  {
    id: 'hand',
    name: '人手施力点（示意）',
    group: 'control',
    material: 'brass',
    solid: arrowSolid,
    rest: { p: [GRIP[0], 0, 0] },
    copies: 2,
    pose: (s, i) => {
      const g = gripWorld(s, i)
      return { p: [g[0], g[1] - 36, g[2]] }
    },
    visible: (s) => s.handKg > 0.5,
    explode: { dir: [0, -1, 0], distance: 0, order: 9, hide: true },
    ...T.hand,
  },
]
