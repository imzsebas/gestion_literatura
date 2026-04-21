"use client"
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Libro {
  id: string
  title: string
  author: string
  series: string
  code: string
  coverUrl: string | null
  totalUnidades: number
  precioVenta: number | null
}

interface LoteDetalle {
  id: string
  proveedor: string
  fechaLlegada: string
  initialQuantity: number
  availableQuantity: number
  netPrice: number
  salePrice: number
  realCost: number
}

export default function LibrosPage() {
  const router = useRouter()
  const [libros, setLibros] = useState<Libro[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [selected, setSelected] = useState<Libro | null>(null)
  const [lotes, setLotes] = useState<LoteDetalle[]>([])
  const [loadingLotes, setLoadingLotes] = useState(false)
  const [editando, setEditando] = useState(false)

  // Campos de edición
  const [editTitle, setEditTitle] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editSeries, setEditSeries] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null)
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { fetchLibros() }, [])

  const fetchLibros = async () => {
    setLoading(true)
    const { data: books } = await supabase
      .from('books')
      .select('id, title, author, series, code, cover_url')
      .order('title')

    if (!books) { setLoading(false); return }

    // Para cada libro traer unidades disponibles y precio de venta del lote más reciente
    const enriched = await Promise.all(books.map(async b => {
      const { data: lots } = await supabase
        .from('inventory_lots')
        .select('available_quantity, sale_price_unit')
        .eq('book_id', b.id)
        .eq('status', 'active')

      const totalUnidades = (lots ?? []).reduce((s, l) => s + l.available_quantity, 0)
      const precioVenta = lots && lots.length > 0 ? Number(lots[lots.length - 1].sale_price_unit) : null

      return {
        id: b.id,
        title: b.title,
        author: b.author ?? '',
        series: b.series ?? '',
        code: b.code ?? '',
        coverUrl: b.cover_url ?? null,
        totalUnidades,
        precioVenta,
      }
    }))

    setLibros(enriched)
    setLoading(false)
  }

  const fetchLotes = async (bookId: string) => {
    setLoadingLotes(true)
    const { data: lots } = await supabase
      .from('inventory_lots')
      .select('id, initial_quantity, available_quantity, net_price_unit, sale_price_unit, real_cost_unit, purchase_id')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false })

    if (!lots || lots.length === 0) { setLotes([]); setLoadingLotes(false); return }

    const purchaseIds = [...new Set(lots.map(l => l.purchase_id))]
    const { data: purchases } = await supabase
      .from('purchases')
      .select('id, provider, arrival_date')
      .in('id', purchaseIds)

    const purchasesMap = Object.fromEntries((purchases ?? []).map(p => [p.id, p]))

    setLotes(lots.map(l => ({
      id: l.id,
      proveedor: purchasesMap[l.purchase_id]?.provider ?? '—',
      fechaLlegada: purchasesMap[l.purchase_id]?.arrival_date ?? '',
      initialQuantity: l.initial_quantity,
      availableQuantity: l.available_quantity,
      netPrice: Number(l.net_price_unit),
      salePrice: Number(l.sale_price_unit),
      realCost: Number(l.real_cost_unit),
    })))
    setLoadingLotes(false)
  }

  const abrirDetalle = async (libro: Libro) => {
    setSelected(libro)
    await fetchLotes(libro.id)
  }

  const abrirEdicion = () => {
    if (!selected) return
    setEditTitle(selected.title)
    setEditAuthor(selected.author)
    setEditSeries(selected.series)
    setEditCode(selected.code)
    setEditCoverPreview(selected.coverUrl)
    setEditCoverFile(null)
    setEditando(true)
  }

  const handleFoto = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => setEditCoverPreview(e.target?.result as string)
    reader.readAsDataURL(file)
    setEditCoverFile(file)
  }

  const handleGuardar = async () => {
    if (!selected) return
    setSaving(true)

    let coverUrl = selected.coverUrl

    // Subir nueva foto si la hay
    if (editCoverFile) {
      const ext = editCoverFile.name.split('.').pop()
      const fileName = `${selected.id}.${ext}`
      await supabase.storage.from('book-covers').upload(fileName, editCoverFile, { upsert: true })
      const { data: urlData } = supabase.storage.from('book-covers').getPublicUrl(fileName)
      coverUrl = urlData?.publicUrl ?? coverUrl
    }

    await supabase.from('books').update({
      title: editTitle,
      author: editAuthor || null,
      series: editSeries || null,
      code: editCode || null,
      cover_url: coverUrl,
    }).eq('id', selected.id)

    setSaving(false)
    setEditando(false)
    setSelected(null)
    await fetchLibros()
  }

  const filtered = libros.filter(l =>
    l.title.toLowerCase().includes(busqueda.toLowerCase()) ||
    (l.author || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (l.code || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (l.series || '').toLowerCase().includes(busqueda.toLowerCase())
  )

  const fmt = (v: number) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 })

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
        .section-title { font-size: 12px; font-weight: 700; color: #718096; padding: 18px 20px 10px; text-transform: uppercase; letter-spacing: 0.06em; }
        .book-card { background: white; border-radius: 18px; padding: 14px 16px; margin: 0 20px 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 14px; cursor: pointer; transition: transform 0.15s; }
        .book-card:hover { transform: translateY(-1px); }
        .cover-box { width: 52px; height: 70px; border-radius: 10px; background: #EEF2FA; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; overflow: hidden; }
        .cover-box img { width: 100%; height: 100%; object-fit: cover; }
        .stock-badge { padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 700; color: white; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 100; display: flex; align-items: flex-end; }
        .sheet { background: white; border-radius: 24px 24px 0 0; padding: 28px 24px 40px; width: 100%; max-height: 90vh; overflow-y: auto; }
        .label { font-size: 12px; color: #718096; font-weight: 500; margin-bottom: 6px; }
        .input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; font-size: 15px; color: #1A202C; outline: none; transition: border-color 0.2s; margin-bottom: 14px; background: white; }
        .input::placeholder { color: #A0AEC0; }
        .input:focus { border-color: #4D7BFE; }
        .action-btn { width: 100%; border: none; border-radius: 14px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 10px; font-family: 'DM Sans', sans-serif; }
        .lote-card { background: #F7FAFC; border-radius: 14px; padding: 14px; margin-bottom: 10px; border-left: 4px solid #4D7BFE; }
        .lote-stats { display: flex; justify-content: space-between; margin-top: 10px; }
        .lote-stat-val { font-size: 13px; font-weight: 700; color: #1A202C; }
        .lote-stat-lab { font-size: 10px; color: #A0AEC0; margin-top: 2px; }
        .lote-bar-bg { height: 5px; background: #EEF2FA; border-radius: 3px; margin-top: 10px; }
        .lote-bar-fill { height: 100%; border-radius: 3px; background: #4D7BFE; }
        .cover-upload { width: 80px; height: 108px; border-radius: 12px; background: #EEF2FA; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 28px; cursor: pointer; border: 2px dashed #CBD5E0; overflow: hidden; flex-shrink: 0; transition: border-color 0.2s; }
        .cover-upload:hover { border-color: #4D7BFE; }
        .cover-upload img { width: 100%; height: 100%; object-fit: cover; }
        .opcional-tag { font-size: 10px; background: #EEF2FA; color: #718096; padding: 2px 7px; border-radius: 6px; margin-left: 4px; }
      `}</style>

      {/* Header */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="back-btn" onClick={() => router.back()}>←</button>
          <div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>Catálogo</p>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Libros</h1>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: 22, fontWeight: 700 }}>{libros.length}</p>
            <p style={{ fontSize: 11, opacity: 0.7 }}>títulos</p>
          </div>
        </div>
        <input
          className="search-bar"
          placeholder="Buscar por título, autor, serie o código..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      <p className="section-title">{loading ? 'Cargando...' : `${filtered.length} libro(s)`}</p>

      {filtered.map(libro => (
        <div className="book-card" key={libro.id} onClick={() => abrirDetalle(libro)}>
          <div className="cover-box">
            {libro.coverUrl ? <img src={libro.coverUrl} alt={libro.title} /> : '📖'}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, color: '#1A202C', fontSize: 15 }}>{libro.title}</p>
            {libro.author && <p style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>{libro.author}</p>}
            {libro.series && <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>📚 {libro.series}</p>}
            {libro.code && <p style={{ fontSize: 11, color: '#CBD5E0', marginTop: 2 }}>#{libro.code}</p>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div
              className="stock-badge"
              style={{ background: libro.totalUnidades === 0 ? '#A0AEC0' : libro.totalUnidades <= 3 ? '#E53E3E' : '#48BB78' }}
            >
              {libro.totalUnidades} uds.
            </div>
            {libro.precioVenta && (
              <p style={{ fontSize: 13, fontWeight: 700, color: '#4D7BFE', marginTop: 6 }}>{fmt(libro.precioVenta)}</p>
            )}
          </div>
          <span style={{ color: '#CBD5E0', fontSize: 18 }}>›</span>
        </div>
      ))}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A0AEC0' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>📖</p>
          <p>No se encontraron libros</p>
        </div>
      )}

      {/* Detalle del libro */}
      {selected && !editando && (
        <div className="overlay" onClick={() => { setSelected(null); setLotes([]) }}>
          <div className="sheet" onClick={e => e.stopPropagation()}>

            {/* Cabecera con portada */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              <div className="cover-box" style={{ width: 70, height: 94, borderRadius: 12, flexShrink: 0 }}>
                {selected.coverUrl ? <img src={selected.coverUrl} alt={selected.title} /> : '📖'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#1A202C' }}>{selected.title}</p>
                {selected.author && <p style={{ fontSize: 14, color: '#718096', marginTop: 4 }}>✍️ {selected.author}</p>}
                {selected.series && <p style={{ fontSize: 13, color: '#A0AEC0', marginTop: 3 }}>📚 {selected.series}</p>}
                {selected.code && <p style={{ fontSize: 12, color: '#CBD5E0', marginTop: 3 }}>#{selected.code}</p>}
              </div>
              <button onClick={() => { setSelected(null); setLotes([]) }} style={{ background: '#EEF2FA', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: '#718096', flexShrink: 0 }}>✕</button>
            </div>

            {/* Stats rápidas */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, background: '#EEF2FA', borderRadius: 14, padding: 14, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 700, color: '#1A202C' }}>{selected.totalUnidades}</p>
                <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 3 }}>Unidades disponibles</p>
              </div>
              <div style={{ flex: 1, background: '#EEF2FA', borderRadius: 14, padding: 14, textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#4D7BFE' }}>
                  {selected.precioVenta ? fmt(selected.precioVenta) : '—'}
                </p>
                <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 3 }}>Precio de venta</p>
              </div>
            </div>

            {/* Historial de lotes */}
            <p style={{ fontSize: 12, fontWeight: 700, color: '#718096', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Historial de pedidos ({lotes.length})
            </p>

            {loadingLotes && <p style={{ color: '#A0AEC0', fontSize: 14, textAlign: 'center', padding: 20 }}>Cargando...</p>}

            {!loadingLotes && lotes.length === 0 && (
              <p style={{ color: '#A0AEC0', fontSize: 14, textAlign: 'center', padding: 16 }}>Sin lotes registrados</p>
            )}

            {lotes.map((lote, i) => {
              const pct = lote.initialQuantity > 0 ? (lote.availableQuantity / lote.initialQuantity) * 100 : 0
              const margen = lote.netPrice > 0 ? Math.round((lote.salePrice - lote.netPrice) / lote.netPrice * 100) : 0
              return (
                <div className="lote-card" key={lote.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1A202C' }}>📦 {lote.proveedor}</p>
                      {lote.fechaLlegada && (
                        <p style={{ fontSize: 11, color: '#A0AEC0', marginTop: 2 }}>
                          {new Date(lote.fechaLlegada).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: lote.availableQuantity === 0 ? '#A0AEC0' : '#48BB78' }}>
                        {lote.availableQuantity}/{lote.initialQuantity} uds.
                      </p>
                      {lote.availableQuantity === 0 && (
                        <p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 2 }}>Agotado</p>
                      )}
                    </div>
                  </div>
                  <div className="lote-bar-bg">
                    <div className="lote-bar-fill" style={{ width: `${pct}%`, background: pct <= 20 ? '#E53E3E' : pct <= 50 ? '#F6AD55' : '#48BB78' }} />
                  </div>
                  <div className="lote-stats">
                    <div>
                      <p className="lote-stat-val">{fmt(lote.netPrice)}</p>
                      <p className="lote-stat-lab">Precio neto</p>
                    </div>
                    <div>
                      <p className="lote-stat-val">{fmt(lote.realCost)}</p>
                      <p className="lote-stat-lab">Costo real</p>
                    </div>
                    <div>
                      <p className="lote-stat-val">{fmt(lote.salePrice)}</p>
                      <p className="lote-stat-lab">Precio venta</p>
                    </div>
                    <div>
                      <p className="lote-stat-val" style={{ color: '#48BB78' }}>+{margen}%</p>
                      <p className="lote-stat-lab">Margen</p>
                    </div>
                  </div>
                </div>
              )
            })}

            <button className="action-btn" style={{ background: '#4D7BFE', color: 'white', marginTop: 16 }} onClick={abrirEdicion}>
              ✏️ Editar información del libro
            </button>
          </div>
        </div>
      )}

      {/* Formulario de edición */}
      {editando && selected && (
        <div className="overlay" onClick={() => setEditando(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#1A202C' }}>Editar Libro</p>
              <button onClick={() => setEditando(false)} style={{ background: '#EEF2FA', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: '#718096' }}>✕</button>
            </div>

            {/* Foto de portada */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
              <div className="cover-upload" onClick={() => fileRef.current?.click()}>
                {editCoverPreview ? <img src={editCoverPreview} alt="portada" /> : <><span>📷</span><p style={{ fontSize: 10, color: '#A0AEC0', marginTop: 4 }}>Portada</p></>}
              </div>
              <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileRef} onChange={e => { const f = e.target.files?.[0]; if (f) handleFoto(f) }} />
              <div style={{ flex: 1 }}>
                <p className="label">Título *</p>
                <input className="input" placeholder="Título del libro" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
              </div>
            </div>

            <p className="label">Autor <span className="opcional-tag">opcional</span></p>
            <input className="input" placeholder="Nombre del autor" value={editAuthor} onChange={e => setEditAuthor(e.target.value)} />

            <p className="label">Serie / Colección <span className="opcional-tag">opcional</span></p>
            <input className="input" placeholder="Ej: Biblias de Estudio, Devocionales..." value={editSeries} onChange={e => setEditSeries(e.target.value)} />

            <p className="label">Código / ISBN <span className="opcional-tag">opcional</span></p>
            <input className="input" placeholder="ISBN o código interno" value={editCode} onChange={e => setEditCode(e.target.value)} />

            <button
              className="action-btn"
              style={{ background: '#4D7BFE', color: 'white', opacity: !editTitle || saving ? 0.5 : 1 }}
              disabled={!editTitle || saving}
              onClick={handleGuardar}
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}