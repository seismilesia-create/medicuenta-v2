# Landing + Brand Kit — Prompts para la Design Feature (Fable 5)

> Fecha: 2026-07-17
> Objetivo: que un médico entre a una landing pública, vea la app funcionando (demo visual)
> y toque **"Solicitar acceso"** (WhatsApp) → Héctor lo cura y le manda el enlace de invitación.
>
> Modelo objetivo: **Fable 5** en la parte de *design* de Claude Desktop (artifacts).
> Orden de uso: **Prompt #1 (Brand Kit) → elegís logo → Prompt #2 (Landing) usa ese logo.**

## Decisiones tomadas (brainstorming)

- **Embudo:** acceso curado. CTA único = "Solicitar acceso" por WhatsApp (coincide con la
  realidad de invitación y evita el hueco del `/signup` público; Suscripciones/Fase 5 pendiente).
- **"Probar la app":** demo visual embebida (capturas reales del agente WhatsApp, agenda, reportes)
  con placeholders prolijos para pegar las capturas/video.
- **Recibir pedidos:** deep link de WhatsApp con mensaje pre-armado (cero backend).
- **Marca real del código:** azul médico `oklch(0.55 0.17 235)` ≈ `#0E7DD1`, Inter, radius 1rem,
  gradiente `gradient-medical`, ícono corazón/pulso. Hoy NO existe landing (`/` redirige a `/login`).

## Placeholders a completar antes/después

- `54XXXXXXXXXX` → tu número de WhatsApp. Formato Argentina para wa.me: **`549` + código de área + número**, sin el 15. (Catamarca = área 383 → `549383…`.)
- `[PEGÁ ACÁ EL SVG DEL LOGO]` en el Prompt #2 → el SVG que elijas del Brand Kit.
- Capturas reales de la app en la sección Demo.
- Prueba social (si la ponés) → placeholders rotulados, **no inventar** nombres/números.

---

## PROMPT #1 — BRAND KIT

```
Rol: Sos un diseñador de marca senior especializado en identidades para productos de salud
digital (health-tech) modernos y confiables.

Contexto del producto:
MediCuenta es una app que ayuda a médicos de la provincia de Catamarca (Argentina) a facturar
a las obras sociales sin planillas ni papeles. Incluye un asistente de IA que atiende pacientes
por WhatsApp (agenda turnos, entrega recetas, cobra), OCR para cargar órdenes/recetas con una
foto, agenda y reportes. Los usuarios son médicos, NO técnicos: la marca tiene que transmitir
claridad, confianza, cercanía y tecnología amable — no fría ni corporativa.

El nombre une dos mundos: "Medi" (salud) + "Cuenta" (facturación/cuentas). La identidad debe
jugar con esa fusión salud + cuentas.

Objetivo (entregable):
Diseñá un MINI BRAND KIT completo y mostralo renderizado en un solo artifact. Todos los logos
deben ser SVG vectorial inline (nada de imágenes raster/PNG), optimizados y listos para copiar
el código.

El brand kit debe incluir:

1) TRES direcciones de logo, cada una renderizada en sus 3 formas
   (símbolo solo / horizontal [símbolo + "MediCuenta"] / apilado):
   - Dirección A (marcala como RECOMENDADA): una línea de pulso/latido cardíaco cuyo último
     trazo se transforma en un tilde (check ✔) o en una barra que sube → idea
     "cuenta al día / facturación resuelta". Debe fundir salud + cuentas.
   - Dirección B: evolución del corazón + pulso con una "M" sutil integrada
     (continuidad cálida, reconocible).
   - Dirección C: un símbolo de recibo/ticket atravesado por una línea de pulso
     (lado más fintech).

2) Favicon / app icon cuadrado (versión que funcione a 16px) de la dirección recomendada.

3) Paleta de color con swatches y su valor:
   - Primario (azul médico): oklch(0.55 0.17 235) ≈ #0E7DD1
   - Neutros (fondo casi blanco con un toque azulado, texto azul-tinta oscuro), un acento
     y colores semánticos (éxito, alerta, error).
   - Mostrá también la versión para modo oscuro (primario ≈ oklch(0.72 0.15 235)).

4) Tipografía: Inter. Mostrá la escala (display / título / cuerpo / caption) con ejemplos.

5) Reglas de uso: espacio de respeto, tamaño mínimo, y ejemplos de "hacer / no hacer".

6) Cada logo en versión clara y oscura.

Requisitos y restricciones:
- SVG vectorial inline únicamente. Cada logo debe poder copiarse como código SVG limpio.
- Moderno y amable, con esquinas redondeadas (lenguaje de radio 1rem). Evitá clichés médicos
  (caduceo, serpiente, cruz roja genérica).
- Legible y nítido desde 16px (favicon) hasta tamaño grande.
- Buen contraste (accesible, WCAG AA).
- Sin dependencias externas de imágenes. Si usás texto dentro del SVG, usá font-family "Inter".
- Español (Argentina).

Presentación:
Mostrá el kit como una guía de marca visual prolija, sección por sección, con fondos que dejen
ver las versiones clara y oscura. Al final, resumí en 2-3 líneas por qué recomendás la dirección A.
```

