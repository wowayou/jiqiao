// 摆钟零件：几何（只建一次）+ 位姿（状态的纯函数）+ 爆炸路径。文字在 content.ts。
// 机芯的齿轮轴沿世界 Z（前后），表盘朝 +Z。擒纵轮与擒纵叉用规范几何沿 x 镜像（轮子顺时针转、直接带秒针）。
import type { Kernel, Region, Solid } from '../../kernel'
import type { PartDef } from '../../exhibit/types'
import { anchorBody, escapeWheel, pallet } from '../../kit/escapement'
import { arborZ, involuteGear } from '../../kit/involuteGear'
import { rotZ } from '../../kinematics/pose'
import { v2, type Vec2, type Vec3 } from '../../kinematics/vec'
import { PART_TEXT, type PartId } from './content'
import {
  AXES,
  BARREL_R,
  CORD_R,
  ESC0,
  ESCAPEMENT,
  GEARS,
  ORIGIN,
  PENDULUM_LENGTH,
  W,
  WEIGHT_TOP,
  Z,
  spin,
  type ClockState,
} from './model'

const { C, E, T, G, M, P } = AXES

/** 轴半径与轴孔间隙（转动配合留 0.3 mm，本站设定） */
const ARBOR = { great: 2.5, center: 2.5, third: 2, escape: 2, anchor: 2 }
const HOLE = 0.3
/** 夹板外框（机芯平面坐标） */
const FRAME = { x0: -125, x1: 90, y0: -160, y1: 215, border: 10 }
const PILLARS: Vec2[] = [
  [FRAME.x0 + 8, FRAME.y0 + 8],
  [FRAME.x1 - 8, FRAME.y0 + 8],
  [FRAME.x0 + 8, FRAME.y1 - 8],
  [FRAME.x1 - 8, FRAME.y1 - 8],
]
const DIAL_FEET: Vec2[] = [
  [-120, 30],
  [85, -88],
  [85, 90],
]
const DIAL = { rIn: 118, rOut: 150, secIn: 18, secOut: 27 }

const span = (z: readonly [number, number]) => ({ z0: z[0], h: z[1] - z[0] })

// —— 机架 ——

function plateRegion(k: Kernel, front: boolean): Region {
  const { x0, x1, y0, y1, border: b } = FRAME
  const outer = k.rect(x1 - x0, y1 - y0, false).translate([x0, y0])
  const inner = k.rect(x1 - x0 - 2 * b, y1 - y0 - 2 * b, false).translate([x0 + b, y0 + b])
  const bar = (a: Vec2, c: Vec2, w: number) => {
    const d = v2.sub(c, a)
    return k.rect(v2.len(d), w, false).translate([0, -w / 2]).rotate(Math.atan2(d[1], d[0])).translate(a)
  }
  const parts: Region[] = [
    outer.subtract(inner),
    bar([0, y0 + 2], [0, y1 - 2], 12),
    bar(C, T, 10),
    bar(T, [x1 - 2, T[1]], 10),
    bar(C, G, 10),
    bar(G, [x0 + 2, G[1]], 10),
    bar(G, [G[0], y0 + 2], 10),
  ]
  for (const a of [C, E, T, G, P]) parts.push(k.circle(10, 40).translate(a))
  if (front) {
    parts.push(bar(C, M, 8), k.circle(7, 32).translate(M))
    for (const f of DIAL_FEET) parts.push(k.circle(6, 24).translate(f))
  }
  let r = k.regionUnion(parts)
  const holes: [Vec2, number][] = [
    [C, ARBOR.center],
    [E, ARBOR.escape],
    [T, ARBOR.third],
    [G, ARBOR.great],
    [P, ARBOR.anchor],
  ]
  for (const [a, rr] of holes) r = r.subtract(k.circle(rr + HOLE, 24).translate(a))
  return r
}

const plate = (front: boolean) => (k: Kernel) => {
  const z = front ? Z.frontPlate : Z.backPlate
  let s = plateRegion(k, front).extrude(z[1] - z[0], 'z').translate([0, 0, z[0]])
  if (front) s = s.add(arborZ(k, { r: 2, z0: Z.frontPlate[1] - 0.5, z1: Z.minutePinion[1] + 0.8 }).translate([M[0], M[1], 0]))
  return s
}

