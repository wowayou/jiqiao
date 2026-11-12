// 统一三维展台。几何只建一次；每帧只做：t → simulate → 位姿/可见性/高亮。
// 剖切：GPU 裁切平面 + 模板缓冲（stencil）补截面，零件移动时截面也实时正确，不需要重算几何。
import { Canvas, createPortal, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  BufferGeometry,
  MathUtils,
  DoubleSide,
  MeshBasicMaterial,
  Raycaster,
  Group,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Quaternion,
  Sphere,
  Vector2,
  Vector3,
  type Object3D,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { basePose, evaluateScene, instancesOf, splitRef, type PartInstance } from '../exhibit/scene'
import { tourDomain, tourTick } from '../exhibit/tour'
import type { Vec2 } from '../kinematics/vec'
import { STILL_FRACTION, peakSpeed, solveDrag } from './drive'
import { stepSize } from './timeline'
import type { AnyExhibit, DriveDef, FeatureDef } from '../exhibit/types'
import type { Vec3 } from '../kinematics/vec'
import { buildGeometries, disposeGeometries, type PartGeometry } from './buildGeometry'
import { activeStepIds, computeFocus } from './focus'
import { MaterialLibrary, THEMES, type Variant } from './materials'
import { prefersReducedMotion, sectionPlane, timelineSpan, useStage, useStageStore, wrapT, type CameraGoal, type StageStore } from './store'

interface Inst {
  inst: PartInstance
  index: number
  group: Group
  mesh: Mesh
  edges: LineSegments
  stencilBack: Mesh
  stencilFront: Mesh
  cap: Mesh
  state: string
}

const DEFAULT_VIEW: Vec3 = [1, 0.8, 1.4]
/** 重建场景（换主题）时记住相机，不跳回默认取景 */
const savedCamera = new WeakMap<object, { target: Vector3; dir: Vector3; dist: number }>()

export interface StageProps {
  def: AnyExhibit
  theme: 'light' | 'dark'
  /** 可访问名称 */
  label: string
}

export function Stage({ def, theme, label }: StageProps) {
  const store = useStageStore()
  const [geoms, setGeoms] = useState<Map<string, PartGeometry> | null>(null)

  useEffect(() => {
    const signal = { cancelled: false }
    let built: Map<string, PartGeometry> | null = null
    store.setState({ ready: false, error: null, buildProgress: 0 })
    buildGeometries(def, (d, n) => store.setState({ buildProgress: d / n }), signal)
      .then((m) => {
        if (signal.cancelled) return
        built = m
        setGeoms(m)
        store.setState({ ready: true })
      })
      .catch((err: Error) => {
        console.error(err)
        store.setState({ error: `几何构建失败：${err.message}` })
      })
    return () => {
      signal.cancelled = true
      if (built) disposeGeometries(built)
    }
  }, [def, store])

  return (
    <Canvas
      className="stage-canvas"
      aria-label={label}
      role="img"
      flat
      dpr={[1, 2]}
      gl={{ stencil: true, antialias: true, alpha: true, preserveDrawingBuffer: true }}
      camera={{ fov: 32, near: 1, far: 100000, position: [1500, 1200, 2000] }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        gl.setClearColor(0x000000, 0)
      }}
      onPointerMissed={() => store.getState().select(null)}
    >
      <hemisphereLight args={['#fffaf0', '#8a7f70', 1.1]} />
      <directionalLight position={[-1.2, 2, 1.4]} intensity={1.7} />
      <directionalLight position={[1.5, 0.6, -1]} intensity={0.45} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} zoomToCursor minDistance={4} maxDistance={20000} />
      {geoms && <SceneContent def={def} geoms={geoms} theme={theme} store={store} />}
    </Canvas>
  )
}

interface Built {
  lib: MaterialLibrary
  root: Group
  capGroup: Group
  insts: Inst[]
}

