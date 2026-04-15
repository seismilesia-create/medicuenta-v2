# PRP-001: Reportes con Análisis de Tendencias

> **Estado**: PENDIENTE DE APROBACIÓN FINAL
> **Fecha**: 2026-04-15
> **Proyecto**: MediCuenta V2
> **Revisión 1**: 2026-04-15 — Integración de lógica de negocio real
> **Revisión 2**: 2026-04-15 — Modelo definitivo: niveles 1°/2° + 3 agentes facturadores (sobrescribe el modelo de "dos canales" de R1)

---

## REVISIÓN 2 — Modelo definitivo (sobrescribe R1.2, R1.3, R1.3b, R1.4, R1.5)

Tras consulta con médicos, el modelo real NO es "dos canales" sino **niveles de prestación + agentes facturadores**. Los cambios de R1 sobre plus privado (R1.1), CSV eliminado (R1.6) y badge de plus (R1.7) se mantienen.

### R2.1 — Niveles de prestación

- **1° Nivel**: órdenes de consulta, prácticas menores, cirugías menores ambulatorias. Puede haber prestaciones con `honorarios=0` y `plus>0` (médico no carga orden porque paga muy poco).
- **2° Nivel**: internación, cirugías mayores, estudios (= honorarios médicos por interpretación/informes — NO laboratorio ni imágenes). Se realizan en institución.

### R2.2 — Tres agentes facturadores

Cada OS tiene convenio con uno. El médico sabe de antemano cuál corresponde.

1. **Círculo Médico (CM)** — factura 1° Nivel. En 2° Nivel: institución factura pero CM aplica descuento admin → **doble descuento**.
2. **Medical Group (MG)** — factura 1° Nivel. 2° Nivel va por sanatorios Jalil (Pasteur, Junín, Privado) sin pasar por CM. 1 descuento.
3. **Nosocomio de la Comunidad** — factura 1° y 2° Nivel directamente. 1 descuento.

### R2.3 — Micro-migraciones de schema (parte de Fase 1)

```sql
-- ordenes: todas 1° Nivel por definición
ALTER TABLE ordenes ADD COLUMN agente_facturador TEXT NOT NULL
  DEFAULT 'circulo_medico'
  CHECK (agente_facturador IN ('circulo_medico', 'medical_group', 'comunidad'));

-- cirugias: pueden ser 1° (ambulatoria) o 2° (en institución)
ALTER TABLE cirugias ADD COLUMN nivel SMALLINT NOT NULL DEFAULT 2
  CHECK (nivel IN (1, 2));
ALTER TABLE cirugias ADD COLUMN agente_facturador TEXT NOT NULL
  DEFAULT 'circulo_medico'
  CHECK (agente_facturador IN ('circulo_medico', 'medical_group', 'comunidad'));
ALTER TABLE cirugias RENAME COLUMN sanatorio TO institucion;
-- institucion TEXT nullable: requerida si nivel=2, opcional si nivel=1

-- debitos: tracking de quién aplicó el descuento
ALTER TABLE debitos ADD COLUMN aplicado_por TEXT
  CHECK (aplicado_por IN ('circulo_medico', 'institucion', 'medical_group', 'comunidad', 'obra_social'));
```

Una cirugía 2° Nivel OS-CM puede generar **2 filas en `debitos`**: una con `aplicado_por='circulo_medico'` (descuento admin) y otra con `aplicado_por='institucion'` (descuento del sanatorio).

### R2.4 — Cambios en UI de carga (afecta `/ordenes/nueva`, `/cirugias/nueva` y sus editar)

- `/ordenes/nueva`: select `agente_facturador` (3 opciones) — el médico elige según la OS del paciente.
- `/cirugias/nueva`: select `nivel` (1° / 2°) + select `agente_facturador` + campo `institucion` (text, requerido si nivel=2).
- Permitir cargar cirugía con `honorarios=0` y `plus>0` (no validar que la suma sea > 0).

### R2.5 — Filtros del reporte (reemplaza R1.4)

Reemplazar "filtro Canal" por:
- **Nivel**: 1° / 2° / ambos (default: ambos)
- **Agente facturador**: CM / MG / Comunidad / todos (default: todos)
- **Institución**: dinámico desde `DISTINCT cirugias.institucion` del médico + "Todas", visible cuando nivel=2 o agente ≠ solo CM 1° Nivel

