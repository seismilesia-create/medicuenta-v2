# Preguntas abiertas — Fase 1 Reportes (RESUELTAS)

> **Estado**: RESUELTAS 2026-04-15 tras consulta con médicos
> **Resolución**: El modelo real resultó ser "niveles 1°/2° + 3 agentes facturadores" (no "dos canales"). Ver PRP-001 Revisión 2 para el modelo definitivo. Este archivo queda como histórico.

---

Necesito clarificar el modelo de canales de liquidación antes de implementar Fase 1. Estas 4 preguntas impactan el schema (tablas `ordenes` y `cirugias`) y la UX de carga.

## 1. OS propias del nosocomio y órdenes de consulta

Hay OS que pertenecen a un nosocomio (ej. OS propia del Sanatorio Pasteur, OS de Medical Group) y liquidan solo a través de ese nosocomio, sin pasar por el Círculo Médico.

**Pregunta**: ¿Estas OS propias del nosocomio también incluyen órdenes de consulta, o solo cirugías/procedimientos?

- Si un paciente con OS propia del nosocomio va a una consulta en el consultorio del médico → ¿esa consulta se liquida vía el nosocomio o vía Círculo?

**Respuesta**: _____

---

## 2. Campo canal_liquidacion en tabla `ordenes`

Actualmente el plan propone agregar `canal_liquidacion` (enum: circulo/nosocomio) + usar `sanatorio` solo en la tabla `cirugias`.

**Pregunta**: ¿Agregamos también `canal_liquidacion` + `sanatorio` a la tabla `ordenes`?

- **Si SÍ**: el médico marca canal + nosocomio por cada orden también. Los reportes unifican todo.
- **Si NO**: solo cirugías llevan canal. Todas las órdenes se asumen como Círculo.

Esta decisión depende de la respuesta a la pregunta 1. Si las OS del nosocomio no pasan por el Círculo ni siquiera en consultas, entonces SÍ hay que agregar el campo a `ordenes`.

**Respuesta**: _____

---

## 3. Ejemplos concretos de OS propias de nosocomios en Catamarca

Para dimensionar el modelo y el impacto:

**Pregunta**: ¿Cuáles son las OS propias de nosocomios con las que trabajás o tenés pacientes? ¿Son 1-2 casos marginales o es algo común?

Ejemplos esperables:
- OS Medical Group → liquida solo por Medical Group
- OS Pasteur → liquida solo por Sanatorio Pasteur
- (otras)

**Respuesta**: _____

---

## 4. Regla de ruteo por OS

Para las OS que pueden liquidar por ambos canales (la mayoría: OSEP, Swiss Medical, OSDE, Galeno, etc.), ¿cómo se decide el canal?

**Opciones**:

- **(a)** La decisión depende de **la OS del paciente** (fijo — ej. OSEP siempre va por Círculo sin excepción)
- **(b)** La decisión depende del **tipo de prestación** (consulta → Círculo; cirugía mayor / internación → Nosocomio)
- **(c)** **Ambos criterios combinados** (algunas OS tienen reglas por tipo de prestación)
- **(d)** **El médico decide caso por caso** (ninguna regla fija)

**Respuesta**: _____

**Pregunta complementaria**: ¿Alguna vez una misma OS liquidó una misma prestación por distintos canales (una vez por Círculo, otra vez por Nosocomio) dependiendo de las circunstancias?

**Respuesta**: _____

---

## Cómo retomar cuando tengas las respuestas

1. Completar este archivo con las respuestas
2. Decirle a Claude: "tengo las respuestas de las preguntas abiertas de Fase 1"
3. Claude actualiza el PRP-001 con el modelo definitivo
4. Aprobación final → arranque del bucle-agéntico para implementar
