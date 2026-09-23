-- ============================================================
-- Migración: agrega soporte para HRV (variabilidad de la frecuencia
-- cardiaca) a una base de datos YOLIA que ya existe (con datos como
-- los de María Valencia ya cargados).
--
-- Solo corre esto UNA VEZ. Si ya lo corriste, MySQL te dirá que la
-- columna ya existe — en ese caso no hay nada más que hacer.
-- ============================================================

USE yolia_db;

ALTER TABLE vitals_readings
  ADD COLUMN hrv_ms DECIMAL(6,1) NULL AFTER spo2;

-- Verificación rápida (opcional):
-- DESCRIBE vitals_readings;
