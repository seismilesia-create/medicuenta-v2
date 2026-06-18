# PRP: Capa canónica de referencia — Obras Sociales, Aranceles, Prestadores e Instituciones

> **Estado**: PENDIENTE
> **Fecha**: 2026-06-17
> **Proyecto**: MediCuenta V2
> **Rama sugerida**: `feat/catalogo-os-prestadores`

---

## ⚠️ Revisión tras mapeo de contexto (2026-06-17)

El mapeo de la BD real (paso BLUEPRINT) reveló que **gran parte del esquema YA existe** (vacío, sin seedear). El PRP original asumía greenfield (inferido del código, donde `obra_social` es texto libre). Corrección:

- **`aranceles_os`** YA ES el catálogo de OS + aranceles: `codigo_os` · `nombre_os` · `valor_consulta_medica` · `valor_especialista` · `valor_consulta_oftalmologica` · `valor_recertificado` · `vigencia` (date, time-varying) · `activa`. **0 filas.** → NO crear `obras_sociales`/`os_aranceles`; **seedear `aranceles_os`**.
- **`prestaciones`** YA es el nomenclador OSEP (código/detalle/honorarios), usado por el feature `nomenclador` + `PracticaAutocomplete` de órdenes. Vacío. (Fuera de alcance de este PRP: es nivel 2 / prácticas.)
- **`aranceles_base`** (aranceles por concepto) — vacío.
- **`wa_os_suspendidas`** YA existe: suspendidas **por médico** (medico_id, nombre_os, fuente); el médico las gestiona en `/consultorio/config`, el bot las lee (`getOsSuspendidas`). → La suspensión per-médico YA está; la **circular-wide por mes** (Excel "SUSPENDIDA") va en `aranceles_os` (activa=false / valor null por vigencia).
- **`ordenes`** YA tiene `nivel` (smallint), `tipo_consulta`, **`agente_facturador`** (canal círculo/nosocomio) y `honorario_calculado` (debería salir de `aranceles_os`; hoy manual porque está vacía).
- **Padrón (`prestadores` / `instituciones`)**: NO existen → única parte realmente net-new.

### Blueprint REVISADO
- **Fase 1 — Seed `aranceles_os`** (NO crear tabla): importar las ~49 OS del Excel (codigo_os, nombre_os) + valores por `vigencia` mensual; manejar SUSPENDIDA. Posible ALTER mínimo (sigla/tipo o `suspendida`). *Depende de mañana:* a qué columna `valor_*` mapea cada "orden" (el dueño pasa "el valor de la orden de consulta de las diferentes órdenes").
- **Fase 2 — Padrón** (net-new): crear `prestadores` + `instituciones` + importador del Excel del Círculo.
- **Fase 3 — Wiring**: `obra_social` (texto) → `aranceles_os`; `honorario_calculado` desde el arancel vigente; reportes por OS canónica.
- **Fase 4-5**: onboarding desde padrón / detección de débitos (igual que abajo).

**Decisiones pendientes del dueño**: (a) mapeo de las "diferentes órdenes" → columnas `valor_*` (mañana); (b) ¿sigla/tipo en `aranceles_os` o catálogo aparte?; (c) suspensión por mes: `activa=false` vs columna `suspendida` nueva.

> El resto del documento es el diseño ORIGINAL (greenfield). Se mantiene como referencia, pero **manda esta revisión**.

---

## Objetivo

Reemplazar el `obra_social` de **texto libre** (hoy disperso en órdenes, liquidaciones, turnos, reportes y el bot) por un **catálogo canónico** de obras sociales con **aranceles mensuales por nivel** (time-varying, incluida la suspensión por mes), y crear un **padrón de prestadores e instituciones** del Círculo Médico — todo **sin romper la facturación actual** (migración suave, aditiva).

## Por Qué

| Problema | Solución |
|----------|----------|
| `obra_social` es texto libre → "OSEP"/"O.S.E.P."/"osep" se cuentan distinto y ensucian los reportes | Catálogo único; los formularios eligen de una lista (autocomplete) |
| Las OS suspendidas se mantienen a mano (match de texto) y **cambian todos los meses** | Tabla de aranceles con `suspendida` y `monto` **por mes** (vigencias) |
| Los aranceles de la orden de consulta no están en el sistema | `os_aranceles` seedeado de la planilla del Círculo |
| Cada médico se carga a mano en el onboarding | Padrón del Círculo (1541 socios) → onboarding seleccionando de la base |
| Sin dato estructurado, no se pueden detectar débitos automáticamente | Comparar lo pagado vs el arancel del mes de esa OS |

