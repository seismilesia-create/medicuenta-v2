'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  link: string | null
  nombre?: string | null
  apellido?: string | null
  especialidad?: string | null
}

export function MiAsistenteWhatsapp({ link, nombre, apellido, especialidad }: Props) {
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

  const nombreDr = ['Dr.', nombre, apellido].filter(Boolean).join(' ')

  async function copiarLink() {
    await navigator.clipboard.writeText(link!)
    setMsg('Link copiado ✓'); setTimeout(() => setMsg(null), 2000)
  }

  async function copiarQR() {
    if (!qr) return
    try {
      const blob = await (await fetch(qr)).blob()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setMsg('QR copiado ✓')
    } catch {
      setMsg('Tu navegador no permite copiar la imagen — usá "Imprimir QR".')
    }
    setTimeout(() => setMsg(null), 3000)
  }

  async function imprimirQR() {
    if (!link) return
    const qrHi = await QRCode.toDataURL(link, { width: 800, margin: 1 })
    const win = window.open('', '_blank')
    if (!win) { setMsg('Permití las ventanas emergentes para imprimir.'); return }
    const esp = especialidad ? ' · ' + especialidad : ''
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR WhatsApp - ${nombreDr}</title><style>
@page{size:A4 portrait;margin:0}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;background:#fff;display:flex;flex-direction:column;align-items:center;padding:22mm 18mm;text-align:center}
.b1{position:absolute;top:-60mm;right:-60mm;width:150mm;height:150mm;border-radius:50%;background:rgba(15,118,110,.08)}
.b2{position:absolute;bottom:-50mm;left:-55mm;width:130mm;height:130mm;border-radius:50%;background:rgba(37,211,102,.10)}
.brand{font-size:16pt;font-weight:800;color:#0F766E;position:relative;margin-bottom:8mm}
.brand small{display:block;font-size:8pt;font-weight:600;color:#64748b;letter-spacing:2px;text-transform:uppercase;margin-top:1mm}
h1{font-size:28pt;font-weight:800;color:#0f172a;line-height:1.12;position:relative;margin-bottom:4mm}
.dr{font-size:15pt;color:#0F766E;font-weight:700;position:relative;margin-bottom:9mm}
.qf{background:#fff;border:3px solid #0F766E;border-radius:8mm;padding:6mm;box-shadow:0 10px 30px rgba(0,0,0,.10);position:relative;margin-bottom:7mm}
.qf img{display:block;width:88mm;height:88mm}
.scan{font-size:13pt;color:#334155;font-weight:600;position:relative;margin-bottom:4mm}
.wa{display:inline-flex;align-items:center;gap:2mm;background:#25D366;color:#fff;padding:4mm 9mm;border-radius:40px;font-size:12pt;font-weight:700;position:relative}
.link{position:absolute;bottom:16mm;left:0;right:0;font-size:8.5pt;color:#94a3b8;word-break:break-all;padding:0 18mm}
.foot{position:absolute;bottom:10mm;left:0;right:0;font-size:7.5pt;color:#cbd5e1}
</style></head><body><div class="page">
<div class="b1"></div><div class="b2"></div>
<div class="brand">MediCuenta<small>Asistente m&eacute;dico</small></div>
<h1>Ped&iacute; turnos y recetas<br>por WhatsApp</h1>
<div class="dr">${nombreDr}${esp}</div>
<div class="qf"><img src="${qrHi}" alt="QR"></div>
<div class="scan">&#128247; Escane&aacute; el c&oacute;digo con la c&aacute;mara de tu celular</div>
<div class="wa">&#10003; Te respondo al instante por WhatsApp</div>
<div class="link">${link}</div>
<div class="foot">Generado con MediCuenta</div>
</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`)
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