---

## PROMPT #2 — LANDING

```
Rol: Sos un diseñador de producto y copywriter senior de landing pages de alta conversión para
SaaS de salud (health-tech), en español rioplatense (voseo).

Contexto del producto:
MediCuenta ayuda a médicos de Catamarca (Argentina) a facturar a las obras sociales sin planillas
ni papeles. Incluye: un asistente de IA que atiende pacientes por WhatsApp (agenda turnos, entrega
recetas, cobra por MercadoPago), OCR para cargar órdenes y recetas con una foto, agenda inteligente
(turnos, días particulares, obras sociales suspendidas) y reportes/liquidaciones para controlar
débitos. Entiende las obras sociales de la provincia (OSEP, PAMI, etc.). Creado por alguien que vive
el problema desde adentro del sistema de salud de Catamarca.

Público: médicos, NO técnicos. Muchos entran desde el celular. Tono cercano, claro, sin jerga
técnica, beneficio-primero. Enfocá en el tiempo que ahorran y la plata que dejan de perder
(débitos, presentaciones rechazadas).

Objetivo (entregable):
Una landing page de UNA sola página, responsive y mobile-first, en React + Tailwind, autocontenida
en un artifact. El único objetivo de conversión es que el médico toque "Solicitar acceso", que abre
un chat de WhatsApp.

IDENTIDAD DE MARCA (respetala exactamente):
- Logo: [PEGÁ ACÁ EL SVG DEL LOGO del Brand Kit, o describilo].
- Tipografía: Inter.
- Radio de esquinas: 1rem (rounded-2xl), estética suave y amable.
- Definí estos design tokens en :root y .dark (así se ve idéntico a la app). Valores en oklch
  (formato "L C H"); agrego el hex aproximado para que el preview no falle:
    Claro:
      --primary: 0.55 0.17 235;      /* ≈ #0E7DD1 azul médico */
      --background: 0.98 0.005 220;  /* ≈ #F7FAFC casi blanco */
      --foreground: 0.15 0.02 250;   /* ≈ #0D1526 azul tinta */
      --secondary: 0.96 0.01 220;    /* ≈ #EEF2F6 */
      --accent: 0.92 0.04 235;       /* ≈ #DCE9F5 */
      --radius: 1rem;
    Oscuro:
      --primary: 0.72 0.15 235;      /* ≈ #3AA0E8 */
      --background: 0.12 0.02 260;   /* ≈ #0B0F1A */
      --foreground: 0.95 0.01 250;   /* ≈ #F1F3F7 */
      --secondary: 0.2 0.03 260;
      --accent: 0.25 0.05 235;
  (En el proyecto Next.js estas variables se llaman --primary-raw, --background-raw, etc., y
   Tailwind las envuelve en oklch(var(--x-raw) / <alpha>). Mantené clases Tailwind mapeables:
   bg-background, text-foreground, bg-primary, text-primary-foreground, border, rounded-2xl.)
- Gradiente de marca para acentos: linear-gradient(135deg, primario, un azul-cian un poco más
  claro, hue ~205-235).
- Mucho espacio en blanco, limpio y aireado. Micro-interacciones sutiles (hover, fade-in al
  scroll). Light-first, con soporte de modo oscuro.

ESTRUCTURA (en este orden):
1. Nav: logo + botón "Solicitar acceso" (WhatsApp). Badge chico "Hecho en Catamarca".
2. Hero: titular de beneficio + subtítulo + CTA principal "Solicitar acceso" (WhatsApp) +
   CTA secundario "Ver cómo funciona" (scroll a la demo). A la derecha (o abajo en mobile), un
   mockup de teléfono mostrando el chat del asistente de WhatsApp.
   Titulares candidatos (elegí/mejorá uno):
     "Dejá de facturar a mano. MediCuenta cobra, agenda y presenta por vos."
     "El asistente de IA que factura tus obras sociales y atiende tu WhatsApp."
3. El problema (empatía): "Hoy facturás a mano — planillas por obra social, códigos, presentación
   física, y débitos que descubrís tarde." Mostrá el dolor real, breve.
4. Cómo funciona: 3 pasos con íconos —
   (1) Sacás una foto de la orden y se carga sola (OCR).
   (2) El asistente de WhatsApp atiende, agenda y cobra 24/7.
   (3) MediCuenta arma la presentación por obra social y controlás los débitos.
5. Demo visual ("Probá cómo funciona"): mockups de teléfono y de pantalla con LUGARES CLARAMENTE
   MARCADOS para pegar capturas reales. Rotulá cada hueco: "[Captura: chat del agente]",
   "[Captura: agenda]", "[Captura: reportes]". NO inventes capturas: dejá placeholders prolijos.
6. Beneficios (bento grid): Facturación a obras sociales automatizada · Asistente de IA 24/7 por
   WhatsApp · OCR de órdenes y recetas · Agenda inteligente · Reportes y control de débitos ·
   Recetas por WhatsApp.
7. Por qué confiar: hecho en Catamarca, entiende las obras sociales locales (OSEP, PAMI…), creado
   desde adentro del sistema de salud, y "tus datos son tuyos" (cada médico ve solo lo suyo —
   multiusuario seguro).
8. FAQ (acordeón): ¿Cuánto cuesta? (durante el lanzamiento el acceso es por invitación / a
   convenir) · ¿Mis datos están seguros? · ¿Funciona con mi obra social? · ¿Necesito saber de
   tecnología? (no) · ¿En qué dispositivos anda? (celu y compu).
9. CTA final: "Sumate a los primeros médicos de Catamarca." + botón "Solicitar acceso".
10. Footer: logo, contacto por WhatsApp, links "Términos" y "Privacidad".

COMPORTAMIENTO DEL CTA:
Todos los botones "Solicitar acceso" abren WhatsApp con este enlace (dejá el número como
placeholder BIEN visible para reemplazar), target _blank:
  https://wa.me/54XXXXXXXXXX?text=Hola%2C%20soy%20m%C3%A9dico%2Fa%20y%20quiero%20probar%20MediCuenta
Marcá claramente dónde va el número (formato: 549 + código de área + número, sin el 15).

GUARDRAILS (importante):
- No inventes testimonios, nombres de médicos, logos de obras sociales ni métricas ("+500 médicos").
  Si incluís prueba social, que sean placeholders rotulados para completar después.
- No prometas diagnóstico ni consejo clínico, ni "asesoramiento financiero/inversiones".
  MediCuenta es gestión y facturación, nada más.
- Nada de datos sensibles de pacientes en la copy.

CALIDAD:
- Responsive real (verificá mobile). Accesible (contraste, foco visible, alt, aria). Semántica
  HTML correcta.
- Código limpio, un solo componente React autocontenido, portable a Next.js App Router
  (client component). Usá clases Tailwind mapeables a tokens.
- Todo el texto en español (Argentina, voseo).

Entregá la landing completa y funcionando en el artifact.
```

