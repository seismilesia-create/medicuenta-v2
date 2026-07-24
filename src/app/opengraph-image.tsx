import { ImageResponse } from 'next/og'

/**
 * Vista previa del link (WhatsApp, Instagram, Twitter…). El CTA de la landing es WhatsApp,
 * así que este es el primer contacto real con la marca: sin imagen, el link se comparte pelado.
 *
 * Se genera en el build (no hay fetch ni fuentes externas): Next la sirve como PNG estático
 * en /opengraph-image. Tipografía del sistema a propósito — cargar una fuente externa acá
 * agrega un fetch que puede fallar y dejar la card sin imagen.
 */
export const alt = 'MediCuenta — agenda, cobra y presenta a las obras sociales por vos'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #F5FAFF 0%, #E3F1FC 55%, #D3E8F9 100%)',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        }}
      >
        {/* Marca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="76" height="76" viewBox="0 0 48 48">
            <defs>
              <linearGradient id="mc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#1189DE" />
                <stop offset="1" stopColor="#0A63AA" />
              </linearGradient>
            </defs>
            <path
              d="M14 4H34C36.2 4 38 5.8 38 8V44L33.3 40.7L28.7 44L24 40.7L19.3 44L14.7 40.7L10 44V8C10 5.8 11.8 4 14 4Z"
              fill="url(#mc)"
            />
            <path
              d="M15 24.5H18.5L21.5 17L25.5 31L28.5 24.5H33"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div style={{ display: 'flex', fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>
            <span style={{ color: '#0F172A' }}>Medi</span>
            <span style={{ color: '#1189DE' }}>Cuenta</span>
          </div>
        </div>

        {/* Mensaje principal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 68,
              fontWeight: 800,
              letterSpacing: -2.5,
              lineHeight: 1.1,
              color: '#0F172A',
            }}
          >
            <span>Dejá de facturar a mano.</span>
            <span style={{ color: '#1189DE' }}>Agenda, cobra y presenta por vos.</span>
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#475569', lineHeight: 1.4 }}>
            Un asistente con IA atiende tu WhatsApp las 24 horas. Sacás una foto de la orden y la
            presentación de cada obra social se arma sola.
          </div>
        </div>

        {/* Pie */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 26 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#FFFFFF',
              border: '2px solid #CBE3F7',
              borderRadius: 999,
              padding: '12px 28px',
              color: '#0A63AA',
              fontWeight: 600,
            }}
          >
            Para médicos que facturan a obras sociales
          </div>
          <div style={{ display: 'flex', color: '#64748B' }}>Hecho en Catamarca 🇦🇷</div>
        </div>
      </div>
    ),
    size,
  )
}
