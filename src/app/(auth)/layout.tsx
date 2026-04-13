export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Panel izquierdo - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-medical relative overflow-hidden">
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                <svg className="w-7 h-7 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12h2m14 0h2M12 3v2m0 14v2" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-white">MediCuenta</span>
            </div>
            <h1 className="text-display-md text-white mb-4">
              Tu facturacion medica, simplificada
            </h1>
            <p className="text-lg text-white/70 leading-relaxed">
              La plataforma de facturacion y control financiero disenada para medicos del Circulo Medico de Catamarca.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Control total de ordenes y liquidaciones</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Seguimiento de debitos y rechazos</span>
            </div>
            <div className="flex items-center gap-3 text-white/80">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Reportes y estadisticas en tiempo real</span>
            </div>
          </div>
        </div>

        {/* Decoracion */}
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute top-20 right-20 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl" />
      </div>

      {/* Panel derecho - Formulario */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}
