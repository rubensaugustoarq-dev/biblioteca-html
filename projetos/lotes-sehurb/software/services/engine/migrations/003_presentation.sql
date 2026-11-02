BEGIN;
ALTER TABLE document_state ADD COLUMN presentation_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(presentation_json));
INSERT INTO schema_migrations(version) VALUES (3);
COMMIT;
