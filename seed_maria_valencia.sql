-- ============================================================
-- YOLIA — Datos de prueba: María Valencia
-- Paciente de 79 años, nacida el 23/dic/1946.
-- Diagnósticos: EPOC (enfermedad pulmonar obstructiva crónica)
--               y diabetes tipo 2 muy bien controlada.
--
-- Crea también su cuidadora y su médico tratante.
-- Ejecutar completo, de una sola vez, en MySQL Workbench o phpMyAdmin.
--
-- Contraseñas de prueba (ya están hasheadas correctamente con
-- bcrypt, funcionan directo con /auth/login):
--   Cuidadora  -> cuidadora.maria@yolia.com   / Cuidador123
--   Doctor     -> doctor.pulmonar@yolia.com   / Doctor123
--   María      -> maria.valencia@yolia.com    / Maria123
-- ============================================================

USE yolia_db;
START TRANSACTION;

-- ---------- 1. Usuarios ----------

INSERT INTO users (full_name, email, password_hash, role, phone) VALUES
('Renata Valencia', 'cuidadora.maria@yolia.com',
 '$2a$10$cP.4h3/LYwi4kSsvTOJlSOjMXDuTp7hQTlObspZK2SjjML0wUye8i',
 'caregiver', '5512345678');
SET @caregiver_id = LAST_INSERT_ID();

INSERT INTO users (full_name, email, password_hash, role, phone) VALUES
('Dr. Ignacio Ramírez', 'doctor.pulmonar@yolia.com',
 '$2a$10$p3/BUeoJvVyNsPiGrWcOjeCKG9f.fXApHyfohD0Ac3oGi9zf2XMaq',
 'doctor', '5598765432');
SET @doctor_id = LAST_INSERT_ID();

INSERT INTO users (full_name, email, password_hash, role, phone) VALUES
('María Valencia', 'maria.valencia@yolia.com',
 '$2a$10$jgm.oReaPwM8FLlwLHOdY.paRdu3evS.3FrL.ZTRK7qFegZR9y3NC',
 'elderly', '5511122233');
SET @maria_user_id = LAST_INSERT_ID();

-- ---------- 2. Perfil clínico ----------

INSERT INTO patients
  (user_id, birth_date, sex, blood_type, height_cm, weight_kg, address,
   emergency_contact_name, emergency_contact_phone, allergies, chronic_conditions)
VALUES
  (@maria_user_id, '1946-12-23', 'F', 'O+', 156.0, 61.5,
   'Calle Framboyanes 45, San José Iturbide, Guanajuato',
   'Renata Valencia (hija)', '5512345678',
   'Penicilina',
   'EPOC (enfermedad pulmonar obstructiva crónica), Diabetes tipo 2 (muy bien controlada)');
SET @maria_patient_id = LAST_INSERT_ID();

-- ---------- 3. Equipo de atención ----------

INSERT INTO patient_caregivers (patient_id, caregiver_id, relationship, is_primary)
VALUES (@maria_patient_id, @caregiver_id, 'Hija', 1);

INSERT INTO patient_doctors (patient_id, doctor_id, specialty, is_primary)
VALUES (@maria_patient_id, @doctor_id, 'Neumología', 1);

-- ---------- 4. Medicamentos activos ----------

-- Broncodilatador de mantenimiento (EPOC), 1 vez al día
INSERT INTO medications
  (patient_id, prescribed_by, name, dosage, frequency_hours, instructions, start_date, is_active)
VALUES
  (@maria_patient_id, @doctor_id, 'Tiotropio (Spiriva)', '18 mcg, 1 inhalación', 24,
   'Inhalar por la mañana, siempre a la misma hora', '2026-06-01', 1);
SET @med_tiotropio = LAST_INSERT_ID();
INSERT INTO medication_schedule (medication_id, time_of_day) VALUES (@med_tiotropio, '08:00:00');

-- Inhalador de rescate (EPOC)
INSERT INTO medications
  (patient_id, prescribed_by, name, dosage, frequency_hours, instructions, start_date, is_active)
VALUES
  (@maria_patient_id, @doctor_id, 'Salbutamol', '2 inhalaciones', 8,
   'Usar si hay dificultad para respirar; no exceder la dosis indicada', '2026-06-01', 1);
SET @med_salbutamol = LAST_INSERT_ID();
INSERT INTO medication_schedule (medication_id, time_of_day) VALUES
  (@med_salbutamol, '08:00:00'), (@med_salbutamol, '16:00:00'), (@med_salbutamol, '23:00:00');

-- Metformina (diabetes, bien controlada)
INSERT INTO medications
  (patient_id, prescribed_by, name, dosage, frequency_hours, instructions, start_date, is_active)
VALUES
  (@maria_patient_id, @doctor_id, 'Metformina', '850 mg', 12,
   'Tomar con alimentos', '2026-05-15', 1);
SET @med_metformina = LAST_INSERT_ID();
INSERT INTO medication_schedule (medication_id, time_of_day) VALUES
  (@med_metformina, '08:00:00'), (@med_metformina, '20:00:00');

