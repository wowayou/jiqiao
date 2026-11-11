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
  Vector3,
  type Object3D,
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { evaluateScene, instancesOf, splitRef, type PartInstance } from '../exhibit/scene'
import type { AnyExhibit, FeatureDef } from '../exhibit/types'
import type { Vec3 } from '../kinematics/vec'
import { buildGeometries, disposeGeometries, type PartGeometry } from './buildGeometry'
import { activeStepIds, computeFocus } from './focus'
import { MaterialLibrary, THEMES, type Variant } from './materials'
import { prefersReducedMotion, sectionPlane, timelineSpan, useStage, useStageStore, type CameraGoal, type StageStore } from './store'

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
    const s = def.simulate(def.timeline.kind === 'assembly' ? 1 : 0, def.defaults)
    for (const ex of [1, 0]) {
      const sc = evaluateScene(def, s, ex)
      for (const it of insts) {
        const st = sc.get(it.inst.key)!
        const bb = geoms.get(it.inst.part.id)!.surface.boundingBox!.clone()
        const q = st.pose.q ? new Quaternion(...st.pose.q) : new Quaternion()
        const m = new Group()
        m.position.set(...st.pose.p)
        m.quaternion.copy(q)
        m.updateMatrixWorld()
        bb.applyMatrix4(m.matrixWorld)
        box.union(bb)
        if (ex === 0) restBox.union(bb)
      }
    }
    const sphere = box.getBoundingSphere(new Sphere())
    // 取景中心偏向装配态（主体居中），距离仍保证爆炸态整体在画面内
    const center = def.view?.target
      ? new Vector3(...def.view.target)
      : restBox.getCenter(new Vector3()).lerp(box.getCenter(new Vector3()), 0.4)
    return { box, sphere, center }
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
    const { min, max } = frame.box
    for (let i = 0; i < 8; i++) {
      const p = new Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(center)
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
      const sph = partsSphere(g.ids, g.features)
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
    if (st.playing) {
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
          gl.domElement.style.cursor = id ? 'pointer' : ''
        }}
        onPointerOut={() => {
          store.getState().hover(null)
          gl.domElement.style.cursor = ''
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
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
      {labels.map(({ it, feature }, i) => (
        <Fragment key={`${it.inst.key}#${feature.id}`}>
          {createPortal(
            <Html position={feature.anchor} center zIndexRange={[20, 0]}>
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
