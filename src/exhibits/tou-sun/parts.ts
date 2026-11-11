// 透榫零件：立料（带出口放大的卯眼）、横料（带锯缝的榫头）、楔。
import { postWithMortise, railWithTenon, wedgeFor } from '../../kit'
import type { PartDef } from '../../exhibit/types'
import { PART_TEXT } from './content'
import { DIM, SHOULDER_X, explodeOf, railPose, wedgePose, type JointState } from './model'

export const parts: PartDef<JointState>[] = [
  {
    id: 'post',
    ...PART_TEXT.post,
    group: 'structure',
    material: 'wood-dark',
    solid: (k) =>
      postWithMortise(k, {
        size: DIM.post,
        mortise: { height: DIM.tenon.height, thickness: DIM.tenon.thickness, flare: DIM.flare },
      }),
    rest: { p: [0, 0, 0] },
    explode: explodeOf('post'),
  },
  {
    id: 'rail',
    ...PART_TEXT.rail,
    group: 'structure',
    material: 'wood-light',
    solid: (k) => railWithTenon(k, { ...DIM.rail, tenon: DIM.tenon, kerf: DIM.kerf }),
    rest: { p: [SHOULDER_X, 0, 0] },
    pose: railPose,
    explode: explodeOf('rail'),
  },
  {
    id: 'wedge',
    ...PART_TEXT.wedge,
    group: 'mechanism',
    material: 'wood-end',
    solid: (k) => wedgeFor(k, DIM.tenon, DIM.kerf, { protrude: DIM.wedgeProtrude }),
    rest: { p: [SHOULDER_X, 0, 0] },
    pose: wedgePose,
    explode: explodeOf('wedge'),
  },
]