/** 建场景对象（一次）。放在 effect 里而不是 useMemo，StrictMode 的卸载/重挂也能正确释放与重建。 */
function SceneContent({ def, geoms, theme, store }: { def: AnyExhibit; geoms: Map<string, PartGeometry>; theme: 'light' | 'dark'; store: StageStore }) {
  const [built, setBuilt] = useState<Built | null>(null)
  useEffect(() => {
    const lib = new MaterialLibrary(THEMES[theme])
    const root = new Group()
    const capGroup = new Group()
    const insts: Inst[] = []
    instancesOf(def).forEach((inst, index) => {
      const g = geoms.get(inst.part.id)!
      const group = new Group()
      group.name = inst.key
      const mesh = new Mesh(g.surface, lib.surface(inst.part.material, 'normal'))
      mesh.userData = { pick: inst.part.id }
      const edges = new LineSegments(g.edges, lib.line('normal'))
      edges.raycast = () => {}
      const stencilBack = new Mesh(g.surface, lib.stencilBack)
      const stencilFront = new Mesh(g.surface, lib.stencilFront)
      for (const m of [stencilBack, stencilFront]) {
        m.raycast = () => {}
        m.visible = false
      }
      stencilBack.renderOrder = index * 3 + 1
      stencilFront.renderOrder = index * 3 + 2
      group.add(mesh, edges, stencilBack, stencilFront)
      const cap = new Mesh(new PlaneGeometry(1, 1), lib.cap(inst.part.material, false))
      cap.renderOrder = index * 3 + 3
      cap.raycast = () => {}
      cap.visible = false
      capGroup.add(cap)
      insts.push({ inst, index, group, mesh, edges, stencilBack, stencilFront, cap, state: '' })
      root.add(group)
    })
    const top = insts.length * 3 + 10
    for (const it of insts) {
      it.mesh.renderOrder = top
      it.edges.renderOrder = top + 1
    }
    setBuilt({ lib, root, capGroup, insts })
    return () => {
      root.clear()
      capGroup.children.forEach((c) => (c as Mesh).geometry.dispose())
      capGroup.clear()
      lib.dispose()
      setBuilt(null)
    }
  }, [def, geoms, theme])
  return built ? <SceneLive def={def} geoms={geoms} store={store} {...built} /> : null
}

