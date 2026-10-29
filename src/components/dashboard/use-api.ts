'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiscountsResponse, HistoryPoint, PricesResponse } from '@/lib/types'

/** 简单的轮询 + 手动刷新 hook（避免额外引入 react-query provider） */
export function usePrices(pollMs = 60_000) {
  const [data, setData] = useState<PricesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const firstLoad = useRef(true)

  const refresh = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices${force ? '?force=1' : ''}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setData(json as PricesResponse)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(false)
      firstLoad.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), pollMs)
    return () => clearInterval(timer)
  }, [refresh, pollMs])

  return { data, error, loading, refresh }
}

export function useHistory(hashName: string | null, pollMs = 120_000) {
  const [points, setPoints] = useState<HistoryPoint[]>([])

  useEffect(() => {
    if (!hashName) return
    let alive = true
    const load = async () => {
      try {
        const res = await fetch(
          `/api/history?hashName=${encodeURIComponent(hashName)}&limit=300`,
          { cache: 'no-store' },
        )
        const json = await res.json()
        if (alive && Array.isArray(json.points)) setPoints(json.points as HistoryPoint[])
      } catch {
        /* 忽略历史查询错误 */
      }
    }
    void load()
    const timer = setInterval(load, pollMs)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [hashName, pollMs])

  return hashName ? points : []
}

/** 游戏折扣数据（服务端 10 分钟缓存，客户端 5 分钟轻轮询） */
export function useDiscounts(limit: number, pollMs = 300_000) {
  const [data, setData] = useState<DiscountsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(
    async (force = false) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/discounts?limit=${limit}${force ? '&force=1' : ''}`, {
          cache: 'no-store',
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
        setData(json as DiscountsResponse)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : '未知错误')
      } finally {
        setLoading(false)
      }
    },
    [limit],
  )

  useEffect(() => {
    void refresh(false)
    const timer = setInterval(() => void refresh(false), pollMs)
    return () => clearInterval(timer)
  }, [refresh, pollMs])

  return { data, error, loading, refresh }
}