-- Algunas tomas ya registradas (para que el historial no se vea vacío)
INSERT INTO medication_intake_log (medication_id, scheduled_for, taken, taken_at, marked_by) VALUES
  (@med_tiotropio, '2026-08-09 08:00:00', 1, '2026-08-09 08:05:00', @caregiver_id),
  (@med_metformina, '2026-08-09 08:00:00', 1, '2026-08-09 08:10:00', @maria_user_id),
  (@med_metformina, '2026-08-08 20:00:00', 1, '2026-08-08 20:15:00', @maria_user_id),
  (@med_salbutamol, '2026-08-09 08:00:00', 1, '2026-08-09 08:20:00', @caregiver_id);

-- ---------- 5. Estudios médicos ----------

INSERT INTO medical_studies
  (patient_id, requested_by, study_type, study_date, results, notes)
VALUES
  (@maria_patient_id, @doctor_id, 'Espirometría', '2026-07-15',
   'FEV1/FVC 58%. Obstrucción moderada, sin cambios significativos respecto al estudio previo.',
   'Continuar tratamiento broncodilatador actual. Revalorar en 6 meses.'),
  (@maria_patient_id, @doctor_id, 'Hemoglobina glucosilada (HbA1c)', '2026-07-15',
   '6.3%. Dentro de meta de control para paciente con diabetes tipo 2.',
   'Buen control glucémico. Mantener dosis actual de metformina.'),
  (@maria_patient_id, @doctor_id, 'Radiografía de tórax', '2026-06-20',
   'Sin infiltrados ni consolidaciones. Hiperinsuflación leve compatible con EPOC.',
   'Sin datos de exacerbación aguda ni proceso infeccioso.');

-- ---------- 6. Dispositivo de monitoreo (ESP-32) ----------

INSERT INTO devices (patient_id, device_type, mac_address, status, last_seen_at)
VALUES (@maria_patient_id, 'ESP32', 'AA:BB:CC:00:11:22', 'online', NOW());
SET @maria_device_id = LAST_INSERT_ID();

-- ---------- 7. Evento de caída (ya resuelto, para historial) ----------

INSERT INTO fall_events
  (patient_id, device_id, detected_at, severity, status, resolved_by, resolved_at, notes)
VALUES
  (@maria_patient_id, @maria_device_id, '2026-08-05 17:42:00', 'low', 'resolved',
   @caregiver_id, '2026-08-05 17:50:00',
   'Falsa alarma: se agachó rápido a recoger algo. Se confirmó que estaba bien.');

-- ---------- 8. Signos vitales — 1 semana, 3 mediciones diarias ----------

INSERT INTO vitals_readings
  (patient_id, heart_rate, spo2, temperature_c, systolic_bp, diastolic_bp, source, recorded_at)
VALUES
  (@maria_patient_id, 72, 93, 36.4, 118, 79, 'manual', '2026-08-03 08:00:00'),
  (@maria_patient_id, 88, 94, 36.3, 121, 70, 'manual', '2026-08-03 14:30:00'),
  (@maria_patient_id, 81, 91, 36.2, 117, 78, 'manual', '2026-08-03 20:00:00'),
  (@maria_patient_id, 76, 93, 36.6, 127, 70, 'manual', '2026-08-04 08:00:00'),
  (@maria_patient_id, 85, 94, 36.4, 116, 81, 'manual', '2026-08-04 14:30:00'),
  (@maria_patient_id, 74, 92, 36.3, 128, 77, 'manual', '2026-08-04 20:00:00'),
  (@maria_patient_id, 85, 94, 36.5, 130, 75, 'manual', '2026-08-05 08:00:00'),
  (@maria_patient_id, 87, 93, 36.6, 128, 77, 'manual', '2026-08-05 14:30:00'),
  (@maria_patient_id, 73, 94, 36.3, 119, 71, 'manual', '2026-08-05 20:00:00'),
  (@maria_patient_id, 74, 92, 36.4, 124, 74, 'manual', '2026-08-06 08:00:00'),
  (@maria_patient_id, 76, 92, 36.4, 129, 78, 'manual', '2026-08-06 14:30:00'),
  (@maria_patient_id, 75, 93, 36.6, 117, 75, 'manual', '2026-08-06 20:00:00'),
  (@maria_patient_id, 84, 95, 36.5, 125, 80, 'manual', '2026-08-07 08:00:00'),
  (@maria_patient_id, 76, 94, 36.2, 119, 73, 'manual', '2026-08-07 14:30:00'),
  (@maria_patient_id, 89, 91, 36.7, 119, 78, 'manual', '2026-08-07 20:00:00'),
  (@maria_patient_id, 88, 92, 36.5, 118, 73, 'manual', '2026-08-08 08:00:00'),
  (@maria_patient_id, 77, 93, 36.6, 128, 75, 'manual', '2026-08-08 14:30:00'),
  (@maria_patient_id, 90, 91, 36.5, 115, 71, 'manual', '2026-08-08 20:00:00'),
  (@maria_patient_id, 83, 91, 36.7, 121, 71, 'manual', '2026-08-09 08:00:00'),
  (@maria_patient_id, 90, 92, 36.5, 130, 80, 'manual', '2026-08-09 14:30:00'),
  (@maria_patient_id, 85, 91, 36.6, 123, 73, 'manual', '2026-08-09 20:00:00');

COMMIT;

-- ============================================================
-- Verificación rápida (opcional, puedes correr esto después):
-- SELECT * FROM patients WHERE id = @maria_patient_id;
-- SELECT COUNT(*) AS lecturas_vitales FROM vitals_readings WHERE patient_id = @maria_patient_id;
-- ============================================================
