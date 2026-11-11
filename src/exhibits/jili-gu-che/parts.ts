// 记里鼓车零件：几何（只建一次）+ 位姿（状态的纯函数）+ 爆炸路径。文字在 content.ts。
import type { Kernel, Solid } from '../../kernel'
import type { PartDef } from '../../exhibit/types'
import { rope, shaft } from '../../kit'
import { armStar, crownPinWheel, radialPegWheel, rimCam, wheelBody } from '../../kit/pegGear'
import type { Vec2, Vec3 } from '../../kinematics/vec'
import { PART_TEXT } from './content'
import {
  ARM,
  GEAR,
  H,
  MARKS,
  MARK_SPACING,
  O2_XZ,
  O3_XZ,
  R,
  STRIKER_GEO,
  S_XZ,
  TEXT,
  Y0,
  Z_LI,
  Z_WHEEL,
  armPose,
  liPose,
  markX,
  rodPose,
  shangPose,
  wheelPose,
  xiaPose,
  xuanPose,
  zhongPose,
  type CarState,
  type StrikerGeo,
} from './model'

// —— 车箱外形（本站设定） ——
export const BOX = { x0: -1080, x1: 700, z: 940, post: 30 } as const
/** 一层、二层台板中间的开口（本站设定：为了从上方看见轮系） */
const DECK1_OPEN = { x0: -950, x1: 480, z0: -690, z1: 400 } as const
const DECK2_OPEN = { x0: -950, x1: 480, z0: -650, z1: 700 } as const
const UP: Vec3 = [0, 1, 0]

/** 竖直圆柱：底面中心 (x, y0, z)，高到 y1 */
const vcyl = (k: Kernel, xz: Vec2, y0: number, y1: number, r: number, seg = 48) =>
  k.cylinder({ r, h: y1 - y0, center: false, segments: seg }).translate([xz[0], y0, xz[1]])

const roadWheel = (k: Kernel) =>
  wheelBody(k, { rimIn: 850, rimOut: R.wheel, rimY0: -40, rimY1: 40, spokes: 18, spokeW: 40, hubR: 65, hubY0: -110, hubY1: 110, holeR: 45.5, segments: 160 })

const liLun = (k: Kernel) =>
  radialPegWheel(k, {
    z: TEXT.li.z,
    rimIn: GEAR.li.rimIn,
    rimOut: GEAR.li.rimOut,
    rimY0: -GEAR.li.halfT,
    rimY1: GEAR.li.halfT,
    spokes: 6,
    spokeW: 26,
    hubR: 65,
    // 毂套向外伸到左轮毂内端（世界 z = −890），留 0.3 mm
    hubY0: -(Z_LI + Z_WHEEL - 110) + 0.3,
    hubY1: GEAR.li.halfT,
    holeR: 45.5,
    pegR: GEAR.li.pegR,
    pegIn: GEAR.li.pegIn,
    pegOut: GEAR.li.pegOut,
    pegY: 0,
  })

const xiaPing = (k: Kernel) =>
  crownPinWheel(k, {
    z: TEXT.xia.z,
    pitchR: R.xia,
    pinR: GEAR.xia.pinR,
    pinY0: H.xiaPinBottom,
    pinY1: H.xiaRim[0] + 4,
    rimIn: GEAR.xia.rimIn,
    rimOut: GEAR.xia.rimOut,
    rimY0: H.xiaRim[0],
    rimY1: H.xiaRim[1],
    spokes: 6,
    spokeW: 44,
    hubR: 60,
    hubY0: H.xiaHub[0],
    hubY1: H.xiaHub[1],
    holeR: 30.3,
  })

const zhongPing = (k: Kernel) =>
  crownPinWheel(k, {
    z: TEXT.zhong.z,
    pitchR: R.zhong,
    pinR: GEAR.zhong.pinR,
    pinY0: H.zhongPinBottom,
    pinY1: H.zhongRim[0] + 4,
    rimIn: GEAR.zhong.rimIn,
    rimOut: GEAR.zhong.rimOut,
    rimY0: H.zhongRim[0],
    rimY1: H.zhongRim[1],
    spokes: 8,
    spokeW: 36,
    hubR: 55,
    hubY0: H.zhongHub[0],
    hubY1: H.zhongHub[1],
    holeR: 25.3,
  })

