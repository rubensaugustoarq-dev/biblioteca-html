-- SQLite canônico próprio; NÃO é um GeoPackage.
-- Serviço ainda não implementado: validar geometria/atributos e revisão em runtime.
PRAGMA foreign_keys = ON;
BEGIN;
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  schema_version TEXT NOT NULL DEFAULT '0.1.0',
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  crs_authid TEXT,
  crs_wkt TEXT NOT NULL CHECK(length(crs_wkt) > 0),
  units TEXT NOT NULL DEFAULT 'm' CHECK(units = 'm'),
  measurement_policy TEXT NOT NULL DEFAULT 'planimetric' CHECK(measurement_policy = 'planimetric'),
  tolerances_json TEXT NOT NULL CHECK(json_valid(tolerances_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE revisions (
  project_id TEXT NOT NULL REFERENCES projects(id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  command_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(project_id, revision),
  UNIQUE(project_id, command_id)
);
CREATE TABLE entities (
  project_id TEXT NOT NULL REFERENCES projects(id),
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('boundary','restriction','road','roadArea','block','parcel','remainder','sectionType','standard','quantity','price')),
  revision INTEGER NOT NULL,
  parent_id TEXT,
  state TEXT NOT NULL DEFAULT 'current' CHECK(state IN ('current','stale','deleted')),
  locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
  geometry_wkb BLOB,
  attributes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(attributes_json)),
  derived_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(derived_json)),
  PRIMARY KEY(project_id, id),
  FOREIGN KEY(project_id, revision) REFERENCES revisions(project_id, revision),
  FOREIGN KEY(project_id, parent_id) REFERENCES entities(project_id, id),
  CHECK(parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX entities_kind ON entities(project_id, kind, state);
CREATE TABLE dependencies (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  dependent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY(project_id, source_id, dependent_id, role),
  FOREIGN KEY(project_id, source_id) REFERENCES entities(project_id, id),
  FOREIGN KEY(project_id, dependent_id) REFERENCES entities(project_id, id),
  CHECK(source_id <> dependent_id)
);
CREATE TABLE resources (
  project_id TEXT NOT NULL REFERENCES projects(id),
  id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('orthophoto','elevation','vectorSource','template','exchange')),
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
  state TEXT NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','missing','deleted')),
  PRIMARY KEY(project_id, id)
);
CREATE TABLE commands (
  project_id TEXT NOT NULL REFERENCES projects(id),
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  applied_revision INTEGER NOT NULL,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  parameters_json TEXT NOT NULL CHECK(json_valid(parameters_json)),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  PRIMARY KEY(project_id, id),
  UNIQUE(project_id, applied_revision),
  FOREIGN KEY(project_id, expected_revision) REFERENCES revisions(project_id, revision),
  FOREIGN KEY(project_id, applied_revision) REFERENCES revisions(project_id, revision),
  CHECK(applied_revision = expected_revision + 1)
);
CREATE TABLE entity_versions (
  project_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  geometry_wkb BLOB,
  PRIMARY KEY(project_id, entity_id, revision),
  FOREIGN KEY(project_id, entity_id) REFERENCES entities(project_id, id),
  FOREIGN KEY(project_id, revision) REFERENCES revisions(project_id, revision)
);
CREATE TABLE previews (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  parameters_hash TEXT NOT NULL CHECK(length(parameters_hash) = 64),
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  state TEXT NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','applied','expired','cancelled')),
  PRIMARY KEY(project_id, id),
  FOREIGN KEY(project_id, base_revision) REFERENCES revisions(project_id, revision)
);
CREATE TABLE jobs (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled')),
  progress REAL NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 1),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  PRIMARY KEY(project_id, id),
  FOREIGN KEY(project_id, base_revision) REFERENCES revisions(project_id, revision)
);
CREATE TABLE exchanges (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  target TEXT NOT NULL CHECK(target IN ('qgis','cad')),
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
  PRIMARY KEY(project_id, id),
  FOREIGN KEY(project_id, base_revision) REFERENCES revisions(project_id, revision)
);
CREATE TABLE deliveries (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('prepared','generated','verified','failed')),
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
  PRIMARY KEY(project_id, id),
  FOREIGN KEY(project_id, revision) REFERENCES revisions(project_id, revision)
);
INSERT INTO schema_migrations(version) VALUES (1);
COMMIT;
