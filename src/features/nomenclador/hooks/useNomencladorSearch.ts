'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Prestacion } from '../types/nomenclador'

export function useNomencladorSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Prestacion[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  function search(newQuery: string) {
    setQuery(newQuery)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (newQuery.length < 2) {
      setResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()

      const { data } = await supabase
        .from('prestaciones')
        .select('id, codigo, detalle, honorarios, gastos, total, seccion, categoria, obra_social')
        .eq('obra_social', 'OSEP')
        .or(`codigo.ilike.%${newQuery}%,detalle.ilike.%${newQuery}%`)
        .limit(30)

      setResults(data ?? [])
      setLoading(false)
    }, 300)
  }

  return { query, results, loading, search }
}
