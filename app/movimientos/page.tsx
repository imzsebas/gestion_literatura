"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type TipoMovimiento = 'venta' | 'abono' | 'ofrendado' | 'pedido_libros' | 'pedido_envio'

interface Movimiento {
  id: string
  tipo: TipoMovimiento
  descripcion: string
  monto: number
  fecha: string
  icono: string
  // Datos extra para el detalle
  detalle: any
}

export default function MovimientosPage() {
  const router = useRouter()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Movimiento | null>(null)
  const [filtro, setFiltro] = useState<'todos' | TipoMovimiento>('todos')

  const fmt = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })
  const fmtFecha = (f: string) => new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  useEffect(() => { fetchMovimientos() }, [])

  const fetchMovimientos = async () => {
    setLoading(true)
    const items: Movimiento[] = []

    // ── 1. Movimientos de caja (ventas, abonos, ofrendados) ──
    const { data: cashMov } = await supabase
      .from('cash_movements')
      .select('id, type, concept, amount, payment_method, receipt_number, sale_id, created_at, created_by')
      .order('created_at', { ascending: false })

    // Traer datos de ventas relacionadas
    const saleIds = [...new Set((cashMov ?? []).map(m => m.sale_id).filter(Boolean))]
    const { data: salesData } = saleIds.length > 0
      ? await supabase.from('sales').select('id, payment_type, payment_method, total, advance_payment, member_id, created_by').in('id', saleIds)
      : { data: [] }

    // Traer miembros
    const memberIds = [...new Set((salesData ?? []).map(s => s.member_id).filter(Boolean))]
    const { data: membersData } = memberIds.length > 0
      ? await supabase.from('members').select('id, name, cedula, phone').in('id', memberIds)
      : { data: [] }

    // Traer usuarios (quién vendió)
    const userIds = [...new Set([
      ...(salesData ?? []).map(s => s.created_by),
      ...(cashMov ?? []).map(m => m.created_by),
    ].filter(Boolean))]
    const { data: usersData } = userIds.length > 0
      ? await supabase.from('users').select('id, name').in('id', userIds)
      : { data: [] }

    // Traer items de venta (libros vendidos)
    const { data: saleItemsData } = saleIds.length > 0
      ? await supabase.from('sale_items').select('sale_id, quantity, sale_price_snapshot, real_cost_snapshot, book_id, inventory_lot_id').in('sale_id', saleIds)
      : { data: [] }

    const bookIds = [...new Set((saleItemsData ?? []).map(i => i.book_id).filter(Boolean))]
    const { data: booksData } = bookIds.length > 0
      ? await supabase.from('books').select('id, title, author, cover_url').in('id', bookIds)
      : { data: [] }

    // Traer deudas relacionadas a ventas a crédito
    const { data: debtsData } = saleIds.length > 0
      ? await supabase.from('debts').select('id, sale_id, original_amount, pending_amount, status').in('sale_id', saleIds)
      : { data: [] }

    // Mapas para lookup rápido
    const salesMap = Object.fromEntries((salesData ?? []).map(s => [s.id, s]))
    const membersMap = Object.fromEntries((membersData ?? []).map(m => [m.id, m]))
    const usersMap = Object.fromEntries((usersData ?? []).map(u => [u.id, u]))
    const booksMap = Object.fromEntries((booksData ?? []).map(b => [b.id, b]))
    const itemsBySale: Record<string, any[]> = {}
    for (const item of saleItemsData ?? []) {
      if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = []
      itemsBySale[item.sale_id].push({ ...item, book: booksMap[item.book_id] })
    }
    const debtsBySale: Record<string, any> = {}
    for (const d of debtsData ?? []) debtsBySale[d.sale_id] = d

    for (const m of cashMov ?? []) {
      const sale = m.sale_id ? salesMap[m.sale_id] : null
      const member = sale ? membersMap[sale.member_id] : null
      const vendedor = usersMap[m.created_by ?? sale?.created_by] ?? null
      const libros = m.sale_id ? (itemsBySale[m.sale_id] ?? []) : []
      const deuda = m.sale_id ? debtsBySale[m.sale_id] : null

      const tipo: TipoMovimiento = m.concept === 'gifted' ? 'ofrendado'
        : m.concept === 'advance' ? 'abono'
        : 'venta'

      const descripcion = tipo === 'venta'
        ? `Venta ${sale?.payment_type === 'contado' ? 'Contado' : sale?.payment_type === 'credi_contado' ? 'Credi-Contado' : 'Crédito'}`
        : tipo === 'abono' ? 'Abono a deuda'
        : 'Libro ofrendado'

      items.push({
        id: `cm-${m.id}`,
        tipo,
        descripcion,
        monto: m.type === 'income' ? Number(m.amount) : -Number(m.amount),
        fecha: m.created_at,
        icono: tipo === 'venta' ? '🛒' : tipo === 'abono' ? '💰' : '🎁',
        detalle: { sale, member, vendedor, libros, deuda, cashMov: m },
      })
    }

    // ── 2. Pedidos (gasto en libros + envío por separado) ──
    const { data: pedidosData } = await supabase
      .from('purchases')
      .select('id, provider, arrival_date, shipping_cost, notes, created_at, created_by')
      .order('created_at', { ascending: false })

    const pedidoIds = (pedidosData ?? []).map(p => p.id)
    const { data: lotesData } = pedidoIds.length > 0
      ? await supabase.from('inventory_lots').select('purchase_id, initial_quantity, net_price_unit, sale_price_unit, real_cost_unit, book_id').in('purchase_id', pedidoIds)
      : { data: [] }

    const lotesBySale: Record<string, any[]> = {}
    for (const l of lotesData ?? []) {
      if (!lotesBySale[l.purchase_id]) lotesBySale[l.purchase_id] = []
      lotesBySale[l.purchase_id].push({ ...l, book: booksMap[l.book_id] })
    }

    for (const p of pedidosData ?? []) {
      const registrador = usersMap[p.created_by] ?? null
      const lotes = lotesBySale[p.id] ?? []
      const costoLibros = lotes.reduce((s: number, l: any) => s + (l.initial_quantity * Number(l.net_price_unit)), 0)
      const totalUnidades = lotes.reduce((s: number, l: any) => s + l.initial_quantity, 0)

      if (costoLibros > 0) {
        items.push({
          id: `ped-libros-${p.id}`,
          tipo: 'pedido_libros',
          descripcion: `Pedido libros — ${p.provider}`,
          monto: -costoLibros,
          fecha: p.created_at,
          icono: '📦',
          detalle: { pedido: p, lotes, registrador, totalUnidades, costoLibros },
        })
      }

      if (Number(p.shipping_cost) > 0) {
        items.push({
          id: `ped-envio-${p.id}`,
          tipo: 'pedido_envio',
          descripcion: `Envío pedido — ${p.provider}`,
          monto: -Number(p.shipping_cost),
          fecha: p.created_at,
          icono: '🚚',
          detalle: { pedido: p, lotes, registrador, totalUnidades, costoLibros },
        })
      }
    }

    // Ordenar por fecha desc
    items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    setMovimientos(items)
    setLoading(false)
  }

  const filtered = movimientos.filter(m => filtro === 'todos' || m.tipo === filtro)

  const totalIngresos = filtered.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0)
  const totalEgresos = filtered.filter(m => m.monto < 0).reduce((s, m) => s + m.monto, 0)

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#EEF2FA', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .top-bar { background: #4D7BFE; color: white; padding: 44px 24px 24px; border-radius: 0 0 28px 28px; }
        .back-btn { background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .stats-row { display: flex; gap: 10px; margin: 16px 20px 4px; }
        .stat-card { flex: 1; background: white; border-radius: 16px; padding: 14px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: center; }
        .filter-row { display: flex; gap: 8px; padding: 12px 20px 4px; overflow-x: auto; scrollbar-width: none; }
        .filter-row::-webkit-scrollbar { display: none; }
        .chip { border: 1.5px solid #E2E8F0; background: white; border-radius: 20px; padding: 7px 14px; font-size: 12px; font-weight: 500; color: #718096; cursor: pointer; white-space: nowrap; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
        .chip.active { border-color: #4D7BFE; background: #EEF2FA; color: #4D7BFE; font-weight: 700; }
        .section-title { font-size: 12px; font-weight: 700; color: #718096; padding: 14px 20px 8px; text-transform: uppercase; letter-spacing: 0.06em; }
        .mov-card { background: white; border-radius: 16px; padding: 14px 16px; margin: 0 20px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px; cursor: pointer; transition: transform 0.15s; }
        .mov-card:hover { transform: translateY(-1px); }
        .mov-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: flex-end; }
        .sheet { background: white; border-radius: 24px 24px 0 0; padding: 28px 24px 44px; width: 100%; max-height: 92vh; overflow-y: auto; }
        .detail-section { margin-bottom: 18px; }
        .detail-title { font-size: 11px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; }
        .detail-card { background: #F7FAFC; border-radius: 14px; padding: 14px; }
        .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #EEF2FA; }
        .detail-row:last-child { border-bottom: none; }
        .detail-label { font-size: 13px; color: #718096; }
        .detail-value { font-size: 13px; font-weight: 600; color: #1A202C; text-align: right; max-width: 60%; }
        .book-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #EEF2FA; }
        .book-item:last-child { border-bottom: none; }
        .book-cover { width: 40px; height: 54px; border-radius: 7px; background: #EEF2FA; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; overflow: hidden; }
        .book-cover img { width: 100%; height: 100%; object-fit: cover; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; }
        .lote-item { background: #F7FAFC; border-radius: 12px; padding: 12px; margin-bottom: 8px; }
      `}</style>

      {/* Header */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="back-btn" onClick={() => router.back()}>←</button>
          <div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>Historial</p>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Movimientos</h1>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: 20, fontWeight: 700 }}>{movimientos.length}</p>
            <p style={{ fontSize: 11, opacity: 0.7 }}>registros</p>
          </div>
        </div>
      </div>

      {/* Totales */}
      <div className="stats-row">
        <div className="stat-card">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#48BB78' }}>{fmt(totalIngresos)}</p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Ingresos</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#E53E3E' }}>{fmt(Math.abs(totalEgresos))}</p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Egresos</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: 13, fontWeight: 700, color: (totalIngresos + totalEgresos) >= 0 ? '#4D7BFE' : '#E53E3E' }}>
            {fmt(totalIngresos + totalEgresos)}
          </p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Balance</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="filter-row">
        {([
          { key: 'todos', label: '📋 Todos' },
          { key: 'venta', label: '🛒 Ventas' },
          { key: 'abono', label: '💰 Abonos' },
          { key: 'ofrendado', label: '🎁 Ofrendados' },
          { key: 'pedido_libros', label: '📦 Pedidos' },
          { key: 'pedido_envio', label: '🚚 Envíos' },
        ] as const).map(f => (
          <button key={f.key} className={`chip ${filtro === f.key ? 'active' : ''}`} onClick={() => setFiltro(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <p className="section-title">{loading ? 'Cargando...' : `${filtered.length} movimiento(s)`}</p>

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A0AEC0' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>📋</p>
          <p>No hay movimientos registrados</p>
        </div>
      )}

      {filtered.map(mov => (
        <div className="mov-card" key={mov.id} onClick={() => setSelected(mov)}>
          <div className="mov-icon" style={{ background: mov.monto >= 0 ? '#F0FFF4' : '#FFF5F5' }}>
            {mov.icono}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#1A202C' }}>{mov.descripcion}</p>
            <p style={{ fontSize: 12, color: '#A0AEC0', marginTop: 2 }}>{fmtFecha(mov.fecha)}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: mov.monto >= 0 ? '#48BB78' : '#E53E3E' }}>
              {mov.monto >= 0 ? '+' : ''}{fmt(mov.monto)}
            </p>
          </div>
          <span style={{ color: '#CBD5E0', fontSize: 18 }}>›</span>
        </div>
      ))}

      {/* Panel de detalle */}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>

            {/* Cabecera del detalle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="mov-icon" style={{ background: selected.monto >= 0 ? '#F0FFF4' : '#FFF5F5', width: 48, height: 48, borderRadius: 14, fontSize: 24 }}>
                  {selected.icono}
                </div>
                <div>
                  <p style={{ fontSize: 17, fontWeight: 700, color: '#1A202C' }}>{selected.descripcion}</p>
                  <p style={{ fontSize: 13, color: '#A0AEC0', marginTop: 3 }}>{fmtFecha(selected.fecha)}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: '#EEF2FA', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: '#718096', flexShrink: 0 }}>✕</button>
            </div>

            {/* Monto destacado */}
            <div style={{ background: selected.monto >= 0 ? '#F0FFF4' : '#FFF5F5', borderRadius: 16, padding: '16px 20px', textAlign: 'center', marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: '#718096', marginBottom: 4 }}>
                {selected.monto >= 0 ? 'Ingreso a caja' : 'Egreso de caja'}
              </p>
              <p style={{ fontSize: 28, fontWeight: 700, color: selected.monto >= 0 ? '#276749' : '#C53030' }}>
                {selected.monto >= 0 ? '+' : ''}{fmt(selected.monto)}
              </p>
            </div>

            {/* ── DETALLE: VENTA ── */}
            {(selected.tipo === 'venta' || selected.tipo === 'ofrendado') && selected.detalle.sale && (
              <>
                {/* Info de la venta */}
                <div className="detail-section">
                  <p className="detail-title">Información de la venta</p>
                  <div className="detail-card">
                    <div className="detail-row">
                      <span className="detail-label">Tipo de pago</span>
                      <span className="detail-value">
                        {selected.detalle.sale.payment_type === 'contado' ? '💵 Contado'
                          : selected.detalle.sale.payment_type === 'credito' ? '📋 Crédito'
                          : selected.detalle.sale.payment_type === 'credi_contado' ? '🤝 Credi-Contado'
                          : '🎁 Ofrendado'}
                      </span>
                    </div>
                    {selected.detalle.sale.payment_method && (
                      <div className="detail-row">
                        <span className="detail-label">Método de pago</span>
                        <span className="detail-value">
                          {selected.detalle.sale.payment_method === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
                        </span>
                      </div>
                    )}
                    <div className="detail-row">
                      <span className="detail-label">Total de la venta</span>
                      <span className="detail-value">{fmt(selected.detalle.sale.total)}</span>
                    </div>
                    {selected.detalle.sale.advance_payment > 0 && (
                      <div className="detail-row">
                        <span className="detail-label">Abono inicial</span>
                        <span className="detail-value" style={{ color: '#48BB78' }}>{fmt(selected.detalle.sale.advance_payment)}</span>
                      </div>
                    )}
                    {selected.detalle.deuda && (
                      <div className="detail-row">
                        <span className="detail-label">Deuda generada</span>
                        <span className="detail-value" style={{ color: '#E53E3E' }}>{fmt(selected.detalle.deuda.original_amount)}</span>
                      </div>
                    )}
                    {selected.detalle.deuda && (
                      <div className="detail-row">
                        <span className="detail-label">Saldo pendiente</span>
                        <span className="detail-value" style={{ color: selected.detalle.deuda.pending_amount > 0 ? '#E53E3E' : '#48BB78' }}>
                          {fmt(selected.detalle.deuda.pending_amount)}
                          {selected.detalle.deuda.pending_amount === 0 && ' ✅'}
                        </span>
                      </div>
                    )}
                    {selected.detalle.cashMov?.receipt_number && (
                      <div className="detail-row">
                        <span className="detail-label">N° comprobante</span>
                        <span className="detail-value">{selected.detalle.cashMov.receipt_number}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comprador */}
                {selected.detalle.member && (
                  <div className="detail-section">
                    <p className="detail-title">Comprador</p>
                    <div className="detail-card">
                      <div className="detail-row">
                        <span className="detail-label">Nombre</span>
                        <span className="detail-value">{selected.detalle.member.name}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Cédula</span>
                        <span className="detail-value">{selected.detalle.member.cedula}</span>
                      </div>
                      {selected.detalle.member.phone && (
                        <div className="detail-row">
                          <span className="detail-label">Teléfono</span>
                          <span className="detail-value">📞 {selected.detalle.member.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Libros vendidos */}
                {selected.detalle.libros?.length > 0 && (
                  <div className="detail-section">
                    <p className="detail-title">Libros vendidos ({selected.detalle.libros.length})</p>
                    <div className="detail-card">
                      {selected.detalle.libros.map((item: any, i: number) => (
                        <div key={i} className="book-item">
                          <div className="book-cover">
                            {item.book?.cover_url
                              ? <img src={item.book.cover_url} alt={item.book?.title} />
                              : '📖'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1A202C' }}>{item.book?.title ?? 'Libro'}</p>
                            {item.book?.author && <p style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>{item.book.author}</p>}
                            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                              <div>
                                <p style={{ fontSize: 10, color: '#A0AEC0' }}>Cant.</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>{item.quantity}</p>
                              </div>
                              <div>
                                <p style={{ fontSize: 10, color: '#A0AEC0' }}>P. venta</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#4D7BFE' }}>{fmt(item.sale_price_snapshot)}</p>
                              </div>
                              <div>
                                <p style={{ fontSize: 10, color: '#A0AEC0' }}>Costo</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#718096' }}>{fmt(item.real_cost_snapshot)}</p>
                              </div>
                              <div>
                                <p style={{ fontSize: 10, color: '#A0AEC0' }}>Utilidad</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#48BB78' }}>
                                  {fmt((item.sale_price_snapshot - item.real_cost_snapshot) * item.quantity)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Vendedor */}
                {selected.detalle.vendedor && (
                  <div className="detail-section">
                    <p className="detail-title">Registrado por</p>
                    <div className="detail-card">
                      <div className="detail-row">
                        <span className="detail-label">Usuario</span>
                        <span className="detail-value">{selected.detalle.vendedor.name}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── DETALLE: ABONO ── */}
            {selected.tipo === 'abono' && (
              <>
                {selected.detalle.member && (
                  <div className="detail-section">
                    <p className="detail-title">Deudor</p>
                    <div className="detail-card">
                      <div className="detail-row">
                        <span className="detail-label">Nombre</span>
                        <span className="detail-value">{selected.detalle.member.name}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Cédula</span>
                        <span className="detail-value">{selected.detalle.member.cedula}</span>
                      </div>
                    </div>
                  </div>
                )}
                {selected.detalle.deuda && (
                  <div className="detail-section">
                    <p className="detail-title">Estado de la deuda</p>
                    <div className="detail-card">
                      <div className="detail-row">
                        <span className="detail-label">Deuda original</span>
                        <span className="detail-value">{fmt(selected.detalle.deuda.original_amount)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Saldo pendiente</span>
                        <span className="detail-value" style={{ color: selected.detalle.deuda.pending_amount > 0 ? '#E53E3E' : '#48BB78' }}>
                          {fmt(selected.detalle.deuda.pending_amount)}{selected.detalle.deuda.pending_amount === 0 ? ' ✅' : ''}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Estado</span>
                        <span className="detail-value">
                          {selected.detalle.deuda.status === 'paid' ? '✅ Pagado'
                            : selected.detalle.deuda.status === 'partial' ? '🔶 Parcial'
                            : '🔴 Pendiente'}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Método de pago</span>
                        <span className="detail-value">
                          {selected.detalle.cashMov?.payment_method === 'efectivo' ? '💵 Efectivo' : '📲 Transferencia'}
                        </span>
                      </div>
                      {selected.detalle.cashMov?.receipt_number && (
                        <div className="detail-row">
                          <span className="detail-label">N° comprobante</span>
                          <span className="detail-value">{selected.detalle.cashMov.receipt_number}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {selected.detalle.libros?.length > 0 && (
                  <div className="detail-section">
                    <p className="detail-title">Libro(s) de la deuda</p>
                    <div className="detail-card">
                      {selected.detalle.libros.map((item: any, i: number) => (
                        <div key={i} className="book-item">
                          <div className="book-cover">
                            {item.book?.cover_url ? <img src={item.book.cover_url} alt={item.book?.title} /> : '📖'}
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1A202C' }}>{item.book?.title ?? 'Libro'}</p>
                            {item.book?.author && <p style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>{item.book.author}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── DETALLE: PEDIDO ── */}
            {(selected.tipo === 'pedido_libros' || selected.tipo === 'pedido_envio') && (
              <>
                <div className="detail-section">
                  <p className="detail-title">Información del pedido</p>
                  <div className="detail-card">
                    <div className="detail-row">
                      <span className="detail-label">Proveedor</span>
                      <span className="detail-value">{selected.detalle.pedido.provider}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Fecha de llegada</span>
                      <span className="detail-value">
                        {selected.detalle.pedido.arrival_date
                          ? new Date(selected.detalle.pedido.arrival_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
                          : '—'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Costo de envío</span>
                      <span className="detail-value">{fmt(Number(selected.detalle.pedido.shipping_cost))}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Total unidades</span>
                      <span className="detail-value">{selected.detalle.totalUnidades} libros</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Costo total libros</span>
                      <span className="detail-value">{fmt(selected.detalle.costoLibros)}</span>
                    </div>
                    {selected.detalle.pedido.notes && (
                      <div className="detail-row">
                        <span className="detail-label">Notas</span>
                        <span className="detail-value">{selected.detalle.pedido.notes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Libros del pedido */}
                {selected.detalle.lotes?.length > 0 && (
                  <div className="detail-section">
                    <p className="detail-title">Libros del pedido ({selected.detalle.lotes.length})</p>
                    {selected.detalle.lotes.map((lote: any, i: number) => (
                      <div key={i} className="lote-item">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <div className="book-cover">
                            {lote.book?.cover_url ? <img src={lote.book.cover_url} alt={lote.book?.title} /> : '📖'}
                          </div>
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#1A202C' }}>{lote.book?.title ?? 'Libro'}</p>
                            {lote.book?.author && <p style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>{lote.book.author}</p>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <div>
                            <p style={{ fontSize: 10, color: '#A0AEC0' }}>Cant.</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>{lote.initial_quantity}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: '#A0AEC0' }}>P. neto</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#718096' }}>{fmt(Number(lote.net_price_unit))}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: '#A0AEC0' }}>P. venta</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#4D7BFE' }}>{fmt(Number(lote.sale_price_unit))}</p>
                          </div>
                          <div>
                            <p style={{ fontSize: 10, color: '#A0AEC0' }}>Costo real</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>{fmt(Number(lote.real_cost_unit))}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selected.detalle.registrador && (
                  <div className="detail-section">
                    <p className="detail-title">Registrado por</p>
                    <div className="detail-card">
                      <div className="detail-row">
                        <span className="detail-label">Usuario</span>
                        <span className="detail-value">{selected.detalle.registrador.name}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}