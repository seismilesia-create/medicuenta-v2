# Checklist — probar la suscripción en PRODUCCIÓN con $100

**Fecha:** 2026-07-17 · **Rama:** `feat/f43-suscripcion`

Por qué en producción y no en sandbox: **MercadoPago no soporta credenciales `TEST-` para
Suscripciones** (solo Checkout API/Bricks). Pelear con cuentas de prueba es más frágil que
cobrar $100 de verdad y cancelar.

> ⚠ **El riesgo NO son los $100. Es el precio publicado.** Mientras `precios_planes` tenga
> un monto cargado, **cualquiera de los médicos reales que entre a `/plan` y apriete
> Contratar queda suscripto a ese precio**, con un `preapproval` real y recurrente que en
> MP **cancelar es irreversible**. Hacelo en una ventana corta y volvé el precio a NULL.

---

## Antes de empezar

| | Estado |
|---|---|
| Webhook configurado en el panel de MP (app del jefe), Modo productivo, evento **"Planes y suscripciones"** | ✅ hecho 2026-07-17 |
| `MP_WEBHOOK_SECRET` en Vercel Production | ✅ hecho |
| `CRON_SECRET` en Vercel Production | ✅ hecho |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` de la app **del jefe** en Production | ✅ confirmado por Héctor |
| **Desplegar la rama** | ⬜ |
| Verificar que `PUBLIC_BASE_URL` sea el dominio real y **no un túnel** | ⬜ |

**Si `PUBLIC_BASE_URL` apunta mal, el `back_url` te devuelve a la nada y el webhook no
llega: pagás y no se activa nada.** Es la misma trampa que dejó anotada la Pieza A.

**No hace falta `MP_PLATAFORMA_ACCESS_TOKEN`**: el token se deriva solo del
`client_id`/`client_secret` por `client_credentials` (vence a las 6 h, por eso no se
guarda). Verificado contra la API real: devuelve un `APP_USR-…` con scope
`subs-recurring:pre-approval/read-write` y `GET /preapproval/search` responde 200.

---

## La prueba

### 1. Poner el precio
Panel de superadmin → precio del plan Full = **100**. (El mínimo de MP para cobrar con
tarjeta es $100: menos que eso no cobra.)

### 2. Contratar
Entrar como un médico (usar `rcarrizomaximo@gmail.com`, **nunca** `admin@medicuenta.com`)
→ `/plan` → **Contratar Full** → poner el **email de la cuenta de MP con la que vas a
pagar**.

> 🔴 **Si ese email no coincide con el del pagador real, MP rechaza el pago** con un error
> que no explica nada. Es la trampa D11.

### 3. Pagar
Te redirige a MercadoPago. Poné la tarjeta **allá** (nosotros no la vemos nunca).

> 🔴 **Probablemente no puedas pagarte a vos mismo.** MP bloquea que el pagador sea el
> mismo que cobra — es el *"Invalid users involved"* que ya apareció en la Pieza A. Como
> ahora cobra la cuenta del jefe y pagás con la tuya, deberían ser partes distintas y
> pasar. Si rebota con eso, ese es el motivo.

### 4. Qué mirar, en orden

| Cuándo | Qué tiene que pasar | Dónde |
|---|---|---|
| Al volver del checkout | MP pasa el preapproval a `authorized` → llega `subscription_preapproval` → **`estado='activa'`** | `suscripciones` |
| **~1 hora** después | MP hace el **primer cobro real** → llega `subscription_authorized_payment` → confirma `activa` + `current_period_end` | `suscripciones` |
| En cualquier momento | Los eventos quedan registrados | `mp_eventos_suscripcion` |

**La primera cuota se cobra ~1 h después, no al instante.** No te asustes si no ves el
cobro enseguida.

### 5. 🔴 Cancelar (no te olvides)
`/plan` → **Dar de baja mi suscripción**. Si no, **te debita $100 todos los meses**.
Verificar en MP que quedó `cancelled`.

### 6. Volver el precio a NULL
Para que ningún médico pueda contratar a $100 por accidente.

---

## Si no llega ningún evento

Es el pendiente **D9**, y está sin resolver en la doc de MP: la doc de Suscripciones dice
que *"la configuración desde el panel no está disponible"* y que hay que mandar
`notification_url` al crear… **pero ese parámetro no existe en `POST /preapproval`**, ni en
la referencia ni en el SDK. La doc se contradice sola.

Vamos por el panel porque **sí** ofrece "Planes y suscripciones". Si en la prueba no llega
nada, el plan B es agregar `notification_url` al body de `buildPreapprovalBody` y ver si MP
lo acepta aunque no esté documentado.

**Cómo distinguir "no llegó" de "llegó y falló":** `mp_eventos_suscripcion` solo se escribe
**después** de procesar. Si está vacía Y `suscripciones.estado` no cambió, mirá los logs de
Vercel: si no hay ni una línea de `[mp/sub]`, MP no llamó. Si hay `firma inválida`, llamó y
el secreto no coincide.

---

## Consultas útiles

```sql
-- Cómo quedó la suscripción
select medico_id, plan, estado, mp_subscription_id, mp_preapproval_status,
       mp_payer_email, current_period_end, ultimo_evento_mp
from suscripciones where mp_subscription_id is not null;

-- Qué eventos procesamos
select * from mp_eventos_suscripcion order by procesado_at desc limit 20;

-- Que el precio haya vuelto a NULL
select * from precios_planes;
```

---

## Después de la prueba, anotar

- ¿Llegaron los eventos por el panel? → **cierra D9**.
- ¿MP dejó pagar? ¿Con qué cuenta pagaste?
- ¿Cuánto tardó el primer cobro?
- ¿Qué comisión cobró MP de verdad? (la ayuda dice **6,29% + IVA**, a confirmar) → hace
  falta para cerrar los precios (**D10**).