const pillars = (k: Kernel) =>
  k.union(PILLARS.map((p) => arborZ(k, { r: 6, z0: Z.backPlate[1], z1: Z.frontPlate[0] }).translate([p[0], p[1], 0])))

const BACKBOARD = { x0: -250, x1: 210, y0: -1000, y1: 280, z0: -112, z1: -92 }

const backboard = (k: Kernel) => {
  const { x0, x1, y0, y1, z0, z1 } = BACKBOARD
  const w = x1 - x0
  // 上端做成拱形
  const pts: Vec2[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1 - w / 2],
  ]
  for (let i = 1; i < 24; i++) pts.push(v2.add([(x0 + x1) / 2, y1 - w / 2], v2.polar(w / 2, (Math.PI * i) / 24)))
  pts.push([x0, y1 - w / 2])
  return k.polygon(pts).extrude(z1 - z0, 'z').translate([0, 0, z0])
}

const wallPosts = (k: Kernel) =>
  k.union(PILLARS.map((p) => arborZ(k, { r: 7, z0: BACKBOARD.z1, z1: Z.backPlate[0] }).translate([p[0], p[1], 0])))

// —— 轮系 ——

const CROSS = (hub: number, arm: number, count = 4) => ({ count, rim: 4, arm, hub, phase: Math.PI / 4 })

const greatWheel = (k: Kernel) =>
  k.union([
    involuteGear(k, GEARS.great, { thickness: Z.great[1] - Z.great[0], z0: Z.great[0], crossing: CROSS(10, 7, 5) }),
    arborZ(k, { r: ARBOR.great, z0: Z.backPlate[0] + 1, z1: Z.frontPlate[1] - 1 }),
    arborZ(k, { r: 7, z0: Z.great[1], z1: Z.great[1] + 3 }),
  ])

const barrel = (k: Kernel) => {
  const bore = ARBOR.great + 0.4
  const drum = arborZ(k, { r: BARREL_R, z0: Z.barrel[0] + 2, z1: Z.barrel[1] - 2, bore, segments: 72 })
  const back = arborZ(k, { r: BARREL_R + 8, z0: Z.barrel[0], z1: Z.barrel[0] + 2, bore, segments: 72 })
  // 前端的棘轮：24 个锯齿
  const n = 24
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n
    pts.push(v2.polar(BARREL_R + 4, a), v2.polar(BARREL_R + 8, a + (2 * Math.PI) / n - 0.02))
  }
  const ratchet = k.polygon(pts).subtract(k.circle(bore, 24)).extrude(3, 'z').translate([0, 0, Z.barrel[1] - 3])
  return k.union([drum, back, ratchet])
}

const CORD_X = G[0] - (BARREL_R + CORD_R + 0.25)
const CORD_Z = (Z.barrel[0] + Z.barrel[1]) / 2
const CORD_BOTTOM = WEIGHT_TOP - 238
const WEIGHT = { r: 26, h: 270, bore: CORD_R + 1.2, boreDepth: 250 }

const cord = (k: Kernel) => k.rod(W([CORD_X, G[1]], CORD_Z), [ORIGIN[0] + CORD_X, CORD_BOTTOM, CORD_Z], CORD_R, 12)

const weight = (k: Kernel) => {
  const body = k
    .revolve([
      [0, 0],
      [WEIGHT.r - 3, 0],
      [WEIGHT.r, 3],
      [WEIGHT.r, WEIGHT.h - 6],
      [WEIGHT.r - 6, WEIGHT.h],
      [0, WEIGHT.h],
    ], 64)
    .translate([0, -WEIGHT.h, 0])
  const bore = k.cylinder({ r: WEIGHT.bore, h: WEIGHT.boreDepth + 1, center: false, segments: 16 }).translate([0, -WEIGHT.boreDepth, 0])
  return body.subtract(bore)
}