function SceneLive({ def, geoms, store, lib, root, capGroup, insts }: Built & { def: AnyExhibit; geoms: Map<string, PartGeometry>; store: StageStore }) {
  const { camera, controls, gl } = useThree() as unknown as { camera: PerspectiveCamera; controls: OrbitControlsImpl | null; gl: { domElement: HTMLCanvasElement } }
  const plane = useMemo(() => new Plane(new Vector3(0, 0, -1), 0), [])

  // —— 取景：装配态与完全爆炸态的并集都要在画面内 ——
  const frame = useMemo(() => {
    const box = new Box3()
    const restBox = new Box3()
    // 每个零件包围盒的 8 个角点（世界坐标）：取景按真实点云求「刚好装下」，比并集 AABB 的 8 角更紧
    const points: Vector3[] = []
    const s = def.simulate(def.timeline.kind === 'assembly' ? 1 : 0, def.defaults)
    for (const ex of [1, 0]) {
      const sc = evaluateScene(def, s, ex)
      for (const it of insts) {
        const st = sc.get(it.inst.key)!
        // 爆炸时隐藏的示意物（粮粒、水流）不参与取景，否则画面会被不可见的东西撑大
        if (!st.visible) continue
        const local = geoms.get(it.inst.part.id)!.surface.boundingBox!
        const q = st.pose.q ? new Quaternion(...st.pose.q) : new Quaternion()
        const m = new Group()
        m.position.set(...st.pose.p)
        m.quaternion.copy(q)
        m.updateMatrixWorld()
        const bb = local.clone().applyMatrix4(m.matrixWorld)
        box.union(bb)
        if (ex === 0) restBox.union(bb)
        for (let i = 0; i < 8; i++) points.push(new Vector3(i & 1 ? local.max.x : local.min.x, i & 2 ? local.max.y : local.min.y, i & 4 ? local.max.z : local.min.z).applyMatrix4(m.matrixWorld))
      }
    }
    const sphere = box.getBoundingSphere(new Sphere())
    // 取景中心偏向装配态（主体居中），距离仍保证爆炸态整体在画面内
    const center = def.view?.target
      ? new Vector3(...def.view.target)
      : restBox.getCenter(new Vector3()).lerp(box.getCenter(new Vector3()), 0.4)
    return { box, sphere, center, points }
  }, [def, insts, geoms])

  // —— 相机 ——
  // 取景把界面浮层（工具条、机位条）占掉的边缘算进去：可用高度 = 画布高 − 上下 inset，
  // 并用 setViewOffset 把画面整体挪到可用区域的中央，所以装配态和爆炸态都不会钻到浮层底下。
  const inset = useStage((s) => s.inset)
  const camGoal = useStage((s) => s.camGoal)
  const anim = useRef<{ t0: number; dur: number; t: Vector3; d0: Vector3; d1: Vector3; dist0: number; dist1: number; from: Vector3; to: Vector3 } | null>(null)
  const userMoved = useRef(false)

  const metrics = () => {
    const W = Math.max(1, gl.domElement.clientWidth)
    const H = Math.max(1, gl.domElement.clientHeight)
    const { top, bottom } = store.getState().inset
    const Hu = Math.max(H * 0.4, H - top - bottom)
    const tanV = Math.tan((camera.fov * Math.PI) / 360)
    return { W, H, top, bottom, tanV, tanVu: (tanV * Hu) / H, tanH: (tanV * W) / H }
  }

  const fitBox = (center: Vector3, dir: Vector3): number => {
    const { tanH, tanVu } = metrics()
    const right = new Vector3(0, 1, 0).cross(dir).normalize()
    const up = dir.clone().cross(right).normalize()
    let dist = 0
    for (const pt of frame.points) {
      const p = pt.clone().sub(center)
      const z = p.dot(dir)
      dist = Math.max(dist, z + Math.abs(p.dot(right)) / tanH, z + Math.abs(p.dot(up)) / tanVu)
    }
    return dist * 1.06
  }
  const fitSphere = (radius: number): number => {
    const { tanH, tanVu } = metrics()
    return (radius * 1.18) / Math.sin(Math.atan(Math.min(tanH, tanVu)))
  }
  const currentDir = () => camera.position.clone().sub(controls ? controls.target : frame.center).normalize()
  const currentTarget = () => (controls ? controls.target.clone() : frame.center.clone())

  /** 把相机带到 (target, dir, dist)。reduced motion 或 instant 时直接到位，不做缓动。 */
  const goTo = (target: Vector3, dir: Vector3, dist: number, instant = false) => {
    const d0 = currentDir()
    const from = currentTarget()
    const dist0 = camera.position.distanceTo(from)
    if (instant || prefersReducedMotion()) {
      anim.current = null
      applyCamera(target, dir, dist)
      return
    }
    // 距离远、转角大时慢一点，上限 0.9 s
    const travel = from.distanceTo(target) / Math.max(dist, 1) + Math.abs(Math.log(dist / dist0)) + d0.angleTo(dir)
    anim.current = { t0: performance.now(), dur: MathUtils.clamp(350 + travel * 220, 400, 900), t: target, d0, d1: dir.clone(), dist0, dist1: dist, from, to: target.clone() }
  }
  const applyCamera = (target: Vector3, dir: Vector3, dist: number) => {
    camera.position.copy(target).addScaledVector(dir, dist)
    if (controls) {
      controls.target.copy(target)
      controls.update()
    } else camera.lookAt(target)
  }
  const stepAnim = () => {
    const a = anim.current
    if (!a) return
    const u = MathUtils.clamp((performance.now() - a.t0) / a.dur, 0, 1)
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2
    const target = a.from.clone().lerp(a.to, e)
    const q = new Quaternion().setFromUnitVectors(a.d0, a.d1)
    const dir = a.d0.clone().applyQuaternion(new Quaternion().slerp(q, e)).normalize()
    const dist = Math.exp(MathUtils.lerp(Math.log(a.dist0), Math.log(a.dist1), e))
    applyCamera(target, dir, dist)
    if (u >= 1) anim.current = null
  }

  const defaultDir = () => new Vector3(...(def.view?.dir ?? DEFAULT_VIEW)).normalize()

  // 世界坐标里一组零件（含副本）的包围球；features 是 'part#feature' 引用，只取标注点
  const partsSphere = (ids: string[], features: string[] = []): Sphere | null => {
    const box = new Box3()
    const set = new Set(ids)
    for (const it of insts) {
      if (!set.has(it.inst.part.id) || !it.group.visible) continue
      it.group.updateMatrixWorld(true)
      box.union(new Box3().setFromObject(it.mesh, true))
    }
    const featurePts: Vector3[] = []
    for (const ref of features) {
      const [pid, fid] = splitRef(ref)
      const feat = def.parts.find((p) => p.id === pid)?.features?.find((f) => f.id === fid)
      const it = insts.find((i) => i.inst.part.id === pid)
      if (feat && it) {
        it.group.updateMatrixWorld(true)
        featurePts.push(it.group.localToWorld(new Vector3(...feat.anchor)))
      }
    }
    // 协同链环里「整件」引用的零件很大时（只想指出其上的特征），以特征点为准
    if (featurePts.length && !box.isEmpty()) {
      const sz = box.getSize(new Vector3()).length()
      if (sz > 600 && ids.every((i) => features.some((f) => splitRef(f)[0] === i))) box.makeEmpty()
    }
    for (const p of featurePts) box.expandByPoint(p).expandByScalar(0)
    if (box.isEmpty()) return null
    const sph = box.getBoundingSphere(new Sphere())
    if (featurePts.length) sph.radius = Math.max(sph.radius, 70)
    return sph
  }

  // 一组零件在若干时刻扫过的范围（讲解：镜头要框住这一环在整个时间窗里的运动，而不只是此刻的位置）。
  // 位姿直接由 simulate 求，不依赖此刻网格的位置；包围盒用局部包围盒的 8 个角点，略松但足够取景。
  const partsSphereAt = (ids: string[], features: string[], times: number[]): Sphere | null => {
    const st = store.getState()
    const box = new Box3()
    const set = new Set(ids)
    const featurePts: Vector3[] = []
    const m = new Group()
    for (const t of times) {
      const sc = evaluateScene(def, def.simulate(t, st.controls), st.explode)
      for (const it of insts) {
        if (!set.has(it.inst.part.id)) continue
        const ist = sc.get(it.inst.key)!
        if (!ist.visible) continue
        m.position.set(...ist.pose.p)
        if (ist.pose.q) m.quaternion.set(...ist.pose.q)
        else m.quaternion.identity()
        m.updateMatrixWorld()
        box.union(geoms.get(it.inst.part.id)!.surface.boundingBox!.clone().applyMatrix4(m.matrixWorld))
      }
      for (const ref of features) {
        const [pid, fid] = splitRef(ref)
        const feat = def.parts.find((p) => p.id === pid)?.features?.find((f) => f.id === fid)
        const it = insts.find((i) => i.inst.part.id === pid)
        if (!feat || !it) continue
        const ist = sc.get(it.inst.key)!
        m.position.set(...ist.pose.p)
        if (ist.pose.q) m.quaternion.set(...ist.pose.q)
        else m.quaternion.identity()
        m.updateMatrixWorld()
        featurePts.push(new Vector3(...feat.anchor).applyMatrix4(m.matrixWorld))
      }
    }
    if (featurePts.length && !box.isEmpty()) {
      const sz = box.getSize(new Vector3()).length()
      if (sz > 600 && ids.every((i) => features.some((f) => splitRef(f)[0] === i))) box.makeEmpty()
    }
    for (const p of featurePts) box.expandByPoint(p)
    if (box.isEmpty()) return null
    const sph = box.getBoundingSphere(new Sphere())
    if (featurePts.length) sph.radius = Math.max(sph.radius, 70)
    return sph
  }

  // 从 camPos 看向 center，被哪些零件挡住（不含 targets 本身与已半透明的）
  const occludersOf = (camPos: Vector3, center: Vector3, targets: Set<string>): string[] => {
    const ray = new Raycaster(camPos.clone(), center.clone().sub(camPos).normalize(), 0, camPos.distanceTo(center))
    const fade = new Set(store.getState().fadeParts)
    const meshes = insts.filter((i) => i.group.visible && !fade.has(i.inst.part.id)).map((i) => i.mesh)
    const hits = ray.intersectObjects(meshes, false)
    const out: string[] = []
    for (const h of hits) {
      const id = h.object.userData.pick as string
      if (targets.has(id)) break
      if (!out.includes(id)) out.push(id)
    }
    return out
  }

  const handleGoal = (g: CameraGoal) => {
    if (g.kind === 'fit') {
      const dir = defaultDir()
      goTo(frame.center, dir, fitBox(frame.center, dir))
    } else if (g.kind === 'preset') {
      const v = def.views?.find((x) => x.id === g.id)
      if (!v) return
      const target = new Vector3(...v.target)
      const dir = (v.dir ? new Vector3(...v.dir) : defaultDir()).normalize()
      goTo(target, dir, fitSphere(v.size / 2))
    } else {
      const sph = g.times?.length ? partsSphereAt(g.ids, g.features ?? [], g.times) : partsSphere(g.ids, g.features)
      if (!sph) return
      const m = metrics()
      const dir = currentDir()
      if (g.auto) {
        // 点协同链：够大又没被挡住就不动镜头，免得打扰
        const dist = camera.position.distanceTo(sph.center)
        const frac = sph.radius / (dist * m.tanV)
        const blocked = occludersOf(camera.position, sph.center, new Set(g.ids)).length > 0
        if (frac > 0.1 && !blocked) return
      }
      const dist = fitSphere(Math.max(sph.radius, 12))
      const camPos = sph.center.clone().addScaledVector(dir, dist)
      goTo(sph.center, dir, dist)
      // 凑近之后仍被挡着的，让开（半透明）
      const occ = occludersOf(camPos, sph.center, new Set(g.ids))
      if (occ.length) {
        const prev = store.getState().fadeParts
        store.getState().setFade([...new Set([...prev, ...occ])])
      }
    }
  }

  // 初次取景 / 浮层尺寸变化而用户还没动过相机时重新取景（瞬间到位）；换主题重建场景时恢复上次相机
  const doneNonce = useRef(store.getState().camGoal?.nonce ?? 0)
  useEffect(() => {
    const saved = savedCamera.get(store)
    if (saved) {
      applyCamera(saved.target, saved.dir, saved.dist)
      userMoved.current = true
      return
    }
    if (userMoved.current) return
    const dir = defaultDir()
    goTo(frame.center, dir, fitBox(frame.center, dir), true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, controls, inset.top, inset.bottom])

  useEffect(() => {
    if (!camGoal || camGoal.nonce === doneNonce.current) return
    doneNonce.current = camGoal.nonce
    userMoved.current = true
    handleGoal(camGoal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camGoal])

  useEffect(() => {
    if (!controls) return
    const onStart = () => {
      userMoved.current = true
      anim.current = null
      store.getState().userMovedCamera()
    }
    controls.addEventListener('start', onStart)
    return () => {
      controls.removeEventListener('start', onStart)
      savedCamera.set(store, { target: controls.target.clone(), dir: camera.position.clone().sub(controls.target).normalize(), dist: camera.position.distanceTo(controls.target) })
    }
  }, [controls, camera, store])

  // 键盘按钮的旋转/缩放指令
  const viewCommand = useStage((s) => s.viewCommand)
  useEffect(() => {
    if (!viewCommand || !controls) return
    const target = controls.target
    const offset = camera.position.clone().sub(target)
    if (viewCommand.kind === 'orbit') offset.applyAxisAngle(new Vector3(0, 1, 0), viewCommand.amount)
    else offset.multiplyScalar(viewCommand.amount)
    camera.position.copy(target).add(offset)
    controls.update()
    anim.current = null
  }, [viewCommand, controls, camera])

  // —— 剖切开关 ——
  const section = useStage((s) => s.section)
  useEffect(() => {
    const c = frame.sphere.center
    const { normal, d } = sectionPlane(def, section, [c.x, c.y, c.z])
    plane.normal.set(...normal)
    plane.constant = -d
    lib.setClipping(section.on ? plane : null)
    // 截面板：放在平面上、足够大
    const size = frame.sphere.radius * 8
    const n = new Vector3(...normal)
    const center = frame.sphere.center.clone().addScaledVector(n, d - n.dot(frame.sphere.center))
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...normal).negate())
    for (const it of insts) {
      it.cap.scale.set(size, size, 1)
      it.cap.position.copy(center)
      it.cap.quaternion.copy(q)
    }
  }, [section, def, frame, plane, lib, insts])

  // —— 每帧 ——
  const lastSnap = useRef(0)
  useFrame((_, dtRaw) => {
    const st = store.getState()
    stepAnim()
    // 视图偏移：把画面挪到「去掉浮层后的可用区域」中央
    {
      const m = metrics()
      const dy = (m.top - m.bottom) / 2
      const v = camera.view
      if (!v || !v.enabled || v.fullWidth !== m.W || v.fullHeight !== m.H || Math.abs(v.offsetY + dy) > 0.5) {
        camera.setViewOffset(m.W, m.H, 0, -dy, m.W, m.H)
      }
      // 相机读数挂在画布元素上，供端到端测试与调试读取（不参与任何渲染逻辑）
      if (controls) {
        const o = camera.position.clone().sub(controls.target)
        const ds = gl.domElement.dataset
        ds.camDist = o.length().toFixed(1)
        ds.camAz = ((Math.atan2(o.x, o.z) * 180) / Math.PI).toFixed(1)
        ds.camTarget = `${controls.target.x.toFixed(0)},${controls.target.y.toFixed(0)},${controls.target.z.toFixed(0)}`
        ds.camAnim = anim.current ? '1' : '0'
      }
      // 近远裁剪面随当前距离走：凑近几毫米的零件时不会被近平面切掉
      const dist = controls ? camera.position.distanceTo(controls.target) : 1000
      const near = Math.max(0.4, dist * 0.02)
      const far = (dist + frame.sphere.radius * 2.5) * 1.5
      if (Math.abs(near - camera.near) / camera.near > 0.05 || Math.abs(far - camera.far) / camera.far > 0.05) {
        camera.near = near
        camera.far = far
        camera.updateProjectionMatrix()
      }
    }
    const dt = Math.min(dtRaw, 0.1)
    let t = st.t
    const tourPlanNow = st.tour && st.playing ? st.plan()[st.tour.index] : null
    if (tourPlanNow) {
      // 讲解：只在这一环的时间窗里循环，速度由时间窗决定（不改观众选的速度）
      t = wrapT(def, tourTick(t, tourPlanNow.window, tourPlanNow.rate, dt, timelineSpan(def), def.timeline.kind === 'cyclic'))
      store.setState({ t })
    } else if (st.playing) {
      const tl = def.timeline
      if (tl.kind === 'cyclic') t = (t + dt * st.speed) % timelineSpan(def)
      else {
        t = Math.min(1, t + (dt * st.speed) / tl.duration)
        if (t >= 1) store.setState({ playing: false })
      }
      store.setState({ t })
    }
    const s = def.simulate(t, st.controls)
    const scene = evaluateScene(def, s, st.explode)
    const active = activeStepIds(def, s)
    const focus = computeFocus(def, st.selected, st.pinnedStep, active)
    const fadeOthers = st.isolate && focus.parts.size > 0
    const fadeSet = new Set(st.fadeParts)
    const secOn = st.section.on
    for (const it of insts) {
      const ist = scene.get(it.inst.key)!
      it.group.visible = ist.visible
      it.group.position.set(...ist.pose.p)
      if (ist.pose.q) it.group.quaternion.set(...ist.pose.q)
      else it.group.quaternion.identity()
      const id = it.inst.part.id
      const v: Variant = focus.parts.has(id) ? 'accent' : fadeOthers || fadeSet.has(id) ? 'faded' : 'normal'
      const hover = st.hovered === id && v !== 'accent'
      const key = `${v}|${hover}|${secOn}`
      if (key !== it.state) {
        it.state = key
        it.mesh.material = lib.surface(it.inst.part.material, v)
        it.edges.material = lib.line(hover ? 'hover' : v)
        it.cap.material = lib.cap(it.inst.part.material, v === 'accent')
        const capsOn = secOn && v !== 'faded'
        it.stencilBack.visible = capsOn
        it.stencilFront.visible = capsOn
      }
      it.cap.visible = secOn && v !== 'faded' && ist.visible
    }
    const now = performance.now()
    if (now - lastSnap.current > 100) {
      lastSnap.current = now
      // 可拖零件提示点的屏幕位置，挂在画布上供端到端测试读取（不参与渲染逻辑）
      if (drives.length) {
        const el = gl.domElement
        el.dataset.driveAnchors = JSON.stringify(
          drives.map((d) => {
            const w = d.it.group.localToWorld(d.anchor.clone()).project(camera)
            return { part: d.def.part, x: Math.round(((w.x + 1) / 2) * el.clientWidth), y: Math.round(((1 - w.y) / 2) * el.clientHeight) }
          }),
        )
      }
      const prev = st.activeSteps
      const same = prev.length === active.length && prev.every((x, i) => x === active[i])
      store.setState(same ? { snapshot: s } : { snapshot: s, activeSteps: active })
    }
  })

  // —— 拾取 ——
  // 剖切时点在截面上：截面板不参与拾取，改为判断截面点落在哪个零件实体内
  const insideTester = useMemo(() => {
    const probe = new Raycaster()
    const dbl = new MeshBasicMaterial({ side: DoubleSide })
    const proxies = new Map<string, Mesh>()
    return (p: Vector3): string | null => {
      for (const it of insts) {
        if (!visibleInScene(it.group)) continue
        let m = proxies.get(it.inst.part.id)
        if (!m) proxies.set(it.inst.part.id, (m = new Mesh(it.mesh.geometry, dbl)))
        const local = it.group.worldToLocal(p.clone())
        const bb = (it.mesh.geometry as BufferGeometry).boundingBox
        if (bb && !bb.containsPoint(local)) continue
        probe.set(local, new Vector3(0.5773, 0.5774, 0.5773))
        const hits = probe.intersectObject(m, false)
        let n = 0
        let last = -1
        for (const h of hits) if (h.distance - last > 1e-4) ((n += 1), (last = h.distance))
        if (n % 2 === 1) return it.inst.part.id
      }
      return null
    }
  }, [insts])

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>): string | null => {
    let first: { id: string; distance: number } | null = null
    for (const hit of e.intersections) {
      const obj = hit.object
      const id = obj.userData?.pick as string | undefined
      if (!id || !visibleInScene(obj)) continue
      if (store.getState().fadeParts.includes(id)) continue
      if (lib.clipping.length && plane.distanceToPoint(hit.point) < 0) continue
      first = { id, distance: hit.distance }
      break
    }
    if (lib.clipping.length) {
      const p = e.ray.intersectPlane(plane, new Vector3())
      if (p) {
        const d = p.distanceTo(e.ray.origin)
        if (!first || d < first.distance) {
          const id = insideTester(p)
          if (id) return id
        }
      }
    }
    return first?.id ?? null
  }

  // —— 亲手驱动 ——
  // 抓住可拖零件上的一点拖动：每次指针移动求 dt（drive.ts），只改时间 t；零件的运动仍全部来自 simulate。
  const drives = useMemo(() => {
    const domain = tourDomain(def)
    return (def.drive ?? []).flatMap((d) => {
      const it = insts.find((i) => i.inst.part.id === d.part)
      if (!it) return []
      return [{ def: d, it, anchor: d.anchor ? new Vector3(...d.anchor) : autoAnchor(def, it, domain) }]
    })
  }, [def, insts])
  const driveOf = (id: string | null) => (id ? drives.find((d) => d.def.part === id) : undefined)
  const canDrive = () => store.getState().explode < 0.001

  /** 局部点在时刻 t 的屏幕坐标（相对画布，CSS px）。位姿直接由 simulate 求，不依赖此刻网格的位置。 */
  const projectAt = (it: Inst, local: Vector3, t: number): Vec2 | null => {
    const s = def.simulate(wrapT(def, t), store.getState().controls)
    const pose = basePose(it.inst.part, s, it.inst.copy)
    const w = local.clone()
    if (pose.q) w.applyQuaternion(new Quaternion(...pose.q))
    w.add(new Vector3(...pose.p)).project(camera)
    if (w.z > 1 || w.z < -1) return null
    const el = gl.domElement
    return [((w.x + 1) / 2) * el.clientWidth, ((1 - w.y) / 2) * el.clientHeight]
  }

  // 屏幕上一点看到的第一个零件表面（让开的、剖切切掉的不算）
  const surfaceAt = (clientX: number, clientY: number): { it: Inst; point: Vector3 } | null => {
    const r = gl.domElement.getBoundingClientRect()
    const ray = new Raycaster()
    ray.setFromCamera(new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), camera)
    const fade = new Set(store.getState().fadeParts)
    const meshes = insts.filter((i) => visibleInScene(i.group) && !fade.has(i.inst.part.id)).map((i) => i.mesh)
    for (const h of ray.intersectObjects(meshes, false)) {
      if (lib.clipping.length && plane.distanceToPoint(h.point) < 0) continue
      const it = insts.find((i) => i.mesh === h.object)
      return it ? { it, point: h.point } : null
    }
    return null
  }

  const suppressClick = useRef(false)
  useEffect(() => {
    const host = gl.domElement.parentElement
    if (!host || drives.length === 0) return
    let drag: {
      id: number
      drive: DriveDef
      it: Inst
      local: Vector3
      offset: Vec2
      x0: number
      y0: number
      moved: boolean
      h: number
      maxDt: number
      minSpeed: number
    } | null = null
    const rel = (e: PointerEvent): Vec2 => {
      const r = gl.domElement.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const end = () => {
      if (!drag) return
      if (drag.moved) {
        suppressClick.current = true
        setTimeout(() => (suppressClick.current = false), 400)
        store.getState().markDriveSeen()
      }
      drag = null
      if (controls) controls.enabled = true
      gl.domElement.style.cursor = ''
      store.setState({ dragging: null })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const [x, y] = rel(e)
      if (!drag.moved) {
        // 按下后挪动 3 px 才算拖动：原地点一下仍是选中零件
        if (Math.hypot(x - drag.x0, y - drag.y0) < 3) return
        drag.moved = true
        store.getState().setPlaying(false)
        store.setState({ dragging: drag.drive.part })
        gl.domElement.style.cursor = 'grabbing'
      }
      const st = store.getState()
      const d = drag
      const res = solveDrag({
        project: (t) => projectAt(d.it, d.local, t),
        t: st.t,
        target: [x - d.offset[0], y - d.offset[1]],
        h: d.h,
        minSpeed: d.minSpeed,
        maxDt: d.maxDt,
        bounds: def.timeline.kind === 'assembly' ? [0, 1] : undefined,
      })
      if (res.dt !== 0) st.setT(st.t + res.dt)
    }
    const onUp = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) end()
    }
    const onDown = (e: PointerEvent) => {
      if (drag) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (!canDrive()) return
      const hit = surfaceAt(e.clientX, e.clientY)
      const drive = hit && driveOf(hit.it.inst.part.id)
      if (!hit || !drive) return
      // 落在可拖零件上：这一次按下是拖零件，不是转视角（轨道控制器在它自己的按下处理里看到 enabled = false 就不接手）
      if (controls) controls.enabled = false
      const local = hit.it.group.worldToLocal(hit.point.clone())
      const st = store.getState()
      const span = tourDomain(def)
      const h = drive.def.scale ?? stepSize(def) / 8
      const p0 = projectAt(hit.it, local, st.t)
      const [x0, y0] = rel(e)
      const peak = peakSpeed((t) => projectAt(hit.it, local, t), st.t - span.length / 2, span.length, h)
      drag = {
        id: e.pointerId,
        drive: drive.def,
        it: hit.it,
        local,
        offset: p0 ? [x0 - p0[0], y0 - p0[1]] : [0, 0],
        x0,
        y0,
        moved: false,
        h,
        // 一次最多走小循环的 1/4；一步一停的零件（scale）按它的尺度放宽
        maxDt: Math.max(span.length / 4, (drive.def.scale ?? 0) * 30),
        minSpeed: Math.max(1e-9, peak * STILL_FRACTION),
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }
    host.addEventListener('pointerdown', onDown, { capture: true })
    return () => {
      host.removeEventListener('pointerdown', onDown, { capture: true })
      end()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drives, controls, gl, camera, def, store])

  const driveSeen = useStage((s) => s.driveSeen)
  const explodeNow = useStage((s) => s.explode)
  const showDrivePins = !driveSeen && explodeNow < 0.001

  const selected = useStage((s) => s.selected)
  const pinned = useStage((s) => s.pinnedStep)
  const activeSteps = useStage((s) => s.activeSteps)
  const labels = useMemo(() => {
    const f = computeFocus(def, selected, pinned, selected || pinned ? [] : activeSteps)
    const out: { it: Inst; feature: FeatureDef }[] = []
    for (const ref of f.features) {
      const [pid, fid] = splitRef(ref)
      const part = def.parts.find((p) => p.id === pid)
      const feature = part?.features?.find((x) => x.id === fid)
      const it = insts.find((i) => i.inst.part.id === pid)
      if (feature && it) out.push({ it, feature })
    }
    return out
  }, [def, selected, pinned, activeSteps, insts])

  return (
    <>
      <primitive
        object={root}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          const id = pick(e)
          if (store.getState().hovered !== id) store.getState().hover(id)
          if (store.getState().dragging) return
          // 可拖零件：手形光标
          gl.domElement.style.cursor = id ? (driveOf(id) && canDrive() ? 'grab' : 'pointer') : ''
        }}
        onPointerOut={() => {
          store.getState().hover(null)
          if (!store.getState().dragging) gl.domElement.style.cursor = ''
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          // 刚拖完零件松手：不当成点选
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          const id = pick(e)
          store.getState().select(id)
        }}
        onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          const id = pick(e)
          if (id) {
            store.getState().select(id)
            store.getState().focusPart(id)
          }
        }}
      />
      <primitive object={capGroup} />
      {showDrivePins &&
        // 同一句提示只标一处（左右两个足轮只标第一个）
        drives.filter((d, i) => drives.findIndex((x) => x.def.hint === d.def.hint) === i).map((d) => (
          <Fragment key={`drive-${d.def.part}`}>
            {createPortal(
              <Html position={[d.anchor.x, d.anchor.y, d.anchor.z]} center zIndexRange={[19, 0]} pointerEvents="none" wrapperClass="no-hit">
                <div className="drive-pin" role="note" data-drive={d.def.part}>
                  <span className="drive-ring" aria-hidden />
                  <span className="drive-hint">{d.def.hint}</span>
                </div>
              </Html>,
              d.it.group,
            )}
          </Fragment>
        ))}
      {labels.map(({ it, feature }, i) => (
        <Fragment key={`${it.inst.key}#${feature.id}`}>
          {createPortal(
            <Html position={feature.anchor} center zIndexRange={[20, 0]} pointerEvents="none" wrapperClass="no-hit">
              <div className="feature-pin" role="note">
                <span className="feature-dot" aria-hidden />
                {/* 多个标注时错开高度，避免互相遮挡 */}
                <span className="feature-label" style={{ bottom: 26 + (i % 3) * 26, ['--leader' as string]: `${14 + (i % 3) * 26}px` }}>
                  {feature.name}
                </span>
              </div>
            </Html>,
            it.group,
          )}
        </Fragment>
      ))}
    </>
  )
}