const xiaoPing = (k: Kernel) =>
  crownPinWheel(k, {
    z: TEXT.xiao.z,
    pitchR: R.xiao,
    pinR: GEAR.xiao.pinR,
    pinY0: H.xiaoDisc[1] - 4,
    pinY1: H.xiaoPinTop,
    rimIn: 30,
    rimOut: GEAR.xiao.discR,
    rimY0: H.xiaoDisc[0],
    rimY1: H.xiaoDisc[1],
    spokes: 0,
    spokeW: 0,
    hubR: 34,
    hubY0: H.xiaoDisc[0],
    hubY1: H.xiaoDisc[1],
    holeR: 25.3,
  })

const shangPing = (k: Kernel) =>
  crownPinWheel(k, {
    z: TEXT.shang.z,
    pitchR: R.shang,
    pinR: GEAR.shang.pinR,
    pinY0: H.shangPinBottom,
    pinY1: H.shangRim[0] + 4,
    rimIn: GEAR.shang.rimIn,
    rimOut: GEAR.shang.rimOut,
    rimY0: H.shangRim[0],
    rimY1: H.shangRim[1],
    spokes: 8,
    spokeW: 32,
    hubR: 45,
    hubY0: H.shangHub[0],
    hubY1: H.shangHub[1],
    holeR: 20.3,
  })

/** 提杆：局部原点 = 圆脚中心，圆脚轴沿 +X（径向）；下段收细到高过凸轮，再接粗杆，杆顶圆头。 */
const rod = (g: StrikerGeo) => (k: Kernel) => {
  const c = g.cfg
  const foot = shaft(k, { r: c.footRad, length: 2 * c.footHalf, axis: 'x', chamfer: 0.5, segments: 24 })
  const neckR = c.footRad - 0.8
  const neckH = c.lift + 10
  const neck = k.cylinder({ r: neckR, h: neckH, center: false, segments: 20 })
  const body = k.cylinder({ r: ARM.rodR, h: g.rodLen - neckH, center: false, segments: 24 }).translate([0, neckH, 0])
  const tip = k.sphere(ARM.tipR, 24).translate([0, g.rodLen, 0])
  return k.union([foot, neck, body, tip])
}

/** 槌臂：局部原点 = 肩轴，臂沿 +X，肩轴沿 Z。 */
const arm = (k: Kernel) => {
  const bar = k.boxFromTo([-ARM.rear, -ARM.half, -ARM.side], [ARM.len, ARM.half, ARM.side])
  const head = k.cylinder({ r: ARM.headR, h: ARM.headDrop + ARM.half, center: false, segments: 32 }).translate([ARM.len, -ARM.headDrop, 0])
  const hole = k.cylinder({ r: ARM.holeR, h: 40, axis: 'z', segments: 24 })
  return bar.add(head).subtract(hole)
}

/** 木人：局部坐标与槌臂相同（原点在肩轴、+X 为击打方向），身体在臂平面的 side 一侧。 */
const figure = (side: 1 | -1, height: number) => (k: Kernel) => {
  const zc = side * 52
  const robe = k
    .revolve(
      [
        [0, 0],
        [70, 0],
        [64, 40],
        [52, 150],
        [40, 250],
        [36, 290],
        [24, 315],
        [0, 315],
      ],
      48,
    )
    .translate([0, -height + 0.3, zc])
  const head = k.sphere(40, 32).translate([0, -height + 0.3 + 355, zc])
  const pin = k.cylinder({ r: ARM.pinR, h: 30 + 17, axis: 'z', center: false, segments: 24 }).translate([0, 0, side > 0 ? -10 : -37])
  // 另一只手臂垂在身侧（不动）
  const other = k.rod([0, -10, zc + side * 46], [10, -170, zc + side * 54], 11, 16)
  return k.union([robe, head, pin, other])
}