---

## ¿Conviene conectar el repo de GitHub? — Sí, con foco

**Por qué sí:** Fable 5 lee tus tokens y componentes reales → la landing queda idéntica en identidad
a la app, y puede escupir código que caiga como ruta pública en tu Next.js.

**Decile qué mirar (y qué ignorar):**
- MIRAR: `tailwind.config.ts`, `src/app/globals.css` (tokens + `gradient-medical`), los componentes
  de `src/features/auth/components` (estilos de botón/input), y el ícono corazón/pulso de
  `src/app/(auth)/signup/page.tsx`.
- IGNORAR: el resto (lógica de negocio, Supabase, `features/*`). La landing no lo necesita y evita
  que se "contamine" con detalles internos.

**Privacidad:** es tu repo privado + tu cuenta de Claude → está bien. La landing NO necesita `.env`
ni datos internos; que el modelo no referencie nada sensible.

**Dos caminos de integración:**
- (a) **Standalone**: la landing vive como artifact/HTML aparte. El prompt ya trae tus tokens, así
  que conectar el repo es un plus, no un requisito.
- (b) **Drop-in en Next.js**: la landing pasa a ser la ruta pública `/` (moviendo el redirect actual
  a otra parte). Acá conectar el repo rinde más: Fable 5 genera un client component que respeta tu
  estructura feature-first.

**Si conectar es engorroso:** alcanza con pegarle a Fable 5 el contenido de `tailwind.config.ts` +
`globals.css`. Con eso ya matchea la marca.
