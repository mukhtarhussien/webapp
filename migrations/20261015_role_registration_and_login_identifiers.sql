ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username varchar(32);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx
  ON users (username);

ALTER TABLE registration_requests
  ALTER COLUMN google_subject DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS username varchar(32),
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS requested_role user_role NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