const drumBody = (g: StrikerGeo) => (k: Kernel) => {
  const y0 = H.deck1[1] + 0.3
  const y1 = g.faceY - 6
  const hgt = y1 - y0
  return k
    .revolve(
      [
        [0, 0],
        [84, 0],
        [96, hgt * 0.35],
        [96, hgt * 0.65],
        [84, hgt],
        [0, hgt],
      ],
      64,
    )
    .translate([g.faceXZ[0], y0, g.faceXZ[1]])
}

const drumHead = (g: StrikerGeo) => (k: Kernel) => vcyl(k, g.faceXZ, g.faceY - 6, g.faceY, 86, 64)

const zhuo = (g: StrikerGeo) => (k: Kernel) => {
  const top = g.faceY
  const bell = k
    .revolve(
      [
        [70, top - 86],
        [76, top - 86],
        [66, top - 40],
        [48, top - 10],
        [20, top],
        [0, top],
        [0, top - 6],
        [18, top - 6],
        [42, top - 16],
        [60, top - 42],
        [70, top - 86],
      ],
      64,
    )
    .translate([g.faceXZ[0], 0, g.faceXZ[1]])
  const post = vcyl(k, g.faceXZ, H.deck2[1] + 0.3, top - 6.3, 12, 32)
  const base = vcyl(k, g.faceXZ, H.deck2[1] + 0.3, H.deck2[1] + 20, 40, 32)
  return k.union([bell, post, base])
}

const postAt = (k: Kernel, x: number, z: number, y0: number, y1: number) =>
  k.boxFromTo([x - BOX.post / 2, y0, z - BOX.post / 2], [x + BOX.post / 2, y1, z + BOX.post / 2])

const POST_X = [BOX.x0 + BOX.post / 2, BOX.x1 - BOX.post / 2]
const POST_Z = BOX.z - BOX.post / 2

const frameLower = (k: Kernel) => {
  const [f0, f1] = H.floor
  const floor = k
    .boxFromTo([BOX.x0, f0, -BOX.z], [BOX.x1, f1, BOX.z])
    .subtract(k.boxFromTo([-240, f0 - 1, Z_LI - 22], [240, f1 + 1, Z_LI + 22]))
  const parts: Solid[] = [floor]
  for (const x of POST_X) {
    for (const z of [-POST_Z, POST_Z, S_XZ[1], O2_XZ[1]]) parts.push(postAt(k, x, z, f1, H.deck1[0]))
  }
  const [b0, b1] = H.bars
  const barA = k
    .boxFromTo([BOX.x0, b0, S_XZ[1] - 15], [BOX.x1, b1, S_XZ[1] + 15])
    .subtract(vcyl(k, S_XZ, b0 - 1, b1 + 1, 30.5))
  const barB = k
    .boxFromTo([BOX.x0, b0, O2_XZ[1] - 15], [BOX.x1, b1, O2_XZ[1] + 15])
    .subtract(vcyl(k, O2_XZ, b0 - 1, b1 + 1, 25.5))
  parts.push(barA, barB)
  // 立贯心轴的底座
  parts.push(vcyl(k, S_XZ, f1, f1 + 30, 52).subtract(vcyl(k, S_XZ, f1 - 1, f1 + 31, 30.5)))
  // 伏兔：底板下骑在车轴上的两块垫木
  for (const z of [-700, 700]) {
    const block = k.boxFromTo([-90, Y0 + 30, z - 50], [90, f0, z + 50])
    parts.push(block.subtract(k.cylinder({ r: 45.3, h: 120, axis: 'z' }).translate([0, Y0, z])))
  }
  return k.union(parts)
}

