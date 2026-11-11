// manifold 初始化：浏览器里用 Vite 产出的 wasm URL（locateFile），Node 里用包的默认定位。
// 两边得到同一个 Kernel 接口；整个进程只初始化一次。
import Module from 'manifold-3d'
import { createKernel, type Kernel } from './kernel'

let pending: Promise<Kernel> | null = null

async function load(): Promise<Kernel> {
  let wasm
  if (typeof window !== 'undefined') {
    const { default: url } = await import('manifold-3d/manifold.wasm?url')
    wasm = await Module({ locateFile: () => url })
  } else {
    wasm = await Module()
  }
  wasm.setup()
  return createKernel(wasm)
}

/** 取得全局唯一的 Kernel（首次调用时加载 WASM）。 */
export function getKernel(): Promise<Kernel> {
  pending ??= load().catch((err) => {
    pending = null
    throw err
  })
  return pending
}
