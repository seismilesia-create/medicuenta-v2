# Registro de Seguridad — MediCuenta

## Vulnerabilidades conocidas (revisión pendiente)

### `xlsx` (SheetJS) — severidad: high

- **Paquete:** `xlsx@^0.18.5` (instalado desde npm registry)
- **Advisories:**
  - [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) — Prototype Pollution
  - [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) — ReDoS
- **Estado:** `npm audit fix` no resuelve. La versión en npm (`0.18.5`) está congelada; SheetJS distribuye versiones parchadas solo desde su CDN (`https://cdn.sheetjs.com/`).
- **Superficie de ataque en MediCuenta:** el paquete se usa únicamente para **exportar** Excel (escritura) en las features `ordenes` y `cirugias`. No se parsea Excel proveniente de usuarios. El riesgo explotable (prototype pollution / ReDoS) requiere **procesar archivos maliciosos**, no generarlos. Impacto real estimado: bajo.
- **Acciones pendientes (post-despliegue):**
  1. Migrar a distribución CDN de SheetJS (`pnpm add https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`) o
  2. Evaluar reemplazo por `exceljs` / `write-excel-file`.
- **Fecha de registro:** 2026-04-13
