/**
 * Logo de marca MediCuenta.
 *
 * `LogoMark` es solo el isotipo (ticket + pulso, degradé azul) — sirve para el
 * favicon, el avatar del panel, o dentro de contenedores. `Logo` es el logotipo
 * completo (isotipo + "MediCuenta"), con el "Cuenta" en el primario.
 *
 * El wordmark usa las variables de tema (`--color-foreground` / `--color-primary`)
 * para adaptarse a claro/oscuro; en fondos de color (p. ej. el panel `gradient-medical`
 * de auth) usar `onColor` para forzar el texto en blanco.
 */

export function LogoMark({
  className = 'h-8 w-8',
  mono = false,
}: {
  className?: string
  /** Versión monocroma en línea (hereda `currentColor`) para fondos de color. */
  mono?: boolean
}) {
  if (mono) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={className}
        role="img"
        aria-label="MediCuenta"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeWidth="3.5"
          d="M14 6.5H34C35.7 6.5 37 7.8 37 9.5V41L32.7 38L28.4 41L24 38L19.6 41L15.3 38L11 41V9.5C11 7.8 12.3 6.5 14 6.5Z"
        />
        <path strokeWidth="3" d="M15.5 23.5H19L22 16.5L26 29.5L29 23.5H32.5" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="MediCuenta"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mediCuentaMark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1189DE" />
          <stop offset="1" stopColor="#0A63AA" />
        </linearGradient>
      </defs>
      {/* Ticket/recibo con borde inferior dentado */}
      <path
        d="M14 4H34C36.2 4 38 5.8 38 8V44L33.3 40.7L28.7 44L24 40.7L19.3 44L14.7 40.7L10 44V8C10 5.8 11.8 4 14 4Z"
        fill="url(#mediCuentaMark)"
      />
      {/* Pulso/latido en blanco */}
      <path
        d="M15 24.5H18.5L21.5 17L25.5 31L28.5 24.5H33"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Logo({
  className = '',
  markClassName = 'h-10 w-10',
  wordmarkClassName = 'text-xl',
  showWordmark = true,
  onColor = false,
}: {
  className?: string
  markClassName?: string
  wordmarkClassName?: string
  showWordmark?: boolean
  onColor?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      {showWordmark && (
        <span className={`font-bold tracking-tight leading-none ${wordmarkClassName}`}>
          <span style={{ color: onColor ? '#FFFFFF' : 'var(--color-foreground)' }}>Medi</span>
          <span style={{ color: onColor ? '#FFFFFF' : 'var(--color-primary)' }}>Cuenta</span>
        </span>
      )}
    </span>
  )
}