const centerWheel = (k: Kernel) =>
  k.union([
    involuteGear(k, GEARS.centerPinion, { thickness: Z.centerPinion[1] - Z.centerPinion[0], z0: Z.centerPinion[0] }),
    involuteGear(k, GEARS.center, { thickness: Z.center[1] - Z.center[0], z0: Z.center[0], crossing: CROSS(8, 5) }),
    arborZ(k, { r: ARBOR.center, z0: Z.backPlate[0] + 1, z1: Z.cannon[0] + 14 }),
    arborZ(k, { r: 6, z0: Z.center[0] - 3, z1: Z.center[0] }),
  ])

const thirdWheel = (k: Kernel) =>
  k.union([
    involuteGear(k, GEARS.thirdPinion, { thickness: Z.thirdPinion[1] - Z.thirdPinion[0], z0: Z.thirdPinion[0] }),
    involuteGear(k, GEARS.third, { thickness: Z.third[1] - Z.third[0], z0: Z.third[0], crossing: CROSS(7, 4.5) }),
    arborZ(k, { r: ARBOR.third, z0: Z.backPlate[0] + 1, z1: Z.frontPlate[1] - 1 }),
    arborZ(k, { r: 5, z0: Z.third[0] - 2.5, z1: Z.third[0] }),
  ])

const escapeArbor = (k: Kernel) =>
  k.union([
    escapeWheel(k, ESCAPEMENT, { thickness: Z.escape[1] - Z.escape[0], z0: Z.escape[0], crossing: CROSS(7, 4), mirror: true }),
    // 小齿轮预转 ESC0：擒纵轮世界转角 = −(ψ + ESC0)，而啮合按 −ψ 计算
    involuteGear(k, GEARS.escapePinion, { thickness: Z.escapePinion[1] - Z.escapePinion[0], z0: Z.escapePinion[0] }).rotate([0, 0, 1], ESC0),
    arborZ(k, { r: ARBOR.escape, z0: Z.backPlate[0] + 1, z1: Z.secondHand[1] }),
    arborZ(k, { r: 5, z0: Z.escape[1], z1: Z.escape[1] + 2.5 }),
  ])

const anchor = (k: Kernel) =>
  k.union([
    anchorBody(k, ESCAPEMENT, { thickness: Z.anchor[1] - Z.anchor[0], z0: Z.anchor[0], hubR: 7, armWidth: 6, mirror: true }),
    arborZ(k, { r: ARBOR.anchor, z0: Z.pendulum[0] + 2, z1: Z.frontPlate[1] - 1 }),
  ])

const palletSolid = (which: 0 | 1) => (k: Kernel) =>
  pallet(k, ESCAPEMENT, which, { thickness: Z.pallet[1] - Z.pallet[0], z0: Z.pallet[0], mirror: true })

// —— 摆 ——

const PEND_Z = (Z.pendulum[0] + Z.pendulum[1]) / 2
const BOB = { r: 62, t: 24 }

const pendulumRod = (k: Kernel) => {
  const hub = arborZ(k, { r: 8, z0: Z.pendulum[0] + 2, z1: Z.pendulum[1] - 2, bore: ARBOR.anchor })
  const rod = k.boxFromTo([-4, -(PENDULUM_LENGTH - BOB.r + 1), PEND_Z - 1.5], [4, -6, PEND_Z + 1.5])
  return hub.add(rod)
}

const bob = (k: Kernel) => {
  // 透镜形摆锤：截面（半径, 厚度）绕 Y 旋转成型，再转到轴沿 Z
  const n = 16
  const half = (r: number) => 2 + (BOB.t / 2 - 2) * (1 - (r / BOB.r) ** 2)
  const prof: Vec2[] = []
  for (let i = 0; i <= n; i++) prof.push([(BOB.r * i) / n, -half((BOB.r * i) / n)])
  for (let i = n; i >= 0; i--) prof.push([(BOB.r * i) / n, half((BOB.r * i) / n)])
  return k.revolve(prof, 72).rotate([1, 0, 0], Math.PI / 2).translate([0, -PENDULUM_LENGTH, PEND_Z])
}

// —— 指针与表盘（局部坐标：指针朝 +Y，即 12 点） ——

