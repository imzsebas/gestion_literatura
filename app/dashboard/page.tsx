"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface ActivityItem {
  id: string
  descripcion: string
  monto: number
  fecha: string
  icono: string
}

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loadingBalance, setLoadingBalance] = useState(true)

  const [cajaReal, setCajaReal] = useState<number>(0)
  const [totalInventario, setTotalInventario] = useState<number>(0)
  const [utilidadTotal, setUtilidadTotal] = useState<number>(0)
  const [cuentasPorCobrar, setCuentasPorCobrar] = useState<number>(0)
  const [ventasHoy, setVentasHoy] = useState<{ cantidad: number; monto: number }>({ cantidad: 0, monto: 0 })
  const [actividad, setActividad] = useState<ActivityItem[]>([])

  const formatCurrency = (value: number) =>
    value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })

  useEffect(() => {
    const session = sessionStorage.getItem('user')
    if (!session) { router.push('/login'); return }
    setUser(JSON.parse(session))
  }, [router])

  useEffect(() => { if (user) fetchBalance() }, [user])

  const fetchBalance = async () => {
    setLoadingBalance(true)
    await Promise.all([
      calcularCajaReal(),
      calcularInventario(),
      calcularUtilidad(),
      calcularCuentasPorCobrar(),
      calcularVentasHoy(),
      fetchActividad(),
    ])
    setLoadingBalance(false)
  }

  // ── 1. CAJA REAL ──
  const calcularCajaReal = async () => {
    const { data } = await supabase.from('cash_movements').select('type, amount')
    if (!data) return
    setCajaReal(data.reduce((acc, m) => m.type === 'income' ? acc + Number(m.amount) : acc - Number(m.amount), 0))
  }

  // ── 2. INVENTARIO VALORIZADO ──
  const calcularInventario = async () => {
    const { data } = await supabase
      .from('inventory_lots')
      .select('available_quantity, real_cost_unit')
      .eq('status', 'active')
      .gt('available_quantity', 0)
    if (!data) return
    setTotalInventario(data.reduce((acc, l) => acc + (l.available_quantity * Number(l.real_cost_unit)), 0))
  }

  // ── 3. UTILIDAD ──
  // Regla: la utilidad se genera SOLO cuando el dinero cobrado supera el costo real.
  // Se calcula deuda por deuda (no acumulado por miembro).
  //
  // Fuente A — CONTADO: utilidad inmediata = precio_venta - costo_real por ítem
  // Fuente B — CRÉDITO: por cada deuda → MAX(0, cobrado - costo)
  // Fuente C — CREDI-CONTADO: cobrado_total = abono_inicial + abonos_posteriores
  //            → por cada deuda → MAX(0, cobrado_total - costo)
  //            El abono inicial (advance_payment) se suma al cobrado de la deuda
  // Fuente D — OFRENDADO: pérdida = -costo_real × cantidad
  const calcularUtilidad = async () => {
    let utilidad = 0

    // A) Contado — utilidad inmediata
    const { data: ventasContado } = await supabase
      .from('sales')
      .select('id, sale_items(quantity, sale_price_snapshot, real_cost_snapshot)')
      .eq('payment_type', 'contado')

    for (const venta of ventasContado ?? []) {
      for (const item of (venta as any).sale_items ?? []) {
        utilidad += (Number(item.sale_price_snapshot) - Number(item.real_cost_snapshot)) * item.quantity
      }
    }

    // B y C) Crédito y Credi-contado — utilidad según cobrado vs costo, deuda por deuda
    // Para credi-contado: cobrado = abono_inicial (advance_payment) + lo abonado después a la deuda
    const { data: deudas } = await supabase
      .from('debts')
      .select('id, sale_id, original_amount, pending_amount')

    if (deudas && deudas.length > 0) {
      const saleIds = [...new Set(deudas.map(d => d.sale_id))]

      // Costo real por venta
      const { data: itemsDeuda } = await supabase
        .from('sale_items')
        .select('sale_id, quantity, real_cost_snapshot')
        .in('sale_id', saleIds)

      const costoPorVenta: Record<string, number> = {}
      for (const item of itemsDeuda ?? []) {
        costoPorVenta[item.sale_id] = (costoPorVenta[item.sale_id] ?? 0) + (Number(item.real_cost_snapshot) * item.quantity)
      }

      // Abono inicial de ventas credi-contado (advance_payment de la tabla sales)
      const { data: ventasCredi } = await supabase
        .from('sales')
        .select('id, advance_payment, payment_type')
        .in('id', saleIds)
        .eq('payment_type', 'credi_contado')

      const abonoInicialPorVenta: Record<string, number> = {}
      for (const v of ventasCredi ?? []) {
        abonoInicialPorVenta[v.id] = Number(v.advance_payment ?? 0)
      }

      // Por cada deuda calcular utilidad
      for (const deuda of deudas) {
        const abonadoALaDeuda = Number(deuda.original_amount) - Number(deuda.pending_amount)
        const abonoInicial = abonoInicialPorVenta[deuda.sale_id] ?? 0
        const cobradoTotal = abonadoALaDeuda + abonoInicial
        const costo = costoPorVenta[deuda.sale_id] ?? 0
        utilidad += Math.max(0, cobradoTotal - costo)
      }
    }

    // D) Ofrendado — pérdida al costo real
    const { data: ventasOfrendadas } = await supabase
      .from('sales')
      .select('id, sale_items(quantity, real_cost_snapshot)')
      .eq('payment_type', 'ofrendado')

    for (const venta of ventasOfrendadas ?? []) {
      for (const item of (venta as any).sale_items ?? []) {
        utilidad -= Number(item.real_cost_snapshot) * item.quantity
      }
    }

    setUtilidadTotal(utilidad)
  }

  // ── 4. CUENTAS POR COBRAR ──
  const calcularCuentasPorCobrar = async () => {
    const { data } = await supabase.from('debts').select('pending_amount').neq('status', 'paid')
    if (!data) return
    setCuentasPorCobrar(data.reduce((acc, d) => acc + Number(d.pending_amount), 0))
  }

  // ── 5. VENTAS DEL DÍA ──
  const calcularVentasHoy = async () => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('sales').select('total').gte('created_at', hoy.toISOString())
    if (!data) return
    setVentasHoy({ cantidad: data.length, monto: data.reduce((acc, s) => acc + Number(s.total), 0) })
  }

  // ── 6. ACTIVIDAD RECIENTE ──
  // Incluye: movimientos de caja (ventas, abonos, ofrendados) + gastos de pedidos (costo libros + envío)
  // Limitado a los 3 más recientes en total
  const fetchActividad = async () => {
    // Movimientos de caja
    const { data: movimientos } = await supabase
      .from('cash_movements')
      .select('id, type, concept, amount, payment_method, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    // Pedidos recientes (para mostrar gasto en libros y envío como registros separados)
    const { data: pedidos } = await supabase
      .from('purchases')
      .select('id, provider, shipping_cost, created_at')
      .order('created_at', { ascending: false })
      .limit(5)

    // Costo total de libros por pedido
    const pedidoIds = (pedidos ?? []).map(p => p.id)
    const { data: lotes } = pedidoIds.length > 0
      ? await supabase
          .from('inventory_lots')
          .select('purchase_id, initial_quantity, net_price_unit')
          .in('purchase_id', pedidoIds)
      : { data: [] }

    const costoPorPedido: Record<string, number> = {}
    for (const l of lotes ?? []) {
      costoPorPedido[l.purchase_id] = (costoPorPedido[l.purchase_id] ?? 0) + (l.initial_quantity * Number(l.net_price_unit))
    }

    // Construir items de actividad
    const items: ActivityItem[] = []

    // Movimientos de caja
    for (const m of movimientos ?? []) {
      items.push({
        id: `cm-${m.id}`,
        descripcion: m.concept === 'sale'
          ? `Venta — ${m.payment_method === 'efectivo' ? 'Efectivo' : 'Transferencia'}`
          : m.concept === 'gifted'
          ? 'Libro ofrendado'
          : `Abono — ${m.payment_method === 'efectivo' ? 'Efectivo' : 'Transferencia'}`,
        monto: m.type === 'income' ? Number(m.amount) : -Number(m.amount),
        fecha: m.created_at,
        icono: m.concept === 'sale' ? '🛒' : m.concept === 'gifted' ? '🎁' : '💰',
      })
    }

    // Pedidos — dos registros por pedido: costo de libros y envío (solo si envío > 0)
    for (const p of pedidos ?? []) {
      const costoLibros = costoPorPedido[p.id] ?? 0
      if (costoLibros > 0) {
        items.push({
          id: `ped-libros-${p.id}`,
          descripcion: `Pedido libros — ${p.provider}`,
          monto: -costoLibros,
          fecha: p.created_at,
          icono: '📦',
        })
      }
      if (Number(p.shipping_cost) > 0) {
        items.push({
          id: `ped-envio-${p.id}`,
          descripcion: `Envío pedido — ${p.provider}`,
          monto: -Number(p.shipping_cost),
          fecha: p.created_at,
          icono: '🚚',
        })
      }
    }

    // Ordenar por fecha descendente y limitar a 3
    items.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    setActividad(items.slice(0, 3))
  }

  if (!user) return null

  return (
    <main className="dashboard-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background-color: #EEF2FA; font-family: 'DM Sans', sans-serif; }
        .dashboard-container { min-height: 100vh; padding-bottom: 80px; }
        .top-bar { background-color: #4D7BFE; color: white; padding: 40px 25px 60px; border-radius: 0 0 30px 30px; }
        .user-info { display: flex; justify-content: space-between; align-items: center; }
        .balance-card { background: white; margin: -40px 25px 20px; padding: 25px; border-radius: 24px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
        .balance-label { color: #718096; font-size: 14px; margin-bottom: 5px; }
        .balance-amount { color: #1A202C; font-size: 32px; font-weight: 700; }
        .skeleton { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.2s infinite; border-radius: 8px; display: inline-block; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .extra-stats { display: flex; gap: 10px; margin: 0 25px 20px; }
        .extra-stat-card { flex: 1; background: white; border-radius: 16px; padding: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.03); text-align: center; cursor: pointer; transition: transform 0.15s; }
        .extra-stat-card:hover { transform: translateY(-1px); }
        .actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; padding: 0 25px; }
        .action-btn { background: white; padding: 20px; border-radius: 20px; text-align: center; text-decoration: none; color: #4D7BFE; font-weight: 600; font-family: 'DM Sans', sans-serif; font-size: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.02); display: flex; flex-direction: column; align-items: center; gap: 10px; border: none; cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .action-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(77,123,254,0.15); }
        .action-btn:active { transform: translateY(0); }
        .section-title { padding: 25px 25px 15px; font-weight: 700; color: #2D3748; display: flex; justify-content: space-between; align-items: center; }
        .ver-todo { font-size: 13px; font-weight: 500; color: #4D7BFE; text-decoration: none; }
        .activity-list { padding: 0 25px; }
        .activity-item { background: white; padding: 15px; border-radius: 16px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .nav-bar { position: fixed; bottom: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 15px; border-top: 1px solid #E2E8F0; }
        .nav-link { text-decoration: none; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; color: #A0AEC0; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: color 0.15s ease; }
        .nav-link:hover { color: #4D7BFE; }
        .nav-link.active { color: #4D7BFE; font-weight: 700; }
        .refresh-btn { background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 10px; padding: 6px 10px; font-size: 16px; cursor: pointer; }
      `}</style>

      {/* Header */}
      <div className="top-bar">
        <div className="user-info">
          <div>
            <p style={{ opacity: 0.8, fontSize: '14px' }}>Bienvenido,</p>
            <h2 style={{ fontSize: '20px' }}>{user.name}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', padding: '5px 12px', borderRadius: '10px', fontSize: '12px' }}>
              {user.role.toUpperCase()}
            </div>
            <button className="refresh-btn" onClick={fetchBalance} title="Actualizar">↻</button>
          </div>
        </div>
      </div>

      {/* Card Financiera */}
      <div className="balance-card">
        <p className="balance-label">Efectivo en Caja Real</p>
        {loadingBalance
          ? <div className="skeleton" style={{ width: 160, height: 38 }} />
          : <h1 className="balance-amount">{formatCurrency(cajaReal)}</h1>
        }
        <div style={{ display: 'flex', gap: '20px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #F7FAFC' }}>
          <div>
            <p style={{ fontSize: '12px', color: '#A0AEC0' }}>Inventario</p>
            {loadingBalance
              ? <div className="skeleton" style={{ width: 80, height: 20, marginTop: 4 }} />
              : <p style={{ fontWeight: '600', color: '#4D7BFE' }}>{formatCurrency(totalInventario)}</p>
            }
          </div>
          <div>
            <p style={{ fontSize: '12px', color: '#A0AEC0' }}>Utilidad</p>
            {loadingBalance
              ? <div className="skeleton" style={{ width: 80, height: 20, marginTop: 4 }} />
              : <p style={{ fontWeight: '600', color: utilidadTotal >= 0 ? '#48BB78' : '#E53E3E' }}>
                  {formatCurrency(utilidadTotal)}
                </p>
            }
          </div>
        </div>
      </div>

      {/* Stats extra */}
      <div className="extra-stats">
        <div className="extra-stat-card" onClick={() => router.push('/deudores')}>
          <p style={{ fontSize: '11px', color: '#A0AEC0', marginBottom: 4 }}>Por cobrar</p>
          {loadingBalance
            ? <div className="skeleton" style={{ width: 80, height: 18 }} />
            : <p style={{ fontSize: '15px', fontWeight: 700, color: cuentasPorCobrar > 0 ? '#E53E3E' : '#1A202C' }}>
                {formatCurrency(cuentasPorCobrar)}
              </p>
          }
        </div>
        <div className="extra-stat-card">
          <p style={{ fontSize: '11px', color: '#A0AEC0', marginBottom: 4 }}>Ventas hoy</p>
          {loadingBalance
            ? <div className="skeleton" style={{ width: 60, height: 18 }} />
            : <p style={{ fontSize: '15px', fontWeight: 700, color: '#1A202C' }}>
                {ventasHoy.cantidad} · {formatCurrency(ventasHoy.monto)}
              </p>
          }
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="actions-grid">
        <Link href="/ventas/nueva" className="action-btn"><span>🛒</span>Venta Nueva</Link>
        <Link href="/miembros" className="action-btn"><span>👤</span>Miembros</Link>
        <Link href="/pedidos/nuevo" className="action-btn"><span>📦</span>Nuevo Pedido</Link>
        <Link href="/inventario" className="action-btn"><span>📊</span>Inventario</Link>
      </div>

      {/* Actividad Reciente — máximo 3 registros */}
      <h3 className="section-title">
        Actividad Reciente
        <Link href="/movimientos" className="ver-todo">Ver todo →</Link>
      </h3>
      <div className="activity-list">
        {loadingBalance && [1, 2, 3].map(i => (
          <div key={i} className="activity-item">
            <div className="skeleton" style={{ width: '60%', height: 16 }} />
            <div className="skeleton" style={{ width: '25%', height: 16 }} />
          </div>
        ))}
        {!loadingBalance && actividad.length === 0 && (
          <p style={{ textAlign: 'center', color: '#A0AEC0', padding: '20px' }}>
            No hay movimientos registrados.
          </p>
        )}
        {!loadingBalance && actividad.map(item => (
          <div key={item.id} className="activity-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{item.icono}</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#1A202C' }}>{item.descripcion}</p>
                <p style={{ fontSize: 12, color: '#A0AEC0', marginTop: 2 }}>
                  {new Date(item.fecha).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: item.monto >= 0 ? '#48BB78' : '#E53E3E' }}>
              {item.monto >= 0 ? '+' : ''}{formatCurrency(item.monto)}
            </p>
          </div>
        ))}
      </div>

      {/* Navegación Inferior */}
      <nav className="nav-bar">
        <Link href="/dashboard" className="nav-link active">
          <span>🏠</span>Inicio
        </Link>
        <Link href="/libros" className="nav-link">
          <span>📚</span>Libros
        </Link>
        <Link href="/movimientos" className="nav-link">
          <span>📋</span>Movimientos
        </Link>
        <Link href="/planillas" className="nav-link">
          <span>📅</span>Planillas
        </Link>
      </nav>
    </main>
  )
}