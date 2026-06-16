'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function MiAsistenteWhatsapp({ link }: { link: string | null }) {
  const [qr, setQr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (link) QRCode.toDataURL(link, { width: 320, margin: 1 }).then(setQr).catch(() => {})
  }, [link])

  if (!link) {
    return (
      <div className="rounded-2xl border border-border p-6">
        <h3 className="font-semibold text-foreground">Tu asistente de WhatsApp</h3>
        <p className="text-sm text-muted-foreground mt-2">Todavía no tenés tu asistente configurado. Hablá con el administrador.</p>
      </div>
    )
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(link!)
    setMsg('Link copiado ✓')
    setTimeout(() => setMsg(null), 2000)
  }

  async function copiarQR() {
    if (!qr) return
    try {
      const blob = await (await fetch(qr)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setMsg('QR copiado ✓')
    } catch {
      setMsg('Tu navegador no permite copiar la imagen — usá "Imprimir QR" o sacale captura.')
    }
    setTimeout(() => setMsg(null), 3000)
  }

  function imprimirQR() {
    if (!qr) return
    const win = window.open('', '_blank', 'width=420,height=560')
    if (!win) return
    win.document.write(
      '<html><head><title>QR - Asistente MediCuenta</title></head>' +
      '<body style="font-family:sans-serif;text-align:center;padding:24px;">' +
      '<h2 style="margin:0 0 8px;">Asistente de WhatsApp</h2>' +
      '<p style="margin:0 0 16px;font-size:13px;color:#555;">Escaneá el código para escribirme</p>' +
      '<img src="' + qr + '" style="width:300px;height:300px;" />' +
      '<p style="margin:16px 0 0;font-size:12px;color:#888;word-break:break-all;">' + link + '</p>' +
      '<script>window.onload=function(){window.print();}<\/script>' +
      '</body></html>'
    )
    win.document.close()
  }

  return (
    <div className="rounded-2xl border border-border p-6 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">Tu asistente de WhatsApp</h3>
        <p className="text-sm text-muted-foreground">Compartí este link o QR con tus pacientes para que te escriban y saquen turno.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
        {qr && <img src={qr} alt="QR de tu asistente" className="w-40 h-40 rounded-xl border border-border bg-white p-1 shrink-0" />}
        <div className="flex-1 w-full space-y-3">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm break-all">{link}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={copiarLink} className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors">Copiar link</button>
            <button onClick={copiarQR} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">Copiar QR</button>
            <button onClick={imprimirQR} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">Imprimir QR</button>
          </div>
          {msg && <p className="text-sm text-primary">{msg}</p>}
        </div>
      </div>
    </div>
  )
}
