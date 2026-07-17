# La suscripción al SaaS

**La otra mitad de MercadoPago: el médico pagándonos a nosotros.**
Continúa el resumen de *Conexiones del consultorio* del 16/07, que terminaba justo acá.

**Fecha:** 17/07/2026 · **Estado:** en producción, cobrando de verdad · **Pendiente clave:** definir los precios

---

> **MediCuenta ya cobra.** Se probó hoy con una suscripción real de $100: se contrató,
> MercadoPago cobró, y el sistema habilitó el acceso solo, sin que nadie tocara nada.
>
> Falta una sola cosa para abrirlo a los médicos, y es una decisión tuya: **cuánto cobramos
> por cada plan**. Hasta que ese número exista, el sistema no deja contratar a nadie — a propósito.

---

## Qué problema resolvía

**MediCuenta no cobraba.** El plan y el estado de cada médico se movían a mano desde el panel
del dueño. No había forma de que un médico pagara, ni consecuencia si dejaba de hacerlo. El
comentario en el código lo decía literal: *«Hasta que entre MercadoPago, el dueño maneja el
plan/estado a mano»*.

Había además una mitad invisible del problema: el sistema **guardaba** si un médico estaba al
día, moroso o suspendido… pero **no lo usaba para nada**. Un médico marcado como suspendido
entraba exactamente igual que uno que pagaba.

---

## Cómo funciona ahora

El recorrido completo de un médico, de que se registra a que paga o se va:

1. **Se registra y arranca probando.** 14 días con el plan Full entero desbloqueado. **Sin
   pedirle tarjeta.** La prueba se crea sola en el momento del alta: nadie tiene que acordarse
   de habilitarla.

2. **Se le avisa, y el aviso se pone serio solo.** Los primeros diez días, un cartel discreto
   arriba: «te quedan 9 días». Los últimos cuatro, además un cartel en el medio de la pantalla,
   una vez por día: «¡últimos 3 días!». El último día pasa a rojo.

3. **Día 15 sin pagar: queda afuera.** No entra a nada — ni facturación, ni agenda, ni WhatsApp.
   Solo ve la pantalla de planes. **Sus datos quedan intactos** y se lo decimos, para que la
   decisión sea «pago o no pago», no «pierdo lo que cargué».

4. **Contrata y paga en MercadoPago.** Elige plan, lo mandamos a MercadoPago y carga la tarjeta
   **allá**: nosotros no la vemos nunca. Cuando MercadoPago confirma, el acceso se le habilita solo.

5. **Si un mes no se le puede cobrar.** Sigue trabajando, con un cartel rojo que no se puede
   cerrar, mientras MercadoPago reintenta el cobro (cuatro intentos en unos diez días). Si se
   agotan, ahí sí queda afuera. La idea: una tarjeta vencida un martes no le corta el sistema a
   un médico que paga.

6. **Se da de baja cuando quiere.** Desde su pantalla de plan, sin llamar a nadie. Se corta el
   débito automático y sus datos quedan guardados por si vuelve.

---

## La prueba con plata real

Se hizo hoy, en producción, de punta a punta. Se eligió probar con plata real y no con el
entorno de pruebas porque **MercadoPago no ofrece entorno de pruebas para suscripciones**: es el
mismo obstáculo que dejó abierta la verificación de la Pieza 1 en el documento anterior.

| | |
|---|---|
| **$100** | cobrado de verdad |
| **2 minutos** | tardó el cobro (la documentación decía ~1 hora) |
| **17/08** | próximo cobro, calculado solo |

**Qué quedó verificado:**

- ✓ Un médico bloqueado por prueba vencida **contrató, pagó, y el sistema lo dejó entrar solo**.
  Nadie tocó la base de datos.
- ✓ **MercadoPago nos avisa.** Era la duda más grande: su propia documentación se contradice
  sobre si avisa para suscripciones. Avisa.
- ✓ El médico puede pagar con **una cuenta de MercadoPago distinta** a su email de MediCuenta —
  el caso normal, porque casi todos tienen una cuenta personal vieja.
- ✓ Sin precio cargado, **nadie puede contratar**. La pantalla lo dice en vez de dejar un botón muerto.

> **Falta cerrar — cuánto nos cobra MercadoPago.** Su tabla de ayuda dice 6,29% + IVA, pero sin
> confirmar. Con esta primera cobranza real ya se puede mirar cuánto entró neto de los $100 — y
> ese número hace falta para fijar los precios con datos y no con estimaciones.

