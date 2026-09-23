-- ============================================================
-- YOLIA - Esquema de base de datos (MySQL 8+)
-- Este archivo es SOLO DE REFERENCIA para confirmar que coincide con
-- lo que ya tienes corriendo en tu WampServer. NO necesitas volver a
-- ejecutarlo si tu base de datos ya existe y funciona — hacerlo de
-- nuevo fallaría porque las tablas ya existen (a menos que quieras
-- recrear todo desde cero).
-- ============================================================

CREATE DATABASE IF NOT EXISTS yolia_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE yolia_db;

-- ------------------------------------------------------------
-- 1. USUARIOS Y AUTENTICACIÓN
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name       VARCHAR(150)  NOT NULL,
  email           VARCHAR(150)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255)  NOT NULL,
  role            ENUM('admin','doctor','caregiver','elderly') NOT NULL,
  phone           VARCHAR(30)   NULL,
  photo_url       VARCHAR(255)  NULL,
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  token_hash   VARCHAR(255) NOT NULL,
  device_info  VARCHAR(255) NULL,
  expires_at   DATETIME     NOT NULL,
  revoked      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_user (user_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 2. PERFIL CLÍNICO DEL ADULTO MAYOR
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patients (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             INT UNSIGNED NOT NULL UNIQUE,
  birth_date          DATE         NULL,
  sex                 ENUM('M','F','O') NULL,
  blood_type          VARCHAR(5)   NULL,
  height_cm           DECIMAL(5,2) NULL,
  weight_kg           DECIMAL(5,2) NULL,
  address             VARCHAR(255) NULL,
  emergency_contact_name  VARCHAR(150) NULL,
  emergency_contact_phone VARCHAR(30)  NULL,
  allergies           TEXT         NULL,
  chronic_conditions  TEXT         NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 3. RELACIONES N:M (paciente <-> cuidadores/médicos)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_caregivers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id    INT UNSIGNED NOT NULL,
  caregiver_id  INT UNSIGNED NOT NULL,
  relationship  VARCHAR(50)  NULL,
  is_primary    TINYINT(1)   NOT NULL DEFAULT 0,
  assigned_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id)   REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (caregiver_id) REFERENCES users(id)    ON DELETE CASCADE,
  UNIQUE KEY uq_patient_caregiver (patient_id, caregiver_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS patient_doctors (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id    INT UNSIGNED NOT NULL,
  doctor_id     INT UNSIGNED NOT NULL,
  specialty     VARCHAR(100) NULL,
  is_primary    TINYINT(1)   NOT NULL DEFAULT 0,
  assigned_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id)  REFERENCES users(id)     ON DELETE CASCADE,
  UNIQUE KEY uq_patient_doctor (patient_id, doctor_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 4. MEDICAMENTOS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS medications (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT UNSIGNED NOT NULL,
  prescribed_by   INT UNSIGNED NOT NULL,
  name            VARCHAR(150) NOT NULL,
  dosage          VARCHAR(100) NOT NULL,
  frequency_hours SMALLINT UNSIGNED NULL,
  instructions    VARCHAR(255) NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id)    REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (prescribed_by) REFERENCES users(id),
  INDEX idx_med_patient (patient_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS medication_schedule (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medication_id  INT UNSIGNED NOT NULL,
  time_of_day    TIME NOT NULL,
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS medication_intake_log (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  medication_id  INT UNSIGNED NOT NULL,
  scheduled_for  DATETIME NOT NULL,
  taken          TINYINT(1) NOT NULL DEFAULT 0,
  taken_at       DATETIME NULL,
  marked_by      INT UNSIGNED NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE,
  FOREIGN KEY (marked_by)     REFERENCES users(id),
  INDEX idx_intake_med_date (medication_id, scheduled_for)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 5. ESTUDIOS MÉDICOS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS medical_studies (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id    INT UNSIGNED NOT NULL,
  requested_by  INT UNSIGNED NOT NULL,
  study_type    VARCHAR(150) NOT NULL,
  study_date    DATE NOT NULL,
  results       TEXT NULL,
  file_url      VARCHAR(255) NULL,
  notes         TEXT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                          ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id)   REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  INDEX idx_study_patient (patient_id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 6. SIGNOS VITALES
-- IMPORTANTE: NO tiene columna hrv_ms — no hay ningún sensor en este
-- proyecto que mida variabilidad de la frecuencia cardiaca todavía.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vitals_readings (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT UNSIGNED NOT NULL,
  heart_rate     SMALLINT UNSIGNED NULL,
  spo2           TINYINT UNSIGNED NULL,
  temperature_c  DECIMAL(4,1) NULL,
  systolic_bp    SMALLINT UNSIGNED NULL,
  diastolic_bp   SMALLINT UNSIGNED NULL,
  source         ENUM('sensor','manual') NOT NULL DEFAULT 'sensor',
  recorded_at    DATETIME NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  INDEX idx_vitals_patient_time (patient_id, recorded_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 7. DISPOSITIVOS (ESP32) Y EVENTOS DE CAÍDA
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS devices (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id    INT UNSIGNED NOT NULL,
  device_type   VARCHAR(50) NOT NULL DEFAULT 'ESP32',
  mac_address   VARCHAR(50) NOT NULL UNIQUE,
  last_seen_at  DATETIME NULL,
  status        ENUM('online','offline') NOT NULL DEFAULT 'offline',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fall_events (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id    INT UNSIGNED NOT NULL,
  device_id     INT UNSIGNED NULL,
  detected_at   DATETIME NOT NULL,
  severity      ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status        ENUM('pending','confirmed','false_alarm','resolved') NOT NULL DEFAULT 'pending',
  resolved_by   INT UNSIGNED NULL,
  resolved_at   DATETIME NULL,
  notes         VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id)  REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id)   REFERENCES devices(id)  ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(id),
  INDEX idx_fall_patient_time (patient_id, detected_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 8. ASISTENTE DE VOZ (Claude API)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_assistant_logs (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id     INT UNSIGNED NOT NULL,
  spoken_by      INT UNSIGNED NOT NULL,
  flow_type      ENUM('emergency','informative','function_call') NOT NULL,
  query_text     TEXT NULL,
  response_text  TEXT NULL,
  function_called   VARCHAR(100) NULL,
  tokens_used    INT UNSIGNED NULL,
  latency_ms     INT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (spoken_by)  REFERENCES users(id),
  INDEX idx_ai_log_patient_time (patient_id, created_at)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- 9. AUDITORÍA GENERAL
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NULL,
  action       VARCHAR(100) NOT NULL,
  entity       VARCHAR(100) NOT NULL,
  entity_id    INT UNSIGNED NULL,
  details      JSON NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
