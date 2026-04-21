"use client"
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface LoteDisponible {
  id: string
  bookId: string
  bookTitle: string
  bookAuthor: string
  coverUrl: string | null
  precioVenta: number
  cantidadDisponible: number
  costoReal: number
}

interface CartItem extends LoteDisponible {
  cantidad: number
}

interface Member {
  id: string
  name: string
  cedula: string
  phone: string
}

type FormaPago = 'contado' | 'credito' | 'credi_contado' | 'ofrendado'
type MetodoPago = 'efectivo' | 'transferencia'

export default function NuevaVentaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const miembroParam = searchParams.get('miembro')

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [inventario, setInventario] = useState<LoteDisponible[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [busquedaLibro, setBusquedaLibro] = useState('')

  const [miembro, setMiembro] = useState<Member | null>(null)
  const [busquedaMiembro, setBusquedaMiembro] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [showFormMiembro, setShowFormMiembro] = useState(false)
  const [noEncontrado, setNoEncontrado] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaCedula, setNuevaCedula] = useState('')
  const [nuevoTel, setNuevoTel] = useState('')
  const [savingMiembro, setSavingMiembro] = useState(false)

  const [formaPago, setFormaPago] = useState<FormaPago | null>(null)
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [abono, setAbono] = useState<number>(0)
  const [comprobante, setComprobante] = useState('')
  const [saving, setSaving] = useState(false)

  const totalVenta = cart.reduce((s, i) => s + i.precioVenta * i.cantidad, 0)
  const deudaRestante = formaPago === 'credi_contado' ? Math.max(0, totalVenta - abono) : 0

  useEffect(() => { fetchInventario() }, [])

  useEffect(() => {
    if (miembroParam) {
      supabase.from('members').select('id, name, cedula, phone').eq('id', miembroParam).single()
        .then(({ data }) => { if (data) setMiembro(data) })
    }
  }, [miembroParam])

  const fetchInventario = async () => {
    // Paso 1: traer lotes activos con stock
    const { data: lots } = await supabase
      .from('inventory_lots')
      .select('id, book_id, sale_price_unit, available_quantity, real_cost_unit')
      .eq('status', 'active')
      .gt('available_quantity', 0)
      .order('created_at', { ascending: false })

    if (!lots || lots.length === 0) return

    // Paso 2: traer books por separado
    const bookIds = [...new Set(lots.map(l => l.book_id).filter(Boolean))]
    const { data: books } = await supabase
      .from('books')
      .select('id, title, author, cover_url')
      .in('id', bookIds)

    const booksMap = Object.fromEntries((books ?? []).map(b => [b.id, b]))

    setInventario(lots.map(l => ({
      id: l.id,
      bookId: l.book_id,
      bookTitle: booksMap[l.book_id]?.title ?? 'Sin título',
      bookAuthor: booksMap[l.book_id]?.author ?? '',
      coverUrl: booksMap[l.book_id]?.cover_url ?? null,
      precioVenta: Number(l.sale_price_unit),
      cantidadDisponible: l.available_quantity,
      costoReal: Number(l.real_cost_unit),
    })))
  }

  const filteredInventario = inventario.filter(l =>
    l.bookTitle.toLowerCase().includes(busquedaLibro.toLowerCase()) ||
    l.bookAuthor.toLowerCase().includes(busquedaLibro.toLowerCase())
  )

  const enCarrito = (loteId: string) => cart.find(i => i.id === loteId)

  const toggleCarrito = (lote: LoteDisponible) => {
    if (enCarrito(lote.id)) {
      setCart(prev => prev.filter(i => i.id !== lote.id))
    } else {
      setCart(prev => [...prev, { ...lote, cantidad: 1 }])
    }
  }

  const updateQty = (id: string, qty: number) => {
    const lote = inventario.find(l => l.id === id)
    if (!lote) return
    setCart(prev => prev.map(i => i.id === id
      ? { ...i, cantidad: Math.max(1, Math.min(qty, lote.cantidadDisponible)) }
      : i
    ))
  }

  const buscarMiembro = async () => {
    if (!busquedaMiembro.trim()) return
    setBuscando(true)
    setNoEncontrado(false)

    const { data } = await supabase
      .from('members')
      .select('id, name, cedula, phone')
      .or(`name.ilike.%${busquedaMiembro}%,cedula.eq.${busquedaMiembro},phone.eq.${busquedaMiembro}`)
      .limit(1)
      .maybeSingle()

    if (data) {
      setMiembro(data)
    } else {
      setNoEncontrado(true)
    }
    setBuscando(false)
  }

  const registrarMiembro = async () => {
    if (!nuevoNombre || !nuevaCedula) return
    setSavingMiembro(true)
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    const { data, error } = await supabase
      .from('members')
      .insert({ name: nuevoNombre, cedula: nuevaCedula, phone: nuevoTel || null, created_by: user.id ?? null })
      .select()
      .single()
    if (data) { setMiembro(data); setShowFormMiembro(false); setNoEncontrado(false) }
    setSavingMiembro(false)
  }

  const confirmarVenta = async () => {
    if (!miembro || !formaPago) return
    setSaving(true)
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')

    try {
      // 1. Crear venta
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          member_id: miembro.id,
          payment_type: formaPago,
          payment_method: (formaPago === 'contado' || formaPago === 'credi_contado') ? metodoPago : null,
          total: totalVenta,
          advance_payment: formaPago === 'credi_contado' ? abono : formaPago === 'contado' ? totalVenta : 0,
          receipt_number: metodoPago === 'transferencia' ? comprobante : null,
          created_by: user.id ?? null,
        })
        .select()
        .single()

      if (saleError || !sale) throw new Error('Error al crear la venta')

      // 2. Items de venta + reducir stock
      for (const item of cart) {
        await supabase.from('sale_items').insert({
          sale_id: sale.id,
          inventory_lot_id: item.id,
          book_id: item.bookId,
          quantity: item.cantidad,
          sale_price_snapshot: item.precioVenta,
          real_cost_snapshot: item.costoReal,
        })

        const nuevaCantidad = item.cantidadDisponible - item.cantidad
        await supabase
          .from('inventory_lots')
          .update({
            available_quantity: nuevaCantidad,
            ...(nuevaCantidad <= 0 ? { status: 'sold_out' } : {}),
          })
          .eq('id', item.id)
      }

      // 3. Movimiento de caja si hay pago inmediato
      const montoIngreso = formaPago === 'contado' ? totalVenta
        : formaPago === 'credi_contado' ? abono : 0

      if (montoIngreso > 0) {
        await supabase.from('cash_movements').insert({
          type: 'income',
          concept: 'sale',
          amount: montoIngreso,
          payment_method: metodoPago,
          receipt_number: metodoPago === 'transferencia' ? comprobante : null,
          sale_id: sale.id,
          created_by: user.id ?? null,
        })
      }

      // 4. Deuda si aplica
      const montoDeuda = formaPago === 'credito' ? totalVenta
        : formaPago === 'credi_contado' ? deudaRestante : 0

      if (montoDeuda > 0) {
        await supabase.from('debts').insert({
          sale_id: sale.id,
          member_id: miembro.id,
          original_amount: montoDeuda,
          pending_amount: montoDeuda,
          status: 'pending',
        })
      }

      // 5. Ofrendado: salida de utilidades al costo real
      if (formaPago === 'ofrendado') {
        const costoTotal = cart.reduce((s, i) => s + i.costoReal * i.cantidad, 0)
        await supabase.from('cash_movements').insert({
          type: 'expense',
          concept: 'gifted',
          amount: costoTotal,
          sale_id: sale.id,
          created_by: user.id ?? null,
        })
      }

      router.push('/dashboard')
    } catch (e: any) {
      console.error(e)
      alert(e.message || 'Error al registrar la venta')
      setSaving(false)
    }
  }

  const puedeConfirmar = () => {
    if (!formaPago || !miembro) return false
    if (formaPago === 'credi_contado' && abono <= 0) return false
    return true
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#EEF2FA', fontFamily: "'DM Sans', sans-serif", paddingBottom: 100 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input { font-family: 'DM Sans', sans-serif; color: #1A202C; }
        .top-bar { background: #4D7BFE; color: white; padding: 44px 24px 24px; border-radius: 0 0 28px 28px; }
        .back-btn { background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .steps-row { display: flex; gap: 6px; margin-top: 14px; }
        .step-pill { flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.25); transition: background 0.3s; }
        .step-pill.done { background: white; }
        .step-pill.active { background: rgba(255,255,255,0.7); }
        .section-title { font-size: 12px; font-weight: 700; color: #718096; padding: 18px 20px 10px; text-transform: uppercase; letter-spacing: 0.06em; }
        .search-wrap { margin: 0 20px 10px; }
        .search-input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; font-size: 15px; outline: none; background: white; color: #1A202C; }
        .search-input::placeholder { color: #A0AEC0; }
        .search-input:focus { border-color: #4D7BFE; }
        .book-item { background: white; border-radius: 16px; padding: 14px 16px; margin: 0 20px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 12px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s; }
        .book-item.selected { border-color: #4D7BFE; background: #F7F9FF; }
        .cover { width: 44px; height: 58px; border-radius: 7px; background: #EEF2FA; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; overflow: hidden; }
        .cover img { width: 100%; height: 100%; object-fit: cover; }
        .qty-btn { width: 28px; height: 28px; border-radius: 8px; border: none; background: #EEF2FA; color: #4D7BFE; font-size: 16px; cursor: pointer; font-weight: 700; font-family: 'DM Sans', sans-serif; }
        .total-bar { background: #4D7BFE; margin: 0 20px 14px; border-radius: 16px; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
        .card { background: white; border-radius: 18px; padding: 18px; margin: 0 20px 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .label { font-size: 12px; color: #718096; font-weight: 500; margin-bottom: 6px; }
        .input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; font-size: 15px; color: #1A202C; outline: none; background: white; }
        .input::placeholder { color: #A0AEC0; }
        .input:focus { border-color: #4D7BFE; }
        .pago-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0 20px 14px; }
        .pago-btn { background: white; border: 2px solid #E2E8F0; border-radius: 16px; padding: 16px 12px; text-align: center; cursor: pointer; transition: all 0.2s; font-family: 'DM Sans', sans-serif; }
        .pago-btn.selected { border-color: #4D7BFE; background: #EEF2FA; }
        .metodo-row { display: flex; gap: 10px; margin: 0 20px 14px; }
        .metodo-btn { flex: 1; background: white; border: 2px solid #E2E8F0; border-radius: 14px; padding: 14px; text-align: center; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 14px; transition: all 0.2s; }
        .metodo-btn.selected { border-color: #4D7BFE; background: #EEF2FA; color: #4D7BFE; font-weight: 700; }
        .member-found { background: white; border-radius: 16px; padding: 16px 18px; margin: 0 20px 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 14px; border: 2px solid #4D7BFE; }
        .cta-btn { position: fixed; bottom: 20px; left: 20px; right: 20px; background: #4D7BFE; color: white; border: none; border-radius: 16px; padding: 18px; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px rgba(77,123,254,0.35); font-family: 'DM Sans', sans-serif; transition: opacity 0.2s; }
        .cta-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .cta-btn.green { background: #48BB78; box-shadow: 0 8px 24px rgba(72,187,120,0.35); }
        .alert-box { border-radius: 12px; padding: 12px 16px; margin: 0 20px 14px; font-size: 14px; }
      `}</style>

      {/* Header */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="back-btn" onClick={() => step > 1 ? setStep((step - 1) as any) : router.back()}>←</button>
          <div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>Paso {step} de 3</p>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>
              {step === 1 ? 'Seleccionar Libros' : step === 2 ? 'Identificar Comprador' : 'Forma de Pago'}
            </h1>
          </div>
        </div>
        <div className="steps-row">
          {[1, 2, 3].map(s => <div key={s} className={`step-pill ${s < step ? 'done' : s === step ? 'active' : ''}`} />)}
        </div>
      </div>

      {/* ── PASO 1: Libros ── */}
      {step === 1 && (
        <>
          <p className="section-title">Inventario disponible</p>
          <div className="search-wrap">
            <input className="search-input" placeholder="Buscar por título o autor..." value={busquedaLibro} onChange={e => setBusquedaLibro(e.target.value)} />
          </div>

          {inventario.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A0AEC0' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>📦</p>
              <p>No hay libros disponibles en inventario</p>
            </div>
          )}

          {filteredInventario.map(lote => {
            const itemCarrito = enCarrito(lote.id)
            return (
              <div key={lote.id} className={`book-item ${itemCarrito ? 'selected' : ''}`} onClick={() => toggleCarrito(lote)}>
                <div className="cover">
                  {lote.coverUrl ? <img src={lote.coverUrl} alt={lote.bookTitle} /> : '📖'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, color: '#1A202C', fontSize: 14 }}>{lote.bookTitle}</p>
                  {lote.bookAuthor && <p style={{ fontSize: 12, color: '#A0AEC0', marginTop: 2 }}>{lote.bookAuthor}</p>}
                  <p style={{ fontSize: 12, color: '#A0AEC0', marginTop: 2 }}>Stock: {lote.cantidadDisponible} uds.</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 700, color: '#4D7BFE', fontSize: 15 }}>${lote.precioVenta.toLocaleString('es-CO')}</p>
                  {itemCarrito && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 6 }} onClick={e => e.stopPropagation()}>
                      <button className="qty-btn" onClick={() => updateQty(lote.id, itemCarrito.cantidad - 1)}>−</button>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1A202C', minWidth: 18, textAlign: 'center' }}>{itemCarrito.cantidad}</span>
                      <button className="qty-btn" onClick={() => updateQty(lote.id, itemCarrito.cantidad + 1)}>+</button>
                    </div>
                  )}
                </div>
                {itemCarrito && <span style={{ color: '#4D7BFE', fontSize: 18, flexShrink: 0 }}>✓</span>}
              </div>
            )
          })}

          {cart.length > 0 && (
            <div className="total-bar" style={{ margin: '10px 20px 90px' }}>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>{cart.reduce((s, i) => s + i.cantidad, 0)} libro(s)</span>
              <span style={{ color: 'white', fontSize: 20, fontWeight: 700 }}>${totalVenta.toLocaleString('es-CO')}</span>
            </div>
          )}

          <button className="cta-btn" disabled={cart.length === 0} onClick={() => setStep(2)}>
            Continuar — Identificar Comprador →
          </button>
        </>
      )}

      {/* ── PASO 2: Miembro ── */}
      {step === 2 && (
        <>
          <p className="section-title">Buscar comprador</p>

          {!miembro && !showFormMiembro && (
            <div className="card">
              <p className="label">Cédula, nombre o teléfono</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="input"
                  placeholder="Buscar miembro..."
                  value={busquedaMiembro}
                  onChange={e => { setBusquedaMiembro(e.target.value); setNoEncontrado(false) }}
                  onKeyDown={e => e.key === 'Enter' && buscarMiembro()}
                  style={{ flex: 1 }}
                />
                <button onClick={buscarMiembro} disabled={buscando} style={{ background: '#4D7BFE', color: 'white', border: 'none', borderRadius: 12, padding: '12px 18px', fontWeight: 700, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: buscando ? 0.7 : 1 }}>
                  {buscando ? '...' : 'Buscar'}
                </button>
              </div>

              {noEncontrado && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFF8E1', borderRadius: 10 }}>
                  <p style={{ fontSize: 13, color: '#856404' }}>No se encontró ningún miembro con ese dato.</p>
                </div>
              )}

              <button onClick={() => setShowFormMiembro(true)} style={{ marginTop: 14, width: '100%', background: 'none', border: '1.5px dashed #CBD5E0', borderRadius: 12, padding: 12, color: '#718096', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}>
                + Registrar nuevo miembro
              </button>
            </div>
          )}

          {showFormMiembro && (
            <div className="card">
              <p style={{ fontWeight: 700, color: '#1A202C', marginBottom: 14 }}>Nuevo Miembro</p>
              <p className="label">Nombre completo *</p>
              <input className="input" placeholder="Nombre completo" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} style={{ marginBottom: 12 }} />
              <p className="label" style={{ marginTop: 4 }}>Cédula *</p>
              <input className="input" placeholder="Número de cédula" value={nuevaCedula} onChange={e => setNuevaCedula(e.target.value)} style={{ marginBottom: 12 }} />
              <p className="label" style={{ marginTop: 4 }}>Teléfono</p>
              <input className="input" placeholder="Sin +57" value={nuevoTel} onChange={e => setNuevoTel(e.target.value)} style={{ marginBottom: 14 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowFormMiembro(false)} style={{ flex: 1, background: '#EEF2FA', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', color: '#718096', fontWeight: 600 }}>Cancelar</button>
                <button onClick={registrarMiembro} disabled={!nuevoNombre || !nuevaCedula || savingMiembro} style={{ flex: 2, background: '#4D7BFE', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer', color: 'white', fontWeight: 700, fontFamily: 'DM Sans, sans-serif', opacity: (!nuevoNombre || !nuevaCedula) ? 0.5 : 1 }}>
                  {savingMiembro ? 'Guardando...' : 'Registrar y Continuar'}
                </button>
              </div>
            </div>
          )}

          {miembro && (
            <>
              <div className="member-found">
                <div style={{ width: 44, height: 44, borderRadius: 14, background: '#EEF2FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👤</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: 16, color: '#1A202C' }}>{miembro.name}</p>
                  <p style={{ fontSize: 13, color: '#718096', marginTop: 2 }}>CC: {miembro.cedula}{miembro.phone ? ` · 📞 ${miembro.phone}` : ''}</p>
                </div>
                <button onClick={() => setMiembro(null)} style={{ background: 'none', border: 'none', color: '#CBD5E0', fontSize: 18, cursor: 'pointer' }}>✕</button>
              </div>
              <button className="cta-btn" onClick={() => setStep(3)}>Continuar — Forma de Pago →</button>
            </>
          )}
        </>
      )}

      {/* ── PASO 3: Pago ── */}
      {step === 3 && (
        <>
          <div className="total-bar" style={{ margin: '16px 20px 14px' }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600 }}>{miembro?.name}</p>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 }}>{cart.length} libro(s) · {cart.reduce((s, i) => s + i.cantidad, 0)} unidades</p>
            </div>
            <span style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>${totalVenta.toLocaleString('es-CO')}</span>
          </div>

          <p className="section-title">¿Cómo paga?</p>
          <div className="pago-grid">
            {([
              { key: 'contado',      icon: '💵', name: 'Contado',      desc: 'Pago total inmediato' },
              { key: 'credito',      icon: '📋', name: 'Crédito',      desc: 'Queda como deuda' },
              { key: 'credi_contado',icon: '🤝', name: 'Credi-Contado',desc: 'Abono + deuda restante' },
              { key: 'ofrendado',    icon: '🎁', name: 'Ofrendado',    desc: 'Regalo del negocio' },
            ] as const).map(op => (
              <button key={op.key} className={`pago-btn ${formaPago === op.key ? 'selected' : ''}`} onClick={() => setFormaPago(op.key)}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>{op.icon}</div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#2D3748' }}>{op.name}</p>
                <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>{op.desc}</p>
              </button>
            ))}
          </div>

          {formaPago === 'credi_contado' && (
            <div className="card">
              <p className="label">Monto del abono inicial</p>
              <input className="input" type="number" placeholder="0" value={abono || ''} onChange={e => setAbono(Math.min(Number(e.target.value), totalVenta))} />
              {abono > 0 && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#FFF5F0', borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#718096' }}>Quedará como deuda:</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#E53E3E' }}>${deudaRestante.toLocaleString('es-CO')}</span>
                </div>
              )}
            </div>
          )}

          {(formaPago === 'contado' || formaPago === 'credi_contado') && (
            <>
              <p className="section-title">Método de pago</p>
              <div className="metodo-row">
                <button className={`metodo-btn ${metodoPago === 'efectivo' ? 'selected' : ''}`} onClick={() => setMetodoPago('efectivo')}>💵 Efectivo</button>
                <button className={`metodo-btn ${metodoPago === 'transferencia' ? 'selected' : ''}`} onClick={() => setMetodoPago('transferencia')}>📲 Transferencia</button>
              </div>
              {metodoPago === 'transferencia' && (
                <div className="card">
                  <p className="label">N° de comprobante</p>
                  <input className="input" placeholder="Número de referencia" value={comprobante} onChange={e => setComprobante(e.target.value)} />
                </div>
              )}
            </>
          )}

          {formaPago === 'credito' && (
            <div className="alert-box" style={{ background: '#FFF8E1', border: '1px solid #F6C90E' }}>
              <p style={{ fontSize: 14, color: '#856404', fontWeight: 600 }}>⚠️ Venta a crédito</p>
              <p style={{ fontSize: 13, color: '#856404', marginTop: 6 }}>Se creará una deuda de <strong>${totalVenta.toLocaleString('es-CO')}</strong> a nombre de {miembro?.name}.</p>
            </div>
          )}

          {formaPago === 'ofrendado' && (
            <div className="alert-box" style={{ background: '#F0FFF4', border: '1px solid #68D391' }}>
              <p style={{ fontSize: 14, color: '#276749', fontWeight: 600 }}>🎁 Libro ofrendado</p>
              <p style={{ fontSize: 13, color: '#276749', marginTop: 6 }}>El costo real se descontará de las utilidades. El comprador no paga nada.</p>
            </div>
          )}

          <button className="cta-btn green" disabled={!puedeConfirmar() || saving} onClick={confirmarVenta}>
            {saving ? 'Registrando...' : `✓ Confirmar Venta — $${totalVenta.toLocaleString('es-CO')}`}
          </button>
        </>
      )}
    </main>
  )
}