---

## Cuatro cosas rotas que aparecieron en el camino

El mismo patrón del documento anterior, pero más profundo: **código escrito, probado y
correcto… que nunca se ejecutó**. No fallaba: simplemente no estaba. Y eso no se nota, porque
«no pasa nada» se parece mucho a «no hay novedades».

| Qué estaba roto | Por qué importaba |
|---|---|
| **El control de acceso nunca se ejecutó** *(desde siempre)* | El archivo que revisa quién entra a dónde estaba **una carpeta más arriba de donde el sistema lo busca**. Existía, estaba bien escrito, y nunca se cargó. Consecuencia real: una secretaria que escribía la dirección de Facturación a mano, **entraba**. No hubo fuga de datos — la base tiene su propia protección y esa sí funcionaba — pero la capa de arriba no existía. **Ya está arreglado y activo.** |
| **El resumen diario nunca te llegó** *(desde siempre)* | Faltaba una clave de seguridad, así que la tarea diaria que arma tus alertas **venía siendo rechazada todos los días**. Nunca recibiste un solo resumen: ni errores de médicos, ni WhatsApp caídos, ni pruebas por vencer. Y no avisaba de nada — simplemente no llegaba nada. **Ya está arreglado; hoy corrió por primera vez.** |
| **El estado no bloqueaba nada** | El sistema guardaba «moroso» o «suspendido» y no los usaba para decidir el acceso. Sin esto, cobrar no habría servido de nada: dejar de pagar no tenía consecuencia. |
| **Nadie creaba la prueba gratis** | Un médico nuevo quedaba sin período de prueba y con el plan más chico. La prueba solo arrancaba si alguien la habilitaba a mano. |

> **Honestidad.** El mismo error se cometió **hoy, en este trabajo**: se escribió la función
> para cambiar los precios y no se hizo la pantalla. Salió a la luz recién cuando Héctor fue a
> cargar un precio y no había dónde. Ya está hecha — pero vale anotarlo, porque el patrón es más
> fácil de repetir que de ver.

---

## Las reglas que se decidieron

| Decisión | Por qué |
|---|---|
| **Prueba de 14 días, plan Full, sin tarjeta** | Que pruebe todo lo bueno antes de pagar. Pedir tarjeta por adelantado espanta, y además nos habría obligado a manejar los datos de la tarjeta nosotros. |
| **Día 15 sin pagar: bloqueo total** | Si no bloquea, la prueba no es una prueba: es un regalo indefinido. |
| **Impago: dejamos reintentar a MercadoPago** | Un rechazo puntual no le corta el sistema a un médico que sí paga. Solo queda afuera si el cobro falla de verdad, después de ~10 días. |
| **Precio fijo en pesos, editable sin programar** | En Argentina el precio se lo come la inflación. Se cambia desde el panel del dueño, sin depender de nadie. |

---

## Lo que falta — y es tuyo

> **Decisión 1 · bloquea todo lo demás — cuánto cobramos.** El diseño original hablaba de
> US$ 25-30 el plan Básico y US$ 55-65 el Full, marcados «a afinar con costos». MercadoPago
> cobra en pesos, así que hay que bajarlo a un número concreto — descontando su comisión, y
> sabiendo que el mínimo que MercadoPago acepta cobrar con tarjeta es $100.
>
> Se carga desde el panel del dueño, en dos campos. La pantalla te muestra **cuánto te queda
> neto** después de la comisión, que es el error fácil: fijar el precio mirando el número de arriba.

> **Decisión 2 · qué hacemos con los médicos que ya están.** Los cuatro actuales quedaron con
> acceso completo y sin cobro — no se les tocó nada a propósito. Hay que decidir si se los migra
> a pago, cuándo, y si se les respeta alguna condición por haber sido los primeros.

**Para saber — subir el precio no afecta a quien ya está pagando.** El precio nuevo aplica a
quien contrate desde ese momento; las suscripciones andando siguen con el suyo. Cambiarlas
requiere avisarle a MercadoPago una por una, y no está confirmado si eso obliga al médico a
autorizar de nuevo — o sea que un aumento masivo podría hacer que algunos dejen de pagar sin
querer. Es un tema abierto, para cuando haga falta.

---

*MediCuenta · La suscripción al SaaS · 17/07/2026 · Continúa el resumen de Conexiones del
consultorio (16/07). El detalle técnico está en
`docs/superpowers/specs/2026-07-16-mp-suscripcion-saas-design.md`.*
