// 内存作用域（arena）：manifold 的 WASM 对象不能被 GC 回收，必须手动 delete()。
//
// 规则：
//   - 所有 Solid / Region 只能在 kernel.scope(fn) 内创建；创建时自动登记到当前作用域。
//   - scope 结束时，除了 fn 的返回值（Solid、Solid 数组或对象的一层属性）之外，全部释放。
//   - 返回值被移交给外层作用域；最外层的返回值由调用者负责 .delete()。
//   - fn 抛错时，本作用域登记的全部对象都会被释放。
// 这样展品作者写 `solid: (k) => k.box(...).subtract(k.cylinder(...))` 时，中间结果自动释放。

export interface Disposable {
  delete(): void
  readonly deleted: boolean
}

const stack: Set<Disposable>[] = []

export function track<T extends Disposable>(x: T): T {
  const top = stack[stack.length - 1]
  if (!top) {
    x.delete()
    throw new Error('几何对象必须在 kernel.scope(() => …) 内创建，以免 WASM 内存泄漏')
  }
  top.add(x)
  return x
}

function collect(result: unknown, isOwned: (x: unknown) => x is Disposable): Set<Disposable> {
  const keep = new Set<Disposable>()
  const visit = (v: unknown, depth: number) => {
    if (isOwned(v)) keep.add(v)
    else if (depth > 0 && Array.isArray(v)) v.forEach((x) => visit(x, depth - 1))
    else if (depth > 0 && v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype)
      Object.values(v).forEach((x) => visit(x, depth - 1))
  }
  visit(result, 2)
  return keep
}

export function runScope<T>(fn: () => T, isOwned: (x: unknown) => x is Disposable): T {
  if (fn.constructor.name === 'AsyncFunction') throw new Error('kernel.scope 不支持异步函数')
  const arena = new Set<Disposable>()
  stack.push(arena)
  let result: T
  try {
    result = fn()
  } catch (err) {
    stack.pop()
    for (const x of arena) x.delete()
    throw err
  }
  stack.pop()
  const keep = collect(result, isOwned)
  const parent = stack[stack.length - 1]
  for (const x of arena) {
    if (keep.has(x)) parent?.add(x)
    else x.delete()
  }
  return result
}

/** 测试用：当前活着的作用域层数。 */
export function scopeDepth(): number {
  return stack.length
}