function handSolid(k: Kernel, o: { len: number; tail: number; w0: number; w1: number; boss: number; bore: number; z: readonly [number, number]; spade?: number }) {
  const pts: Vec2[] = [
    [-o.w0 / 2, -o.tail],
    [o.w0 / 2, -o.tail],
    [o.w0 / 2, 0],
    [o.w1 / 2, o.len - 2],
    [0, o.len],
    [-o.w1 / 2, o.len - 2],
    [-o.w0 / 2, 0],
  ]
  let r = k.regionUnion([k.polygon(pts), k.circle(o.boss, 32)])
  if (o.spade) r = r.add(k.polygon([[0, o.spade - 10], [6, o.spade], [0, o.spade + 12], [-6, o.spade]]))
  r = r.subtract(k.circle(o.bore, 24))
  return r.extrude(o.z[1] - o.z[0], 'z').translate([0, 0, o.z[0]])
}

const dial = (k: Kernel) => {
  const ring = k.circle(DIAL.rOut, 160).subtract(k.circle(DIAL.rIn, 160))
  const sec = k.circle(DIAL.secOut, 64).subtract(k.circle(DIAL.secIn, 64)).translate(E)
  const face = k.regionUnion([ring, sec]).extrude(Z.dial[1] - Z.dial[0], 'z').translate([0, 0, Z.dial[0]])
  const feet = DIAL_FEET.map((f) => arborZ(k, { r: 3, z0: Z.frontPlate[1], z1: Z.dial[0] }).translate([f[0], f[1], 0]))
  return k.union([face, ...feet])
}

const dialMarks = (k: Kernel) => {
  const regs: Region[] = []
  const tick = (r0: number, r1: number, w: number, a: number, c: Vec2 = [0, 0]) =>
    k.rect(r1 - r0, w, false).translate([r0, -w / 2]).rotate(a).translate(c)
  for (let i = 0; i < 60; i++) {
    const a = Math.PI / 2 - (i * Math.PI) / 30
    regs.push(i % 5 === 0 ? tick(DIAL.rIn + 6, DIAL.rOut - 4, 5, a) : tick(DIAL.rOut - 10, DIAL.rOut - 4, 1.2, a))
  }
  for (let i = 0; i < 12; i++) regs.push(tick(DIAL.secIn + 3, DIAL.secOut - 1.5, i % 3 === 0 ? 1.6 : 0.8, Math.PI / 2 - (i * Math.PI) / 6, E))
  regs.push(k.circle(DIAL.rOut - 3.2, 160).subtract(k.circle(DIAL.rOut - 4, 160)))
  return k.regionUnion(regs).extrude(0.4, 'z').translate([0, 0, Z.dial[1]])
}

// —— 位姿 ——

const at = (p: Vec2): Vec3 => W(p, 0)

type Def = Omit<PartDef<ClockState>, 'name' | 'role' | 'claims' | 'features'>

const text = (id: PartId) => PART_TEXT[id]

