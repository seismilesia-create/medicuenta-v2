# Capturas de la landing

Cada tarjeta de la landing acepta **dos archivos** (tema claro y oscuro) y alterna entre ellos
con un crossfade suave. Si falta uno, se muestra solo el que exista; si faltan los dos, la tarjeta
cae al placeholder rotulado y la página no se rompe.

Guardá los PNG acá con **exactamente estos nombres**:

| Archivo | Qué pantalla | Dónde aparece |
|---|---|---|
| `asistente-movil-claro.png` | Asistente IA en el celular (`/asistente`) | Demo · marco de teléfono |
| `asistente-movil-oscuro.png` | Idem, en tema oscuro | ídem (crossfade) |
| `agenda-claro.png` | Agenda del día con sala de espera (`/agenda`) | Demo |
| `agenda-oscuro.png` | Idem, tema oscuro | ídem (crossfade) |
| `reportes-claro.png` | Reportes: KPIs y tendencia (`/reportes`) | Demo |
| `reportes-oscuro.png` | Idem, tema oscuro | ídem (crossfade) |
| `ordenes-claro.png` | Listado de órdenes (`/ordenes`) | Cómo funciona · paso 1 |
| `ordenes-oscuro.png` | Idem, tema oscuro | ídem (crossfade) |
| `conversaciones-claro.png` | Bandeja de WhatsApp (`/conversaciones`) | Cómo funciona · paso 2 |
| `conversaciones-oscuro.png` | Idem, tema oscuro | ídem (crossfade) |
| `cierre-claro.png` | Rendición del día (`/cierre`) | Cómo funciona · paso 3 |
| `cierre-oscuro.png` | Idem, tema oscuro | ídem (crossfade) |

## Cómo sacarlas para que queden bien

- **Escritorio**: ventana ancha, y capturá **solo el contenido del navegador** (sin la barra de
  marcadores ni las pestañas): la landing ya dibuja su propio marco de navegador alrededor.
  El recorte se muestra en proporción 16:10 anclado arriba, así que lo importante va arriba.
- **Celular**: captura vertical del teléfono. Se muestra en proporción 9:19.5 dentro de un marco
  con muesca.
- **El par claro/oscuro tiene que ser de la MISMA pantalla y el mismo momento** (mismos datos,
  mismo scroll): si no, el crossfade se nota como un salto en vez de un cambio de tema.
- Antes de capturar, correr el refresco del seed (`scripts/seed-demo-capturas.md`) para que la
  bandeja tenga los colores vivos y la sala de espera con pacientes.

## Peso

Son PNG grandes. Si alguna supera ~500 KB conviene pasarla por un compresor
(`pngquant`, TinyPNG o similar) antes de commitear: la landing es lo primero que carga un médico
desde el celular.
