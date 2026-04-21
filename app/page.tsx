"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const features = [
  {
    icon: '👥',
    title: 'Gestión de Miembros',
    desc: 'Registra, busca y administra a cada miembro. Consulta sus compras y deudas activas en un solo lugar.',
    color: '#EEF2FA',
    accent: '#4D7BFE',
  },
  {
    icon: '🛒',
    title: 'Registro de Ventas',
    desc: 'Venta en 3 pasos: selecciona libros, identifica al comprador y define la forma de pago (contado, crédito, credi-contado u ofrendado).',
    color: '#F0FFF4',
    accent: '#48BB78',
  },
  {
    icon: '📦',
    title: 'Control de Inventario',
    desc: 'Pedidos con múltiples libros, precios neto y de venta, portada y distribución automática del costo de envío.',
    color: '#FFF8E1',
    accent: '#F6AD55',
  },
  {
    icon: '💰',
    title: 'Caja & Finanzas',
    desc: 'Monitorea en tiempo real la caja, el inventario valorizado, la utilidad generada y las cuentas por cobrar.',
    color: '#FFF5F5',
    accent: '#E53E3E',
  },
  {
    icon: '📚',
    title: 'Libro Contable',
    desc: 'Generación automática del Libro Diario de ingresos y egresos para un control contable completo.',
    color: '#F3E8FF',
    accent: '#805AD5',
  },
]