const defs: (Def & { id: PartId })[] = [
  {
    id: 'backboard',
    group: 'base',
    material: 'wood-dark',
    solid: backboard,
    rest: { p: at([0, 0]) },
    explode: { dir: [0, 0, -1], distance: 0, order: 0 },
  },
  {
    id: 'wall-posts',
    group: 'base',
    material: 'iron',
    solid: wallPosts,
    rest: { p: at([0, 0]) },
    explode: { dir: [0, 0, -1], distance: 0, order: 0 },
  },
  {
    id: 'back-plate',
    group: 'structure',
    material: 'brass',
    solid: plate(false),
    rest: { p: at([0, 0]) },
    explode: { dir: [0, 0, -1], distance: 0, order: 0 },
  },
  {
    id: 'pillars',
    group: 'structure',
    material: 'brass',
    solid: pillars,
    rest: { p: at([0, 0]) },
    explode: { dir: [0, 0, -1], distance: 0, order: 0 },
  },
  {
    id: 'pendulum',
    group: 'control',
    material: 'steel',
    solid: pendulumRod,
    rest: { p: at(P) },
    pose: (s) => ({ p: at(P), q: rotZ(s.pendulum) }),
    explode: { dir: [0, -1, 0], distance: 140, order: 1 },
  },
  {
    id: 'bob',
    group: 'control',
    material: 'brass',
    solid: bob,
    rest: { p: at(P) },
    pose: (s) => ({ p: at(P), q: rotZ(s.pendulum) }),
    explode: { dir: [0, -1, 0], distance: 0, order: 1, with: 'pendulum' },
  },
  {
    id: 'weight',
    group: 'mechanism',
    material: 'iron',
    solid: weight,
    rest: { p: [ORIGIN[0] + CORD_X, WEIGHT_TOP, CORD_Z] },
    pose: (s) => ({ p: [ORIGIN[0] + CORD_X, s.weightY, CORD_Z] }),
    explode: { dir: [0, -1, 0], distance: 160, order: 2 },
  },
  {
    id: 'cord',
    group: 'mechanism',
    material: 'rope',
    solid: cord,
    rest: { p: [0, 0, 0] },
    explode: { dir: [0, -1, 0], distance: 0, order: 2, hide: true },
  },
  {
    id: 'great-wheel',
    group: 'mechanism',
    material: 'brass',
    solid: greatWheel,
    rest: spin(G, 0, 0),
    pose: (s) => spin(G, 0, s.angle.great),
    explode: { dir: [-0.868744485526, -0.477809467039, 0.130311672829], distance: 330, order: 3 },
  },
  {
    id: 'barrel',
    group: 'mechanism',
    material: 'wood-light',
    solid: barrel,
    rest: spin(G, 0, 0),
    pose: (s) => spin(G, 0, s.angle.barrel),
    explode: { dir: [0, 0, 1], distance: 60, order: 3, with: 'great-wheel' },
  },
  {
    id: 'center-wheel',
    group: 'mechanism',
    material: 'brass',
    solid: centerWheel,
    rest: spin(C, 0, 0),
    pose: (s) => spin(C, 0, s.angle.center),
    explode: { dir: [0.896221429896, -0.313677500464, 0.313677500464], distance: 250, order: 4 },
  },
  {
    id: 'third-wheel',
    group: 'mechanism',
    material: 'brass',
    solid: thirdWheel,
    rest: spin(T, 0, 0),
    pose: (s) => spin(T, 0, s.angle.third),
    explode: { dir: [0.93968197147, -0.093968197147, 0.328888690014], distance: 340, order: 5 },
  },
  {
    id: 'escape-wheel',
    group: 'mechanism',
    material: 'steel',
    solid: escapeArbor,
    rest: spin(E, 0, -ESC0),
    pose: (s) => spin(E, 0, -(s.psi + ESC0)),
    explode: { dir: [0.934538627032, 0.140180794055, 0.327088519461], distance: 420, order: 6 },
  },
  {
    id: 'anchor',
    group: 'control',
    material: 'steel',
    solid: anchor,
    rest: { p: at(P) },
    pose: (s) => ({ p: at(P), q: rotZ(s.pendulum) }),
    explode: { dir: [0.908153218373, 0.272445965512, 0.317853626431], distance: 470, order: 7 },
  },
  {
    id: 'pallet-entry',
    group: 'control',
    material: 'steel',
    solid: palletSolid(0),
    rest: { p: at(P) },
    pose: (s) => ({ p: at(P), q: rotZ(s.pendulum) }),
    explode: { dir: [0, 0, 1], distance: 0, order: 7, with: 'anchor' },
  },
  {
    id: 'pallet-exit',
    group: 'control',
    material: 'steel',
    solid: palletSolid(1),
    rest: { p: at(P) },
    pose: (s) => ({ p: at(P), q: rotZ(s.pendulum) }),
    explode: { dir: [0, 0, 1], distance: 0, order: 7, with: 'anchor' },
  },
  {
    id: 'front-plate',
    group: 'structure',
    material: 'brass',
    solid: plate(true),
    rest: { p: at([0, 0]) },
    explode: { dir: [0, 0, 1], distance: 130, order: 8 },
  },
  {
    id: 'cannon',
    group: 'mechanism',
    material: 'brass',
    solid: (k) =>
      k.union([
        involuteGear(k, GEARS.cannon, { thickness: Z.cannon[1] - Z.cannon[0], z0: Z.cannon[0], bore: ARBOR.center + HOLE }),
        arborZ(k, { r: 4, z0: Z.cannon[0], z1: Z.minuteHand[1], bore: ARBOR.center + HOLE }),
      ]),
    rest: spin(C, 0, 0),
    pose: (s) => spin(C, 0, s.angle.center),
    explode: { dir: [-0.399421258459, -0.499276573074, 0.768885922534], distance: 240, order: 9 },
  },
  {
    id: 'minute-wheel',
    group: 'mechanism',
    material: 'brass',
    solid: (k) =>
      k.union([
        involuteGear(k, GEARS.minute, { thickness: Z.minute[1] - Z.minute[0], z0: Z.minute[0], bore: 2 + HOLE, crossing: CROSS(5, 3.5) }),
        involuteGear(k, GEARS.minutePinion, { thickness: Z.minutePinion[1] - Z.minutePinion[0], z0: Z.minutePinion[0], bore: 2 + HOLE }),
        arborZ(k, { r: 4.5, z0: Z.minute[1], z1: Z.minutePinion[0], bore: 2 + HOLE }),
      ]),
    rest: spin(M, 0, 0),
    pose: (s) => spin(M, 0, s.angle.minute),
    explode: { dir: [-0.399421258459, -0.499276573074, 0.768885922534], distance: 270, order: 10 },
  },
  {
    id: 'hour-wheel',
    group: 'mechanism',
    material: 'brass',
    solid: (k) =>
      k.union([
        involuteGear(k, GEARS.hour, { thickness: Z.hour[1] - Z.hour[0], z0: Z.hour[0], bore: 4 + HOLE, crossing: CROSS(8, 3.5) }),
        arborZ(k, { r: 5.6, z0: Z.hour[0], z1: Z.hourHand[0], bore: 4 + HOLE }),
      ]),
    rest: spin(C, 0, 0),
    pose: (s) => spin(C, 0, s.angle.hour),
    explode: { dir: [-0.399421258459, -0.499276573074, 0.768885922534], distance: 300, order: 11 },
  },
  {
    id: 'dial',
    group: 'structure',
    material: 'dial',
    solid: dial,
    rest: { p: at([0, 0]) },
    explode: { dir: [-0.557006651896, 0.658280588604, 0.506369683542], distance: 380, order: 12 },
  },
  {
    id: 'dial-marks',
    group: 'structure',
    material: 'lacquer',
    solid: dialMarks,
    rest: { p: at([0, 0]) },
    explode: { dir: [0, 0, 1], distance: 0, order: 12, with: 'dial' },
  },
  {
    id: 'hour-hand',
    group: 'mechanism',
    material: 'lacquer',
    solid: (k) => handSolid(k, { len: 94, tail: 14, w0: 5, w1: 2, boss: 9, bore: 5.6, z: Z.hourHand, spade: 72 }),
    rest: spin(C, 0, 0),
    pose: (s) => spin(C, 0, -s.hands.hour),
    explode: { dir: [0.100180487463, 0.901624387163, 0.420758047343], distance: 380, order: 13 },
  },
  {
    id: 'minute-hand',
    group: 'mechanism',
    material: 'lacquer',
    solid: (k) => handSolid(k, { len: 142, tail: 22, w0: 4, w1: 1.4, boss: 7, bore: 4, z: Z.minuteHand }),
    rest: spin(C, 0, 0),
    pose: (s) => spin(C, 0, -s.hands.minute),
    explode: { dir: [0.100180487463, 0.901624387163, 0.420758047343], distance: 460, order: 14 },
  },
  {
    id: 'second-hand',
    group: 'mechanism',
    material: 'lacquer',
    solid: (k) => handSolid(k, { len: 24, tail: 8, w0: 1.6, w1: 0.8, boss: 3.6, bore: ARBOR.escape, z: Z.secondHand }),
    rest: spin(E, 0, 0),
    pose: (s) => spin(E, 0, -s.hands.second),
    explode: { dir: [0.100180487463, 0.901624387163, 0.420758047343], distance: 300, order: 13 },
  },
]

export const parts: PartDef<ClockState>[] = defs.map((d) => ({ ...d, ...text(d.id) }))

export type { Solid }