**Valor de negocio**: reportes confiables por OS; menos carga manual (onboarding desde la base, ~867 prestadores activos); base para **detección automática de débitos**; y el **activo de datos limpios** para el futuro producto B2B de círculos médicos (visión del dueño — la data estructurada ES el producto).

## Qué

### Criterios de Éxito
- [ ] Catálogo `obras_sociales` cargado (~49 OS) con el **código de planilla** del Círculo (327 OSEP, 186 PAMI, …).
- [ ] `os_aranceles` con estructura **mensual por nivel** (nivel 1 = orden de consulta), seedeado con la evolución 2025; `suspendida` por mes.
- [ ] Padrón `prestadores` importado de la base del Círculo, con `estado` derivado (activo vs no-prestador) y rol PAMI; e `instituciones` (119) con flag `presta_nivel2`.
- [ ] Los formularios de **orden / liquidación / turno** eligen la OS del **catálogo** (autocomplete tolerante), escribiendo un FK — sin perder los registros históricos en texto.
- [ ] Reportes (FacturacionPorOS) agregan por **OS canónica**.
- [ ] El bot valida OS suspendida contra el **catálogo/mes** (no contra una lista de texto).
- [ ] **Nada de la facturación actual se rompe**: los registros viejos se siguen leyendo; la migración es aditiva.
- [ ] RLS correcta: catálogo/aranceles = lectura para todos los médicos; padrón = solo superadmin.

### Comportamiento Esperado (Happy Path)
1. Al cargar una orden/liquidación/turno, el campo "Obra social" es un **autocomplete** del catálogo (búsqueda tolerante a acentos/siglas). Si esa OS está **suspendida el mes corriente**, se avisa.
2. El bot de WhatsApp, al reservar turno, valida la OS contra el catálogo + arancel vigente (reemplaza el match de texto de `osSuspendidas`).
3. El **superadmin** ve el padrón del Círculo y puede **onboardear un médico seleccionándolo** (prellena nombre/matrícula/CUIT/tel) en `/admin/medicos`.
4. Reportes muestran facturación por OS canónica y (fase posterior) **alertan débitos** cuando lo cobrado < arancel del mes.

---

## Contexto

### Referencias (código existente)
- **`obra_social` es texto libre en toda la app** — a cablear al catálogo:
  - Órdenes: `src/features/ordenes/` (types, NuevaOrdenForm, EditarOrdenForm, OrdenFilters, OrdenesTable, ordenesService, NuevaFojaForm)
  - Liquidaciones: `src/features/liquidaciones/` (types, NuevaLiquidacionForm, EditarLiquidacionForm, LiquidacionesTable)
  - Turnos/agenda + bot: `src/features/consultorio/components/agenda/*`, `src/features/whatsapp/agent/toolsTurnos.ts`
  - Reportes: `src/features/reportes/components/FacturacionPorOSChart.tsx`, `DescuentosApiladosChart.tsx`
  - Perfil: `src/features/perfil/` (obras sociales del médico)
- **Suspendidas hoy = match de texto**: `src/lib/consultorio/osSuspendidas.ts` (`normalizarOs`, `esOsSuspendida`) — pasa a leer del catálogo/mes.
- **Onboarding**: `src/actions/admin-medicos.ts` (`onboardMedico`, RPC `onboard_medico_cablear`, `actualizarMedico`) — extender para alta desde el padrón.
- **Patrón multi-tenant**: RLS por `medico_id` (ver migraciones). Las tablas de **referencia** son globales (lectura para todos); el **padrón** es administrativo (superadmin) — patrón `resolverSuperadmin` / RPC con EXECUTE revocado a anon/authenticated.
- **Fuentes de datos** (en memoria): `reference_medicuenta_obras_sociales.md` y `reference_medicuenta_circulo_socios.md`. Excels en `~/Downloads/informacion-MediCuenta/`.

### Arquitectura Propuesta (Feature-First)
```
src/features/catalogo/                 # referencia (OS + aranceles)
├── components/  (OsAutocomplete, ...)
├── services/    (catalogoService: buscar OS, arancel vigente, suspendida-mes)
└── types/
src/features/padron/                   # prestadores + instituciones (admin)
├── components/  (PadronTable, OnboardDesdePadron, ...)
├── services/
└── types/
scripts/importers/                     # seeders idempotentes desde los Excel (server-only)
```

