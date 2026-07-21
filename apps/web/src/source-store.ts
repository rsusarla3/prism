import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import type { CapturedSource, CapturedSourceInput, LearningAsset, LearningAssetKind, LearningAssetPayload, LearningMaterial, StudyBundle } from 'prism-shared';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

interface SourceRow {
  id: string;
  url: string;
  title: string;
  text: string;
  captured_at: string;
  created_at: string;
  updated_at: string;
}

interface MaterialRow {
  id: string;
  source_id: string;
  source_title: string;
  source_url: string;
  bundle_json: string;
  created_at: string;
}

interface AssetRow {
  id: string;
  source_id: string;
  source_title: string;
  source_url: string;
  kind: LearningAssetKind;
  payload_json: string;
  created_at: string;
}

export class SourceStore {
  private readonly db: DatabaseSyncType;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS learning_materials (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        bundle_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS materials_source_created
        ON learning_materials(source_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS learning_assets (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('read', 'listen', 'watch', 'explore', 'quiz')),
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(source_id, kind)
      );
    `);
  }

  saveSources(inputs: CapturedSourceInput[]): CapturedSource[] {
    const upsert = this.db.prepare(`
      INSERT INTO sources (id, url, title, text, captured_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        text = excluded.text,
        captured_at = excluded.captured_at,
        updated_at = excluded.updated_at
    `);
    const find = this.db.prepare('SELECT * FROM sources WHERE url = ?');
    const clearAssets = this.db.prepare('DELETE FROM learning_assets WHERE source_id = ?');
    const now = new Date().toISOString();
    const saved: CapturedSource[] = [];
    this.db.exec('BEGIN');
    try {
      for (const input of inputs) {
        const id = `src_${createHash('sha256').update(input.url).digest('hex').slice(0, 20)}`;
        const existing = find.get(input.url) as unknown as SourceRow | undefined;
        upsert.run(id, input.url, input.title, input.text, input.capturedAt, now, now);
        if (existing && existing.text !== input.text) clearAssets.run(id);
        saved.push(toSource(find.get(input.url) as unknown as SourceRow));
      }
      this.db.exec('COMMIT');
      return saved;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listSources(): CapturedSource[] {
    const rows = this.db.prepare('SELECT * FROM sources ORDER BY updated_at DESC').all() as unknown as SourceRow[];
    return rows.map(toSource);
  }

  getSource(id: string): CapturedSource | null {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as unknown as SourceRow | undefined;
    return row ? toSource(row) : null;
  }

  saveMaterial(source: CapturedSource, bundle: StudyBundle): LearningMaterial {
    const id = `mat_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    this.db.prepare('INSERT INTO learning_materials (id, source_id, bundle_json, created_at) VALUES (?, ?, ?, ?)')
      .run(id, source.id, JSON.stringify(bundle), createdAt);
    return { id, sourceId: source.id, sourceTitle: source.title, sourceUrl: source.url, bundle, createdAt };
  }

  listMaterials(): LearningMaterial[] {
    const rows = this.db.prepare(`
      SELECT m.id, m.source_id, s.title AS source_title, s.url AS source_url, m.bundle_json, m.created_at
      FROM learning_materials m JOIN sources s ON s.id = m.source_id
      ORDER BY m.created_at DESC
    `).all() as unknown as MaterialRow[];
    return rows.map(toMaterial);
  }

  getLearningAsset(sourceId: string, kind: LearningAssetKind): LearningAsset | null {
    const row = this.db.prepare(`
      SELECT a.id, a.source_id, s.title AS source_title, s.url AS source_url, a.kind, a.payload_json, a.created_at
      FROM learning_assets a JOIN sources s ON s.id = a.source_id
      WHERE a.source_id = ? AND a.kind = ?
    `).get(sourceId, kind) as unknown as AssetRow | undefined;
    return row ? toAsset(row, true) : null;
  }

  saveLearningAsset(source: CapturedSource, kind: LearningAssetKind, payload: LearningAssetPayload): LearningAsset {
    const id = `asset_${source.id}_${kind}`;
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO learning_assets (id, source_id, kind, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_id, kind) DO UPDATE SET payload_json = excluded.payload_json, created_at = excluded.created_at
    `).run(id, source.id, kind, JSON.stringify(payload), createdAt);
    return { id, sourceId: source.id, sourceTitle: source.title, sourceUrl: source.url, kind, payload, createdAt, cached: false };
  }

  close() {
    this.db.close();
  }
}

function toSource(row: SourceRow): CapturedSource {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    text: row.text,
    capturedAt: row.captured_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMaterial(row: MaterialRow): LearningMaterial {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    bundle: JSON.parse(row.bundle_json) as StudyBundle,
    createdAt: row.created_at,
  };
}

function toAsset(row: AssetRow, cached: boolean): LearningAsset {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    kind: row.kind,
    payload: JSON.parse(row.payload_json) as LearningAssetPayload,
    createdAt: row.created_at,
    cached,
  };
}
