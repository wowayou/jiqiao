// 实体 → three BufferGeometry。
// 法线按二面角拆分：夹角大于 sharpAngle 的棱保持锐利（顶点各自一份法线），
// 小于它的（圆柱面的小平面之间）共享法线，因此曲面看起来平滑。
import { BufferAttribute, BufferGeometry } from 'three'
import type { Kernel } from './kernel'
import { Solid } from './solid'

export const DEFAULT_SHARP_ANGLE = 35

export function toBufferGeometry(k: Kernel, solid: Solid, sharpAngle = DEFAULT_SHARP_ANGLE): BufferGeometry {
  return k.scope(() => {
    const withNormals = new Solid(solid.raw.calculateNormals(0, sharpAngle))
    const mesh = withNormals.raw.getMesh()
    const { numProp, vertProperties, triVerts } = mesh
    const count = vertProperties.length / numProp
    const pos = new Float32Array(count * 3)
    const nor = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const o = i * numProp
      pos[i * 3] = vertProperties[o]
      pos[i * 3 + 1] = vertProperties[o + 1]
      pos[i * 3 + 2] = vertProperties[o + 2]
      if (numProp >= 6) {
        nor[i * 3] = vertProperties[o + 3]
        nor[i * 3 + 1] = vertProperties[o + 4]
        nor[i * 3 + 2] = vertProperties[o + 5]
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setIndex(new BufferAttribute(new Uint32Array(triVerts), 1))
    if (numProp >= 6) geo.setAttribute('normal', new BufferAttribute(nor, 3))
    else geo.computeVertexNormals()
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    return geo
  })
}
