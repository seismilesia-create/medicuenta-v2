# Spec — Item 3: honorario auto-calculado desde el arancel vigente

> **Fecha**: 2026-06-20
> **Proyecto**: MediCuenta V2
> **Backlog**: item 3 del contador del Círculo (`project_medicuenta_backlog_contador`)
> **PRP madre**: `.claude/PRPs/prp-catalogo-obras-sociales-prestadores.md` (Fase 3/5)
> **Rama sugerida**: apilada sobre `feat/tabla-canonica-os` (sin mergear; la integración la decide Héctor al final)

---

## Objetivo

Que `ordenes.honorario_calculado`, hoy **cargado a mano**, salga **solo** del **arancel vigente** de `aranceles_os` para órdenes `tipo = obra_social` **nivel 1** (consulta), según la **especialidad del médico** (categoría arancelaria) y con **recargo % si atiende en el interior**. El valor queda **editable** (el médico puede sobrescribir).

## Por qué

- Hoy el médico tipea el honorario de cada consulta → fricción + error.
- `aranceles_os` ya está seedeada (50 OS, vigencia 2026-02-01) y cada orden ya trae `codigo_os` (item 4) → la fuente del arancel ya está joineable.
- El contador (reunión 2026-06-18, doc `respuestas-reunion-contador-circulo.md`) confirmó el modelo: la orden de consulta tiene valores **común / especialista / oftalmológica** (+ recertificado en los datos), **uniforme en todas las OS** (resp. 2.1), y *"las órdenes de consulta suman un porcentaje si es en el interior, y no hay categoría de médico, o sea, es según las especialidades"* (resp. 2.5).

## Decisiones tomadas (con Héctor, 2026-06-20)

1. **Qué columna aplica = categoría fija del médico** (su especialidad), no una selección por orden. Se setea una vez.
2. **Recertificado = categoría base + flag** (no enum único de 4). Más general: sirve igual si recertificado resulta excluyente o combinable. La regla exacta es dato pendiente (ver "Datos parametrizados").
3. **El % de interior vive en `aranceles_os`** (por OS / vigencia), no como constante global — todo el dominio ya es time-varying y por OS. Si resulta global, se setea igual en todas las filas.
4. **La categoría la setea el ADMIN al onboardear al médico** (`/admin/medicos`), NO el médico en su config. La categoría define plata → write admin-only.
5. **Avisar, no bloquear**: el campo se prellena pero queda editable (el arancel puede estar desactualizado; el médico es la autoridad).

## Alcance

**Entra:** órdenes `tipo = obra_social` **`nivel = 1`** → prellenar `honorario_calculado` desde el arancel vigente.

**Fuera (sin tocar):**
- **Nivel 2** (foja quirúrgica) → sigue por nomenclador (`prestacionSeleccionada.total`).
- **Particular** → sigue con `monto_particular`.
- Liquidaciones / turnos / bot → no es este item.

---

## Modelo de datos (migración aditiva, no destructiva)

### `perfiles` (categoría del médico — write admin-only)
```sql
ALTER TABLE perfiles ADD COLUMN categoria_arancel text;        -- 'comun' | 'especialista' | 'oftalmologica'
ALTER TABLE perfiles ADD COLUMN recertificado    boolean NOT NULL DEFAULT false;
ALTER TABLE perfiles ADD COLUMN atiende_interior boolean NOT NULL DEFAULT false;
```
- `categoria_arancel` nullable: médico sin categoría seteada → no auto-calcula (fallback manual).
- Validación de valores con Zod en el action (no enum de Postgres, para extender sin migración si aparecen más cortes por especialidad).

### `aranceles_os` (% de interior, time-varying)
```sql
ALTER TABLE aranceles_os ADD COLUMN recargo_interior_pct numeric;   -- ej. 10.00 = +10%; NULL = 0%
```

Las 4 columnas de valor ya existen: `valor_consulta_medica`, `valor_especialista`, `valor_consulta_oftalmologica`, `valor_recertificado`.

---

## Regla pura de cálculo — `src/lib/catalogo/honorario.ts` (+ `honorario.test.ts`)

Función pura (mismo patrón que `riesgo-debito.ts` / `planilla.ts` / `obras-sociales.ts`):

```ts
type CategoriaArancel = 'comun' | 'especialista' | 'oftalmologica'

interface ArancelVigente {
  valor_consulta_medica: number | null
  valor_especialista: number | null
  valor_consulta_oftalmologica: number | null
  valor_recertificado: number | null
  recargo_interior_pct: number | null
}

interface ResultadoHonorario {
  honorario: number        // base + recargo, redondeado a 2 decimales
  base: number             // valor de la columna elegida
  columna: string          // p.ej. 'valor_especialista' (para la nota de procedencia)
  recargoPct: number       // 0 si no aplica
  motivo: string           // legible: "especialista $25.011 +10% interior = $27.512"
}

calcularHonorarioConsulta(params: {
  arancel: ArancelVigente | null
  categoria: CategoriaArancel | null
  recertificado: boolean
  atiendeInterior: boolean
}): ResultadoHonorario | null   // null = no se puede calcular → campo manual
```

### Selección de columna
| categoría | columna |
|---|---|
| `comun` | `valor_consulta_medica` |
| `especialista` | `valor_especialista` |
| `oftalmologica` | `valor_consulta_oftalmologica` |
| `recertificado = true` | `valor_recertificado` |