### Modelo de Datos (propuesto)
```sql
-- 1) Catálogo de obras sociales (referencia GLOBAL: lectura para todos)
CREATE TABLE obras_sociales (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      INT UNIQUE,              -- código de planilla del Círculo (327 OSEP, 186 PAMI…)
  sigla       TEXT NOT NULL,
  nombre      TEXT,                    -- nombre completo
  tipo        TEXT,                    -- sindical | prepaga | gerenciadora | provincial | estatal | mutual
  ambito      TEXT,                    -- nacional | provincial
  web         TEXT,
  activa      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Aranceles mensuales por OS y nivel (TIME-VARYING: precio y suspensión cambian por mes)
CREATE TABLE os_aranceles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_social_id UUID NOT NULL REFERENCES obras_sociales(id) ON DELETE CASCADE,
  nivel          SMALLINT NOT NULL DEFAULT 1,    -- 1 = orden de consulta (lo común)
  canal          TEXT,                           -- 'circulo' (default) | 'nosocomio' (2 canales de liquidación)
  vigencia_desde DATE NOT NULL,                  -- 1.er día del mes (ej. 2025-12-01)
  monto          NUMERIC(12,2),                  -- NULL si SUSPENDIDA o sin dato ese mes
  suspendida     BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (obra_social_id, nivel, canal, vigencia_desde)
);

-- 3) Padrón: prestadores (personas) — ADMIN
CREATE TABLE prestadores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nro_socio     INT,
  apellido_nombre TEXT,
  matricula     TEXT,
  cuit          TEXT,
  documento     TEXT,
  telefono      TEXT, celular TEXT, email TEXT,
  tipo_socio    TEXT,            -- Activo | Vitalicio Activo | Baja | Fallecido | …
  estado        TEXT,            -- DERIVADO: 'activo' | 'no_prestador'
  presta_pami   TEXT,            -- No | Especialista | Médico Cabecera | Sí
  reside_en     TEXT,            -- Capital | Interior
  categoria     TEXT,            -- A | B | C | P
  perfil_id     UUID REFERENCES perfiles(id),   -- link cuando se onboardea en la app (NULL si no)
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4) Instituciones (los 119 Centros - Clínicas - Sanatorios) — ADMIN
CREATE TABLE instituciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nro_socio     INT,
  nombre        TEXT,
  cuit          TEXT, telefono TEXT, email TEXT,
  reside_en     TEXT,
  presta_nivel2 BOOLEAN,         -- DATO PENDIENTE del dueño (NULL hasta tenerlo)
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE obras_sociales ENABLE ROW LEVEL SECURITY;  -- SELECT: authenticated; escritura: service_role
ALTER TABLE os_aranceles   ENABLE ROW LEVEL SECURITY;  -- idem
ALTER TABLE prestadores    ENABLE ROW LEVEL SECURITY;  -- solo superadmin (service_role)
ALTER TABLE instituciones  ENABLE ROW LEVEL SECURITY;  -- solo superadmin (service_role)

-- Migración suave del texto libre (aditiva, NO destructiva):
-- ALTER TABLE ordenes      ADD COLUMN obra_social_id UUID REFERENCES obras_sociales(id);
-- ALTER TABLE liquidaciones ADD COLUMN obra_social_id UUID REFERENCES obras_sociales(id);
-- ALTER TABLE wa_turnos    ADD COLUMN obra_social_id UUID REFERENCES obras_sociales(id);
-- (se mantiene la columna de texto; backfill por match; la UI escribe el FK; lecturas prefieren FK con fallback a texto)
```

---

## Blueprint (Assembly Line)

> Solo FASES. Las subtareas se generan al entrar a cada fase (bucle agéntico).
> **Construible YA**: la estructura no depende de los datos pendientes; esos son SEED/placeholder.

### Fase 1: Catálogo de OS + Aranceles
**Objetivo**: tablas `obras_sociales` + `os_aranceles` con RLS, y seeder idempotente desde el Excel de OS (normalizando los typos de miles). Estructura time-varying lista.
**Validación**: ~49 OS cargadas; query "arancel vigente de la OS X para el mes M" devuelve monto o suspendida; re-correr el seeder no duplica.

### Fase 2: Padrón del Círculo (prestadores + instituciones)
**Objetivo**: tablas `prestadores` + `instituciones` (RLS superadmin) + importador desde la base, derivando `estado` de `Tipo Socio` y separando las 119 instituciones.
**Validación**: conteos coinciden con el Excel (~867 activos, 135 fallecidos, 119 instituciones, etc.); `presta_nivel2` queda NULL (pendiente).