Se mantienen: período, obra social, tipo (consultas/cirugías/todas).

### R2.6 — KPIs y gráficos ajustados

**KPIs del mes (6 cards):**
1. Facturado del mes (sumatorio ordenes + cirugias)
2. Cobrado del mes (liquidaciones aprobadas)
3. Débitos del mes (suma de débitos)
4. Plus cobrado del mes 🔒 Privado
5. **Cirugías 2° Nivel sin liquidar >30 días** (alerta rojo/naranja si > 0)
6. **Descuento neto por agente facturador** (mini-card: CM $X / MG $Y / Comunidad $Z)

**Gráficos:**
- **G1 Tendencia mensual** (6 meses): facturado, cobrado, débitos. Se puede agrupar por agente facturador cuando el filtro está en "todos".
- **G2 Facturación por OS** (barras): suma facturada por OS en el período, descendente.
- **G3 Débitos por motivo** (torta): usa `MOTIVO_LABELS` y colores de `DebitosPieChart`.
- **G4 Descuentos por entidad** (barras apiladas por mes): separa descuento de CM vs institución vs MG vs Comunidad vs OS. Nuevo gráfico clave — muestra dónde se pierde plata.
- **G5 Plus mensual** (barras, 6 meses) 🔒 Privado.
- **G6 Institución con más pendiente** (barras horizontales): monto sin liquidar por cada institución (nivel=2) — para identificar sanatorios problemáticos.

**Tabla comparativa mensual** (12 meses): Mes / Facturado / Cobrado / Débitos / Plus / Neto — segmentable por agente facturador con tabs o columnas extra.

### R2.7 — Catálogo `obras_sociales` — FUERA DE ALCANCE Fase 1

Crear tabla con `nombre + agente_facturador` para auto-sugerir el agente al cargar → queda para una fase posterior cuando la lista de OS se estabilice. Fase 1: el médico elige manual.

---

## REVISIÓN 1 — Deltas validados con el owner

Los siguientes puntos **sobrescriben** secciones posteriores del PRP original:

### R1.1 — Plus privado
- **Siempre se cuenta** al estar registrado, sin condicionar al `estado` de la orden. Es dinero cobrado en mano al momento de la consulta, no sujeto a liquidación de OS.
- **Confidencial**: solo visible para el médico propietario. En UI lleva etiqueta `🔒 Privado` o badge similar. Nunca debe aparecer en exports compartibles, emails a pacientes, ni endpoints sin auth.
- Escenarios válidos: (OS + plus), (sin OS + plus), (OS sin plus). Algunas OS lo prohíben contractualmente pero el médico igual lo cobra.

### R1.2 — Dos canales de liquidación (crítico)
Se agrega un **filtro nuevo** y una dimensión de análisis adicional:

- **Canal Círculo Médico**: órdenes de consulta, prácticas pequeñas, cirugías menores ambulatorias (hechas en consultorio). Liquida el Círculo Médico.
- **Canal Nosocomio**: cirugías mayores, internaciones, procedimientos de complejidad. Liquida el sanatorio. **Principal fuente de pérdida silenciosa** (nosocomios que liquidan mal o no liquidan).

**Micro-migración necesaria** (parte de la Fase 1):
```sql
ALTER TABLE cirugias
  ADD COLUMN canal_liquidacion TEXT NOT NULL DEFAULT 'circulo'
  CHECK (canal_liquidacion IN ('circulo', 'nosocomio'));
```

- Las `ordenes` NO llevan este campo (todas van por Círculo).
- El médico elige el canal al cargar la cirugía (UI en `/cirugias/nueva` y `/cirugias/[id]/editar`).

### R1.3 — KPI + Gráfico nuevos: "Cirugías Nosocomio sin liquidar" (desglosado por nosocomio)
- 5ª tarjeta de KPI: cantidad + monto total de cirugías con `canal_liquidacion='nosocomio'` y estado ≠ liquidada con más de 30 días desde la fecha.
- Alerta visual (rojo/naranja) si el número es > 0.
- **Gráfico complementario**: barras horizontales agrupadas por campo `sanatorio` mostrando monto sin liquidar por cada nosocomio, para identificar cuál nosocomio es el problemático.
- Objetivo: dar visibilidad inmediata al problema crónico de nosocomios que no liquidan y permitir ver cuál nosocomio en particular.

