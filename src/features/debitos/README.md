# Feature: Débitos

Gestión de débitos aplicados por obras sociales a las órdenes médicas.

## Descripción

Los débitos son descuentos o rechazos que las obras sociales aplican a las órdenes presentadas por diversas razones (falta de documentación, errores administrativos, etc.). Esta feature permite registrar, categorizar y hacer seguimiento de todos los débitos.

## Estructura de Archivos

```
src/features/debitos/
├── types/
│   └── debitos.ts           # Tipos, interfaces y schemas Zod
├── components/
│   ├── DebitosStats.tsx     # 4 tarjetas de estadísticas
│   ├── DebitosTable.tsx     # Tabla principal con filtros
│   ├── NuevoDebitoForm.tsx  # Formulario de creación
│   ├── MotivoDebitoBadge.tsx # Badge con colores por motivo
│   └── index.ts             # Barrel export
```

## Componentes

### 1. DebitosStats
**Ubicación:** `components/DebitosStats.tsx`

Muestra 4 tarjetas con estadísticas clave:
- Total debitado este mes
- Total debitado últimos 3 meses
- Porcentaje sobre facturación total
- Motivo más frecuente

**Props:** Ninguna (auto-fetch de datos)

**Ejemplo de uso:**
```tsx
import { DebitosStats } from '@/features/debitos/components'

export default function DebitosPage() {
  return <DebitosStats />
}
```

### 2. DebitosTable
**Ubicación:** `components/DebitosTable.tsx`

Tabla principal con listado de débitos.

**Características:**
- Ordenado por fecha descendente
- Filtro por motivo
- Columnas: Fecha, Motivo (badge), Detalle, Monto, Refacturable
- Empty state
- Loading state
- Botón "Nuevo Débito"

**Props:** Ninguna (auto-fetch de datos)

### 3. NuevoDebitoForm
**Ubicación:** `components/NuevoDebitoForm.tsx`

Formulario para crear un nuevo débito.

**Campos:**
- Motivo (select, requerido)
- Detalle del motivo (text, opcional)
- Monto (number, requerido)
- Fecha (date, requerido, default: hoy)
- Refacturable (checkbox)

**Lógica especial:**
Los débitos con motivos `falta_token`, `falta_firma`, `falta_diagnostico` o `error_codigo` se marcan automáticamente como refacturables en el backend.

### 4. MotivoDebitoBadge
**Ubicación:** `components/MotivoDebitoBadge.tsx`

Badge con colores específicos por motivo.

**Props:**
```typescript
interface Props {
  motivo: MotivoDebito
}
```

**Colores:**
- `falta_token`: Rojo
- `falta_firma`: Naranja
- `falta_diagnostico`: Amarillo
- `no_autorizada`: Púrpura
- `error_codigo`: Azul
- `otro`: Gris

## Tipos

### MotivoDebito
```typescript
type MotivoDebito =
  | 'falta_token'
  | 'falta_firma'
  | 'falta_diagnostico'
  | 'no_autorizada'
  | 'error_codigo'
  | 'otro'
```

### Debito
```typescript
interface Debito {
  id: string
  medico_id: string
  orden_id: string | null
  liquidacion_id: string | null
  motivo: MotivoDebito
  motivo_detalle: string | null
  monto: number
  refacturable: boolean
  refacturado: boolean
  fecha: string
  created_at: string
}
```

## Server Actions

### createDebito
**Archivo:** `src/actions/debitos.ts`

Crea un nuevo débito en la base de datos.

**Parámetros:**
```typescript
type DebitoFormData = {
  motivo: MotivoDebito
  motivo_detalle?: string
  monto: number
  refacturable: boolean
  fecha: string
}
```

**Validaciones:**
- Autenticación requerida
- Validación con Zod schema
- Monto debe ser >= 0
- Auto-marca refacturable según motivo

**Retorno:**
- `{ error: string }` si hay error
- Redirect a `/debitos` si es exitoso

## Base de Datos

### Tabla: debitos

```sql
CREATE TABLE debitos (
  id UUID PRIMARY KEY,
  medico_id UUID REFERENCES auth.users(id),
  orden_id UUID REFERENCES ordenes(id) NULL,
  liquidacion_id UUID REFERENCES liquidaciones(id) NULL,
  motivo TEXT NOT NULL CHECK (motivo IN (...)),
  motivo_detalle TEXT,
  monto DECIMAL(10,2) NOT NULL,
  refacturable BOOLEAN DEFAULT false,
  refacturado BOOLEAN DEFAULT false,
  fecha DATE NOT NULL,
  created_at TIMESTAMP
)
```

**RLS Policies:**
- Los médicos solo ven sus propios débitos
- Los médicos solo pueden crear/editar/borrar sus propios débitos

**Índices:**
- `medico_id`
- `fecha`
- `motivo`
- `refacturable` (parcial, solo true)

## Rutas

### `/debitos`
**Archivo:** `src/app/(main)/debitos/page.tsx`

Página principal con estadísticas y tabla.

**Metadata:**
```typescript
title: 'Débitos | MediCuenta'
```

### `/debitos/nuevo`
**Archivo:** `src/app/(main)/debitos/nuevo/page.tsx`

Página de creación de débito con formulario.

**Metadata:**
```typescript
title: 'Nuevo Débito | MediCuenta'
```

## Estilos

Todos los componentes usan CSS variables para theming:

```typescript
// Variables disponibles
var(--color-foreground)  // Texto principal
var(--color-muted)       // Texto secundario
var(--color-surface)     // Fondo de cards
var(--color-border)      // Bordes
var(--color-primary)     // Color primario
var(--color-error)       // Rojo (para montos negativos)
var(--color-warning)     // Amarillo
var(--color-success)     // Verde
```

## Accesibilidad

- HTML semántico (table, thead, tbody)
- Labels asociados a inputs
- Estados de loading y empty
- Contraste de colores WCAG AA
- Navegación por teclado funcional

## Ejemplo de Uso Completo

```tsx
// En una página
import { DebitosStats, DebitosTable } from '@/features/debitos/components'

export default function DebitosPage() {
  return (
    <div className="p-6 space-y-6">
      <DebitosStats />
      <DebitosTable />
    </div>
  )
}
```

## Consideraciones de Negocio

1. **Refacturable vs No Refacturable:**
   - Refacturable: Errores corregibles (falta documentación, errores de código)
   - No refacturable: Rechazos definitivos (no autorizada)

2. **Tracking:**
   - Campo `refacturado` permite marcar débitos ya corregidos
   - Útil para reportes de eficiencia

3. **Asociación con Ordenes:**
   - Futuro: Vincular débitos con órdenes específicas
   - Actualmente: Solo registro manual

## Testing

Para probar la feature:

1. Navega a `/debitos`
2. Haz clic en "Nuevo Débito"
3. Completa el formulario
4. Verifica que aparece en la tabla
5. Prueba los filtros por motivo
6. Verifica las estadísticas

## Próximos Pasos (Futuro)

- [ ] Vincular débitos con órdenes específicas
- [ ] Marcar débitos como refacturados
- [ ] Gráficos de evolución de débitos
- [ ] Alertas automáticas por débitos frecuentes
- [ ] Export a CSV/PDF
