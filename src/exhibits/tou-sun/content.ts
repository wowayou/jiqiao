// 透榫的文字。docs/sources/ 里没有榫卯的史料，因此这里没有 'source' 陈述：
// 通行做法标 reconstruction，本站尺寸与刚体简化标 model，经测试验证的标 calc。
import type { Claim, FeatureDef } from '../../exhibit/types'

export const intro: Claim[] = [
  {
    text: '透榫：横料端部做出榫头，穿透立料上的卯眼，从另一面露出来。破头楔：在榫头端部锯一道缝，装好后从露头的一面把楔打进缝里。',
    provenance: 'reconstruction',
  },
  {
    text: '楔把榫头末端撑开，卯眼出口一段做得外大里小，撑开的榫头卡在里面，横料就拔不出来了。',
    provenance: 'reconstruction',
  },
  {
    text: '本模型是刚体，画不出木头被撑开的变形：锯缝预先画成与楔同形的 V 形缝，卯眼出口两侧留出的三角空隙，就是真实木料中被撑开的榫头填满的地方。',
    provenance: 'model',
  },
  { text: '各部尺寸（立料 80×80、横料 50×90、榫厚 16、榫高 70 等）为本站设定。', provenance: 'model' },
]

type PartText = { name: string; role: string; claims?: Claim[]; features?: FeatureDef[] }

export const PART_TEXT: Record<'post' | 'rail' | 'wedge', PartText> = {
  post: {
    name: '立料',
    role: '竖直的木料，开一个贯穿的卯眼接纳横料的榫头。',
    features: [
      {
        id: 'mortise',
        name: '卯眼',
        role: '贯穿立料的长方孔；四壁挡住榫头的上下、前后移动和转动。',
        anchor: [40, 0, 0],
        claims: [
          { text: '卯眼与榫头每侧留 0.1 mm 间隙，只为刚体模型避免面面重合；真实做法讲究严丝合缝。', provenance: 'model' },
        ],
      },
      {
        id: 'flare',
        name: '出口放大段',
        role: '卯眼靠出口的一段上下略放大，外大里小，给被楔撑开的榫头留位置。',
        anchor: [-40, 41, 0],
        claims: [
          { text: '出口一段做得外大里小，与楔配合锁住榫头。', provenance: 'reconstruction' },
          { text: '放大段长 30 mm、每侧放大 7 mm（等于楔头厚度的一半）为本站设定；模型里这段空隙留空，示意木料被撑开后的去处。', provenance: 'model' },
        ],
      },
    ],
  },
  rail: {
    name: '横料',
    role: '水平的木料，端部做出榫头穿过立料；榫肩抵住立料表面。',
    features: [
      {
        id: 'tenon',
        name: '榫头',
        role: '横料端部减薄的部分，穿透卯眼并露出约 12 mm。',
        anchor: [-46, 35, 0],
        claims: [{ text: '榫厚约为料厚的三分之一，是常见比例；具体尺寸为本站设定。', provenance: 'reconstruction' }],
      },
      {
        id: 'shoulder',
        name: '榫肩',
        role: '榫头根部的台阶面，抵住立料，挡住横料继续往里走。',
        anchor: [0, 45, 25],
      },
      {
        id: 'kerf',
        name: '锯缝',
        role: '在榫头端部沿水平方向锯开的缝，让楔能把榫头上下撑开。',
        anchor: [-52, 0, 0],
        claims: [
          { text: '缝的方向让楔把榫头朝卯眼上下两端撑开，而不是朝立料两侧，以免把立料顺纹撑裂。', provenance: 'reconstruction' },
          { text: '真实的锯缝只是一道窄缝；模型预先画成与楔同形的 V 形缝（刚体简化）。', provenance: 'model' },
        ],
      },
    ],
  },
  wedge: {
    name: '楔',
    role: '从露头的一面打进锯缝的薄木片，把榫头撑开。',
    claims: [
      { text: '楔头露出榫端 8 mm，实际做法常在打紧后锯平；本模型保留露头以便看清。', provenance: 'model' },
      { text: '楔本身靠木料回弹的挤压力和摩擦留在缝里；刚体模型表现不了这一点。', provenance: 'reconstruction' },
    ],
  },
}
