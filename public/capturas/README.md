# Capturas de la landing

Las tarjetas de la landing aceptan **varias imágenes** y alternan entre ellas con un crossfade
suave (solo mientras el bloque está a la vista, y nunca si el visitante pidió reducir el
movimiento). Si un archivo falta, se usa el que haya; si no hay ninguno, la tarjeta cae al
placeholder rotulado y la página no se rompe.

**Regla de tema (decisión de Héctor):** la ÚNICA imagen que pasa de fondo claro a oscuro es la del
celular. Todo el resto de la landing queda fijo en **tema claro** — nada de flasheo blanco↔negro en
las pantallas de escritorio. El movimiento que sí se permite ahí es rotar entre vistas que son
**todas claras** (p. ej. reportes), porque no cambia el fondo.

## Lo que se usa hoy

| Archivo | Pantalla | Dónde aparece |
|---|---|---|
| `asistente-movil-claro.webp` / `asistente-movil-oscuro.webp` | Inicio en el celular (el asistente) | Demo · teléfono · **único crossfade claro/oscuro** |
| `agenda-claro.webp` | Agenda con sala de espera | Demo · fija en claro |
| `reportes-claro.webp` · `reportes-graficos.webp` · `reportes-tabla.webp` | Reportes (KPIs → gráficos → tabla 12 meses) | Demo · rota entre vistas claras |
| `ordenes-claro.webp` | Listado de órdenes | Cómo funciona · paso 1 · fija |
| `conversaciones-claro.webp` | Bandeja de WhatsApp | Cómo funciona · paso 2 · fija |
| `cierre-claro.webp` | Rendición del día | Cómo funciona · paso 3 · fija |

## Guardadas pero sin usar

`agenda-oscuro.webp`, `conversaciones-oscuro.webp` (versiones oscuras que ya no van, porque el
escritorio queda en claro fijo) y `agenda-movil.webp`, `cierre-movil.webp` (por si se quiere rotar
pantallas en el teléfono en vez del crossfade de tema). No estorban; se pueden borrar si molestan.

## Cómo procesarlas

Las capturas de escritorio vienen con la barra del navegador, que hay que quitar porque la landing
dibuja la suya. El corte se detecta solo buscando dónde termina el color de esa barra:

```bash
# corte = última fila de la barra del navegador + 1
corte=$(magick ORIGINAL.png -crop "1800x260+0+0" +repage -resize 1x260! txt: | tail -n +2 |
  awk -F'[(,)]' '{r=$3;g=$4;b=$5;y=NR-1; if (r>40 && r<115 && g<r && b<g && r-b>20) last=y} END{print last+1}')
magick ORIGINAL.png -crop "1800x$((ALTO-corte))+0+$corte" +repage -resize 1440x -quality 85 destino.webp

# celular: ya viene en 736x1600, que es la proporción del marco
magick ORIGINAL.jpeg -resize 640x -quality 86 destino.webp
```

Quedan entre 30 y 70 KB cada una. Next las vuelve a optimizar al servirlas.

## Al capturar

- El único par claro/oscuro que hace falta es el del **celular** (misma pantalla, mismo scroll, con
  la cuenta del Dr. Juan Pérez). El resto va en claro.
- Sin tooltips, menús abiertos ni el cursor encima de un gráfico.
- Ojo con el badge flotante de SaaS Factory sobre el sidebar: aparecía en dos capturas y hubo que
  descartarlas.
- Antes de capturar, correr el refresco del seed (`scripts/seed-demo-capturas.md`).
