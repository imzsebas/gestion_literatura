"use client"
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface BookItem {
  id: string
  bookTitle: string
  autor: string
  serie: string
  codigo: string
  fotoFile: File | null
  fotoPreview: string | null
  cantidad: number
  precioNeto: number
  precioVenta: number
}

export default function NuevoPedidoPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [proveedor, setProveedor] = useState('')
  const [fechaLlegada, setFechaLlegada] = useState('')
  const [costoEnvio, setCostoEnvio] = useState<number>(0)
  const [notas, setNotas] = useState('')
  const [items, setItems] = useState<BookItem[]>([])
  const [busquedaLibro, setBusquedaLibro] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const totalUnidades = items.reduce((acc, i) => acc + i.cantidad, 0)

  const costoRealUnitario = (item: BookItem) => {
    if (totalUnidades === 0 || item.cantidad === 0) return item.precioNeto
    const parteEnvio = (costoEnvio / totalUnidades) * item.cantidad
    return (item.precioNeto * item.cantidad + parteEnvio) / item.cantidad
  }

  const agregarItem = () => {
    if (!busquedaLibro.trim()) return
    setItems(prev => [...prev, {
      id: crypto.randomUUID(),
      bookTitle: busquedaLibro,
      autor: '', serie: '', codigo: '',
      fotoFile: null, fotoPreview: null,
      cantidad: 1, precioNeto: 0, precioVenta: 0,
    }])
    setBusquedaLibro('')
  }

  const updateItem = (id: string, field: keyof BookItem, value: any) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id))

  const handleFoto = (id: string, file: File) => {
    const reader = new FileReader()
    reader.onload = e => updateItem(id, 'fotoPreview', e.target?.result as string)
    reader.readAsDataURL(file)
    updateItem(id, 'fotoFile', file)
  }

  const handleGuardar = async () => {
    setSaving(true)
    setErrorMsg('')
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')

    try {
      // 1. Crear el pedido (purchases)
      const { data: purchase, error: purchaseError } = await supabase
        .from('purchases')
        .insert({
          provider: proveedor,
          arrival_date: fechaLlegada,
          shipping_cost: costoEnvio || 0,
          notes: notas || null,
          created_by: user.id ?? null,
        })
        .select()
        .single()

      if (purchaseError || !purchase) throw new Error('Error al crear el pedido')

      // 2. Por cada libro del pedido
      for (const item of items) {
        // 2a. Subir foto si existe
        let coverUrl: string | null = null
        if (item.fotoFile) {
          const ext = item.fotoFile.name.split('.').pop()
          const fileName = `${crypto.randomUUID()}.${ext}`
          const { data: uploadData } = await supabase.storage
            .from('book-covers')
            .upload(fileName, item.fotoFile, { upsert: false })
          if (uploadData) {
            const { data: urlData } = supabase.storage.from('book-covers').getPublicUrl(fileName)
            coverUrl = urlData?.publicUrl ?? null
          }
        }

        // 2b. Buscar libro existente por título (o crear nuevo)
        let bookId: string
        const { data: existingBook } = await supabase
          .from('books')
          .select('id')
          .ilike('title', item.bookTitle)
          .limit(1)
          .single()

        if (existingBook) {
          bookId = existingBook.id
          // Actualizar campos si se agregaron nuevos datos
          await supabase.from('books').update({
            ...(item.autor ? { author: item.autor } : {}),
            ...(item.serie ? { series: item.serie } : {}),
            ...(item.codigo ? { code: item.codigo } : {}),
            ...(coverUrl ? { cover_url: coverUrl } : {}),
          }).eq('id', bookId)
        } else {
          // Crear libro nuevo
          const { data: newBook, error: bookError } = await supabase
            .from('books')
            .insert({
              title: item.bookTitle,
              author: item.autor || null,
              series: item.serie || null,
              code: item.codigo || null,
              cover_url: coverUrl,
            })
            .select()
            .single()
          if (bookError || !newBook) throw new Error(`Error al crear libro: ${item.bookTitle}`)
          bookId = newBook.id
        }

        // 2c. Crear lote en inventory_lots
        const { error: lotError } = await supabase.from('inventory_lots').insert({
          purchase_id: purchase.id,
          book_id: bookId,
          initial_quantity: item.cantidad,
          available_quantity: item.cantidad,
          net_price_unit: item.precioNeto,
          sale_price_unit: item.precioVenta,
          real_cost_unit: costoRealUnitario(item),
          status: 'active',
        })
        if (lotError) throw new Error(`Error al registrar lote de: ${item.bookTitle}`)
      }

      router.push('/inventario')
    } catch (e: any) {
      setErrorMsg(e.message || 'Ocurrió un error. Intenta de nuevo.')
      setSaving(false)
    }
  }

  const paso1Completo = proveedor.trim() && fechaLlegada

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#EEF2FA', fontFamily: "'DM Sans', sans-serif", paddingBottom: 100 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, textarea { font-family: 'DM Sans', sans-serif; color: #1A202C; }
        .top-bar { background: #4D7BFE; color: white; padding: 44px 24px 28px; border-radius: 0 0 28px 28px; display: flex; align-items: center; gap: 14px; }
        .back-btn { background: rgba(255,255,255,0.2); border: none; color: white; width: 36px; height: 36px; border-radius: 10px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .step-dots { display: flex; gap: 6px; margin-left: auto; }
        .dot { width: 8px; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.35); transition: all 0.3s; }
        .dot.active { background: white; width: 20px; }
        .card { background: white; border-radius: 20px; padding: 20px; margin: 0 20px 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); }
        .label { font-size: 12px; color: #718096; font-weight: 500; margin-bottom: 6px; }
        .input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; font-size: 15px; color: #1A202C; outline: none; transition: border-color 0.2s; background: white; }
        .input::placeholder { color: #A0AEC0; }
        .input:focus { border-color: #4D7BFE; }
        .row { display: flex; gap: 12px; }
        .row > * { flex: 1; }
        .section-title { font-size: 12px; font-weight: 700; color: #718096; padding: 18px 20px 10px; text-transform: uppercase; letter-spacing: 0.06em; }
        .item-card { background: white; border-radius: 18px; margin: 0 20px 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.05); overflow: hidden; border-left: 4px solid #4D7BFE; }
        .item-header { display: flex; align-items: center; gap: 12px; padding: 14px 16px 12px; border-bottom: 1px solid #F7FAFC; }
        .item-cover { width: 48px; height: 64px; border-radius: 8px; background: #EEF2FA; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; overflow: hidden; cursor: pointer; border: 2px dashed #CBD5E0; transition: border-color 0.2s; }
        .item-cover:hover { border-color: #4D7BFE; }
        .item-cover img { width: 100%; height: 100%; object-fit: cover; }
        .item-title-input { flex: 1; border: none; font-size: 15px; font-weight: 700; color: #1A202C; outline: none; background: transparent; padding: 0; }
        .item-title-input::placeholder { color: #A0AEC0; font-weight: 400; }
        .item-body { padding: 14px 16px; }
        .mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
        .mini-label { font-size: 11px; color: #A0AEC0; margin-bottom: 4px; font-weight: 500; }
        .mini-input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 10px; padding: 9px 12px; font-size: 14px; outline: none; color: #1A202C; background: white; transition: border-color 0.2s; }
        .mini-input::placeholder { color: #A0AEC0; }
        .mini-input:focus { border-color: #4D7BFE; }
        .qty-btn { width: 32px; height: 32px; border-radius: 8px; border: none; background: #EEF2FA; color: #4D7BFE; font-size: 18px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .qty-num { font-size: 16px; font-weight: 700; color: #1A202C; min-width: 24px; text-align: center; }
        .divider { height: 1px; background: #F7FAFC; margin: 10px 0; }
        .opcional-tag { font-size: 10px; background: #EEF2FA; color: #718096; padding: 2px 7px; border-radius: 6px; margin-left: 4px; }
        .remove-btn { background: #FFF5F5; color: #E53E3E; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; margin-top: 12px; font-family: 'DM Sans', sans-serif; }
        .add-row { display: flex; gap: 10px; margin: 0 20px 16px; }
        .add-input { flex: 1; border: 1.5px dashed #CBD5E0; border-radius: 12px; padding: 12px 14px; font-size: 15px; outline: none; background: white; color: #1A202C; }
        .add-input::placeholder { color: #A0AEC0; }
        .add-input:focus { border-color: #4D7BFE; border-style: solid; }
        .add-btn { background: #4D7BFE; color: white; border: none; border-radius: 12px; padding: 12px 18px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; }
        .summary-bar { background: white; margin: 16px 20px 4px; border-radius: 16px; padding: 14px 20px; display: flex; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .cta-btn { position: fixed; bottom: 20px; left: 20px; right: 20px; background: #4D7BFE; color: white; border: none; border-radius: 16px; padding: 18px; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px rgba(77,123,254,0.35); font-family: 'DM Sans', sans-serif; transition: opacity 0.2s; }
        .cta-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .error-bar { background: #FFF5F5; border: 1px solid #FED7D7; border-radius: 12px; padding: 12px 16px; margin: 0 20px 14px; color: #C53030; font-size: 14px; }
      `}</style>

      {/* Header */}
      <div className="top-bar">
        <button className="back-btn" onClick={() => step === 2 ? setStep(1) : router.back()}>←</button>
        <div>
          <p style={{ fontSize: 13, opacity: 0.75 }}>Módulo de Pedidos</p>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Nuevo Pedido</h1>
        </div>
        <div className="step-dots">
          <div className={`dot ${step === 1 ? 'active' : ''}`} />
          <div className={`dot ${step === 2 ? 'active' : ''}`} />
        </div>
      </div>

      {/* ── PASO 1 ── */}
      {step === 1 && (
        <>
          <p className="section-title">Datos del Pedido</p>
          <div className="card">
            <div style={{ marginBottom: 14 }}>
              <p className="label">Proveedor *</p>
              <input className="input" placeholder="Nombre del proveedor" value={proveedor} onChange={e => setProveedor(e.target.value)} />
            </div>
            <div className="row">
              <div>
                <p className="label">Fecha de llegada *</p>
                <input className="input" type="date" value={fechaLlegada} onChange={e => setFechaLlegada(e.target.value)} />
              </div>
              <div>
                <p className="label">Costo de envío</p>
                <input className="input" type="number" placeholder="0" value={costoEnvio || ''} onChange={e => setCostoEnvio(Number(e.target.value))} />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <p className="label">Notas <span className="opcional-tag">opcional</span></p>
              <textarea className="input" rows={3} placeholder="Observaciones..." value={notas} onChange={e => setNotas(e.target.value)} style={{ resize: 'none' }} />
            </div>
          </div>
          <button className="cta-btn" disabled={!paso1Completo} onClick={() => setStep(2)}>
            Continuar — Agregar Libros →
          </button>
        </>
      )}

      {/* ── PASO 2 ── */}
      {step === 2 && (
        <>
          <div className="summary-bar">
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>{proveedor}</p>
              <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>Proveedor</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1A202C' }}>{items.length}</p>
              <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>Títulos</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1A202C' }}>{totalUnidades}</p>
              <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>Unidades</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1A202C' }}>${costoEnvio.toLocaleString('es-CO')}</p>
              <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>Envío</p>
            </div>
          </div>

          <p className="section-title">Libros del Pedido</p>

          <div className="add-row">
            <input className="add-input" placeholder="Escribir título del libro..." value={busquedaLibro} onChange={e => setBusquedaLibro(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregarItem()} />
            <button className="add-btn" onClick={agregarItem}>+ Agregar</button>
          </div>

          {errorMsg && <div className="error-bar">⚠️ {errorMsg}</div>}

          {items.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A0AEC0' }}>
              <p style={{ fontSize: 36, marginBottom: 8 }}>📦</p>
              <p>Agrega al menos un libro para continuar</p>
            </div>
          )}

          {items.map(item => (
            <div className="item-card" key={item.id}>
              <div className="item-header">
                <div className="item-cover" onClick={() => fileRefs.current[item.id]?.click()}>
                  {item.fotoPreview ? <img src={item.fotoPreview} alt="portada" /> : <span>📷</span>}
                </div>
                <input type="file" accept="image/*" style={{ display: 'none' }} ref={el => { fileRefs.current[item.id] = el }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFoto(item.id, f) }} />
                <div style={{ flex: 1 }}>
                  <input className="item-title-input" value={item.bookTitle} onChange={e => updateItem(item.id, 'bookTitle', e.target.value)} placeholder="Título del libro" />
                  <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 3 }}>
                    {item.fotoPreview ? '✅ Foto cargada' : <>Toca 📷 para portada <span className="opcional-tag">opcional</span></>}
                  </p>
                </div>
              </div>

              <div className="item-body">
                <div className="mini-grid">
                  <div>
                    <p className="mini-label">Autor <span className="opcional-tag">opcional</span></p>
                    <input className="mini-input" placeholder="Nombre del autor" value={item.autor} onChange={e => updateItem(item.id, 'autor', e.target.value)} />
                  </div>
                  <div>
                    <p className="mini-label">Código / ISBN <span className="opcional-tag">opcional</span></p>
                    <input className="mini-input" placeholder="ISBN o código" value={item.codigo} onChange={e => updateItem(item.id, 'codigo', e.target.value)} />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <p className="mini-label">Serie / Colección <span className="opcional-tag">opcional</span></p>
                  <input className="mini-input" placeholder="Ej: Biblias de Estudio, Devocionales..." value={item.serie} onChange={e => updateItem(item.id, 'serie', e.target.value)} />
                </div>

                <div className="divider" />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
                  <div>
                    <p className="mini-label">Cantidad recibida</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button className="qty-btn" onClick={() => updateItem(item.id, 'cantidad', Math.max(1, item.cantidad - 1))}>−</button>
                      <span className="qty-num">{item.cantidad}</span>
                      <button className="qty-btn" onClick={() => updateItem(item.id, 'cantidad', item.cantidad + 1)}>+</button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p className="mini-label">Costo real/u (con envío)</p>
                    <p style={{ color: '#4D7BFE', fontWeight: 700, fontSize: 15 }}>${costoRealUnitario(item).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>

                <div className="mini-grid">
                  <div>
                    <p className="mini-label">Precio neto (costo) *</p>
                    <input className="mini-input" type="number" placeholder="0" value={item.precioNeto || ''} onChange={e => updateItem(item.id, 'precioNeto', Number(e.target.value))} />
                  </div>
                  <div>
                    <p className="mini-label">Precio de venta *</p>
                    <input className="mini-input" type="number" placeholder="0" value={item.precioVenta || ''} onChange={e => updateItem(item.id, 'precioVenta', Number(e.target.value))} />
                  </div>
                </div>

                {item.precioNeto > 0 && item.precioVenta > 0 && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#F0FFF4', borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#276749' }}>Margen por unidad</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#276749' }}>+${(item.precioVenta - item.precioNeto).toLocaleString('es-CO')} ({Math.round((item.precioVenta - item.precioNeto) / item.precioNeto * 100)}%)</span>
                  </div>
                )}

                <button className="remove-btn" onClick={() => removeItem(item.id)}>✕ Quitar libro</button>
              </div>
            </div>
          ))}

          <div style={{ height: 90 }} />

          <button
            className="cta-btn"
            disabled={items.length === 0 || saving || items.some(i => i.precioNeto === 0 || i.precioVenta === 0)}
            onClick={handleGuardar}
          >
            {saving ? 'Guardando en Supabase...' : `Registrar Pedido — ${items.length} lote${items.length !== 1 ? 's' : ''}, ${totalUnidades} unidades`}
          </button>
        </>
      )}
    </main>
  )
}