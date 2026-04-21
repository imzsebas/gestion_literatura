"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Deuda {
  id: string
  saleId: string
  originalAmount: number
  pendingAmount: number
  status: string
  createdAt: string
  libros: string[]
}

interface Deudor {
  id: string
  name: string
  cedula: string
  phone: string
  deudaTotal: number
  deudas: Deuda[]
}

export default function DeudoresPage() {
  const router = useRouter()
  const [deudores, setDeudores] = useState<Deudor[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [selected, setSelected] = useState<Deudor | null>(null)

  // Estado para abono
  const [deudaSeleccionada, setDeudaSeleccionada] = useState<Deuda | null>(null)
  const [montoAbono, setMontoAbono] = useState<number>(0)
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia'>('efectivo')
  const [comprobante, setComprobante] = useState('')
  const [savingAbono, setSavingAbono] = useState(false)
  const [errorAbono, setErrorAbono] = useState('')

  useEffect(() => { fetchDeudores() }, [])

  const fetchDeudores = async () => {
    setLoading(true)

    // 1. Traer todas las deudas activas
    const { data: debts } = await supabase
      .from('debts')
      .select('id, sale_id, member_id, original_amount, pending_amount, status, created_at')
      .neq('status', 'paid')
      .order('created_at', { ascending: false })

    if (!debts || debts.length === 0) { setDeudores([]); setLoading(false); return }

    // 2. Traer miembros únicos
    const memberIds = [...new Set(debts.map(d => d.member_id))]
    const { data: members } = await supabase
      .from('members')
      .select('id, name, cedula, phone')
      .in('id', memberIds)

    // 3. Traer libros de cada venta
    const saleIds = [...new Set(debts.map(d => d.sale_id))]
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('sale_id, book_id')
      .in('sale_id', saleIds)

    const bookIds = [...new Set((saleItems ?? []).map(i => i.book_id))]
    const { data: books } = await supabase
      .from('books')
      .select('id, title')
      .in('id', bookIds)

    const booksMap = Object.fromEntries((books ?? []).map(b => [b.id, b.title]))
    const librosPorVenta: Record<string, string[]> = {}
    for (const item of saleItems ?? []) {
      if (!librosPorVenta[item.sale_id]) librosPorVenta[item.sale_id] = []
      librosPorVenta[item.sale_id].push(booksMap[item.book_id] ?? 'Libro')
    }

    // 4. Agrupar deudas por miembro
    const membersMap = Object.fromEntries((members ?? []).map(m => [m.id, m]))
    const porMiembro: Record<string, Deudor> = {}

    for (const debt of debts) {
      const m = membersMap[debt.member_id]
      if (!m) continue
      if (!porMiembro[m.id]) {
        porMiembro[m.id] = { id: m.id, name: m.name, cedula: m.cedula, phone: m.phone, deudaTotal: 0, deudas: [] }
      }
      porMiembro[m.id].deudaTotal += Number(debt.pending_amount)
      porMiembro[m.id].deudas.push({
        id: debt.id,
        saleId: debt.sale_id,
        originalAmount: Number(debt.original_amount),
        pendingAmount: Number(debt.pending_amount),
        status: debt.status,
        createdAt: debt.created_at,
        libros: librosPorVenta[debt.sale_id] ?? ['Libro'],
      })
    }

    setDeudores(Object.values(porMiembro).sort((a, b) => b.deudaTotal - a.deudaTotal))
    setLoading(false)
  }

  const filtered = deudores.filter(d =>
    d.name.toLowerCase().includes(busqueda.toLowerCase()) ||
    d.cedula.includes(busqueda) ||
    (d.phone || '').includes(busqueda)
  )

  const enviarRecordatorio = (deudor: Deudor, deuda: Deuda) => {
    const primerNombre = deudor.name.split(' ')[0]
    const libros = deuda.libros.join(', ')
    const fecha = new Date(deuda.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
    const saldo = deuda.pendingAmount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })

    const mensaje =
      `Hola ${primerNombre}, esperamos que estés muy bien. 🙏\n\n` +
      `Te contactamos amablemente del *Servicio de Literatura* para recordarte que tienes un saldo pendiente de *${saldo}* correspondiente a: *${libros}*, generado el ${fecha}.\n\n` +
      `Te agradecemos comunicarte con nuestro equipo de contabilidad para coordinar el pago de tu saldo. ¡Que Dios te bendiga! ✨`

    const url = `https://wa.me/57${deudor.phone}?text=${encodeURIComponent(mensaje)}`
    window.open(url, '_blank')
  }

  const handleAbono = async () => {
    if (!deudaSeleccionada || !selected) return
    setErrorAbono('')

    if (montoAbono <= 0) { setErrorAbono('El monto debe ser mayor a 0'); return }
    if (montoAbono > deudaSeleccionada.pendingAmount) { setErrorAbono(`El abono no puede superar el saldo de ${deudaSeleccionada.pendingAmount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}`); return }

    setSavingAbono(true)
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')

    const nuevoSaldo = deudaSeleccionada.pendingAmount - montoAbono
    const nuevoStatus = nuevoSaldo <= 0 ? 'paid' : 'partial'

    // 1. Actualizar deuda
    await supabase.from('debts').update({
      pending_amount: nuevoSaldo,
      status: nuevoStatus,
    }).eq('id', deudaSeleccionada.id)

    // 2. Registrar abono en debt_payments
    await supabase.from('debt_payments').insert({
      debt_id: deudaSeleccionada.id,
      amount: montoAbono,
      payment_method: metodoPago,
      receipt_number: metodoPago === 'transferencia' ? comprobante : null,
      created_by: user.id ?? null,
    })

    // 3. Registrar movimiento de caja
    await supabase.from('cash_movements').insert({
      type: 'income',
      concept: 'advance',
      amount: montoAbono,
      payment_method: metodoPago,
      receipt_number: metodoPago === 'transferencia' ? comprobante : null,
      sale_id: deudaSeleccionada.saleId,
      created_by: user.id ?? null,
    })

    setDeudaSeleccionada(null)
    setMontoAbono(0)
    setComprobante('')
    setMetodoPago('efectivo')
    setSelected(null)
    setSavingAbono(false)
    await fetchDeudores()
  }

  const totalPorCobrar = deudores.reduce((s, d) => s + d.deudaTotal, 0)

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#EEF2FA', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 }}>
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
        .section-title { font-size: 12px; font-weight: 700; color: #718096; padding: 18px 20px 10px; text-transform: uppercase; letter-spacing: 0.06em; }
        .member-card { background: white; border-radius: 18px; padding: 16px 18px; margin: 0 20px 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 14px; cursor: pointer; transition: transform 0.15s; }
        .member-card:hover { transform: translateY(-1px); }
        .deuda-tag { background: #FFF5F5; color: #E53E3E; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; margin-top: 4px; display: inline-block; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: flex-end; }
        .sheet { background: white; border-radius: 24px 24px 0 0; padding: 28px 24px 40px; width: 100%; max-height: 88vh; overflow-y: auto; }
        .label { font-size: 12px; color: #718096; font-weight: 500; margin-bottom: 6px; }
        .input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; font-size: 15px; color: #1A202C; outline: none; transition: border-color 0.2s; background: white; }
        .input::placeholder { color: #A0AEC0; }
        .input:focus { border-color: #4D7BFE; }
        .action-btn { width: 100%; border: none; border-radius: 14px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 10px; font-family: 'DM Sans', sans-serif; }
        .deuda-card { background: #F7FAFC; border-radius: 14px; padding: 14px; margin-bottom: 10px; border-left: 4px solid #E53E3E; }
        .deuda-card.parcial { border-left-color: #F6AD55; }
        .metodo-row { display: flex; gap: 10px; margin: 8px 0 14px; }
        .metodo-btn { flex: 1; background: white; border: 2px solid #E2E8F0; border-radius: 12px; padding: 12px; text-align: center; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 14px; transition: all 0.2s; }
        .metodo-btn.selected { border-color: #4D7BFE; background: #EEF2FA; color: #4D7BFE; font-weight: 700; }
        .error-msg { font-size: 12px; color: #E53E3E; margin-top: 6px; }
        .progress-bar-bg { height: 6px; background: #EEF2FA; border-radius: 3px; margin-top: 8px; }
        .progress-bar-fill { height: 100%; border-radius: 3px; background: #E53E3E; transition: width 0.4s; }
      `}</style>

      {/* Header */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="back-btn" onClick={() => router.back()}>←</button>
          <div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>Cartera</p>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Deudores</h1>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: 22, fontWeight: 700 }}>{deudores.length}</p>
            <p style={{ fontSize: 11, opacity: 0.7 }}>con deuda</p>
          </div>
        </div>
        <input className="search-bar" placeholder="Buscar por nombre, cédula o teléfono..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <p style={{ fontSize: 18, fontWeight: 700, color: '#E53E3E' }}>{deudores.length}</p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Deudores</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: 13, fontWeight: 700, color: '#E53E3E' }}>
            {totalPorCobrar.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
          </p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Total por cobrar</p>
        </div>
        <div className="stat-card">
          <p style={{ fontSize: 18, fontWeight: 700, color: '#F6AD55' }}>
            {deudores.reduce((s, d) => s + d.deudas.filter(x => x.status === 'partial').length, 0)}
          </p>
          <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Parciales</p>
        </div>
      </div>

      <p className="section-title">{loading ? 'Cargando...' : `${filtered.length} deudor(es)`}</p>

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A0AEC0' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>✅</p>
          <p>No hay deudores activos</p>
        </div>
      )}

      {filtered.map(d => (
        <div className="member-card" key={d.id} onClick={() => setSelected(d)}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: '#FFF5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            ⚠️
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, color: '#1A202C', fontSize: 15 }}>{d.name}</p>
            <p style={{ fontSize: 12, color: '#A0AEC0', marginTop: 2 }}>CC: {d.cedula}{d.phone ? ` · 📞 ${d.phone}` : ''}</p>
            <span className="deuda-tag">{d.deudas.length} deuda{d.deudas.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#E53E3E' }}>
              {d.deudaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
            </p>
            <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>pendiente</p>
          </div>
          <span style={{ color: '#CBD5E0', fontSize: 18 }}>›</span>
        </div>
      ))}

      {/* Perfil del deudor */}
      {selected && !deudaSeleccionada && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            {/* Cabecera */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 20, fontWeight: 700, color: '#1A202C' }}>{selected.name}</p>
                <p style={{ fontSize: 13, color: '#718096', marginTop: 3 }}>CC: {selected.cedula}</p>
                {selected.phone && <p style={{ fontSize: 13, color: '#718096' }}>📞 {selected.phone}</p>}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: '#EEF2FA', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: '#718096' }}>✕</button>
            </div>

            {/* Total deuda */}
            <div style={{ background: '#FFF5F5', borderRadius: 14, padding: 14, textAlign: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: '#A0AEC0' }}>Total pendiente</p>
              <p style={{ fontSize: 24, fontWeight: 700, color: '#E53E3E', marginTop: 4 }}>
                {selected.deudaTotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
              </p>
            </div>

            {/* Lista de deudas */}
            <p style={{ fontSize: 12, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Deudas activas
            </p>
            {selected.deudas.map(deuda => {
              const pagado = deuda.originalAmount - deuda.pendingAmount
              const pct = (pagado / deuda.originalAmount) * 100
              return (
                <div key={deuda.id} className={`deuda-card ${deuda.status === 'partial' ? 'parcial' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>📖 {deuda.libros.join(', ')}</p>
                      <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 3 }}>
                        {new Date(deuda.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#E53E3E' }}>
                        {deuda.pendingAmount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                      </p>
                      <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>
                        de {deuda.originalAmount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                  {/* Barra de progreso de pago */}
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${pct}%`, background: deuda.status === 'partial' ? '#F6AD55' : '#E53E3E' }} />
                  </div>
                  <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 4 }}>{Math.round(pct)}% pagado</p>

                  <button
                    onClick={() => { setDeudaSeleccionada(deuda) }}
                    style={{ marginTop: 10, width: '100%', background: '#4D7BFE', color: 'white', border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                  >
                    💰 Registrar Abono
                  </button>

                  {selected.phone && (
                    <button
                      onClick={() => enviarRecordatorio(selected, deuda)}
                      style={{ marginTop: 8, width: '100%', background: '#F0FFF4', color: '#276749', border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
                    >
                      💬 Enviar Recordatorio
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Panel de abono */}
      {selected && deudaSeleccionada && (
        <div className="overlay" onClick={() => { setDeudaSeleccionada(null); setMontoAbono(0); setErrorAbono('') }}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#1A202C' }}>Registrar Abono</p>
                <p style={{ fontSize: 13, color: '#718096', marginTop: 2 }}>{selected.name}</p>
              </div>
              <button onClick={() => { setDeudaSeleccionada(null); setMontoAbono(0); setErrorAbono('') }} style={{ background: '#EEF2FA', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: '#718096' }}>✕</button>
            </div>

            {/* Info de la deuda */}
            <div style={{ background: '#FFF5F5', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1A202C' }}>📖 {deudaSeleccionada.libros.join(', ')}</p>
              <p style={{ fontSize: 13, color: '#E53E3E', fontWeight: 700, marginTop: 6 }}>
                Saldo pendiente: {deudaSeleccionada.pendingAmount.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
              </p>
            </div>

            <p className="label">Monto del abono *</p>
            <input
              className="input"
              type="number"
              placeholder="0"
              value={montoAbono || ''}
              onChange={e => { setMontoAbono(Number(e.target.value)); setErrorAbono('') }}
              style={{ marginBottom: 4 }}
            />
            {errorAbono && <p className="error-msg">⚠️ {errorAbono}</p>}

            {montoAbono > 0 && montoAbono <= deudaSeleccionada.pendingAmount && (
              <div style={{ marginTop: 8, marginBottom: 12, padding: '8px 12px', background: '#F0FFF4', borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#276749' }}>Saldo restante después:</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#276749' }}>
                  {(deudaSeleccionada.pendingAmount - montoAbono).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })}
                </span>
              </div>
            )}

            <p className="label" style={{ marginTop: 12 }}>Método de pago</p>
            <div className="metodo-row">
              <button className={`metodo-btn ${metodoPago === 'efectivo' ? 'selected' : ''}`} onClick={() => setMetodoPago('efectivo')}>💵 Efectivo</button>
              <button className={`metodo-btn ${metodoPago === 'transferencia' ? 'selected' : ''}`} onClick={() => setMetodoPago('transferencia')}>📲 Transferencia</button>
            </div>

            {metodoPago === 'transferencia' && (
              <>
                <p className="label">N° de comprobante</p>
                <input className="input" placeholder="Número de referencia" value={comprobante} onChange={e => setComprobante(e.target.value)} style={{ marginBottom: 12 }} />
              </>
            )}

            <button
              onClick={handleAbono}
              disabled={montoAbono <= 0 || savingAbono}
              style={{ width: '100%', background: '#4D7BFE', color: 'white', border: 'none', borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', marginTop: 8, opacity: montoAbono <= 0 ? 0.5 : 1 }}
            >
              {savingAbono ? 'Registrando...' : `Confirmar Abono`}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}