### R1.3b — Filtro por nosocomio
- Un médico puede operar en múltiples nosocomios (Pasteur, Medical Group, Clínica Modelo, etc.)
- Cuando el filtro "Canal" está en "Nosocomio" o "Ambos", aparece un filtro adicional **Nosocomio** que lista los sanatorios donde el médico ha cargado cirugías (DISTINCT de `cirugias.sanatorio` del médico actual) + opción "Todos".
- Permite analizar tendencia, facturación y débitos de un nosocomio específico.
- Implementación: el campo `sanatorio` ya existe en la tabla (TEXT, nullable). Normalización de typos queda para una feature posterior.

### R1.4 — Filtros actualizados
Agregar a los 3 filtros originales:
- **Canal**: Círculo / Nosocomio / Ambos (default: Ambos)

### R1.5 — Gráfico de tendencia con canales
El gráfico de líneas de tendencia mensual debe poder mostrar las series separadas por canal cuando el filtro "Canal" esté en "Ambos" (líneas punteadas vs sólidas, o colores distintos). Si está filtrado por un canal específico, muestra solo ese.

### R1.6 — CSV export: ELIMINADO
Se remueve toda la funcionalidad de exportar a CSV (Fase 5 del plan original). El médico consume la data visualmente en la app. Si en el futuro se necesita para contador, se agrega como feature separada.

### R1.7 — Plus en reportes
- El KPI "Plus cobrado del mes" y el gráfico de "Plus privado mensual" **siguen en el reporte** porque el médico es el único que ve sus propios datos (RLS lo garantiza).
- Agregar badge visual `🔒 Privado` en ambos componentes como recordatorio de confidencialidad.

---

## Objetivo

Construir un dashboard `/reportes` que le permita al médico analizar su facturación, cobros, débitos y plus con KPIs, gráficos de tendencias y tabla comparativa exportable, usando exclusivamente datos ya presentes en Supabase (ordenes, liquidaciones, debitos, cirugias) y la librería `recharts` ya instalada.

## Por Qué

| Problema | Solución |
|----------|----------|
| El médico no tiene visibilidad temporal de su facturación vs cobros reales | KPIs del mes + tendencia de 6 meses en un único tablero |
| No sabe qué obras sociales le representan mayor volumen ni dónde pierde plata | Gráficos de barras por obra social + torta de motivos de débito |
| No puede comparar meses ni exportar datos para su contador | Tabla 12 meses con export CSV |
| Los filtros de período están dispersos en cada sección | Filtros unificados (período, obra social, tipo) en una sola vista |

**Valor de negocio**: el médico pasa de "creer que factura bien" a ver con datos reales cuánto factura, cuánto cobra, dónde pierde y cómo evoluciona mes a mes — decisiones informadas sobre qué obras sociales priorizar.

## Qué

### Criterios de Éxito
- [ ] Ruta `/reportes` accesible desde el sidebar (sección Principal, debajo de Débitos) con ícono `BarChart3` de lucide-react
- [ ] 4 KPI cards del mes actual: Facturado, Cobrado, Débitos, Plus cobrado — cargan en Server Component
- [ ] Gráfico de líneas (LineChart de recharts) con 3 series: Facturado, Cobrado, Débitos de últimos 6 meses
- [ ] Gráfico de barras: facturación agrupada por obra social (descendente)
- [ ] Gráfico de torta: distribución de débitos por motivo (usa `MOTIVO_LABELS` y colores existentes de `DebitosPieChart`)
- [ ] Gráfico de barras: plus privado mensual últimos 6 meses
- [ ] Tabla 12 meses con columnas: Mes, Facturado, Cobrado, Débitos, Plus, Neto — con botón "Exportar CSV"
- [ ] Filtros funcionales: período (mes actual / 3 meses / 6 meses / año / personalizado con date range), obra social (dropdown con las que tiene ordenes el médico + "Todas"), tipo (consultas / cirugías / todas)
- [ ] Todos los gráficos muestran empty state elegante cuando `data.length === 0` (mismo patrón que `DashboardTrendChart`)
- [ ] Dark theme consistente con resto de la app (usa `var(--color-surface)`, `var(--color-foreground)`, etc.)
- [ ] RLS filtra por `medico_id = auth.uid()` en todas las queries (ya configurada en las tablas)
- [ ] `npm run typecheck` y `npm run build` pasan sin errores
- [ ] Responsive: grid de KPIs se apila en mobile, gráficos ocupan 100% ancho en mobile

