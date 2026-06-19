# Spec — Catálogo canónico de Obras Sociales (cableado en órdenes) + aviso de suspendida

- **Fecha:** 2026-06-19
- **Estado:** Aprobado para pasar a plan de implementación
- **Origen:** Backlog del contador del Círculo Médico — **Item 4** ("tabla canónica de OS con estado activa/suspendida por mes → alimenta avisos"). Es la **Fase 3 (wiring)** del PRP previo `.claude/PRPs/prp-catalogo-obras-sociales-prestadores.md`.
- **Rama:** `feat/tabla-canonica-os` (apilada sobre item 2; no toca la rama de trabajo ni prod hasta integración final).

---

## 1. Objetivo y contexto

**El catálogo YA EXISTE y está seedeado.** La tabla **`aranceles_os`** (en prod) tiene **50 OS**, vigencia `2026-02-01`, todas `activa=true`, con `codigo_os` (327 O.S.E.P., 186 PAMI…), `nombre_os`, los 4 valores (`valor_consulta_medica` / `_especialista` / `_consulta_oftalmologica` / `_recertificado`), `vigencia` (date, time-varying) y `activa`. El nomenclador `prestaciones` también está cargado (1148 filas).

**Hoy** `obra_social` es **texto libre / un enum hardcodeado** (`OBRAS_SOCIALES`, duplicado en `ordenes.ts` + `liquidaciones.ts`, con nombres que NO matchean el catálogo: enum `"OSEP"` vs catálogo `"O.S.E.P."`). No hay aviso de OS suspendida en órdenes.

**Objetivo (foco órdenes):** que el flujo de órdenes use el **catálogo canónico** (`aranceles_os`) como fuente de OS, y que el estado **suspendida** (catálogo del mes + lista propia del médico) genere un **aviso** al cargar/editar — sin romper nada de lo existente (migración aditiva).

**Valor:** datos de OS consistentes (reportes confiables, base para item 3 aranceles y detección de débitos), y prevención: avisar cuando se presenta a una OS suspendida (que sería debitada → conviene cobrar particular).

---

## 2. Alcance

### Dentro de esta v1 (foco órdenes)
- **`catalogoService`** que lee `aranceles_os` (vigencia más reciente).
- **Función pura `estaSuspendida(...)`** (catálogo `activa` + `wa_os_suspendidas` con match tolerante).
- **`OsAutocomplete`**: autocomplete del catálogo + escape de texto libre.
- Cableado en **NuevaOrdenForm**, **EditarOrdenForm** y **OrdenFilters** (el flujo de órdenes nivel 1).
- **`ordenes.codigo_os`** (int, nullable) — clave de negocio estable; `obra_social` (texto) se mantiene.
- **Backfill suave** de `codigo_os` en órdenes existentes por match tolerante.
- **Aviso de OS suspendida** en vivo en los forms de orden (ámbar, no bloquea).

### Fuera de esta v1 (explícito)
- **Cálculo del honorario desde el arancel** (`valor_consulta_*`) → **Item 3** (mismo `aranceles_os`, otro item).
- **Otras superficies**: liquidaciones, turnos/agenda, reportes, cirugías, perfil, bot de WhatsApp → adoptan el catálogo en items posteriores. El **enum `OBRAS_SOCIALES` se mantiene** (lo siguen usando esas superficies); su dedup/eliminación es follow-up.
- **Padrón** (prestadores/instituciones) → PRP Fase 2/4 (otro item).
- **Unificar el bot de turnos** para que lea `aranceles_os.activa` (hoy lee solo `wa_os_suspendidas`) → follow-up.

---

## 3. Decisiones de diseño (cerradas en el brainstorming)

1. **Selección de OS: catálogo + escape "Otra".** Autocomplete de las 50 OS, pero permite texto libre si una OS no está (no bloquea al médico).
2. **Fuente de suspensión: catálogo del mes (`aranceles_os.activa`) O lista propia (`wa_os_suspendidas`).** Combina ambas (máxima protección).
3. **Avisar, no bloquear** (mismo patrón que el pre-check de item 2). El médico decide.
4. **Migración aditiva / suave** (alineada al PRP): se agrega `codigo_os` (nullable), se mantiene `obra_social` texto, backfill por match; nunca se rompe la lectura de registros viejos.
5. **`codigo_os` es clave de negocio, NO FK formal** — porque `aranceles_os` es time-varying (`codigo_os` se repite por vigencia, no es único). El join a `aranceles_os` se hace por `codigo_os` + vigencia.

---