### Cadena de fallback (hay OS con columnas en `null`, ej. GALENO sin recertificado)
1. Si `recertificado` y `valor_recertificado` es `null` → caer a la columna **base** de su categoría.
2. Si la columna base es `null` → caer a `valor_consulta_medica`.
3. Si `valor_consulta_medica` también es `null`, o no hay `arancel`, o `categoria` es `null` → **devolver `null`** (sin auto-cálculo; campo manual).

### Recargo de interior
`honorario = base × (1 + recargo_interior_pct / 100)` si `atiendeInterior` y `recargo_interior_pct != null`; si no, `honorario = base`. Redondeo a 2 decimales.

---

## Wiring en la app

### Acción — `src/actions/catalogo.ts`
Agregar `getArancelVigente(codigoOs: number): Promise<ArancelVigente | null>`: la fila de `aranceles_os` de mayor `vigencia` para ese `codigo_os`, con los 4 `valor_*` + `recargo_interior_pct`. (Hoy `getCatalogoOs` solo trae `codigo_os, nombre_os, activa, vigencia`.)

La categoría del médico (`categoria_arancel`, `recertificado`, `atiende_interior`) se lee de **su perfil** server-side (ya logueado) y se pasa al form.

### Forms — `NuevaOrdenForm` + `EditarOrdenForm`
- Al elegir OS en `OsAutocomplete` (que ya setea `codigo_os`), si `tipo = obra_social` y `nivel = 1`: obtener el arancel vigente, correr `calcularHonorarioConsulta`, **prellenar** `honorario_calculado`.
- **Nota de procedencia** bajo el campo (de `motivo`), ej.: *"Auto: O.S.E.P. · especialista $25.011 +10% interior = $27.512 — editable"*. El campo sigue siendo `<input>` editable.
- Si `calcularHonorarioConsulta` devuelve `null` (médico sin categoría, u OS sin arancel) → campo manual + nudge suave: *"Configurá la categoría del médico para auto-calcular"*.
- No se fuerza recálculo server-side al guardar: se respeta el override (lo que esté en el campo es lo que se guarda).

### Onboarding/edición del médico — admin-only
- Agregar `categoria_arancel` (select común/especialista/oftalmológica) + `recertificado` + `atiende_interior` (checkboxes) a `onboardMedicoSchema` y `editarMedicoSchema` en `src/features/admin/medicos/types.ts`, y persistir en `onboardMedico` / `actualizarMedico` (`src/actions/admin-medicos.ts`) + el form en `src/features/admin/medicos/components`.
- **`src/actions/perfil.ts` (self-edit del médico) NO debe aceptar ni escribir estos 3 campos.** Se hace cumplir en la capa de acción (el schema de self-edit no los incluye). Nota: en pre-launch solo-owner alcanza con el guard de acción; si más adelante se endurece RLS, evaluar columna-level o tabla aparte.

---

## Datos parametrizados (entran cuando Héctor vuelva del Círculo)

| Dato pendiente | Dónde enchufa | ¿Re-toca diseño? |
|---|---|---|
| **% de interior** exacto (¿único o por OS?) | `UPDATE aranceles_os SET recargo_interior_pct = …` | No — es un valor |
| **Regla de recertificado** (qué es / quién lo cobra) | flag `perfiles.recertificado` + fallback ya definido | No |
| **¿"Interior" es por médico o por orden?** | hoy: atributo del médico (`perfiles.atiende_interior`). Si fuera por orden → agregar override en el form (YAGNI hasta confirmarlo) | Aditivo |
| ¿"Especialista" = bucket único o más cortes? | si hay más → más valores de `categoria_arancel` (sin migración, es texto + Zod) | No |
| Planilla mensual oficial de las 4 columnas | proceso de actualización de `aranceles_os` por vigencia | No |

---

## Tests (vitest, lib puro)

`honorario.test.ts`:
- Cada categoría (`comun`/`especialista`/`oftalmologica`) → su columna correcta.
- `recertificado = true` con `valor_recertificado` presente → usa esa columna.
- `recertificado = true` con `valor_recertificado = null` → fallback a la columna base.
- Columna base `null` → fallback a `valor_consulta_medica`.
- Todo `null` / `arancel = null` / `categoria = null` → devuelve `null`.
- `atiende_interior` con `recargo_interior_pct = 10` → base × 1.10; con `recargo = null` → base sin recargo.
- Redondeo a 2 decimales.

---

## Fuera de alcance (YAGNI)

- Override de interior por orden (es atributo del médico hasta que se confirme lo contrario).
- Flag "auto vs manual" en la orden (se evalúa en Fase 5 = detección de débitos).
- Recálculo forzado server-side (rompería el override).
- Arancel por canal Círculo/Nosocomio (el Excel actual es solo Círculo).
- Migrar liquidaciones/turnos/bot al arancel (son items siguientes).

---

## Criterios de éxito

- [ ] Al cargar una orden `obra_social` nivel 1 eligiendo una OS con arancel, `honorario_calculado` se prellena con el valor correcto según la categoría del médico, y se ve la nota de procedencia.
- [ ] El campo se puede editar (override) y se guarda lo editado.
- [ ] Médico sin categoría / OS sin arancel → campo manual, sin romper.
- [ ] Nivel 2 y particular intactos.
- [ ] La categoría se setea solo desde admin; el self-edit del médico no la toca.
- [ ] `npm run test`, `npm run typecheck`, `npm run build` verdes.
