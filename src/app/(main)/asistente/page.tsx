import { redirect } from 'next/navigation'

// El home (/) es ahora el asistente fullscreen. Mantenemos /asistente como
// alias para no romper enlaces existentes.
export default function AsistentePage() {
  redirect('/')
}
