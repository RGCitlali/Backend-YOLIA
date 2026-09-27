USE yolia_db;

CREATE TABLE IF NOT EXISTS meal_logs (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id    INT UNSIGNED NOT NULL,
  logged_by     INT UNSIGNED NOT NULL,
  meal_type     ENUM('breakfast','lunch','dinner','snack') NOT NULL,
  description   VARCHAR(255) NOT NULL,
  meal_date     DATE NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (logged_by)  REFERENCES users(id),
  INDEX idx_patient_date (patient_id, meal_date)
) ENGINE=InnoDB;
