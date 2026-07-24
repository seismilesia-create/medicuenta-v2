/**
 * Bloques tipográficos de las páginas legales. Se separan del contenido para que los
 * documentos se lean como prosa y no como una maraña de clases de Tailwind.
 */

export function TituloLegal({ titulo, actualizado }: { titulo: string; actualizado: string }) {
  return (
    <div className="mb-10">
      <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{titulo}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Última actualización: {actualizado}</p>
    </div>
  )
}

export function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export function Lista({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** Aviso destacado: lo que el lector no se puede perder. */
export function Destacado({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
      {children}
    </p>
  )
}