### Comportamiento Esperado

1. Médico entra a `/reportes` — ve KPIs del mes actual, 4 gráficos, tabla 12 meses. Todos los cálculos ocurren en Server Component al cargar la página (respetando filtros por defecto: mes actual, todas las obras sociales, tipo todas).
2. Cambia el filtro de período a "6 meses" — los KPIs y gráficos se re-renderizan con el rango ampliado (navegación con query params en URL, Server Component re-fetch).
3. Filtra por obra social "OSEP" — todos los gráficos reflejan solo datos de OSEP.
4. Click en "Exportar CSV" — descarga archivo `reportes-YYYY-MM-DD.csv` con los 12 meses de la tabla.
5. Si no hay datos en el rango, cada gráfico muestra su empty state específico ("No hay datos para mostrar en este período"), sin romper la página.

---

## Contexto

### Referencias
- `src/features/dashboard/components/DashboardTrendChart.tsx` — patrón de chart con recharts + empty state + theming con CSS vars
- `src/features/debitos/components/DebitosPieChart.tsx` — patrón de PieChart + colores por motivo (reusar `MOTIVO_COLORS`)
- `src/app/(main)/dashboard/page.tsx` — patrón de Server Component que fetcha en paralelo con `Promise.all` y hace cálculos server-side
- `src/features/debitos/types/debitos.ts` — `MOTIVO_LABELS`, `MotivoDebito` enum (reutilizar)
- `src/actions/ordenes.ts` — patrón de Server Action (`'use server'`, `createClient`, auth check, return `{error}` o `{success}`)
- `src/shared/components/layout/sidebar.tsx` — líneas 21-58 `mainNavItems`: agregar entrada "Reportes" después de "Debitos"
- `src/app/(main)/dashboard/page.tsx:221-257` — `computeTrendData`: lógica de agrupación por mes reutilizable

### Arquitectura Propuesta (Feature-First)
```
src/features/reportes/
├── components/
│   ├── ReportesFilters.tsx          # Client: periodo + OS + tipo (URL query params)
│   ├── ReportesKPICards.tsx          # Server-safe: 4 cards
│   ├── ReportesTrendLineChart.tsx    # 'use client' — LineChart 6 meses
│   ├── ReportesFacturacionPorOS.tsx  # 'use client' — BarChart por obra social
│   ├── ReportesDebitosPie.tsx        # 'use client' — PieChart motivos (reusa colores)
│   ├── ReportesPlusBar.tsx           # 'use client' — BarChart plus mensual
│   ├── ReportesTabla12Meses.tsx      # 'use client' — tabla + botón export
│   └── ReportesEmptyState.tsx        # empty state compartido
├── hooks/
│   └── useExportCSV.ts               # hook cliente: convierte rows → csv → download
├── lib/
│   ├── date-ranges.ts                # helpers: getMonthRange, getLastNMonthsRange, etc.
│   └── aggregations.ts               # agrupadores puros (testeable): byMonth, byObraSocial, byMotivo
└── types/
    └── reportes.ts                   # tipos: Periodo, TipoFiltro, ReporteData, MonthRow

src/actions/
└── reportes.ts                       # getReportesData(filters) — fetch + aggregate server-side

src/app/(main)/reportes/
└── page.tsx                          # Server Component — lee searchParams, llama action, renderiza
```

### Modelo de Datos (existente — no se crean tablas)

Se usan las tablas ya existentes. Las queries clave son:

