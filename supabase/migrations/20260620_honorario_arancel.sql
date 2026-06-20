-- Item 3: honorario auto-calculado desde el arancel vigente.
-- Aditiva, no destructiva. Sin uso hasta mergear el código.

-- Categoría arancelaria del médico (write admin-only; el self-edit del médico NO la toca).
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS categoria_arancel text;        -- 'comun' | 'especialista' | 'oftalmologica'
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS recertificado    boolean NOT NULL DEFAULT false;
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS atiende_interior boolean NOT NULL DEFAULT false;

-- % de recargo de interior, time-varying por OS/vigencia (NULL = 0%).
ALTER TABLE aranceles_os ADD COLUMN IF NOT EXISTS recargo_interior_pct numeric;