/** 台板四周的勾阑（低栏）：立柱 + 扶手，内缩 inset */
const railing = (k: Kernel, y: number, inset: number, height: number) => {
  const x0 = BOX.x0 + inset
  const x1 = BOX.x1 - inset
  const z = BOX.z - inset
  const parts: Solid[] = []
  const rail = (a: Vec3, b: Vec3) => parts.push(k.boxFromTo(a, b))
  const w = 20
  rail([x0, y + height - 24, -z], [x1, y + height, -z + w])
  rail([x0, y + height - 24, z - w], [x1, y + height, z])
  rail([x0, y + height - 24, -z], [x0 + w, y + height, z])
  rail([x1 - w, y + height - 24, -z], [x1, y + height, z])
  const nX = 8
  for (let i = 0; i <= nX; i++) {
    const x = x0 + w / 2 + ((x1 - x0 - w) * i) / nX
    for (const zz of [-z + w / 2, z - w / 2]) parts.push(k.boxFromTo([x - 8, y, zz - 8], [x + 8, y + height - 24, zz + 8]))
  }
  const nZ = 4
  for (let i = 1; i < nZ; i++) {
    const zz = -z + w / 2 + ((2 * z - w) * i) / nZ
    for (const x of [x0 + w / 2, x1 - w / 2]) parts.push(k.boxFromTo([x - 8, y, zz - 8], [x + 8, y + height - 24, zz + 8]))
  }
  return k.union(parts)
}

const deck1 = (k: Kernel) => {
  const [d0, d1] = H.deck1
  const lo = STRIKER_GEO.lower
  const up = STRIKER_GEO.upper
  // 台板中间开一个大口，好从上面看见轮系；两道梁跨过开口，吊住中平轮轴、上平轮轴的轴座
  const slab = k
    .boxFromTo([BOX.x0, d0, -BOX.z], [BOX.x1, d1, BOX.z])
    .subtract(k.boxFromTo([DECK1_OPEN.x0, d0 - 1, DECK1_OPEN.z0], [DECK1_OPEN.x1, d1 + 1, DECK1_OPEN.z1]))
    .add(k.boxFromTo([BOX.x0, d0, O2_XZ[1] - 35], [BOX.x1, d1, O2_XZ[1] + 35]))
    .add(k.boxFromTo([BOX.x0, d0, O3_XZ[1] - 35], [BOX.x1, d1, O3_XZ[1] + 35]))
    .subtract(vcyl(k, lo.rod, d0 - 1, d1 + 1, ARM.rodR + 1.5, 32))
    .subtract(vcyl(k, up.rod, d0 - 1, d1 + 1, ARM.rodR + 1.5, 32))
  const blockZ = vcyl(k, O2_XZ, 1420, d0 + 1, 45).subtract(vcyl(k, O2_XZ, 1418, 1458, 25.5))
  const blockS = vcyl(k, O3_XZ, 1420, d0 + 1, 45)
  const collar = vcyl(k, O3_XZ, d1 - 1, d1 + 22, 40)
  return k
    .union([slab, blockZ, blockS, collar, railing(k, d1, 40, 150)])
    .subtract(vcyl(k, O3_XZ, 1418, d1 + 30, 20.5))
}

const frameUpper = (k: Kernel) => {
  const [d0, d1] = H.deck2
  const parts: Solid[] = []
  for (const x of POST_X) for (const z of [-POST_Z, POST_Z]) parts.push(postAt(k, x, z, H.deck1[1], d0))
  parts.push(
    k
      .boxFromTo([BOX.x0, d0, -BOX.z], [BOX.x1, d1, BOX.z])
      .subtract(k.boxFromTo([DECK2_OPEN.x0, d0 - 1, DECK2_OPEN.z0], [DECK2_OPEN.x1, d1 + 1, DECK2_OPEN.z1]))
      .subtract(vcyl(k, STRIKER_GEO.upper.rod, d0 - 1, d1 + 1, ARM.rodR + 1.5, 32)),
  )
  parts.push(railing(k, d1, 40, 150))
  return k.union(parts)
}

