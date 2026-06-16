'use client'

import { useState } from 'react'
import { updatePassword } from '@/actions/auth'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

export function UpdatePasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const password = (formData.get('password') as string) ?? ''
    const confirm = (formData.get('confirmPassword') as string) ?? ''

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      setLoading(false)
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      setLoading(false)
      return
    }

    const result = await updatePassword(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Input
        id="password"
        name="password"
        type="password"
        label="Nueva contraseña"
        placeholder="Mínimo 6 caracteres"
        hint="Elige una contraseña segura"
        required
        minLength={6}
      />

      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label="Repetir contraseña"
        placeholder="Volvé a escribir la contraseña"
        required
        minLength={6}
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        isLoading={loading}
        className="w-full"
      >
        Actualizar Contraseña
      </Button>
    </form>
  )
}
