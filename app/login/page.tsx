"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Iconos SVG simples para el diseño
const UserIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A0AEC0" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const LockIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A0AEC0" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
const EyeIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A0AEC0" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const EyeOffIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A0AEC0" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>

export default function LoginPage() {
  const router = useRouter()
  // Estado para el botón Ojo (ver/ocultar contraseña)
  const [showPass, setShowPass] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cedula, setCedula] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Tu lógica de autenticación (se mantiene igual)
      const { data: user, error: dbError } = await supabase
        .from('users')
        .select('id, name, cedula, role, password, active')
        .eq('cedula', cedula.trim())
        .single()

      if (dbError || !user) {
        setError('Cédula o contraseña incorrectos.')
        setLoading(false)
        return
      }

      if (user.active === false) {
        setError('Tu cuenta está desactivada.')
        setLoading(false)
        return
      }

      if (user.password !== password) {
        setError('Cédula o contraseña incorrectos.')
        setLoading(false)
        return
      }

      const sessionData = {
        id: user.id,
        name: user.name,
        role: user.role
      }
      
      sessionStorage.setItem('user', JSON.stringify(sessionData))
      router.push('/dashboard')

    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <main className="smart-banking-login">
      {/* BLOQUE DE ESTILOS INSPIRADO EN LA IMAGEN */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        .smart-banking-login {
          min-height: 100vh;
          background-color: #4D7BFE; /* Azul de fondo de la imagen */
          font-family: 'DM Sans', sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
        }

        /* Contenedor principal que simula la pantalla del celular */
        .mobile-container {
          width: 100%;
          max-width: 375px; /* Ancho estándar de celular */
          min-height: 80vh;
          background: #EEF2FA; /* Fondo gris muy claro de las tarjetas */
          border-radius: 30px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: fadeUp .5s ease;
        }

        /* Sección superior azul */
        .header-section {
          background-color: #4D7BFE;
          color: white;
          padding: 60px 30px 40px 30px;
          text-align: center;
          position: relative;
        }

        .header-section::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          width: 100%;
          height: 30px;
          background: #EEF2FA;
          border-radius: 30px 30px 0 0;
        }

        .app-title {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 10px;
          letter-spacing: -0.5px;
        }

        /* Sección del formulario (tarjeta blanca elevada) */
        .form-section {
          flex: 1;
          background: #EEF2FA;
          padding: 0 25px 30px 25px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .login-card {
          background: #FFFFFF;
          border-radius: 20px;
          padding: 30px 20px;
          box-shadow: 0 10px 25px rgba(100, 120, 240, 0.08);
          margin-bottom: 30px;
        }

        .welcome-text {
          color: #1A202C;
          font-size: 18px;
          font-weight: 700;
          text-align: center;
          margin-bottom: 30px;
        }

        /* Estilo de los Inputs con Iconos (Style de la imagen) */
        .input-group {
          margin-bottom: 20px;
          position: relative;
        }

        .input-icon-label {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          pointer-events: none;
        }

        .input-group input {
          width: 100%;
          padding: 16px 16px 16px 50px; /* Espacio para el icono izquierdo */
          border: 1.5px solid #E2E8F0;
          border-radius: 12px;
          font-size: 15px;
          color: #2D3748;
          transition: border-color 0.2s;
        }

        .input-group input:focus {
          outline: none;
          border-color: #4D7BFE;
          background-color: #F8FAFF;
        }

        /* Estilo específico para el Ojo de la contraseña */
        .eye-button {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }

        /* Botón Submit Azul Principal */
        .btn-sign-in {
          width: 100%;
          padding: 18px;
          background-color: #4D7BFE;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 0.2s, transform 0.1s;
          box-shadow: 0 8px 15px rgba(77, 123, 254, 0.25);
        }

        .btn-sign-in:hover:not(:disabled) {
          background-color: #3D6AEF;
        }

        .btn-sign-in:active:not(:disabled) {
          transform: translateY(1px);
          box-shadow: 0 4px 10px rgba(77, 123, 254, 0.2);
        }

        .btn-sign-in:disabled {
          background-color: #A0AEC0;
          cursor: not-allowed;
          box-shadow: none;
        }

        /* Footer y Texto Inferior */
        .footer-section {
          text-align: center;
          padding: 15px;
        }

        .error-msg {
          background-color: #FFF5F5;
          border: 1px solid #FC8181;
          color: #C53030;
          padding: 12px;
          border-radius: 10px;
          margin-bottom: 20px;
          font-size: 13px;
          text-align: center;
          font-weight: 500;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="mobile-container">
        {/* Superior Azul */}
        <div className="header-section">
          <h1 className="app-title">Smart Accounting</h1>
          <p style={{fontSize: '14px', opacity: 0.8}}>Iglesia en Montería</p>
        </div>

        {/* Sección del Formulario */}
        <div className="form-section">
          <div className="login-card">
            <h2 className="welcome-text">Iniciar Sesión</h2>

            <form onSubmit={handleSubmit}>
              {/* Input Cédula con Icono de Usuario */}
              <div className="input-group">
                <div className="input-icon-label">
                  <UserIcon />
                </div>
                <input
                  type="text"
                  placeholder="Cédula de identidad"
                  value={cedula}
                  onChange={e => setCedula(e.target.value)}
                  required
                />
              </div>

              {/* Input Contraseña con Icono de Candado y Botón Ojo */}
              <div className="input-group">
                <div className="input-icon-label">
                  <LockIcon />
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Contraseña"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: '50px' }} // Espacio para el ojo
                />
                {/* BOTÓN OJO FUNCIONAL */}
                <button 
                  type="button" 
                  className="eye-button" 
                  onClick={() => setShowPass(!showPass)}
                  title={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>

              {error && <div className="error-msg">{error}</div>}

              <button type="submit" className="btn-sign-in" disabled={loading}>
                {loading ? "Verificando..." : "Ingresar"}
              </button>
            </form>
          </div>

          <div className="footer-section">
            <p style={{fontSize: '11px', color: '#718096'}}>© 2026 Sebastian Nuñez Productions</p>
            <p style={{fontSize: '10px', color: '#A0AEC0', marginTop: '5px'}}>Mobile-First Accounting System</p>
          </div>
        </div>
      </div>
    </main>
  )
}