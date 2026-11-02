-- Adição compatível com os documentos criados durante a construção da 0.3.
BEGIN;
CREATE TABLE IF NOT EXISTS document_state (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  undo_json TEXT NOT NULL CHECK(json_valid(undo_json)),
  redo_json TEXT NOT NULL CHECK(json_valid(redo_json)),
  view_json TEXT NOT NULL CHECK(json_valid(view_json))
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES (2);
COMMIT;