```sql
-- Facturación por mes (desde ordenes)
SELECT
  date_trunc('month', fecha_atencion) AS mes,
  SUM(honorario_calculado + monto_particular + monto_plus) AS facturado,
  SUM(CASE WHEN estado = 'aprobada' THEN honorario_calculado + monto_particular + monto_plus ELSE 0 END) AS cobrado,
  SUM(monto_plus) AS plus
FROM ordenes
WHERE fecha_atencion >= $1 AND fecha_atencion < $2
  AND ($3::text IS NULL OR obra_social = $3)
GROUP BY mes
ORDER BY mes;

-- Débitos por motivo
SELECT motivo, SUM(monto) AS total
FROM debitos
WHERE fecha >= $1 AND fecha < $2
GROUP BY motivo;

-- Facturación por obra social
SELECT obra_social, SUM(honorario_calculado) AS total
FROM ordenes
WHERE fecha_atencion >= $1 AND fecha_atencion < $2
  AND obra_social IS NOT NULL
GROUP BY obra_social
ORDER BY total DESC;
```

Dada la complejidad de los filtros dinámicos y que el dataset inicial es chico (un solo médico, volumen bajo), se opta por **fetch de filas crudas + agregación en Node** (mismo patrón que `DashboardPage`) en lugar de múltiples queries SQL con GROUP BY. Esto simplifica la lógica, la hace testeable, y evita N queries distintas por gráfico.

**RLS**: ya existe policy `auth.uid() = medico_id` en `ordenes`, `liquidaciones`, `debitos`, `cirugias` — no se requiere trabajo adicional.

---

## Blueprint (Assembly Line)

> IMPORTANTE: Solo definir FASES. Las subtareas se generan al entrar a cada fase
> siguiendo el bucle agéntico (mapear contexto → generar subtareas → ejecutar)

### Fase 1: Types, helpers puros y server action
**Objetivo**: Tipos de filtros/datos (`src/features/reportes/types/reportes.ts`), helpers de fechas y agregación puros (testeables sin React), y Server Action `getReportesData(filters)` que fetcha en paralelo de las 4 tablas y devuelve `ReporteData` ya agregado (KPIs + series para cada gráfico + rows de tabla 12 meses).
**Validación**:
- `npm run typecheck` pasa
- La action devuelve estructura consistente tanto con datos como sin datos (arrays vacíos, no `null`)

### Fase 2: Página, filtros y layout
**Objetivo**: Crear `src/app/(main)/reportes/page.tsx` Server Component que lee `searchParams`, llama a `getReportesData`, y renderiza layout con skeleton. `ReportesFilters.tsx` (client) maneja cambios de filtros actualizando query params con `useRouter().push()`. Agregar link "Reportes" al sidebar con ícono `BarChart3` de lucide-react en sección Principal, debajo de Débitos.
**Validación**:
- Navegar a `/reportes` desde sidebar funciona
- Cambiar filtro dispara navegación que re-fetcha data
- Layout responsive (grid de KPIs, 2-col de gráficos en desktop, 1-col en mobile)

### Fase 3: KPI cards y gráfico de tendencia de líneas
**Objetivo**: `ReportesKPICards` (4 cards con mismo estilo visual que `DashboardPage`) y `ReportesTrendLineChart` usando `LineChart` de recharts con 3 líneas (facturado, cobrado, débitos) últimos 6 meses. Reusar paleta de `DashboardTrendChart` (`#0A84FF`, `#30D158`, `#FF453A`).
**Validación**:
- KPIs muestran valores formateados en ARS (reusar `Intl.NumberFormat` pattern)
- LineChart renderiza en dark theme, muestra empty state cuando no hay datos

### Fase 4: Gráficos restantes (OS, débitos pie, plus)
**Objetivo**: Implementar `ReportesFacturacionPorOS` (BarChart horizontal o vertical sorted desc), `ReportesDebitosPie` (reusa `MOTIVO_COLORS` y `MOTIVO_LABELS` del feature débitos), y `ReportesPlusBar` (BarChart plus últimos 6 meses).
**Validación**:
- Los 3 gráficos renderizan con datos reales (o empty states si no hay)
- PieChart muestra porcentajes en tooltip
- Colores consistentes con resto de la app

### Fase 5: Tabla 12 meses + export CSV
**Objetivo**: `ReportesTabla12Meses` con columnas Mes/Facturado/Cobrado/Débitos/Plus/Neto, totales en fila final. Hook `useExportCSV` que convierte rows a CSV y dispara download con `Blob` + `URL.createObjectURL`. Nombre de archivo: `reportes-{YYYY-MM-DD}.csv`.
**Validación**:
- Tabla muestra 12 meses (incluyendo meses sin datos con ceros)
- Click en "Exportar CSV" descarga archivo correcto, abre bien en Excel (usa `;` como separador en es-AR y BOM UTF-8)

