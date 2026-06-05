-- Unificación: las cirugías (foja quirúrgica) pasan a ser órdenes de Nivel 2.
-- Idempotente.

alter table ordenes
  add column if not exists nivel smallint not null default 1,
  -- Nivel 2 (foja quirúrgica): la cirugía PRINCIPAL reutiliza codigo_practica /
  -- nombre_practica / honorario_calculado. Acá van la ADICIONAL y el rol.
  add column if not exists cirugia_adicional            text,
  add column if not exists cirugia_adicional_codigo     text,
  add column if not exists cirugia_adicional_honorario  numeric(12,2),
  add column if not exists rol_medico                   text;

comment on column ordenes.nivel is '1 = consulta/práctica ambulatoria (foto). 2 = foja quirúrgica (voz).';
comment on column ordenes.cirugia_adicional is 'Nivel 2: descripción de la cirugía adicional';
comment on column ordenes.cirugia_adicional_codigo is 'Nivel 2: código de nomenclador de la cirugía adicional';
comment on column ordenes.cirugia_adicional_honorario is 'Nivel 2: honorario de la cirugía adicional';
comment on column ordenes.rol_medico is 'Nivel 2: cirujano_principal | ayudante';
