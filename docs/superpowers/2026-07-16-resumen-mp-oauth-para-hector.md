# Conectar MercadoPago por link — resumen para Héctor

**Fecha:** 2026-07-16 · **Hecho por:** Gabriel · **Estado:** en producción, falta la prueba con plata real

---

## Qué problema resolvía

El cobro de recetas por WhatsApp ya funcionaba, pero **no había forma de que un médico conectara su
cuenta**. El token se sembraba a mano con `scripts/seed-mp-conexion.mjs` — o sea que cada médico
tendría que pasarnos su Access Token, que es la llave de su caja. Impensable.

Era el **"Task 13, diferible"** del plan de la Fase 1 (`2026-06-09-whatsapp-fase1-recetas.md`). El
agujero ya se notaba en producción: el bot le decía al paciente *"avisale a tu médico que debe
conectarlo desde MediCuenta"* (`agent/tools.ts:82`) y el panel mostraba un ✓/✗ de MercadoPago
**sin ningún botón**. La app prometía una pantalla que no existía.

## Qué se hizo

El médico ahora conecta **con un clic** desde `/consultorio/config` → Conexiones. Autoriza en
MercadoPago (nunca vemos su usuario ni su contraseña) y volvemos con su token, **cifrado y con
refresh_token** — el sembrado a mano no lo tenía, así que no se podía renovar solo.

La sección Conexiones muestra los tres estados reales: **sin conectar** (con el botón),
**conectado** y **hay que reconectar** (cuando venció el permiso y el cobro está pausado).

**Código nuevo:** `src/lib/mercadopago/oauth.ts` (+6 tests) · `src/app/api/mercadopago/oauth/`
(inicio + callback) · `desconectarMercadoPago()` · `src/shared/components/ui/confirm-dialog.tsx`.
**Spec y plan:** `docs/superpowers/specs/2026-07-13-mp-oauth-conectar-design.md` y su plan.

## Bugs que aparecieron en el camino (y se arreglaron)

| Bug | Por qué importaba |
|---|---|
| **`getConfig` filtraba `estado='conectado'`** | Una conexión vencida (`reconectar`) se veía **igual que "nunca conectó"**. El médico dejaba de cobrar sin entender por qué. Ahora la UI avisa que el cobro está pausado. |
| **Las rutas OAuth chequeaban sesión, no dueño** | Lo marcó tu nota, y era real: con el #13 la **secretaria** tiene sesión y entra a la config; si tocaba Conectar, ataba una conexión MP **bajo su propio id**. No robaba plata, pero dejaba basura y le mentía. Ahora usan `resolverConsultorio` + `esDueño`. |
| **Los redirects usaban el origin del request** | Detrás de un túnel/proxy daba `https://localhost:3000` (roto). Ahora usan `siteUrl()`. |
| **`window.confirm` nativo** | Se hizo un `ConfirmDialog` reutilizable, aplicado a desconectar MP y revocar secretaria. Quedan 6 `window.confirm` en otras features, sin migrar. |

## Qué está verificado (y cómo)

Todo esto se probó **contra la API real de MercadoPago**, con cuentas sandbox:

- ✅ **El médico conecta**: token guardado **cifrado**, con refresh_token, vence 2027-01-10.
- ✅ **El token sirve de verdad**: responde `/users/me`, y **generó un link de pago real** — es la
  llamada exacta que hace `cobrar_receta` para cobrar.
- ✅ **El webhook funciona con datos reales**: descifró el token del OAuth, consultó un pago real en
  MP, y la validación lo **rechazó** correctamente por referencia ajena (la guarda que impide
  liberar una receta con el pago de otra cosa).
- ✅ **Desconectar** funciona.
- ✅ 405 tests, typecheck limpio, build ok. Mergeado a `main` y **desplegado a producción**.

## Qué NO está verificado (y por qué)

- ❌ **El pago aprobado de una receta propia.** El sandbox de MercadoPago lo bloquea: por API tira
  *"Invalid users involved"*, y por checkout pide un código de email que a las cuentas
  `@testuser.com` nunca llega. **No es del código** — está cubierto por tests unitarios — es una
  limitación del entorno de pruebas de MP.
- ❌ **La entrega del PDF por WhatsApp**, que necesita la configuración de Meta (lista de
  destinatarios + webhook apuntando al entorno de prueba).

**Ambas se cierran con una sola prueba real en producción:** un médico conecta, un paciente pide una
receta y paga $100 de verdad. Si el PDF llega solo, está todo cerrado.

## Qué falta para dejarlo funcionando

1. **Verificar que las credenciales cargadas en Production sean las de la app del negocio.**
   Comprobación de 10 segundos: tocar **Conectar MercadoPago** y mirar el nombre en la pantalla de
   MP. Si dice **"MediCuenta"** → bien. Si dice **"MediCuenta vPrueba"** → quedaron las de
   desarrollo de Gabriel y hay que reemplazarlas + redesplegar.
2. **La Redirect URI** debe estar registrada idéntica en la app:
   `https://medicuenta-v2.vercel.app/api/mercadopago/oauth/callback`
   (Configuración de la app → Configuraciones avanzadas → URLs de redireccionamiento).
   **Sin activar PKCE** — la implementación no manda `code_verifier` todavía.
3. **Reconectar `admin@medicuenta.com`**: hoy tiene el token pegado a mano, **sin refresh_token**.
   Desconectar + Conectar con el botón lo reemplaza por uno OAuth renovable.
4. **La prueba con plata real** (punto anterior).

## Dos cosas para tener en cuenta

- **Una cuenta no puede autorizar su propia app** (regla de MP). Si la app es de tu cuenta, probá
  con la de un médico. Esto nos costó un rato de diagnóstico.
- **Vercel dedupllica los builds por contenido, no por commit.** Pushear el mismo SHA a una rama y a
  `main` construye solo el de la rama (preview) y **producción no se actualiza** — pasó, y por eso
  las rutas daban 404. Un commit vacío tampoco lo fuerza. Se resuelve con
  `npx vercel deploy --prod`. Y **nunca promover un preview a producción**: arrastraría las
  variables del Preview (credenciales de desarrollo) a producción.

## Sobre el fix de Tailwind (`abc1510`)

La nota sugería que podía haber quedado redundante por el #2. **No lo está**: el #2 pasó a tokens
semánticos **solo `button.tsx`**, pero quedan **33 usos de escalas numéricas en 12 archivos**
(login, signup, `input.tsx`, `select.tsx`, `badge.tsx`). Sin registrarlas en el config, esas clases
siguen sin generar CSS. Se dejó en su propio commit, separado de MercadoPago.

## Lo que sigue: la Pieza B

La otra mitad de MercadoPago es la **suscripción al SaaS** (el médico pagándonos a nosotros). No
lleva OAuth: usa la cuenta MP de la plataforma y la API `preapproval`. Ya tiene spec propio en
`docs/superpowers/specs/2026-07-16-mp-suscripcion-saas-design.md`.