const yuan = (k: Kernel) => {
  const pts: Vec3[] = [
    [BOX.x1 + 2, 1010, 0],
    [1150, 1010, 0],
    [1550, 1120, 0],
    [1850, 1300, 0],
    [1960, 1450, 0],
  ]
  const pole = rope(k, pts, 38, 20)
  const head = k.sphere(62, 24).scale([1.3, 1, 0.8]).translate([1985, 1510, 0])
  const beak = k.cylinder({ r: 30, r2: 2, h: 90, axis: 'x', center: false, segments: 16 }).translate([2050, 1500, 0])
  const crest = k.cylinder({ r: 14, r2: 3, h: 80, center: false, segments: 12 }).rotate([0, 0, 1], 0.5).translate([1975, 1555, 0])
  return k.union([pole, head, beak, crest])
}

type P = PartDef<CarState>
const T = (id: keyof typeof PART_TEXT) => ({ id, ...PART_TEXT[id] })

const lo = STRIKER_GEO.lower
const up = STRIKER_GEO.upper

export const parts: P[] = [
  {
    ...T('ground'),
    group: 'base',
    material: 'earth',
    solid: (k) => k.boxFromTo([-MARKS * MARK_SPACING * 0.5, -60, -1300], [MARKS * MARK_SPACING * 0.5, 0, 1300]),
    rest: { p: [0, 0, 0] },
    explode: { dir: UP, distance: 0, order: 0 },
  },
  {
    ...T('marks'),
    group: 'base',
    material: 'wood-end',
    solid: (k) => k.boxFromTo([-14, -1, -1250], [14, 0.2, 1250]),
    copies: MARKS,
    rest: { p: [0, 0, 0] },
    pose: (s, i) => ({ p: [markX(s, i), 0, 0] }),
    visible: (s) => s.showMarks,
    explode: { dir: UP, distance: 0, order: 0, hide: true },
  },
  {
    ...T('axle'),
    group: 'structure',
    material: 'wood-dark',
    solid: (k) => shaft(k, { r: 45, length: 2 * (Z_WHEEL + 140), axis: 'z', chamfer: 4 }),
    rest: { p: [0, Y0, 0] },
    explode: { dir: UP, distance: 0, order: 0 },
  },
  {
    ...T('frame-lower'),
    group: 'structure',
    material: 'wood-dark',
    solid: frameLower,
    rest: { p: [0, 0, 0] },
    explode: { dir: UP, distance: 0, order: 1 },
  },
  {
    ...T('wheel-left'),
    group: 'mechanism',
    material: 'wood-light',
    solid: roadWheel,
    rest: wheelPose(-Z_WHEEL)({ ang: { wheel: Math.PI / 2 } } as CarState),
    pose: wheelPose(-Z_WHEEL),
    explode: { dir: [0, 0, -1], distance: 600, order: 2 },
  },
  {
    ...T('wheel-right'),
    group: 'structure',
    material: 'wood-light',
    solid: roadWheel,
    rest: wheelPose(Z_WHEEL)({ ang: { wheel: Math.PI / 2 } } as CarState),
    pose: wheelPose(Z_WHEEL),
    explode: { dir: [0, 0, 1], distance: 600, order: 2 },
  },
  {
    ...T('li-lun'),
    group: 'mechanism',
    material: 'wood-light',
    solid: liLun,
    rest: liPose({ ang: { wheel: Math.PI / 2 } } as CarState),
    pose: liPose,
    explode: { dir: [0, 0, 1], distance: 330, order: 3, with: 'wheel-left' },
    features: [
      { id: 'pegs', name: '立轮木销', role: '沿半径插在轮辋上的圆木销；转到顶上时伸进下平轮的冠销之间。', anchor: [GEAR.li.pegOut, 0, 0] },
    ],
  },
  {
    ...T('guan-xin-zhou'),
    group: 'mechanism',
    material: 'wood-dark',
    solid: (k) => vcyl(k, [0, 0], H.floor[1] + 0.3, H.guanTop, 30),
    rest: { p: [S_XZ[0], 0, S_XZ[1]] },
    pose: xiaPose,
    explode: { dir: UP, distance: 300, order: 4 },
  },
  {
    ...T('xia-ping'),
    group: 'mechanism',
    material: 'wood-light',
    solid: xiaPing,
    rest: { p: [S_XZ[0], 0, S_XZ[1]] },
    pose: xiaPose,
    explode: { dir: UP, distance: 0, order: 4, with: 'guan-xin-zhou' },
    features: [
      { id: 'pins', name: '下平轮冠销', role: '从轮辋向下垂的木销，被立轮顶上的木销拨着走。', anchor: [0, H.xiaPinBottom, R.xia] },
    ],
  },
  {
    ...T('xuan-feng'),
    group: 'mechanism',
    material: 'brass',
    solid: (k) =>
      armStar(k, {
        arms: TEXT.xuan.z,
        rootR: GEAR.xuan.rootR,
        tipR: GEAR.xuan.tipR,
        armR: GEAR.xuan.armR,
        armY0: H.xuanArm[0],
        armY1: H.xuanArm[1],
        hubR: GEAR.xuan.hubR,
        hubY0: H.xuanHub[0],
        hubY1: H.xuanHub[1],
      }),
    rest: { p: [S_XZ[0], 0, S_XZ[1]] },
    pose: xuanPose,
    explode: { dir: UP, distance: 140, order: 5, with: 'guan-xin-zhou' },
    features: [
      {
        id: 'arm',
        name: '拨齿',
        role: '三根之一：扫过中平轮的木销，推满一个齿距后滑脱。',
        anchor: [GEAR.xuan.tipR, H.xuanArm[1], 0],
      },
    ],
  },
  {
    ...T('zhong-zhou'),
    group: 'mechanism',
    material: 'wood-dark',
    solid: (k) => vcyl(k, [0, 0], H.zhongShaftBottom, H.zhongShaftTop, 25),
    rest: { p: [O2_XZ[0], 0, O2_XZ[1]] },
    pose: zhongPose,
    explode: { dir: UP, distance: 0, order: 6, with: 'zhong-ping' },
  },
  {
    ...T('zhong-ping'),
    group: 'mechanism',
    material: 'wood-light',
    solid: zhongPing,
    rest: { p: [O2_XZ[0], 0, O2_XZ[1]] },
    pose: zhongPose,
    explode: { dir: UP, distance: 600, order: 6 },
    features: [
      { id: 'pins', name: '中平轮冠销', role: '从轮辋向下垂的 100 根木销，被旋风轮的拨齿一根根拨过。', anchor: [-R.zhong, H.zhongPinBottom, 0] },
    ],
  },
  {
    ...T('bozi-zhong'),
    group: 'control',
    material: 'iron',
    solid: (k) => rimCam(k, lo.cam),
    rest: { p: [O2_XZ[0], 0, O2_XZ[1]] },
    pose: zhongPose,
    explode: { dir: UP, distance: 70, order: 7, with: 'zhong-ping' },
  },
  {
    ...T('xiao-ping'),
    group: 'mechanism',
    material: 'wood-light',
    solid: xiaoPing,
    rest: { p: [O2_XZ[0], 0, O2_XZ[1]] },
    pose: zhongPose,
    explode: { dir: UP, distance: 180, order: 7, with: 'zhong-ping' },
    features: [
      { id: 'pins', name: '小平轮立销', role: '立在小盘边上的木销，拨上平轮垂下的冠销。', anchor: [R.xiao, H.xiaoPinTop, 0] },
    ],
  },
  {
    ...T('shang-ping'),
    group: 'mechanism',
    material: 'wood-light',
    solid: shangPing,
    rest: { p: [O3_XZ[0], 0, O3_XZ[1]] },
    pose: shangPose,
    explode: { dir: UP, distance: 900, order: 8 },
    features: [
      { id: 'pins', name: '上平轮冠销', role: '从轮辋向下垂的 100 根木销，被小平轮的木销拨着走。', anchor: [R.shang, H.shangPinBottom, 0] },
    ],
  },
  {
    ...T('shang-zhou'),
    group: 'mechanism',
    material: 'wood-dark',
    solid: (k) => vcyl(k, [0, 0], H.shangShaft[0], H.shangShaft[1], 20),
    rest: { p: [O3_XZ[0], 0, O3_XZ[1]] },
    pose: shangPose,
    explode: { dir: UP, distance: 0, order: 8, with: 'shang-ping' },
  },
  {
    ...T('bozi-shang'),
    group: 'control',
    material: 'iron',
    solid: (k) => rimCam(k, up.cam),
    rest: { p: [O3_XZ[0], 0, O3_XZ[1]] },
    pose: shangPose,
    explode: { dir: UP, distance: 60, order: 9, with: 'shang-ping' },
  },
  {
    ...T('deck-1'),
    group: 'structure',
    material: 'wood-dark',
    solid: deck1,
    rest: { p: [0, 0, 0] },
    explode: { dir: UP, distance: 1050, order: 10 },
  },
  {
    ...T('ti-gan-xia'),
    group: 'control',
    material: 'wood-light',
    solid: rod(lo),
    rest: rodPose('lower')({ lower: { footY: lo.cfg.rimTop + 0.3 + lo.cfg.footRad } } as CarState),
    pose: rodPose('lower'),
    explode: { dir: UP, distance: 0, order: 10, with: 'deck-1' },
  },
  {
    ...T('ti-gan-shang'),
    group: 'control',
    material: 'wood-light',
    solid: rod(up),
    rest: rodPose('upper')({ upper: { footY: up.cfg.rimTop + 0.3 + up.cfg.footRad } } as CarState),
    pose: rodPose('upper'),
    explode: { dir: UP, distance: 0, order: 10, with: 'deck-1' },
  },
  {
    ...T('drum'),
    group: 'subject',
    material: 'lacquer',
    solid: drumBody(lo),
    rest: { p: [0, 0, 0] },
    explode: { dir: UP, distance: 0, order: 11, with: 'deck-1' },
  },
  {
    ...T('drum-head'),
    group: 'subject',
    material: 'hide',
    solid: drumHead(lo),
    rest: { p: [0, 0, 0] },
    explode: { dir: UP, distance: 0, order: 11, with: 'deck-1' },
  },
  {
    ...T('figure-lower'),
    group: 'subject',
    material: 'wood-light',
    solid: figure(lo.cfg.bodySide, lo.cfg.pivotY - H.deck1[1]),
    rest: { p: lo.pivot, q: armPose('lower')({ lower: { arm: 0 } } as CarState).q },
    explode: { dir: UP, distance: 0, order: 11, with: 'deck-1' },
  },
  {
    ...T('arm-lower'),
    group: 'control',
    material: 'wood-dark',
    solid: arm,
    rest: armPose('lower')({ lower: { arm: ARM.restAngle } } as CarState),
    pose: armPose('lower'),
    explode: { dir: UP, distance: 0, order: 11, with: 'deck-1' },
  },
  {
    ...T('frame-upper'),
    group: 'structure',
    material: 'wood-dark',
    solid: frameUpper,
    rest: { p: [0, 0, 0] },
    explode: { dir: UP, distance: 550, order: 12, with: 'deck-1' },
  },
  {
    ...T('zhuo'),
    group: 'subject',
    material: 'brass',
    solid: zhuo(up),
    rest: { p: [0, 0, 0] },
    explode: { dir: UP, distance: 0, order: 13, with: 'frame-upper' },
  },
  {
    ...T('figure-upper'),
    group: 'subject',
    material: 'wood-light',
    solid: figure(up.cfg.bodySide, up.cfg.pivotY - H.deck2[1]),
    rest: { p: up.pivot, q: armPose('upper')({ upper: { arm: 0 } } as CarState).q },
    explode: { dir: UP, distance: 0, order: 13, with: 'frame-upper' },
  },
  {
    ...T('arm-upper'),
    group: 'control',
    material: 'wood-dark',
    solid: arm,
    rest: armPose('upper')({ upper: { arm: ARM.restAngle } } as CarState),
    pose: armPose('upper'),
    explode: { dir: UP, distance: 0, order: 13, with: 'frame-upper' },
  },
  {
    ...T('yuan'),
    group: 'structure',
    material: 'lacquer',
    solid: yuan,
    rest: { p: [0, 0, 0] },
    explode: { dir: [1, 0, 0], distance: 500, order: 14 },
  },
]
