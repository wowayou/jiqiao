// 统一三维展台。几何只建一次；每帧只做：t → simulate → 位姿/可见性/高亮。
// 剖切：GPU 裁切平面 + 模板缓冲（stencil）补截面，零件移动时截面也实时正确，不需要重算几何。
import { Canvas, createPortal, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  BufferGeometry,
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
import { sectionPlane, timelineSpan, useStage, useStageStore, type StageStore } from './store'

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
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} />
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

  const viewNonce = useStage((s) => s.viewNonce)
  const cameraRef = useRef({ fitted: -1 })
  useEffect(() => {
    if (cameraRef.current.fitted === viewNonce && viewNonce !== 0) return
    cameraRef.current.fitted = viewNonce
    const dir = new Vector3(...(def.view?.dir ?? DEFAULT_VIEW)).normalize()
    const aspect = gl.domElement.clientWidth / Math.max(1, gl.domElement.clientHeight)
    const tanV = Math.tan((camera.fov * Math.PI) / 360)
    const tanH = tanV * aspect
    // 相机基：right、up 垂直于视线；逐个包围盒角点求「刚好装下」的距离
    const right = new Vector3(0, 1, 0).cross(dir).normalize()
    const up = dir.clone().cross(right).normalize()
    const center = frame.center
    let dist = 0
    const { min, max } = frame.box
    for (let i = 0; i < 8; i++) {
      const p = new Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(center)
      const z = p.dot(dir)
      dist = Math.max(dist, z + Math.abs(p.dot(right)) / tanH, z + Math.abs(p.dot(up)) / tanV)
    }
    dist *= 1.06
    camera.position.copy(center).addScaledVector(dir, dist)
    camera.near = Math.max(1, dist / 50)
    camera.far = dist * 10
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(center)
      controls.update()
    } else camera.lookAt(center)
  }, [viewNonce, frame, camera, controls, def, gl])

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
    const secOn = st.section.on
    for (const it of insts) {
      const ist = scene.get(it.inst.key)!
      it.group.visible = ist.visible
      it.group.position.set(...ist.pose.p)
      if (ist.pose.q) it.group.quaternion.set(...ist.pose.q)
      else it.group.quaternion.identity()
      const id = it.inst.part.id
      const v: Variant = focus.parts.has(id) ? 'accent' : fadeOthers ? 'faded' : 'normal'
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