## 4. Comportamiento detallado

### Autocomplete de OS (nueva/editar orden, tipo obra social)
- El `<select>` actual del enum se reemplaza por **`OsAutocomplete`**: busca en el catálogo por `nombre_os` (tolerante a acentos/mayúsculas/siglas, reutilizando `normalizarOs`).
- Al elegir una OS del catálogo: el form guarda `obra_social = nombre_os` (canónico) **y** `codigo_os = codigo_os`.
- Si el médico escribe una OS que no está (escape): `obra_social = <su texto>`, `codigo_os = null`.
- El OCR (`matchesOsFromScan`) pasa a matchear contra el **catálogo** (no el enum) y, si matchea, setea `codigo_os`.

### Aviso de OS suspendida
- El form carga (1 vez) el catálogo (`{codigo_os, nombre_os, activa}` de la vigencia más reciente) + la lista de suspendidas del médico (`wa_os_suspendidas`).
- Al haber una OS seleccionada, computa `estaSuspendida(...)` en vivo. Si da true → **aviso ámbar, no bloquea**:
  > ⚠️ *Esta obra social está suspendida este mes. Presentarla puede ser debitada — conviene cobrarla como particular.*

### Filtro del listado
- `OrdenFilters` usa la lista del catálogo para el filtro de OS (en vez del enum). El filtrado contra `ordenes` sigue por `obra_social` (texto) para no perder históricos; opcionalmente por `codigo_os` cuando esté backfilleado. *(Ver §8.)*

---

## 5. Modelo de datos

> No se crean tablas. `aranceles_os` (catálogo + aranceles) y `wa_os_suspendidas` (suspendidas por médico) ya existen.

### Cambio en `ordenes`
- `codigo_os int NULL` — código de OS del catálogo (clave de negocio estable). Nullable (escape de texto libre / históricos sin match). Índice para filtros/joins.

### `aranceles_os` (referencia, ya existe — no se modifica)
`id`, `codigo_os` (int), `nombre_os` (text), `valor_consulta_medica` / `valor_especialista` / `valor_consulta_oftalmologica` / `valor_recertificado` (numeric), `vigencia` (date), `activa` (bool), `notas`. Hoy: 50 filas, vigencia `2026-02-01`, todas activas. RLS: lectura para autenticados *(confirmar — ver §12 S2).*

---

## 6. `catalogoService` + función pura `estaSuspendida`

### Server (lectura del catálogo)
`src/actions/catalogo.ts` (server actions `'use server'`, patrón del repo — igual que `actions/ordenes.ts`):
- `getCatalogoOs(): Promise<OsCatalogoItem[]>` — lee `aranceles_os`, se queda con la **vigencia más reciente** (`max(vigencia) <= hoy`), dedup por `codigo_os`. Devuelve `{ codigo_os, nombre_os, activa }[]` ordenado por `nombre_os`.
- `getMisOsSuspendidas(): Promise<string[]>` — `wa_os_suspendidas.nombre_os` del médico (reusar/compartir con `turnosService.getOsSuspendidas`).

### Pura y testeable (`src/lib/catalogo/suspension.ts`)
```ts
export interface OsCatalogoItem { codigo_os: number; nombre_os: string; activa: boolean }

export function estaSuspendida(params: {
  codigoOs: number | null
  obraSocial: string | null
  catalogo: OsCatalogoItem[]
  suspendidasMedico: string[]
}): boolean
```
- Vacío / `"particular"` → `false`.
- **Suspendida por catálogo**: ubicar el item del catálogo por `codigoOs` (si hay) o por match tolerante de `obraSocial` (`normalizarOs`); si existe y `activa === false` → suspendida.
- **Suspendida por médico**: `esOsSuspendida(suspendidasMedico, obraSocial)` (helper existente en `src/lib/consultorio/osSuspendidas.ts`).
- Resultado = catálogo **OR** médico.

---

## 7. Componente `OsAutocomplete`

`src/features/catalogo/components/OsAutocomplete.tsx` (cliente):
- Props: lista del catálogo, valor actual (`{ obra_social, codigo_os }`), `onChange`.
- Input con búsqueda tolerante sobre `nombre_os`; dropdown de coincidencias; al elegir, setea `obra_social=nombre_os` + `codigo_os`. Permite confirmar texto libre (escape) → `codigo_os=null`.
- Reutilizable por las otras superficies en items posteriores.

---

## 8. Backfill / migración suave