export default function WelcomePage() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Si ya hay sesión activa, redirigir al dashboard
    const session = sessionStorage.getItem('user')
    if (session) { router.replace('/dashboard'); return }
    // Pequeño delay para que la animación de entrada se vea limpia
    const t = setTimeout(() => setVisible(true), 80)
    return () => clearTimeout(t)
  }, [router])

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#EEF2FA', fontFamily: "'DM Sans', sans-serif", paddingBottom: 60 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #EEF2FA; }

        /* ── Animaciones de entrada ── */
        .fade-in {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.55s ease, transform 0.55s ease;
        }
        .fade-in.visible { opacity: 1; transform: translateY(0); }
        .delay-1 { transition-delay: 0.10s; }
        .delay-2 { transition-delay: 0.20s; }
        .delay-3 { transition-delay: 0.30s; }
        .delay-4 { transition-delay: 0.40s; }
        .delay-5 { transition-delay: 0.50s; }
        .delay-6 { transition-delay: 0.60s; }
        .delay-7 { transition-delay: 0.70s; }

        /* ── Header ── */
        .hero {
          background: linear-gradient(160deg, #1A3A8F 0%, #2B5BBF 50%, #4D7BFE 100%);
          border-radius: 0 0 32px 32px;
          padding: 56px 28px 48px;
          text-align: center;
          color: white;
          position: relative;
          overflow: hidden;
        }
        .hero::before {
          content: '';
          position: absolute;
          top: -60px; right: -60px;
          width: 200px; height: 200px;
          background: rgba(255,255,255,0.05);
          border-radius: 50%;
        }
        .hero::after {
          content: '';
          position: absolute;
          bottom: -40px; left: -40px;
          width: 160px; height: 160px;
          background: rgba(255,255,255,0.04);
          border-radius: 50%;
        }
        .hero-logo {
          width: 64px; height: 64px;
          background: rgba(255,255,255,0.15);
          border-radius: 20px;
          display: flex; align-items: center; justify-content: center;
          font-size: 30px;
          margin: 0 auto 20px;
          backdrop-filter: blur(4px);
          border: 1.5px solid rgba(255,255,255,0.2);
        }
        .hero-title {
          font-family: 'Playfair Display', serif;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: -0.5px;
          line-height: 1.25;
          margin-bottom: 8px;
        }
        .hero-subtitle {
          font-size: 14px;
          opacity: 0.75;
          font-weight: 500;
          letter-spacing: 0.02em;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 20px;
          padding: 5px 14px;
          font-size: 12px;
          font-weight: 600;
          margin-top: 16px;
          letter-spacing: 0.03em;
        }

        /* ── Sección estadísticas rápidas ── */
        .stats-strip {
          display: flex;
          gap: 10px;
          margin: -22px 20px 0;
          position: relative;
          z-index: 10;
        }
        .stat-pill {
          flex: 1;
          background: white;
          border-radius: 16px;
          padding: 14px 8px;
          text-align: center;
          box-shadow: 0 4px 16px rgba(77,123,254,0.10);
        }
        .stat-pill-val { font-size: 20px; margin-bottom: 2px; }
        .stat-pill-lab { font-size: 10px; color: #A0AEC0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }

        /* ── Features ── */
        .section-label {
          font-size: 11px;
          font-weight: 700;
          color: #A0AEC0;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 28px 24px 12px;
        }
        .feature-card {
          background: white;
          border-radius: 20px;
          padding: 18px 20px;
          margin: 0 20px 12px;
          box-shadow: 0 3px 12px rgba(0,0,0,0.04);
          display: flex;
          align-items: flex-start;
          gap: 14px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .feature-card:active { transform: scale(0.98); }
        .feature-icon-box {
          width: 48px; height: 48px;
          border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
          flex-shrink: 0;
        }
        .feature-title {
          font-size: 15px;
          font-weight: 700;
          color: #1A202C;
          margin-bottom: 4px;
        }
        .feature-desc {
          font-size: 13px;
          color: #718096;
          line-height: 1.5;
        }

        /* ── Divider ornamental ── */
        .divider {
          height: 1px;
          background: linear-gradient(to right, transparent, #E2E8F0, transparent);
          margin: 8px 24px 0;
        }

        /* ── CTA inferior ── */
        .cta-section {
          padding: 28px 20px 0;
        }
        .cta-btn {
          width: 100%;
          padding: 18px;
          background: linear-gradient(135deg, #2B5BBF 0%, #4D7BFE 100%);
          color: white;
          border: none;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          box-shadow: 0 8px 24px rgba(77,123,254,0.35);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          letter-spacing: 0.01em;
        }
        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(77,123,254,0.45);
        }
        .cta-btn:active { transform: translateY(0); }

        .footer-note {
          text-align: center;
          margin-top: 18px;
          font-size: 11px;
          color: #A0AEC0;
          line-height: 1.6;
        }
      `}</style>

      {/* ── HERO ── */}
      <div className={`hero fade-in ${visible ? 'visible' : ''}`}>
      <div className="hero-logo">📖</div>
        <h1 className="hero-title">Servicio de Literatura</h1>
        <p className="hero-subtitle">Sistema de gestión de literatura y finanzas</p>
        <div className="hero-badge">
          Iglesia en Montería
        </div>
      </div>

      {/* ── STATS STRIP ── */}
      <div className={`stats-strip fade-in delay-1 ${visible ? 'visible' : ''}`}>
        <div className="stat-pill">
          <div className="stat-pill-val">👥</div>
          <p className="stat-pill-lab">Miembros</p>
        </div>
        <div className="stat-pill">
          <div className="stat-pill-val">📦</div>
          <p className="stat-pill-lab">Inventario</p>
        </div>
        <div className="stat-pill">
          <div className="stat-pill-val">📋</div>
          <p className="stat-pill-lab">Libros</p>
        </div>
        <div className="stat-pill">
          <div className="stat-pill-val">💰</div>
          <p className="stat-pill-lab">Caja</p>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <p className={`section-label fade-in delay-2 ${visible ? 'visible' : ''}`}>
        ¿Qué puedes hacer?
      </p>

      {features.map((f, i) => (
        <div
          key={f.title}
          className={`feature-card fade-in delay-${i + 2} ${visible ? 'visible' : ''}`}
        >
          <div className="feature-icon-box" style={{ background: f.color }}>
            {f.icon}
          </div>
          <div style={{ flex: 1 }}>
            <p className="feature-title" style={{ color: '#1A202C' }}>{f.title}</p>
            <p className="feature-desc">{f.desc}</p>
          </div>
          <span style={{ color: '#CBD5E0', fontSize: 18, alignSelf: 'center' }}>›</span>
        </div>
      ))}

      <div className={`divider fade-in delay-7 ${visible ? 'visible' : ''}`} />

      {/* ── CTA ── */}
      <div className={`cta-section fade-in delay-7 ${visible ? 'visible' : ''}`}>
        <button
          className="cta-btn"
          onClick={() => router.push('/login')}
        >
          Ingresar al sistema
          <span style={{ fontSize: 18 }}>→</span>
        </button>
        <p className="footer-note">
          © 2026 Sebastian Nuñez Productions<br />
          Mobile-First Accounting System
        </p>
      </div>
    </main>
  )
}