function visibleInScene(o: Object3D | null): boolean {
  for (let x = o; x; x = x.parent) if (!x.visible) return false
  return true
}

/**
 * 没写 anchor 的可拖零件：在推导范围里取样，挑运动幅度最大的顶点，再往零件包围盒中心收 3%（落在实体里，
 * 投到屏幕上仍在零件轮廓内）。只用于提示标记的位置。
 */
function autoAnchor(def: AnyExhibit, it: Inst, domain: { start: number; length: number }): Vector3 {
  const geo = it.mesh.geometry as BufferGeometry
  const pos = geo.getAttribute('position')
  const stride = Math.max(1, Math.floor(pos.count / 400))
  const times = Array.from({ length: 12 }, (_, k) => domain.start + (domain.length * k) / 12)
  const poses = times.map((t) => basePose(it.inst.part, def.simulate(wrapT(def, t), def.defaults), it.inst.copy))
  const v = new Vector3()
  const w = new Vector3()
  let best = -1
  const out = new Vector3()
  for (let i = 0; i < pos.count; i += stride) {
    v.fromBufferAttribute(pos, i)
    let lo = new Vector3(Infinity, Infinity, Infinity)
    let hi = new Vector3(-Infinity, -Infinity, -Infinity)
    for (const p of poses) {
      w.copy(v)
      if (p.q) w.applyQuaternion(new Quaternion(...p.q))
      w.add(new Vector3(...p.p))
      lo = lo.min(w)
      hi = hi.max(w)
    }
    const amp = hi.distanceTo(lo)
    if (amp > best + 1e-6) {
      best = amp
      out.copy(v)
    }
  }
  const c = geo.boundingBox!.getCenter(new Vector3())
  return out.lerp(c, 0.03)
}