- Migración: `alter table ordenes add column codigo_os int` + índice.
- **Backfill** (en la misma migración o un script idempotente): para cada orden con `obra_social` no nulo y `codigo_os` null, matchear `normalizarOs(obra_social)` contra `normalizarOs(aranceles_os.nombre_os)` (de cualquier vigencia) y setear `codigo_os`. Sin match → queda null (no se toca el texto).
- El filtro/listado sigue leyendo `obra_social` (texto) para no perder históricos; el `codigo_os` habilita joins/filtros canónicos cuando está.

---

## 9. Casos borde
- OS fuera del catálogo → escape libre, `codigo_os` null. No falla.
- Orden vieja sin match en backfill → texto intacto, `codigo_os` null.
- `particular` → sin OS, sin aviso (ya manejado por `tipo`).
- Hoy hay **1 sola vigencia** y **todas activas** → el aviso no dispara hasta que haya una OS con `activa=false` o una entrada en `wa_os_suspendidas`. La infraestructura queda lista.
- Catálogo vacío / error de lectura → el autocomplete cae a permitir texto libre (no bloquear la carga de la orden).

---

## 10. Cómo lo verificamos
- **Unit (`estaSuspendida`)**: activa→no; suspendida-catálogo por codigo_os; suspendida-catálogo por match tolerante de nombre; suspendida por lista del médico; particular/vacío→no; combinación.
- **Unit (`catalogoService`)**: elige la vigencia más reciente; dedup por `codigo_os`.
- **Integración**: `OsAutocomplete` lista del catálogo + escape; el form guarda `nombre_os` + `codigo_os`; el aviso aparece con una OS marcada suspendida (de prueba) y NO con una activa.
- **Migración**: backfill matchea "OSEP"→327, "Galeno"→183, etc.; sin match → null; re-correr no duplica.
- **E2E (al final, en prod)**.

---

## 11. Referencias al código actual (para el plan)
- **Enum (se mantiene):** `src/features/ordenes/types/ordenes.ts:32-44` (`OBRAS_SOCIALES`).
- **Campo + Zod:** `types/ordenes.ts:54` (`obra_social`), `:221` (validación). Interface `Orden` suma `codigo_os`.
- **Forms a cablear:** `NuevaOrdenForm.tsx` (select OS ~L490; `matchesOsFromScan` L79-86; `buscarPrestacionPorCodigo` usa obra_social), `EditarOrdenForm.tsx` (select OS), `OrdenFilters.tsx:43` (multiselect OS).
- **Actions:** `src/actions/ordenes.ts` (`createOrden`/`updateOrden` — persistir `codigo_os`).
- **Service de listado:** `src/features/ordenes/services/ordenesService.ts:15-16` (filtro por obra_social).
- **Suspendidas (reusar):** `src/lib/consultorio/osSuspendidas.ts` (`normalizarOs`, `esOsSuspendida`); lectura `wa_os_suspendidas` en `src/features/whatsapp/services/turnosService.ts` (`getOsSuspendidas`).
- **Catálogo (DB):** tabla `aranceles_os`.

---

## 12. Supuestos y preguntas abiertas (para el review del spec)
- **S1.** "Vigencia más reciente" = `max(vigencia)` del catálogo (hoy `2026-02-01`). Cuando haya varios meses, se toma la última ≤ hoy. *(Asumo esto.)*
- **S2.** `aranceles_os` debe ser **legible por cualquier médico autenticado** (catálogo global). Verificar/crear la policy RLS de SELECT (la migración de catálogo puede no haberla seteado). *(A confirmar al implementar — es lectura, no escritura.)*
- **S3.** El backfill matchea por `nombre_os` normalizado. Si algún nombre histórico no matchea (typos), queda `codigo_os` null — aceptable.
- **S4.** `OrdenFilters`: el filtro sigue por texto `obra_social` (no se rompe históricos). Migrar a `codigo_os` puro queda para cuando todo esté backfilleado.

---

## 13. Conexión con el resto del backlog (no implementar acá)
- **Item 3 (aranceles time-varying):** `ordenes.codigo_os` habilita el join a `aranceles_os` para que `honorario_calculado` salga del `valor_*` vigente según OS + tipo.
- **Pre-check (item 2):** `evaluarRiesgoOrden` podrá sumar "OS suspendida" como faltante/riesgo cuando se integre.
- **Cross-surface:** liquidaciones/turnos/reportes/cirugías/perfil + dedup del enum + unificar el bot con `aranceles_os.activa` → items siguientes (reusan `OsAutocomplete` + `catalogoService`).
- **Padrón / onboarding / débitos:** PRP Fases 2/4/5.
