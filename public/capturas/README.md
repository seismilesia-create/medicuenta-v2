# Capturas de la landing

Las tarjetas de la landing aceptan **varias imágenes** y alternan entre ellas con un crossfade
suave (solo mientras el bloque está a la vista, y nunca si el visitante pidió reducir el
movimiento). Sirve para dos cosas: mostrar la misma pantalla en **tema claro y oscuro**, o rotar
**varias vistas** de una misma sección. Si un archivo falta, se usa el que haya; si no hay
ninguno, la tarjeta cae al placeholder rotulado y la página no se rompe.

## Lo que hay hoy

| Archivo | Pantalla | Dónde aparece |
|---|---|---|
| `asistente-movil-claro.webp` | Asistente IA en el celular | Demo · teléfono (rota con las 2 de abajo) |
| `agenda-movil.webp` | Agenda del día en el celular | ídem |
| `cierre-movil.webp` | Rendición del día en el celular | ídem |
| `agenda-claro.webp` / `agenda-oscuro.webp` | Agenda con sala de espera | Demo · **crossfade claro/oscuro** |
| `reportes-claro.webp` | Reportes: los 6 indicadores | Demo (rota con las 2 de abajo) |
| `reportes-graficos.webp` | Descuentos, plus e institución pendiente | ídem |
| `reportes-tabla.webp` | Comparativa de 12 meses | ídem |
| `ordenes-claro.webp` | Listado de órdenes | Cómo funciona · paso 1 |
| `conversaciones-claro.webp` / `conversaciones-oscuro.webp` | Bandeja de WhatsApp | Cómo funciona · paso 2 · **crossfade** |
| `cierre-claro.webp` | Rendición del día | Cómo funciona · paso 3 |

## Falta (para completar los crossfades)

`ordenes-oscuro`, `cierre-oscuro`, `reportes-oscuro` y `asistente-movil-oscuro` (esta última con la
cuenta del Dr. Juan Pérez: la que había decía "Dr. Admin MediCuenta").

## Cómo procesarlas

Las capturas de escritorio vienen con la barra del navegador, que hay que quitar porque la landing
dibuja la suya. El recorte se detecta solo buscando dónde termina el color de esa barra:

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

- Que el par claro/oscuro sea de la **misma pantalla y el mismo scroll**, o el cambio de tema se
  ve como un salto.
- Sin tooltips, menús abiertos ni el cursor encima de un gráfico.
- Ojo con el badge flotante de SaaS Factory sobre el sidebar: aparecía en dos capturas y hubo que
  descartarlas.
- Antes de capturar, correr el refresco del seed (`scripts/seed-demo-capturas.md`).
