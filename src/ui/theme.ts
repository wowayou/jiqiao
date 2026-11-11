// 主题：跟随系统 / 浅色 / 深色。偏好存在 localStorage（读写失败时退回跟随系统）。
import { useEffect, useState } from 'react'

export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'jiqiao-theme'

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

function systemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(readPref)
  const [sysDark, setSysDark] = useState(systemDark)
  useEffect(() => {
    let mq: MediaQueryList | null = null
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    const on = () => setSysDark(mq!.matches)
    mq.addEventListener('change', on)
    return () => mq!.removeEventListener('change', on)
  }, [])
  const resolved: 'light' | 'dark' = pref === 'auto' ? (sysDark ? 'dark' : 'light') : pref
  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])
  const update = (p: ThemePref) => {
    setPref(p)
    try {
      if (p === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, p)
    } catch {
      /* 存储不可用时只在本次会话生效 */
    }
  }
  return { pref, resolved, setPref: update }
}
