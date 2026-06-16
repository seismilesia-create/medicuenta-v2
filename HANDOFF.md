# HANDOFF — MediCuenta V2 — 2026-06-16 (madrugada)

> Sesión larga. DOS cosas: (1) se **VALIDÓ el E2E del bot WhatsApp en prod** (estaba bloqueado), y
> (2) se **diseñó + speceó el Panel de onboarding de médicos** (PENDIENTE de implementar).
> Se retoma **MAÑANA TEMPRANO**. Sin código nuevo de la app esta sesión (diagnóstico + config Meta + specs + memoria).

---

## 0. Estado actual
- **Tarea en curso**: **Panel de onboarding de médicos** — spec aprobado y commiteado (`9ddffba`); falta el PLAN y la implementación.
- **Estado**: spec done; próximo = revisar spec → `writing-plans` → bucle-agentico.
- **Branch**: `feat/whatsapp-recetas-turnos` (= `origin/main` = prod, salvo los commits de docs). **Pusheado.**
- **Último commit ANTES de este handoff**: `9ddffba` *docs(spec): panel de onboarding*.

---

## 1. ⭐ PRIMEROS PASOS MAÑANA (en orden)
1. **Supabase a plan pago.** Héctor va a poner la base paga. **Pregunta a resolver: ¿upgradear el MISMO proyecto (`eylcrxhpccwobipcjzal`) o crear uno nuevo?** → **Lean de Claude: upgradear el mismo, in-place** (conserva datos, schema, migraciones y env vars; uno nuevo obliga a migrar todo + re-apuntar Vercel). Confirmar antes de tocar.
2. **Panel de onboarding**: que Héctor revise el spec → invocar `writing-plans` → implementar por fases.

---

## 2. Lo que se hizo esta sesión

### A. Bot WhatsApp — E2E VALIDADO en prod ✅
- El bloqueador era el **Callback URL de Meta** apuntando a una URL de prueba (NO env vars, NO código). **Fix**: Callback URL de prod (`…/api/whatsapp`) + verify token = `WHATSAPP_VERIFY_TOKEN` + suscribir el campo `messages`.
- **Médico** (`precio`, `recetas`) ✅ · **Paciente** (se presenta como asistente del Dr. Martínez) ✅ · **Turno agendado end-to-end** ✅ (Federico Ravetti, datos completos, `origen=bot`).
- **Cobro de receta**: validado en LOCAL; el E2E con MercadoPago **real** se difiere al 1er médico real con infra paga. El MP del piloto es CUENTA DE PRUEBA.
- **Display name** "Asistente MediCuenta": bien configurado, pero NO aparece en el header del chat porque la cuenta no está verificada (tilde azul "Enviar solicitud") — se difiere (negocio nuevo, Meta puede rechazar).
- Checkpoint previo del E2E: `95a9458`.

### B. Panel de onboarding de médicos — DISEÑADO (spec listo)
- **Spec**: `docs/superpowers/specs/2026-06-16-panel-onboarding-medicos-design.md` (`9ddffba`). **Empezar por acá mañana.**
- Decisiones: admin hace todo (llave en mano); alcance = **cuenta + identidad + servicio "Consulta" + cableado WhatsApp** (horarios/asistente quedan en `/consultorio/config`); acceso por **invitación email**; **nodo+slug automáticos** editables; enfoque A (formulario único + lista con "reintentar").

---

## 3. Decisiones / gotchas (no repetir)
- **✓✓ entregado NO garantiza que el webhook procese** (puede ser el Callback URL mal). Diagnóstico decisivo: `wa_eventos_webhook` en 0 + **cero `POST /api/whatsapp`** en `vercel logs --since` a pesar de ✓✓.
- **Probar el flujo paciente desde el nº del MÉDICO no sirve** (lo toma como médico por `esRemitenteMedico`). Usar OTRO número.
- **Onboarding HOY es semi-manual**: el cableado de WhatsApp + el servicio requieren SQL/script. El panel mata eso. Hoy el único "médico" es la cuenta `admin@medicuenta.com` (rol `admin`+superadmin); no hay `rol='medico'` real todavía.

---

## 4. Próximo paso concreto
Mañana: (1) confirmar y hacer el upgrade de Supabase (lean: mismo proyecto); (2) revisar el spec del panel → `writing-plans` → arrancar la implementación por fases.

---

## 5. Comandos para verificar estado al retomar
```bash
git status        # limpio, en feat/whatsapp-recetas-turnos
git log -3        # último: 9ddffba docs(spec) panel onboarding
curl -i https://medicuenta-v2.vercel.app/c/dr-prueba   # 302 (el bot sigue vivo)
```

---

## 6. Archivos clave para releer
- `docs/superpowers/specs/2026-06-16-panel-onboarding-medicos-design.md` — **EL SPEC, empezar acá.**
- `middleware.ts` — guards por rol (`es_superadmin` → `/admin`).
- `src/actions/perfil.ts`, `src/actions/consultorio-secretaria.ts` — patrones de server actions + `perfiles`.
- `supabase/migrations/20260614_fase1_nodos_dinamicos.sql` — `wa_nodos` / `wa_asignaciones`.

---

## 7. Notas contextuales
- Tablas del panel: `perfiles`, `wa_servicios`, `wa_asignaciones`, `wa_nodos`. Modelo **NODOS** (no el legacy `wa_canales`).
- **Riesgos del spec a confirmar**: SMTP para los emails de invitación (Supabase default es limitado → Resend); página de "aceptar invitación" (`type=invite`).
- Pendientes viejos: probar **rol secretaria**; seguridad §6 (sacar `WA_TOKEN_TMP`, rotar token); **Fase 5 Suscripciones**.
- Repo: `main` LOCAL desincronizado (commits "Auto-backup"); no afecta prod, ordenar algún día.