### Fase 6: Validación Final
**Objetivo**: Sistema funcionando end-to-end con filtros interactuando.
**Validación**:
- [ ] `npm run typecheck` pasa
- [ ] `npm run build` exitoso
- [ ] `npm run lint` sin warnings nuevos
- [ ] Playwright screenshot de `/reportes` confirma UI en dark theme
- [ ] Probar los 4 períodos + cambio de obra social + tipo — todo re-renderiza correctamente
- [ ] Probar estado "sin datos" en BD vacía — no rompe, muestra empty states
- [ ] Criterios de éxito cumplidos

---

## Aprendizajes (Self-Annealing / Neural Network)

> Esta sección CRECE con cada error encontrado durante la implementación.
> El conocimiento persiste para futuros PRPs. El mismo error NUNCA ocurre dos veces.

_(vacío — se llenará durante la implementación)_

---

## Gotchas

- [ ] Componentes de recharts REQUIEREN `'use client'` — el Server Component pasa `data` serializable como prop
- [ ] `fecha_atencion` en ordenes y `fecha` en debitos son `string` (formato ISO date) — comparar con `.startsWith(YYYY-MM)` o convertir a `Date` para ranges
- [ ] No confundir `honorario_calculado` (lo que OS debería pagar) con `cobrado` (solo cuando `estado === 'aprobada'`). El dashboard actual ya aplica esta regla en `computeTrendData` — replicar
- [ ] Montos en Supabase son `numeric` → llegan como `string` o `number` según driver. Siempre castear con `Number(valor)` antes de sumar
- [ ] Filtro de obra social debe ser dropdown poblado dinámicamente (SELECT DISTINCT obra_social FROM ordenes WHERE medico_id) — no hardcodear
- [ ] Tipo "cirugias" toma datos de tabla `cirugias` (no `ordenes.tipo`) — cuando el filtro es "cirugías" se lee `cirugias.total_calculado`; cuando es "consultas" se leen solo `ordenes`; "todas" suma ambas
- [ ] Plus cobrado ≠ plus facturado — el plus se considera "cobrado" cuando la orden pasó a `estado = 'aprobada'` (cobrado de la OS) + cuando es particular (monto_plus directo). Validar con el usuario si duda
- [ ] CSV en español: usar `;` como separador y prepender BOM `\uFEFF` para que Excel en es-AR abra bien caracteres con acentos
- [ ] No instalar `chart.js` ni ninguna otra librería de gráficos — `recharts` v3 ya está instalada y es la que usa toda la app
- [ ] RLS ya filtra por `medico_id`, NO pasar `medico_id` explícito en queries client-side (redundante y acopla código a auth)
- [ ] Período "personalizado" necesita 2 date inputs (from/to) — guardar en query params como `from=YYYY-MM-DD&to=YYYY-MM-DD`
- [ ] Empty state NO debe ser un simple "Sin datos" — seguir el patrón de `DashboardTrendChart`: título del chart + mensaje guía ("Carga órdenes para ver el gráfico")

## Anti-Patrones

- NO crear una nueva librería de charts — usar `recharts`
- NO hacer fetch client-side con `createClient` del browser en la página principal — usar Server Component + Server Action
- NO duplicar la lógica de agrupación por mes que ya existe en `computeTrendData` — extraerla a `lib/aggregations.ts` y reusarla desde ambos (dashboard y reportes) si el refactor es barato, o copiarla con comentario `// TODO: extract shared helper`
- NO usar `any` — si un tipo de Supabase no está generado, crear la interfaz manualmente (existe `src/features/debitos/types/debitos.ts` como ejemplo)
- NO hardcodear colores en los charts — usar los mismos de `DashboardTrendChart` y `DebitosPieChart` para consistencia visual
- NO implementar paginación en la tabla de 12 meses (son máximo 12 filas, no la necesita)
- NO mezclar lógica de filtros en el Server Component — usar query params como single source of truth

---

*PRP pendiente aprobación. No se ha modificado código.*
