# Reglas de actualización de MediCuenta

> Cómo evolucionamos la app sin romper lo que anda ni exponer datos — sobre todo
> una vez en **producción** (médicos reales, datos reales, plata real).
> Estas reglas no se saltean: ante la duda, gana "no romper y no filtrar".

## 0. Principio rector
Cada cambio entra **aditivo y verificado**. Si algo puede romper datos o seguridad,
se hace en pasos chicos, con vuelta atrás disponible. La velocidad nunca se compra
con riesgo sobre los datos del médico.

## 1. Antes de construir — pensar
- **Feature no trivial → spec/plan corto** con las decisiones y el *por qué* (como el
  spec del dashboard). Las features chicas van directo.
- **Etapas chicas y verificables.** Si algo depende de algo externo (credenciales de
  Google/MP, infra de WhatsApp), se **difiere esa parte** y se avanza el resto — no se
  bloquea la fase entera.
- **Decisiones de negocio / no obvias → a memoria** (precios, fiscal, modelo operativo).

## 2. Mientras construyo — cómo
- **Rama aparte**, nunca directo a `main`. Commits chicos y descriptivos.
- **Lógica decidible → funciones puras con tests (TDD)** (fechas, candado, correlación,
  alertas…). Es lo que nos deja cambiar con confianza.
- **Seguridad por construcción:** RLS en cada tabla nueva; el candado se aplica
  **server-side** (no alcanza con ocultar en la UI); `service-role` SOLO detrás de un
  guard estricto de rol.
- Sin `any`; entradas de usuario validadas con Zod.

## 3. Base de datos — lo más delicado en producción
- **Migraciones aditivas e idempotentes** (`ADD COLUMN IF NOT EXISTS`, `CREATE … IF NOT
  EXISTS`). **Nunca** borrar/renombrar una columna en uso de un saque:
  agregar → migrar → deprecar → recién después limpiar.
- **Seeds que preservan** lo existente (como dejar a los médicos actuales en Full).
- Correr **`get_advisors`** después de cada cambio de DB (caza RLS faltante / funciones
  expuestas).
- En producción: **backup antes** de una migración grande.

## 4. Antes de soltar — verificar
- **Gates obligatorios en verde:** `npm test` + `npm run typecheck` + `npm run build`.
- **Verificar contra datos reales** (round-trip / query real), no solo los tests.
- **Probar primero en staging / preview**, nunca el primer intento directo en producción.
  *(Pendiente de armar: un entorno de staging + deploys de preview cuando estemos en prod.)*

## 5. Soltar a producción — rollout seguro
- Feature **riesgosa o muy visible → gradual**: a unos pocos médicos primero (por plan /
  feature flag), después a todos.
- Cambios visibles para el médico → **avisarle** (changelog / mensaje).
- Tener **vuelta atrás rápida** (revert del deploy).

## 6. Después — aprender y vigilar
- **Auto-blindaje:** cada error se documenta para que no se repita.
- El **orquestador** vigila la salud tras cada cambio (errores en la bitácora); cuando
  tenga IA, además analiza y avisa.
- **Prueba en vivo del dueño** al cierre de cada etapa.

## 7. Lo que NO se relaja nunca
- La **RLS** y el **candado de planes** (un Básico jamás accede al asistente de WhatsApp).
- La separación **facturación/recetas** vs la **secretaria**.
- El **orquestador v1 observa y avisa, NO actúa solo**. La autonomía se habilita después,
  con cuidado y configurable.
- **Secrets fuera del código.**

---
*Documento vivo: se actualiza cuando aprendemos algo nuevo (auto-blindaje).*
