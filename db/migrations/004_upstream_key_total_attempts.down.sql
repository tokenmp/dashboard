DROP TRIGGER IF EXISTS trg_request_attempts_bump_key ON request_attempts;
DROP FUNCTION IF EXISTS bump_upstream_key_attempts();
ALTER TABLE upstream_keys DROP COLUMN IF EXISTS total_attempts;
