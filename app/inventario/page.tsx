"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface Lote {
  id: string
  bookTitle: string
  bookAuthor: string
  coverUrl: string | null
  proveedor: string
  cantidadDisponible: number
  cantidadInicial: number
  precioVenta: number
  costoReal: number
  fechaLlegada: string
}

type OrdenFiltro = 'reciente' | 'titulo' | 'stock' | 'precio'

export default function InventarioPage() {
  const router = useRouter()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<OrdenFiltro>('reciente')

  useEffect(() => { fetchInventario() }, [])

  const fetchInventario = async () => {
    setLoading(true)
  
    const { data: lots, error } = await supabase
    .from('inventory_lots')
    .select('id, initial_quantity, available_quantity, net_price_unit, sale_price_unit, real_cost_unit, book_id, purchase_id, created_at')
    .filter('available_quantity', 'gte', 1)   // aquí el cambio
    .order('created_at', { ascending: false })

      // Aquí imprimes el error en consola
  if (error) {
    console.log("Error en Supabase:", error)   // <-- este console.log
    setLotes([])
    setLoading(false)
    return
  }

  if (!lots || lots.length === 0) {
    setLotes([])
    setLoading(false)
    return
  }
  
    if (error || !lots || lots.length === 0) {
      setLotes([])
      setLoading(false)
      return
    }
  
    // Traer libros y pedidos relacionados
    const bookIds = [...new Set(lots.map(l => l.book_id).filter(Boolean))]
    const purchaseIds = [...new Set(lots.map(l => l.purchase_id).filter(Boolean))]
  
    const { data: books } = await supabase
      .from('books')
      .select('id, title, author, cover_url')
      .in('id', bookIds)
  
    const { data: purchases } = await supabase
      .from('purchases')
      .select('id, provider, arrival_date')
      .in('id', purchaseIds)
  
    const booksMap = Object.fromEntries((books ?? []).map(b => [b.id, b]))
    const purchasesMap = Object.fromEntries((purchases ?? []).map(p => [p.id, p]))
  
    const enriched: Lote[] = lots.map(l => ({
      id: l.id,
      bookTitle: booksMap[l.book_id]?.title ?? 'Sin título',
      bookAuthor: booksMap[l.book_id]?.author ?? '',
      coverUrl: booksMap[l.book_id]?.cover_url ?? null,
      proveedor: purchasesMap[l.purchase_id]?.provider ?? '',
      cantidadDisponible: l.available_quantity,
      cantidadInicial: l.initial_quantity,
      precioVenta: Number(l.sale_price_unit),
      costoReal: Number(l.real_cost_unit),
      fechaLlegada: purchasesMap[l.purchase_id]?.arrival_date ?? '',
    }))
  
    setLotes(enriched)
    setLoading(false)
  }
  

  const filtered = lotes
    .filter(l =>
      l.bookTitle.toLowerCase().includes(busqueda.toLowerCase()) ||
      l.bookAuthor.toLowerCase().includes(busqueda.toLowerCase()) ||
      l.proveedor.toLowerCase().includes(busqueda.toLowerCase())
    )
    .sort((a, b) => {
      if (orden === 'titulo') return a.bookTitle.localeCompare(b.bookTitle)
      if (orden === 'stock') return b.cantidadDisponible - a.cantidadDisponible
      if (orden === 'precio') return b.precioVenta - a.precioVenta
      return b.fechaLlegada.localeCompare(a.fechaLlegada)
    })

  const totalUnidades = lotes.reduce((s, l) => s + l.cantidadDisponible, 0)
  const valorCosto = lotes.reduce((s, l) => s + l.costoReal * l.cantidadDisponible, 0)
  const valorVenta = lotes.reduce((s, l) => s + l.precioVenta * l.cantidadDisponible, 0)

  const stockColor = (l: Lote) => {
    const pct = l.cantidadDisponible / l.cantidadInicial
    if (pct <= 0.2) return '#E53E3E'
    if (pct <= 0.5) return '#F6AD55'
    return '#48BB78'
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#EEF2FA', fontFamily: "'DM Sans', sans-serif", paddingBottom: 90 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input { font-family: 'DM Sans', sans-serif; color: #1A202C; }
        .top-bar { background: #4D7BFE; color: white; padding: 44px 24px 24px; border-radius: 0 0 28px 28px; }
        .back-btn { background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .search-bar { background: rgba(255,255,255,0.15); border: none; border-radius: 14px; padding: 12px 16px; color: white; width: 100%; font-size: 15px; margin-top: 14px; outline: none; font-family: 'DM Sans', sans-serif; }
        .search-bar::placeholder { color: rgba(255,255,255,0.6); }
        .stats-row { display: flex; gap: 10px; margin: 16px 20px 4px; }
        .stat-card { flex: 1; background: white; border-radius: 16px; padding: 14px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: center; }
        .filter-row { display: flex; gap: 8px; padding: 12px 20px 4px; overflow-x: auto; scrollbar-width: none; }
        .filter-row::-webkit-scrollbar { display: none; }
        .filter-chip { border: 1.5px solid #E2E8F0; background: white; border-radius: 20px; padding: 7px 14px; font-size: 13px; font-weight: 500; color: #718096; cursor: pointer; white-space: nowrap; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
        .filter-chip.active { border-color: #4D7BFE; background: #EEF2FA; color: #4D7BFE; font-weight: 700; }
        .section-title { font-size: 12px; font-weight: 700; color: #718096; padding: 14px 20px 8px; text-transform: uppercase; letter-spacing: 0.06em; }
        .lote-card { background: white; border-radius: 18px; padding: 16px 18px; margin: 0 20px 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.04); display: flex; gap: 14px; }
        .cover-box { width: 52px; height: 70px; border-radius: 8px; background: #EEF2FA; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; overflow: hidden; }
        .lote-bar-bg { height: 5px; background: #EEF2FA; border-radius: 3px; margin: 10px 0 8px; }
        .lote-bar-fill { height: 100%; border-radius: 3px; }
        .lote-stats { display: flex; justify-content: space-between; }
        .lote-stat-val { font-size: 13px; font-weight: 700; color: #1A202C; }
        .lote-stat-lab { font-size: 10px; color: #A0AEC0; margin-top: 1px; }
        .fab { position: fixed; bottom: 24px; right: 24px; background: #4D7BFE; color: white; border: none; border-radius: 18px; padding: 14px 20px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px rgba(77,123,254,0.4); display: flex; align-items: center; gap: 8px; font-family: 'DM Sans', sans-serif; text-decoration: none; }
      `}</style>

      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="back-btn" onClick={() => router.back()}>←</button>
          <div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>Stock actual</p>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Inventario</h1>
          </div>
        </div>
        <input className="search-bar" placeholder="Buscar libro, autor o proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <p style={{ fontSize: 18, fontWeight: 700, color: '#1A202C' }}>{totalUnidades}</p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Unidades</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>${valorCosto.toLocaleString('es-CO')}</p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Costo total</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#48BB78' }}>${valorVenta.toLocaleString('es-CO')}</p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Valor venta</p>
        </div>
      </div>

      <div className="filter-row">
        {([
          { key: 'reciente', label: '🕐 Reciente' },
          { key: 'titulo',   label: '🔤 A–Z' },
          { key: 'stock',    label: '📦 Mayor stock' },
          { key: 'precio',   label: '💵 Mayor precio' },
        ] as const).map(f => (
          <button key={f.key} className={`filter-chip ${orden === f.key ? 'active' : ''}`} onClick={() => setOrden(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <p className="section-title">
        {loading ? 'Cargando...' : `${filtered.length} lote(s) disponibles`}
      </p>

      {!loading && filtered.map(lote => {
        const pct = lote.cantidadInicial > 0 ? lote.cantidadDisponible / lote.cantidadInicial : 1
        const color = stockColor(lote)
        const margen = lote.costoReal > 0 ? Math.round((lote.precioVenta - lote.costoReal) / lote.costoReal * 100) : 0

        return (
          <div className="lote-card" key={lote.id}>
            <div className="cover-box">
              {lote.coverUrl
                ? <img src={lote.coverUrl} alt={lote.bookTitle} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                : '📖'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, paddingRight: 8 }}>
                  <p style={{ fontWeight: 700, color: '#1A202C', fontSize: 14 }}>{lote.bookTitle}</p>
                  {lote.bookAuthor && <p style={{ fontSize: 12, color: '#A0AEC0', marginTop: 2 }}>{lote.bookAuthor}</p>}
                  {lote.proveedor && <p style={{ fontSize: 11, color: '#CBD5E0', marginTop: 1 }}>{lote.proveedor}</p>}
                </div>
                <div style={{ background: color, color: 'white', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {lote.cantidadDisponible} uds.
                </div>
              </div>

              <div className="lote-bar-bg">
                <div className="lote-bar-fill" style={{ width: `${Math.round(pct * 100)}%`, background: color }} />
              </div>

              <div className="lote-stats">
                <div>
                  <p className="lote-stat-val">${lote.costoReal.toLocaleString('es-CO')}</p>
                  <p className="lote-stat-lab">Costo/u</p>
                </div>
                <div>
                  <p className="lote-stat-val">${lote.precioVenta.toLocaleString('es-CO')}</p>
                  <p className="lote-stat-lab">Precio venta</p>
                </div>
                <div>
                  <p className="lote-stat-val" style={{ color: '#48BB78' }}>+{margen}%</p>
                  <p className="lote-stat-lab">Margen</p>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A0AEC0' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>📦</p>
          <p>No hay lotes disponibles</p>
        </div>
      )}

      <Link href="/pedidos/nuevo" className="fab">+ Nuevo Pedido</Link>
    </main>
  )
}