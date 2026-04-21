"use client"
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Member {
  id: string
  name: string
  cedula: string
  phone: string
  createdAt: string
}

export default function MiembrosPage() {
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Member | null>(null)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [telefono, setTelefono] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorCedula, setErrorCedula] = useState(false)

  useEffect(() => { fetchMembers() }, [])

  const fetchMembers = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('members')
      .select('id, name, cedula, phone, created_at')
      .order('name')
    setMembers((data ?? []).map(m => ({ id: m.id, name: m.name, cedula: m.cedula, phone: m.phone ?? '', createdAt: m.created_at })))
    setLoading(false)
  }

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(busqueda.toLowerCase()) ||
    m.cedula.includes(busqueda) ||
    (m.phone || '').includes(busqueda)
  )

  const resetForm = () => { setNombre(''); setCedula(''); setTelefono(''); setErrorCedula(false) }

  const handleGuardar = async () => {
    if (members.find(m => m.cedula === cedula)) { setErrorCedula(true); return }
    setErrorCedula(false); setSaving(true)
    const user = JSON.parse(sessionStorage.getItem('user') || '{}')
    const { error } = await supabase.from('members').insert({ name: nombre, cedula, phone: telefono || null, created_by: user.id ?? null })
    if (!error) { resetForm(); setShowForm(false); await fetchMembers() }
    setSaving(false)
  }

  const abrirEdicion = (m: Member) => {
    setSelected(m); setNombre(m.name); setCedula(m.cedula); setTelefono(m.phone); setEditando(true)
  }

  const handleEditar = async () => {
    if (!selected) return
    if (members.find(m => m.cedula === cedula && m.id !== selected.id)) { setErrorCedula(true); return }
    setErrorCedula(false); setSaving(true)
    const { error } = await supabase.from('members').update({ name: nombre, cedula, phone: telefono || null }).eq('id', selected.id)
    if (!error) { resetForm(); setEditando(false); setSelected(null); await fetchMembers() }
    setSaving(false)
  }

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
        .member-card { background: white; border-radius: 18px; padding: 16px 18px; margin: 0 20px 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 14px; }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; display: flex; align-items: flex-end; }
        .sheet { background: white; border-radius: 24px 24px 0 0; padding: 28px 24px 40px; width: 100%; }
        .label { font-size: 12px; color: #718096; font-weight: 500; margin-bottom: 6px; }
        .input { width: 100%; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; font-size: 15px; color: #1A202C; outline: none; transition: border-color 0.2s; margin-bottom: 14px; background: white; }
        .input::placeholder { color: #A0AEC0; }
        .input:focus { border-color: #4D7BFE; }
        .input.error { border-color: #E53E3E; }
        .fab { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 18px; background: #4D7BFE; border: none; color: white; font-size: 26px; cursor: pointer; box-shadow: 0 8px 24px rgba(77,123,254,0.4); display: flex; align-items: center; justify-content: center; }
        .edit-btn { background: #EEF2FA; border: none; border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #4D7BFE; cursor: pointer; font-family: 'DM Sans', sans-serif; flex-shrink: 0; }
        .info-chip { background: #F7FAFC; border-radius: 8px; padding: 4px 10px; font-size: 12px; color: #718096; display: inline-block; margin-right: 6px; margin-top: 5px; }
        .save-btn { width: 100%; border: none; border-radius: 14px; padding: 16px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; background: #4D7BFE; color: white; }
        .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="back-btn" onClick={() => router.back()}>←</button>
          <div>
            <p style={{ fontSize: 13, opacity: 0.75 }}>Directorio</p>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>Miembros</h1>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <p style={{ fontSize: 22, fontWeight: 700 }}>{members.length}</p>
            <p style={{ fontSize: 11, opacity: 0.7 }}>registrados</p>
          </div>
        </div>
        <input className="search-bar" placeholder="Buscar por nombre, cédula o teléfono..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      <p className="section-title">{loading ? 'Cargando...' : `${filtered.length} miembro(s)`}</p>

      {filtered.map(m => (
        <div className="member-card" key={m.id}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: '#EEF2FA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👤</div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, color: '#1A202C', fontSize: 15 }}>{m.name}</p>
            <div>
              <span className="info-chip">CC: {m.cedula}</span>
              {m.phone && <span className="info-chip">📞 {m.phone}</span>}
            </div>
            <p style={{ fontSize: 11, color: '#CBD5E0', marginTop: 4 }}>
              Desde: {new Date(m.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <button className="edit-btn" onClick={() => abrirEdicion(m)}>✏️ Editar</button>
        </div>
      ))}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#A0AEC0' }}>
          <p style={{ fontSize: 36, marginBottom: 8 }}>🔍</p>
          <p>No se encontraron miembros</p>
        </div>
      )}

      <button className="fab" onClick={() => { resetForm(); setShowForm(true) }}>+</button>

      {/* Form nuevo */}
      {showForm && (
        <div className="overlay" onClick={() => setShowForm(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#1A202C' }}>Nuevo Miembro</p>
              <button onClick={() => setShowForm(false)} style={{ background: '#EEF2FA', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: '#718096' }}>✕</button>
            </div>
            <p className="label">Nombre completo *</p>
            <input className="input" placeholder="Nombre y apellidos" value={nombre} onChange={e => setNombre(e.target.value)} />
            <p className="label">Cédula *</p>
            <input className={`input ${errorCedula ? 'error' : ''}`} placeholder="Número de cédula" value={cedula} onChange={e => { setCedula(e.target.value); setErrorCedula(false) }} />
            {errorCedula && <p style={{ fontSize: 12, color: '#E53E3E', marginTop: -10, marginBottom: 12 }}>⚠️ Esta cédula ya está registrada</p>}
            <p className="label">Teléfono (sin +57)</p>
            <input className="input" placeholder="Ej: 3001234567" value={telefono} onChange={e => setTelefono(e.target.value)} />
            <button className="save-btn" onClick={handleGuardar} disabled={!nombre || !cedula || saving}>
              {saving ? 'Guardando...' : 'Registrar Miembro'}
            </button>
          </div>
        </div>
      )}

      {/* Form editar */}
      {editando && selected && (
        <div className="overlay" onClick={() => { setEditando(false); resetForm() }}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: '#1A202C' }}>Editar Miembro</p>
              <button onClick={() => { setEditando(false); resetForm() }} style={{ background: '#EEF2FA', border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', color: '#718096' }}>✕</button>
            </div>
            <p className="label">Nombre completo *</p>
            <input className="input" placeholder="Nombre y apellidos" value={nombre} onChange={e => setNombre(e.target.value)} />
            <p className="label">Cédula *</p>
            <input className={`input ${errorCedula ? 'error' : ''}`} placeholder="Número de cédula" value={cedula} onChange={e => { setCedula(e.target.value); setErrorCedula(false) }} />
            {errorCedula && <p style={{ fontSize: 12, color: '#E53E3E', marginTop: -10, marginBottom: 12 }}>⚠️ Esta cédula ya está registrada en otro miembro</p>}
            <p className="label">Teléfono (sin +57)</p>
            <input className="input" placeholder="Ej: 3001234567" value={telefono} onChange={e => setTelefono(e.target.value)} />
            <button className="save-btn" onClick={handleEditar} disabled={!nombre || !cedula || saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}