### Fase 3: Cablear el catálogo en la app (migración suave)
**Objetivo**: `OsAutocomplete` + `catalogoService`; agregar `obra_social_id` (nullable) a ordenes/liquidaciones/wa_turnos; backfill por match tolerante; formularios escriben el FK; reportes y `osSuspendidas`/bot leen del catálogo (con fallback a texto para lo viejo).
**Validación**: cargar una orden eligiendo OS del catálogo; FacturacionPorOS agrupa por OS canónica; registros históricos siguen visibles; nada se rompe.

### Fase 4: Onboarding desde el padrón
**Objetivo**: en `/admin/medicos`, elegir un prestador de la base (filtrando activos) que prellena el alta y linkea `perfil_id`.
**Validación**: onboardear un médico desde la base end-to-end.

### Fase 5 (posterior/opcional): Aranceles → detección de débitos
**Objetivo**: reporte/alerta cuando lo cobrado por una orden < arancel del mes de esa OS.
**Validación**: detectar un débito de ejemplo.

### Fase N: Validación Final
**Validación**:
- [ ] `npm run typecheck` pasa
- [ ] `npm run build` exitoso
- [ ] `npm run test` (vitest) verde
- [ ] Playwright/E2E confirma alta de orden con OS del catálogo y reporte por OS
- [ ] Criterios de éxito cumplidos

---

## 🧠 Aprendizajes (Self-Annealing)

> Crece durante la implementación.

---

## Gotchas

- [ ] `obra_social` está en MUCHOS lugares (órdenes/liquidaciones/turnos/reportes/bot/perfil) → migración **incremental y aditiva**; jamás romper lectura de registros viejos.
- [ ] Aranceles y suspensión son **por mes** → NO columnas fijas en `obras_sociales`; usar `os_aranceles` con vigencias. (El dueño actualiza los valores cada mes.)
- [ ] Typos de separador de miles en el Excel de precios ("23.557.67" = 23557,67; "16.380.30" = 16380,30) → normalizar al importar.
- [ ] `Tipo Socio` mezcla estado + categoría → derivar `estado` (activo vs no_prestador) al importar; separar las 119 instituciones.
- [ ] `Prest. PAMI` NO es boolean (Especialista / Médico Cabecera / Sí) → guardar el rol.
- [ ] **2 canales de liquidación** (Círculo vs Nosocomio, ver `project_medicuenta_business_logic`) → `os_aranceles.canal` previsto; MVP puede seedear solo 'circulo'.
- [ ] RLS: catálogo/aranceles legibles por todos los médicos; padrón solo superadmin (datos personales, incl. fallecidos).
- [ ] Datos personales sensibles (fallecidos/baja) en el padrón → acceso administrativo, no exponer públicamente.

## Anti-Patrones
- NO romper la facturación actual: la migración es aditiva (FK nullable + backfill), no un reemplazo destructivo.
- NO modelar aranceles/suspensión como dato fijo (cambian por mes).
- NO hardcodear la lista de OS en código (vive en la tabla, seedeada del Excel).
- NO `any`; validar inputs con Zod; RLS en todas las tablas nuevas.

---

## ❓ Preguntas Abiertas / Datos Pendientes

> El PRP es construible sin esto; son SEED/placeholder que se completan después.

1. **Valores actualizados de la orden de consulta** (el dueño los pasa ~2026-06-18) → seed del último mes en `os_aranceles`.
2. **Qué instituciones prestan nivel 2** (el dueño lo averigua) → `instituciones.presta_nivel2` (NULL hasta tenerlo).
3. ¿Hay niveles además de 1 (consulta) y 2? ¿Las prácticas raras van por el nomenclador? (define el alcance de `nivel`).
4. ¿Los aranceles dependen del **canal** (Círculo vs Nosocomio)? ¿El Excel actual es solo el del Círculo?
5. ¿Qué significa `Categoría` (A/B/C/P) en el padrón? (informativo o afecta arancel).
6. Migración del texto histórico: los registros que **no matcheen** ninguna OS del catálogo, ¿se revisan a mano o quedan con FK NULL + texto?
7. ¿El médico declara qué OS factura (relación médico↔OS) o se infiere de las órdenes? (posible tabla futura).

---

*PRP pendiente de aprobación. No se ha modificado código.*
