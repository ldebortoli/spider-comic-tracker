const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { manualSpiderRoster } = require("./catalog-characters");
const { deriveVolumeInfo } = require("./marvel");
const {
  buildWeekKey,
  normalizeText,
  nowIso,
  safeJsonParse,
  uniqueStrings
} = require("./utils");

const SEEDED_TRACKED_CHARACTERS = [
  {
    displayName: "Spider-Verse (all variants)",
    aliases: [
      "Spider-Man",
      "Amazing Spider-Man",
      "Spectacular Spider-Men",
      "Superior Spider-Man",
      "Ultimate Spider-Man",
      "Spider-Man Noir",
      "Spider-Man 2099",
      "Spider-Man India",
      "Spider-Boy",
      "Spider-Girl",
      "Spider-Woman",
      "Ghost-Spider",
      "Spider-Gwen",
      "Scarlet Spider",
      "Silk",
      "Araña",
      "Spider-Punk",
      "Spider-Ham",
      "Spider-UK",
      "Madame Web",
      "Chasm",
      "Spider-Verse"
    ]
  },
  {
    displayName: "Peter Parker",
    aliases: ["Peter Parker", "Spider-Man", "Amazing Spider-Man", "Spectacular Spider-Men"]
  },
  {
    displayName: "Miles Morales",
    aliases: ["Miles Morales", "Miles Morales: Spider-Man", "Spider-Man (Miles Morales)"]
  },
  {
    displayName: "Ghost-Spider",
    aliases: ["Ghost-Spider", "Spider-Gwen", "Gwen Stacy"]
  },
  {
    displayName: "Silk",
    aliases: ["Silk", "Cindy Moon"]
  },
  {
    displayName: "Spider-Woman",
    aliases: ["Spider-Woman", "Jessica Drew"]
  },
  {
    displayName: "Spider-Boy",
    aliases: ["Spider-Boy", "Bailey Briggs"]
  },
  {
    displayName: "Scarlet Spider",
    aliases: ["Scarlet Spider", "Ben Reilly", "Kaine"]
  },
  {
    displayName: "Spider-Man 2099",
    aliases: ["Spider-Man 2099", "Miguel O'Hara"]
  },
  {
    displayName: "Venom",
    aliases: ["Venom", "Eddie Brock", "Dylan Brock", "Anti-Venom", "Agent Anti-Venom"]
  },
  {
    displayName: "Carnage",
    aliases: ["Carnage", "Cletus Kasady"]
  },
  {
    displayName: "Symbiotes (all variants)",
    aliases: [
      "Symbiote",
      "Venom",
      "Carnage",
      "Anti-Venom",
      "Agent Anti-Venom",
      "Toxin",
      "Scream",
      "Agony",
      "Lasher",
      "Riot",
      "Phage",
      "Sleeper",
      "Mania",
      "Silence",
      "Misery",
      "Scorn",
      "Red Goblin"
    ]
  },
  {
    displayName: "Black Cat",
    aliases: ["Black Cat", "Felicia Hardy"]
  },
  {
    displayName: "Mary Jane Watson",
    aliases: ["Mary Jane Watson", "Mary Jane", "MJ", "Jackpot", "Venom (Mary Jane Watson)"]
  },
  {
    displayName: "Gwen Stacy",
    aliases: ["Gwen Stacy", "Gwendolyne Stacy"]
  },
  {
    displayName: "Knull",
    aliases: ["Knull"]
  }
];

class ComicDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.migrate();
    this.seedTrackedCharacters();
    this.seedCatalogCharacters();
    this.seedPeterCatalogMembership();
    this.prepareStatements();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracked_characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT NOT NULL,
        aliases_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS volumes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_title TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        series_name TEXT NOT NULL,
        volume_number INTEGER,
        fandom_url TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        page_title TEXT NOT NULL UNIQUE,
        fandom_url TEXT NOT NULL UNIQUE,
        release_date TEXT NOT NULL,
        cover_image_url TEXT,
        week_year INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        week_key TEXT NOT NULL,
        featured_characters_json TEXT NOT NULL DEFAULT '[]',
        supporting_characters_json TEXT NOT NULL DEFAULT '[]',
        antagonists_json TEXT NOT NULL DEFAULT '[]',
        other_characters_json TEXT NOT NULL DEFAULT '[]',
        synopsis TEXT,
        match_summary_json TEXT NOT NULL DEFAULT '[]',
        originality_status TEXT NOT NULL DEFAULT 'unknown',
        originality_reason TEXT,
        decision TEXT NOT NULL CHECK(decision IN ('auto_added', 'manual_added', 'manual_rejected', 'auto_rejected', 'pending_review')),
        decision_reason TEXT,
        last_sync_run_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comic_characters (
        comic_id INTEGER NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
        character_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        section TEXT NOT NULL,
        is_match INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (comic_id, normalized_name, section)
      );

      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_year INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        week_key TEXT NOT NULL,
        trigger_source TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
        summary_json TEXT NOT NULL DEFAULT '{}',
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS review_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comic_id INTEGER NOT NULL UNIQUE REFERENCES comics(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
        telegram_chat_id TEXT,
        telegram_message_id TEXT,
        requested_at TEXT NOT NULL,
        decided_at TEXT,
        decided_by_user_id TEXT,
        decided_by_username TEXT
      );

      CREATE TABLE IF NOT EXISTS app_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spiderman_catalog_issues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fandom_page_id INTEGER NOT NULL UNIQUE,
        page_title TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        fandom_url TEXT NOT NULL,
        series_name TEXT NOT NULL,
        volume_number INTEGER,
        issue_label TEXT,
        issue_number INTEGER,
        release_date TEXT,
        date_source TEXT NOT NULL DEFAULT '',
        date_precision TEXT NOT NULL DEFAULT '',
        cover_image_url TEXT,
        writers_json TEXT NOT NULL DEFAULT '[]',
        appearance_type TEXT NOT NULL CHECK(appearance_type IN ('direct', 'minor')),
        source_defaultsort TEXT,
        source_synced_at TEXT NOT NULL,
        owned INTEGER NOT NULL DEFAULT 0,
        owned_publisher TEXT NOT NULL DEFAULT '',
        owned_edition TEXT NOT NULL DEFAULT '',
        collection_notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalog_characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        fandom_entity TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK(kind IN ('spider', 'symbiote')),
        reality TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'manual',
        active INTEGER NOT NULL DEFAULT 1,
        last_comic_date TEXT,
        last_sync_at TEXT,
        last_sync_status TEXT NOT NULL DEFAULT 'never',
        last_sync_added_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalog_character_issues (
        character_id INTEGER NOT NULL REFERENCES catalog_characters(id) ON DELETE CASCADE,
        issue_id INTEGER NOT NULL REFERENCES spiderman_catalog_issues(id) ON DELETE CASCADE,
        appearance_type TEXT NOT NULL CHECK(appearance_type IN ('direct', 'minor')),
        source_synced_at TEXT NOT NULL,
        PRIMARY KEY (character_id, issue_id)
      );

      CREATE TABLE IF NOT EXISTS spanish_editions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        publisher TEXT NOT NULL DEFAULT '',
        collection_name TEXT NOT NULL DEFAULT '',
        volume_label TEXT NOT NULL DEFAULT '',
        format_label TEXT NOT NULL DEFAULT '',
        publication_date TEXT,
        isbn TEXT NOT NULL DEFAULT '',
        cover_image_url TEXT NOT NULL DEFAULT '',
        reference_url TEXT NOT NULL DEFAULT '',
        purchase_status TEXT NOT NULL DEFAULT 'wanted' CHECK(purchase_status IN ('wanted', 'owned')),
        characters_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spanish_edition_issues (
        edition_id INTEGER NOT NULL REFERENCES spanish_editions(id) ON DELETE CASCADE,
        issue_id INTEGER NOT NULL REFERENCES spiderman_catalog_issues(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (edition_id, issue_id)
      );

      CREATE INDEX IF NOT EXISTS idx_comics_release_date ON comics(release_date DESC);
      CREATE INDEX IF NOT EXISTS idx_comics_decision ON comics(decision);
      CREATE INDEX IF NOT EXISTS idx_volumes_normalized_name ON volumes(normalized_name);
      CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
      CREATE INDEX IF NOT EXISTS idx_comic_characters_normalized ON comic_characters(normalized_name);
      CREATE INDEX IF NOT EXISTS idx_catalog_series ON spiderman_catalog_issues(series_name COLLATE NOCASE, volume_number, issue_number);
      CREATE INDEX IF NOT EXISTS idx_catalog_release_date ON spiderman_catalog_issues(release_date);
      CREATE INDEX IF NOT EXISTS idx_catalog_owned ON spiderman_catalog_issues(owned);
      CREATE INDEX IF NOT EXISTS idx_catalog_appearance ON spiderman_catalog_issues(appearance_type);
      CREATE INDEX IF NOT EXISTS idx_catalog_characters_kind ON catalog_characters(kind, display_name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_catalog_character_issues_issue ON catalog_character_issues(issue_id);
      CREATE INDEX IF NOT EXISTS idx_spanish_editions_status ON spanish_editions(purchase_status, publisher COLLATE NOCASE, title COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_spanish_edition_issues_issue ON spanish_edition_issues(issue_id);
    `);

    this.ensureColumn("comics", "volume_id INTEGER REFERENCES volumes(id)");
    this.ensureColumn("comics", "issue_label TEXT");
    this.ensureColumn("comics", "issue_number INTEGER");
    this.ensureColumn("comics", "originality_status TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn("comics", "originality_reason TEXT");
    this.ensureColumn("spiderman_catalog_issues", "date_source TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("spiderman_catalog_issues", "date_precision TEXT NOT NULL DEFAULT ''");
    this.backfillComicVolumes();
  }

  seedCatalogCharacters() {
    const now = nowIso();
    const upsert = this.db.prepare(`
      INSERT INTO catalog_characters (
        slug, display_name, fandom_entity, kind, reality, source, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(fandom_entity) DO UPDATE SET
        slug = excluded.slug,
        display_name = excluded.display_name,
        kind = excluded.kind,
        reality = excluded.reality,
        source = excluded.source,
        updated_at = excluded.updated_at
    `);

    for (const character of manualSpiderRoster()) {
      upsert.run(
        character.slug,
        character.displayName,
        character.fandomEntity,
        character.kind,
        character.reality,
        character.source,
        now,
        now
      );
    }
  }

  seedPeterCatalogMembership() {
    const peter = this.db.prepare(`
      SELECT id FROM catalog_characters WHERE fandom_entity = 'Peter Parker (Earth-616)'
    `).get();

    if (!peter) {
      return;
    }

    const existingMemberships = Number(this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM catalog_character_issues
      WHERE character_id = ?
    `).get(peter.id).count || 0);

    if (existingMemberships > 0) {
      return;
    }

    this.db.prepare(`
      INSERT OR IGNORE INTO catalog_character_issues (character_id, issue_id, appearance_type, source_synced_at)
      SELECT ?, id, appearance_type, source_synced_at
      FROM spiderman_catalog_issues
    `).run(peter.id);

    this.db.prepare(`
      UPDATE catalog_characters
      SET last_comic_date = (
            SELECT MAX(i.release_date)
            FROM catalog_character_issues ci
            JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
            WHERE ci.character_id = catalog_characters.id
          ),
          last_sync_at = COALESCE(last_sync_at, (
            SELECT MAX(i.source_synced_at)
            FROM catalog_character_issues ci
            JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
            WHERE ci.character_id = catalog_characters.id
          )),
          last_sync_status = CASE WHEN last_sync_status = 'never' THEN 'completed' ELSE last_sync_status END
      WHERE id = ?
    `).run(peter.id);
  }

  hasColumn(tableName, columnName) {
    return this.db.prepare(`PRAGMA table_info(${tableName})`).all().some((row) => row.name === columnName);
  }

  ensureColumn(tableName, columnDefinition) {
    const columnName = columnDefinition.trim().split(/\s+/)[0];

    if (this.hasColumn(tableName, columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }

  backfillComicVolumes() {
    const rows = this.db.prepare(`
      SELECT id, page_title, title, fandom_url, volume_id, issue_label, issue_number
      FROM comics
      WHERE volume_id IS NULL OR issue_label IS NULL OR issue_number IS NULL
    `).all();

    if (!rows.length) {
      return;
    }

    const insertVolume = this.db.prepare(`
      INSERT INTO volumes (page_title, name, series_name, volume_number, fandom_url, normalized_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateVolume = this.db.prepare(`
      UPDATE volumes
      SET name = ?, series_name = ?, volume_number = ?, fandom_url = ?, normalized_name = ?, updated_at = ?
      WHERE id = ?
    `);
    const getVolumeByPageTitle = this.db.prepare(`
      SELECT id
      FROM volumes
      WHERE page_title = ?
    `);
    const updateComic = this.db.prepare(`
      UPDATE comics
      SET volume_id = ?, issue_label = ?, issue_number = ?, updated_at = ?
      WHERE id = ?
    `);

    for (const row of rows) {
      const volumeInfo = deriveVolumeInfo({
        pageTitle: row.page_title,
        title: row.title,
        fandomUrl: row.fandom_url
      });
      const existingVolume = getVolumeByPageTitle.get(volumeInfo.volumePageTitle);
      const now = nowIso();
      let volumeId;

      if (existingVolume) {
        volumeId = existingVolume.id;
        updateVolume.run(
          volumeInfo.volumeName,
          volumeInfo.seriesName,
          volumeInfo.volumeNumber,
          volumeInfo.volumeFandomUrl,
          normalizeText(volumeInfo.volumeName),
          now,
          volumeId
        );
      } else {
        const result = insertVolume.run(
          volumeInfo.volumePageTitle,
          volumeInfo.volumeName,
          volumeInfo.seriesName,
          volumeInfo.volumeNumber,
          volumeInfo.volumeFandomUrl,
          normalizeText(volumeInfo.volumeName),
          now,
          now
        );
        volumeId = Number(result.lastInsertRowid);
      }

      updateComic.run(
        volumeId,
        volumeInfo.issueLabel || row.issue_label || "",
        volumeInfo.issueNumber ?? row.issue_number ?? null,
        now,
        row.id
      );
    }
  }

  prepareStatements() {
    this.statements = {
      volumeByPageTitle: this.db.prepare(`
        SELECT *
        FROM volumes
        WHERE page_title = ?
      `),
      volumeInsert: this.db.prepare(`
        INSERT INTO volumes (page_title, name, series_name, volume_number, fandom_url, normalized_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `),
      volumeUpdate: this.db.prepare(`
        UPDATE volumes
        SET name = ?, series_name = ?, volume_number = ?, fandom_url = ?, normalized_name = ?, updated_at = ?
        WHERE page_title = ?
      `),
      trackedCharactersAll: this.db.prepare(`
        SELECT id, display_name, aliases_json, active, created_at, updated_at
        FROM tracked_characters
        ORDER BY active DESC, display_name COLLATE NOCASE ASC
      `),
      trackedCharacterById: this.db.prepare(`
        SELECT id, display_name, aliases_json, active, created_at, updated_at
        FROM tracked_characters
        WHERE id = ?
      `),
      trackedCharacterInsert: this.db.prepare(`
        INSERT INTO tracked_characters (display_name, aliases_json, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `),
      trackedCharacterUpdate: this.db.prepare(`
        UPDATE tracked_characters
        SET display_name = ?, aliases_json = ?, active = ?, updated_at = ?
        WHERE id = ?
      `),
      trackedCharacterDelete: this.db.prepare(`DELETE FROM tracked_characters WHERE id = ?`),
      countTrackedCharacters: this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM tracked_characters
        WHERE active = 1
      `),
      comicByPageTitle: this.db.prepare(`
        SELECT c.*, v.page_title AS volume_page_title, v.name AS volume_name, v.series_name, v.volume_number,
               v.fandom_url AS volume_fandom_url
        FROM comics c
        LEFT JOIN volumes v ON v.id = c.volume_id
        WHERE c.page_title = ?
      `),
      comicById: this.db.prepare(`
        SELECT c.*, v.page_title AS volume_page_title, v.name AS volume_name, v.series_name, v.volume_number,
               v.fandom_url AS volume_fandom_url
        FROM comics c
        LEFT JOIN volumes v ON v.id = c.volume_id
        WHERE c.id = ?
      `),
      comicInsert: this.db.prepare(`
        INSERT INTO comics (
          title, page_title, fandom_url, release_date, cover_image_url,
          volume_id, issue_label, issue_number,
          week_year, week_number, week_key,
          featured_characters_json, supporting_characters_json, antagonists_json, other_characters_json,
          synopsis, match_summary_json, originality_status, originality_reason, decision, decision_reason, last_sync_run_id,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      comicUpdate: this.db.prepare(`
        UPDATE comics
        SET title = ?,
            fandom_url = ?,
            release_date = ?,
            cover_image_url = ?,
            volume_id = ?,
            issue_label = ?,
            issue_number = ?,
            week_year = ?,
            week_number = ?,
            week_key = ?,
            featured_characters_json = ?,
            supporting_characters_json = ?,
            antagonists_json = ?,
            other_characters_json = ?,
            synopsis = ?,
            match_summary_json = ?,
            originality_status = ?,
            originality_reason = ?,
            decision = ?,
            decision_reason = ?,
            last_sync_run_id = ?,
            updated_at = ?
        WHERE page_title = ?
      `),
      comicCharactersDelete: this.db.prepare(`DELETE FROM comic_characters WHERE comic_id = ?`),
      comicCharacterInsert: this.db.prepare(`
        INSERT INTO comic_characters (comic_id, character_name, normalized_name, section, is_match)
        VALUES (?, ?, ?, ?, ?)
      `),
      syncRunInsert: this.db.prepare(`
        INSERT INTO sync_runs (week_year, week_number, week_key, trigger_source, started_at, status, summary_json)
        VALUES (?, ?, ?, ?, ?, 'running', '{}')
      `),
      syncRunFinish: this.db.prepare(`
        UPDATE sync_runs
        SET finished_at = ?, status = ?, summary_json = ?, error_message = ?
        WHERE id = ?
      `),
      lastSyncRun: this.db.prepare(`
        SELECT *
        FROM sync_runs
        ORDER BY started_at DESC
        LIMIT 1
      `),
      countPendingReviews: this.db.prepare(`
        SELECT COUNT(*) AS count
        FROM review_queue
        WHERE status = 'pending'
      `),
      dashboardCounts: this.db.prepare(`
        SELECT
          SUM(CASE WHEN decision IN ('auto_added', 'manual_added') THEN 1 ELSE 0 END) AS included_count,
          SUM(CASE WHEN decision = 'pending_review' THEN 1 ELSE 0 END) AS pending_comics_count,
          SUM(CASE WHEN decision IN ('auto_rejected', 'manual_rejected') THEN 1 ELSE 0 END) AS rejected_count,
          COUNT(DISTINCT CASE WHEN decision IN ('auto_added', 'manual_added') THEN volume_id END) AS included_volumes_count
        FROM comics
      `),
      appStateGet: this.db.prepare(`SELECT value FROM app_state WHERE key = ?`),
      appStateSet: this.db.prepare(`
        INSERT INTO app_state (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `),
      reviewByComicId: this.db.prepare(`
        SELECT rq.*, c.title, c.fandom_url, c.release_date, c.cover_image_url, c.match_summary_json, c.decision_reason,
               c.originality_status, c.originality_reason, v.name AS volume_name, c.issue_label
        FROM review_queue rq
        JOIN comics c ON c.id = rq.comic_id
        LEFT JOIN volumes v ON v.id = c.volume_id
        WHERE rq.comic_id = ?
      `),
      reviewById: this.db.prepare(`
        SELECT rq.*, c.title, c.fandom_url, c.release_date, c.cover_image_url, c.match_summary_json, c.decision_reason,
               c.originality_status, c.originality_reason, v.name AS volume_name, c.issue_label
        FROM review_queue rq
        JOIN comics c ON c.id = rq.comic_id
        LEFT JOIN volumes v ON v.id = c.volume_id
        WHERE rq.id = ?
      `),
      reviewInsert: this.db.prepare(`
        INSERT INTO review_queue (comic_id, status, requested_at)
        VALUES (?, 'pending', ?)
      `),
      reviewAttachMessage: this.db.prepare(`
        UPDATE review_queue
        SET telegram_chat_id = ?, telegram_message_id = ?
        WHERE id = ?
      `),
      reviewResolve: this.db.prepare(`
        UPDATE review_queue
        SET status = ?, decided_at = ?, decided_by_user_id = ?, decided_by_username = ?
        WHERE id = ? AND status = 'pending'
      `),
      updateComicDecisionById: this.db.prepare(`
        UPDATE comics
        SET decision = ?, decision_reason = ?, updated_at = ?
        WHERE id = ?
      `),
      pendingReviews: this.db.prepare(`
        SELECT rq.id, rq.requested_at, rq.telegram_chat_id, rq.telegram_message_id,
               c.id AS comic_id, c.title, c.fandom_url, c.release_date, c.cover_image_url, c.match_summary_json, c.decision_reason,
               c.originality_status, c.originality_reason, v.name AS volume_name, c.issue_label
        FROM review_queue rq
        JOIN comics c ON c.id = rq.comic_id
        LEFT JOIN volumes v ON v.id = c.volume_id
        WHERE rq.status = 'pending'
        ORDER BY c.release_date DESC, c.title COLLATE NOCASE ASC
      `),
      catalogUpsert: this.db.prepare(`
        INSERT INTO spiderman_catalog_issues (
          fandom_page_id, page_title, title, fandom_url, series_name, volume_number,
          issue_label, issue_number, release_date, date_source, date_precision, cover_image_url, writers_json,
          appearance_type, source_defaultsort, source_synced_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fandom_page_id) DO UPDATE SET
          page_title = excluded.page_title,
          title = excluded.title,
          fandom_url = excluded.fandom_url,
          series_name = excluded.series_name,
          volume_number = excluded.volume_number,
          issue_label = excluded.issue_label,
          issue_number = excluded.issue_number,
          release_date = excluded.release_date,
          date_source = excluded.date_source,
          date_precision = excluded.date_precision,
          cover_image_url = excluded.cover_image_url,
          writers_json = excluded.writers_json,
          appearance_type = excluded.appearance_type,
          source_defaultsort = excluded.source_defaultsort,
          source_synced_at = excluded.source_synced_at,
          updated_at = excluded.updated_at
      `),
      catalogById: this.db.prepare(`
        SELECT * FROM spiderman_catalog_issues WHERE id = ?
      `),
      catalogByFandomPageId: this.db.prepare(`
        SELECT * FROM spiderman_catalog_issues WHERE fandom_page_id = ?
      `),
      catalogCollectionUpdate: this.db.prepare(`
        UPDATE spiderman_catalog_issues
        SET owned = ?, owned_publisher = ?, owned_edition = ?, collection_notes = ?, updated_at = ?
        WHERE id = ?
      `),
      catalogStats: this.db.prepare(`
        SELECT
          COUNT(*) AS total_count,
          SUM(CASE WHEN owned = 1 THEN 1 ELSE 0 END) AS owned_count,
          COUNT(DISTINCT series_name) AS series_count,
          SUM(CASE WHEN appearance_type = 'direct' THEN 1 ELSE 0 END) AS direct_count,
          SUM(CASE WHEN appearance_type = 'minor' THEN 1 ELSE 0 END) AS minor_count,
          SUM(CASE WHEN release_date IS NOT NULL AND release_date != '' THEN 1 ELSE 0 END) AS dated_count,
          SUM(CASE WHEN writers_json != '[]' THEN 1 ELSE 0 END) AS writers_count,
          MAX(source_synced_at) AS last_source_sync_at
        FROM spiderman_catalog_issues
      `),
      catalogCharacterUpsert: this.db.prepare(`
        INSERT INTO catalog_characters (
          slug, display_name, fandom_entity, kind, reality, source, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(fandom_entity) DO UPDATE SET
          slug = excluded.slug,
          display_name = excluded.display_name,
          kind = excluded.kind,
          reality = excluded.reality,
          source = excluded.source,
          active = 1,
          updated_at = excluded.updated_at
      `),
      catalogCharacterBySlug: this.db.prepare(`
        SELECT * FROM catalog_characters WHERE slug = ?
      `),
      catalogCharacterByEntity: this.db.prepare(`
        SELECT * FROM catalog_characters WHERE fandom_entity = ?
      `),
      catalogCharactersAll: this.db.prepare(`
        SELECT c.*,
               COUNT(ci.issue_id) AS issue_count,
               SUM(CASE WHEN i.owned = 1 THEN 1 ELSE 0 END) AS owned_count,
               SUM(CASE WHEN ci.appearance_type = 'direct' THEN 1 ELSE 0 END) AS direct_count,
               SUM(CASE WHEN ci.appearance_type = 'minor' THEN 1 ELSE 0 END) AS minor_count,
               MAX(i.release_date) AS computed_last_comic_date
        FROM catalog_characters c
        LEFT JOIN catalog_character_issues ci ON ci.character_id = c.id
        LEFT JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
        WHERE c.active = 1
        GROUP BY c.id
        ORDER BY CASE c.kind WHEN 'spider' THEN 0 ELSE 1 END,
                 c.display_name COLLATE NOCASE ASC,
                 c.reality COLLATE NOCASE ASC
      `),
      catalogMembershipDelete: this.db.prepare(`
        DELETE FROM catalog_character_issues WHERE character_id = ?
      `),
      catalogMembershipInsert: this.db.prepare(`
        INSERT INTO catalog_character_issues (character_id, issue_id, appearance_type, source_synced_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(character_id, issue_id) DO UPDATE SET
          appearance_type = CASE
            WHEN catalog_character_issues.appearance_type = 'direct' OR excluded.appearance_type = 'direct' THEN 'direct'
            ELSE 'minor'
          END,
          source_synced_at = excluded.source_synced_at
      `),
      catalogCharacterSyncUpdate: this.db.prepare(`
        UPDATE catalog_characters
        SET last_comic_date = (
              SELECT MAX(i.release_date)
              FROM catalog_character_issues ci
              JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
              WHERE ci.character_id = catalog_characters.id
            ),
            last_sync_at = ?,
            last_sync_status = ?,
            last_sync_added_count = ?,
            updated_at = ?
        WHERE id = ?
      `)
    };
  }

  seedTrackedCharacters() {
    const now = nowIso();
    const insert = this.db.prepare(`
      INSERT INTO tracked_characters (display_name, aliases_json, active, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
    `);
    const exists = this.db.prepare(`
      SELECT id
      FROM tracked_characters
      WHERE display_name = ?
      LIMIT 1
    `);

    for (const character of SEEDED_TRACKED_CHARACTERS) {
      const row = exists.get(character.displayName);

      if (row) {
        continue;
      }

      insert.run(character.displayName, JSON.stringify(uniqueStrings(character.aliases)), now, now);
    }
  }

  mapTrackedCharacter(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      displayName: row.display_name,
      aliases: safeJsonParse(row.aliases_json, []),
      active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  mapComic(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      title: row.title,
      pageTitle: row.page_title,
      fandomUrl: row.fandom_url,
      releaseDate: row.release_date,
      coverImageUrl: row.cover_image_url,
      volumeId: row.volume_id,
      volumePageTitle: row.volume_page_title,
      volumeName: row.volume_name,
      volumeFandomUrl: row.volume_fandom_url,
      seriesName: row.series_name,
      volumeNumber: row.volume_number,
      issueLabel: row.issue_label,
      issueNumber: row.issue_number,
      weekYear: row.week_year,
      weekNumber: row.week_number,
      weekKey: row.week_key,
      featuredCharacters: safeJsonParse(row.featured_characters_json, []),
      supportingCharacters: safeJsonParse(row.supporting_characters_json, []),
      antagonists: safeJsonParse(row.antagonists_json, []),
      otherCharacters: safeJsonParse(row.other_characters_json, []),
      synopsis: row.synopsis,
      matchSummary: safeJsonParse(row.match_summary_json, []),
      originalityStatus: row.originality_status,
      originalityReason: row.originality_reason,
      decision: row.decision,
      decisionReason: row.decision_reason,
      lastSyncRunId: row.last_sync_run_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  mapReview(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      comicId: row.comic_id,
      status: row.status,
      telegramChatId: row.telegram_chat_id,
      telegramMessageId: row.telegram_message_id,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      decidedByUserId: row.decided_by_user_id,
      decidedByUsername: row.decided_by_username,
      title: row.title,
      fandomUrl: row.fandom_url,
      releaseDate: row.release_date,
      coverImageUrl: row.cover_image_url,
      volumeName: row.volume_name,
      issueLabel: row.issue_label,
      matchSummary: safeJsonParse(row.match_summary_json, []),
      originalityStatus: row.originality_status,
      originalityReason: row.originality_reason,
      decisionReason: row.decision_reason
    };
  }

  mapCatalogIssue(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      fandomPageId: row.fandom_page_id,
      pageTitle: row.page_title,
      title: row.title,
      fandomUrl: row.fandom_url,
      seriesName: row.series_name,
      volumeNumber: row.volume_number,
      issueLabel: row.issue_label,
      issueNumber: row.issue_number,
      releaseDate: row.release_date,
      dateSource: row.date_source || "",
      datePrecision: row.date_precision || "",
      coverImageUrl: row.cover_image_url,
      writers: safeJsonParse(row.writers_json, []),
      appearanceType: row.character_appearance_type || row.appearance_type,
      sourceSyncedAt: row.source_synced_at,
      owned: Boolean(row.owned),
      ownedPublisher: row.owned_publisher,
      ownedEdition: row.owned_edition,
      collectionNotes: row.collection_notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  mapCatalogCharacter(row) {
    if (!row) {
      return null;
    }

    const issueCount = Number(row.issue_count || 0);
    const ownedCount = Number(row.owned_count || 0);

    return {
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      fandomEntity: row.fandom_entity,
      kind: row.kind,
      reality: row.reality,
      source: row.source,
      active: Boolean(row.active),
      issueCount,
      ownedCount,
      missingCount: Math.max(0, issueCount - ownedCount),
      directCount: Number(row.direct_count || 0),
      minorCount: Number(row.minor_count || 0),
      lastComicDate: row.computed_last_comic_date || row.last_comic_date || "",
      lastSyncAt: row.last_sync_at || "",
      lastSyncStatus: row.last_sync_status,
      lastSyncAddedCount: Number(row.last_sync_added_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  mapSpanishEdition(row, issues = []) {
    if (!row) {
      return null;
    }

    return {
      id: Number(row.id),
      title: row.title,
      publisher: row.publisher,
      collectionName: row.collection_name,
      volumeLabel: row.volume_label,
      formatLabel: row.format_label,
      publicationDate: row.publication_date || "",
      isbn: row.isbn,
      coverImageUrl: row.cover_image_url,
      referenceUrl: row.reference_url,
      purchaseStatus: row.purchase_status,
      characters: safeJsonParse(row.characters_json, []),
      notes: row.notes,
      issues,
      issueCount: issues.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsertVolume(volume) {
    const existing = this.statements.volumeByPageTitle.get(volume.volumePageTitle);
    const now = nowIso();

    if (existing) {
      this.statements.volumeUpdate.run(
        volume.volumeName,
        volume.seriesName,
        volume.volumeNumber,
        volume.volumeFandomUrl,
        normalizeText(volume.volumeName),
        now,
        volume.volumePageTitle
      );
      return this.statements.volumeByPageTitle.get(volume.volumePageTitle);
    }

    const result = this.statements.volumeInsert.run(
      volume.volumePageTitle,
      volume.volumeName,
      volume.seriesName,
      volume.volumeNumber,
      volume.volumeFandomUrl,
      normalizeText(volume.volumeName),
      now,
      now
    );

    return this.statements.volumeByPageTitle.get(volume.volumePageTitle) || { id: Number(result.lastInsertRowid) };
  }

  getTrackedCharacters() {
    return this.statements.trackedCharactersAll.all().map((row) => this.mapTrackedCharacter(row));
  }

  createTrackedCharacter({ displayName, aliases, active }) {
    const now = nowIso();
    const aliasesJson = JSON.stringify(uniqueStrings(aliases));
    const result = this.statements.trackedCharacterInsert.run(displayName, aliasesJson, active ? 1 : 0, now, now);
    return this.getTrackedCharacterById(result.lastInsertRowid);
  }

  getTrackedCharacterById(id) {
    return this.mapTrackedCharacter(this.statements.trackedCharacterById.get(id));
  }

  updateTrackedCharacter(id, { displayName, aliases, active }) {
    this.statements.trackedCharacterUpdate.run(
      displayName,
      JSON.stringify(uniqueStrings(aliases)),
      active ? 1 : 0,
      nowIso(),
      id
    );
    return this.getTrackedCharacterById(id);
  }

  deleteTrackedCharacter(id) {
    return this.statements.trackedCharacterDelete.run(id);
  }

  getComicByPageTitle(pageTitle) {
    return this.mapComic(this.statements.comicByPageTitle.get(pageTitle));
  }

  getComicById(id) {
    return this.mapComic(this.statements.comicById.get(id));
  }

  upsertComic(comic) {
    const existing = this.getComicByPageTitle(comic.pageTitle);
    const now = nowIso();
    const volume = this.upsertVolume({
      volumePageTitle: comic.volumePageTitle,
      volumeName: comic.volumeName,
      seriesName: comic.seriesName,
      volumeNumber: comic.volumeNumber,
      volumeFandomUrl: comic.volumeFandomUrl
    });

    if (existing) {
      this.statements.comicUpdate.run(
        comic.title,
        comic.fandomUrl,
        comic.releaseDate,
        comic.coverImageUrl,
        volume.id,
        comic.issueLabel || "",
        comic.issueNumber ?? null,
        comic.weekYear,
        comic.weekNumber,
        comic.weekKey,
        JSON.stringify(comic.featuredCharacters || []),
        JSON.stringify(comic.supportingCharacters || []),
        JSON.stringify(comic.antagonists || []),
        JSON.stringify(comic.otherCharacters || []),
        comic.synopsis || "",
        JSON.stringify(comic.matchSummary || []),
        comic.originalityStatus || "unknown",
        comic.originalityReason || "",
        comic.decision,
        comic.decisionReason || "",
        comic.lastSyncRunId || null,
        now,
        comic.pageTitle
      );
    } else {
      this.statements.comicInsert.run(
        comic.title,
        comic.pageTitle,
        comic.fandomUrl,
        comic.releaseDate,
        comic.coverImageUrl,
        volume.id,
        comic.issueLabel || "",
        comic.issueNumber ?? null,
        comic.weekYear,
        comic.weekNumber,
        comic.weekKey,
        JSON.stringify(comic.featuredCharacters || []),
        JSON.stringify(comic.supportingCharacters || []),
        JSON.stringify(comic.antagonists || []),
        JSON.stringify(comic.otherCharacters || []),
        comic.synopsis || "",
        JSON.stringify(comic.matchSummary || []),
        comic.originalityStatus || "unknown",
        comic.originalityReason || "",
        comic.decision,
        comic.decisionReason || "",
        comic.lastSyncRunId || null,
        now,
        now
      );
    }

    return this.getComicByPageTitle(comic.pageTitle);
  }

  replaceComicCharacters(comicId, characters) {
    this.statements.comicCharactersDelete.run(comicId);

    for (const character of characters) {
      this.statements.comicCharacterInsert.run(
        comicId,
        character.name,
        normalizeText(character.name),
        character.section,
        character.isMatch ? 1 : 0
      );
    }
  }

  createSyncRun({ weekYear, weekNumber, triggerSource }) {
    const weekKey = buildWeekKey(weekYear, weekNumber);
    const result = this.statements.syncRunInsert.run(weekYear, weekNumber, weekKey, triggerSource, nowIso());
    return Number(result.lastInsertRowid);
  }

  finishSyncRun(id, { status, summary, errorMessage }) {
    this.statements.syncRunFinish.run(nowIso(), status, JSON.stringify(summary || {}), errorMessage || null, id);
  }

  getLastSyncRun() {
    const row = this.statements.lastSyncRun.get();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      weekYear: row.week_year,
      weekNumber: row.week_number,
      weekKey: row.week_key,
      triggerSource: row.trigger_source,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      summary: safeJsonParse(row.summary_json, {}),
      errorMessage: row.error_message
    };
  }

  getDashboardStats() {
    const counts = this.statements.dashboardCounts.get() || {};

    return {
      includedCount: Number(counts.included_count || 0),
      includedVolumesCount: Number(counts.included_volumes_count || 0),
      pendingComicsCount: Number(counts.pending_comics_count || 0),
      rejectedCount: Number(counts.rejected_count || 0),
      trackedCharactersCount: Number(this.statements.countTrackedCharacters.get().count || 0),
      pendingReviewsCount: Number(this.statements.countPendingReviews.get().count || 0)
    };
  }

  getState(key, fallback = null) {
    const row = this.statements.appStateGet.get(key);
    return row ? row.value : fallback;
  }

  setState(key, value) {
    this.statements.appStateSet.run(key, String(value));
  }

  createOrGetPendingReview(comicId) {
    const existing = this.mapReview(this.statements.reviewByComicId.get(comicId));

    if (existing && existing.status === "pending") {
      return existing;
    }

    if (!existing) {
      this.statements.reviewInsert.run(comicId, nowIso());
    }

    return this.mapReview(this.statements.reviewByComicId.get(comicId));
  }

  attachTelegramMessage(reviewId, { chatId, messageId }) {
    this.statements.reviewAttachMessage.run(chatId, messageId, reviewId);
    return this.getReviewById(reviewId);
  }

  getReviewById(reviewId) {
    return this.mapReview(this.statements.reviewById.get(reviewId));
  }

  listPendingReviews() {
    return this.statements.pendingReviews.all().map((row) => this.mapReview(row));
  }

  beginImmediate() {
    this.db.exec("BEGIN IMMEDIATE;");
  }

  commit() {
    this.db.exec("COMMIT;");
  }

  rollback() {
    this.db.exec("ROLLBACK;");
  }

  resolveReviewDecision(reviewId, action, user) {
    const desiredStatus = action === "approve" ? "approved" : "rejected";
    const resultingComicDecision = action === "approve" ? "manual_added" : "manual_rejected";
    const source = user.source === "web" ? "la página local" : "Telegram";
    const baseReason = action === "approve" ? `Agregado manualmente desde ${source}.` : `Rechazado manualmente desde ${source}.`;
    const username = user.username ? `@${user.username}` : user.first_name || user.firstName || "usuario";

    this.beginImmediate();

    try {
      const review = this.getReviewById(reviewId);

      if (!review) {
        this.rollback();
        return { status: "not_found" };
      }

      if (review.status !== "pending") {
        this.rollback();
        return { status: "already_resolved", review };
      }

      const update = this.statements.reviewResolve.run(
        desiredStatus,
        nowIso(),
        String(user.id),
        username,
        reviewId
      );

      if (!update.changes) {
        this.rollback();
        return { status: "already_resolved", review: this.getReviewById(reviewId) };
      }

      this.statements.updateComicDecisionById.run(
        resultingComicDecision,
        `${baseReason} Por ${username}.`,
        nowIso(),
        review.comicId
      );

      this.commit();

      return {
        status: "resolved",
        review: this.getReviewById(reviewId),
        comic: this.getComicById(review.comicId),
        action
      };
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  listIncludedComics(filters = {}) {
    const conditions = ["c.decision IN ('auto_added', 'manual_added')"];
    const params = [];

    if (filters.query) {
      conditions.push("c.title LIKE ?");
      params.push(`%${filters.query}%`);
    }

    if (filters.from) {
      conditions.push("c.release_date >= ?");
      params.push(filters.from);
    }

    if (filters.to) {
      conditions.push("c.release_date <= ?");
      params.push(filters.to);
    }

    if (filters.character) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM comic_characters cc2
          WHERE cc2.comic_id = c.id
            AND cc2.character_name LIKE ?
        )
      `);
      params.push(`%${filters.character}%`);
    }

    const rows = this.db.prepare(`
      SELECT
        c.*,
        v.page_title AS volume_page_title,
        v.name AS volume_name,
        v.series_name,
        v.volume_number,
        v.fandom_url AS volume_fandom_url,
        GROUP_CONCAT(DISTINCT CASE WHEN cc.is_match = 1 THEN cc.character_name END) AS matched_characters,
        GROUP_CONCAT(DISTINCT cc.character_name) AS all_characters
      FROM comics c
      LEFT JOIN volumes v ON v.id = c.volume_id
      LEFT JOIN comic_characters cc ON cc.comic_id = c.id
      WHERE ${conditions.join(" AND ")}
      GROUP BY c.id
      ORDER BY v.name COLLATE NOCASE ASC, COALESCE(c.issue_number, -1) DESC, c.release_date DESC, c.title COLLATE NOCASE ASC
    `).all(...params);

    return rows.map((row) => ({
      ...this.mapComic(row),
      matchedCharacters: row.matched_characters ? row.matched_characters.split(",") : [],
      allCharacters: row.all_characters ? row.all_characters.split(",") : []
    }));
  }

  upsertCatalogIssues(issues) {
    if (!issues.length) {
      return 0;
    }

    const sourceSyncedAt = nowIso();
    let changes = 0;
    this.db.exec("BEGIN;");

    try {
      for (const issue of issues) {
        const now = nowIso();
        const result = this.statements.catalogUpsert.run(
          issue.fandomPageId,
          issue.pageTitle,
          issue.title,
          issue.fandomUrl,
          issue.seriesName,
          issue.volumeNumber ?? null,
          issue.issueLabel || "",
          issue.issueNumber ?? null,
          issue.releaseDate || null,
          issue.dateSource || "",
          issue.datePrecision || "",
          issue.coverImageUrl || "",
          JSON.stringify(uniqueStrings(issue.writers || [])),
          issue.appearanceType,
          issue.sourceDefaultSort || "",
          sourceSyncedAt,
          now,
          now
        );
        changes += Number(result.changes || 0);
      }

      this.db.exec("COMMIT;");
      return changes;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  getCatalogIssue(id) {
    return this.mapCatalogIssue(this.statements.catalogById.get(id));
  }

  getCatalogIssueByFandomPageId(pageId) {
    return this.mapCatalogIssue(this.statements.catalogByFandomPageId.get(pageId));
  }

  upsertCatalogCharacters(characters) {
    const now = nowIso();

    for (const character of characters) {
      this.statements.catalogCharacterUpsert.run(
        character.slug,
        character.displayName,
        character.fandomEntity,
        character.kind,
        character.reality || "",
        character.source || "manual",
        now,
        now
      );
    }

    return this.listCatalogCharacters();
  }

  listCatalogCharacters() {
    return this.statements.catalogCharactersAll.all().map((row) => this.mapCatalogCharacter(row));
  }

  getCatalogCharacter(slug) {
    return this.listCatalogCharacters().find((character) => character.slug === slug) || null;
  }

  replaceCatalogCharacterIssues(slug, members, status = "completed") {
    const characterRow = this.statements.catalogCharacterBySlug.get(slug);

    if (!characterRow) {
      throw new Error(`Personaje de catálogo inexistente: ${slug}`);
    }

    const existing = new Set(this.db.prepare(`
      SELECT issue_id FROM catalog_character_issues WHERE character_id = ?
    `).all(characterRow.id).map((row) => Number(row.issue_id)));
    const resolved = [];

    for (const member of members) {
      const issue = this.statements.catalogByFandomPageId.get(member.pageId);

      if (issue) {
        resolved.push({
          issueId: Number(issue.id),
          appearanceType: member.appearanceType
        });
      }
    }

    const unique = new Map();

    for (const item of resolved) {
      const previous = unique.get(item.issueId);
      unique.set(item.issueId, {
        issueId: item.issueId,
        appearanceType: previous?.appearanceType === "direct" || item.appearanceType === "direct" ? "direct" : "minor"
      });
    }

    const syncAt = nowIso();
    const addedCount = [...unique.keys()].filter((issueId) => !existing.has(issueId)).length;
    this.db.exec("BEGIN;");

    try {
      this.statements.catalogMembershipDelete.run(characterRow.id);

      for (const item of unique.values()) {
        this.statements.catalogMembershipInsert.run(
          characterRow.id,
          item.issueId,
          item.appearanceType,
          syncAt
        );
      }

      this.statements.catalogCharacterSyncUpdate.run(
        syncAt,
        status,
        addedCount,
        syncAt,
        characterRow.id
      );
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }

    return {
      character: {
        id: characterRow.id,
        slug: characterRow.slug,
        displayName: characterRow.display_name,
        fandomEntity: characterRow.fandom_entity
      },
      linkedCount: unique.size,
      addedCount
    };
  }

  markCatalogCharacterSyncFailed(slug) {
    const character = this.statements.catalogCharacterBySlug.get(slug);

    if (!character) {
      return;
    }

    const now = nowIso();
    this.statements.catalogCharacterSyncUpdate.run(now, "failed", 0, now, character.id);
  }

  updateCatalogCollection(id, { owned, publisher, editionTitle, notes }) {
    const result = this.statements.catalogCollectionUpdate.run(
      owned ? 1 : 0,
      String(publisher || "").trim(),
      String(editionTitle || "").trim(),
      String(notes || "").trim(),
      nowIso(),
      id
    );

    if (!result.changes) {
      return null;
    }

    return this.getCatalogIssue(id);
  }

  getCatalogScope(characterSlug = "", universeGroup = "main") {
    if (characterSlug) {
      return { conditions: ["c.slug = ?"], params: [characterSlug] };
    }

    const featured = ["Earth-65", "Earth-928", "Earth-982", "Earth-90214"];
    if (universeGroup === "all") return { conditions: ["c.active = 1"], params: [] };
    if (universeGroup === "ultimate") {
      return { conditions: ["c.active = 1", "c.reality IN ('Earth-1610', 'Earth-6160')"], params: [] };
    }
    if (universeGroup === "featured") {
      return { conditions: ["c.active = 1", `c.reality IN (${featured.map(() => "?").join(", ")})`], params: featured };
    }
    if (universeGroup === "other") {
      const excluded = ["Earth-616", "Earth-1610", "Earth-6160", ...featured];
      return {
        conditions: ["c.active = 1", `c.reality NOT IN (${excluded.map(() => "?").join(", ")})`],
        params: excluded
      };
    }
    return { conditions: ["c.active = 1", "c.reality = 'Earth-616'"], params: [] };
  }

  getCatalogStats(characterSlug = "", universeGroup = "main") {
    const scope = this.getCatalogScope(characterSlug, universeGroup);
    const row = this.db.prepare(`
      SELECT
        COUNT(DISTINCT i.id) AS total_count,
        COUNT(DISTINCT CASE WHEN i.owned = 1 THEN i.id END) AS owned_count,
        COUNT(DISTINCT i.series_name) AS series_count,
        COUNT(DISTINCT CASE WHEN ci.appearance_type = 'direct' THEN i.id END) AS direct_count,
        COUNT(DISTINCT CASE WHEN ci.appearance_type = 'minor' THEN i.id END) AS minor_count,
        COUNT(DISTINCT CASE WHEN i.release_date IS NOT NULL AND i.release_date != '' THEN i.id END) AS dated_count,
        COUNT(DISTINCT CASE WHEN i.writers_json != '[]' THEN i.id END) AS writers_count,
        MAX(i.source_synced_at) AS last_source_sync_at,
        MAX(i.release_date) AS last_comic_date
      FROM catalog_characters c
      LEFT JOIN catalog_character_issues ci ON ci.character_id = c.id
      LEFT JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
      WHERE ${scope.conditions.join(" AND ")}
    `).get(...scope.params) || {};
    const totalCount = Number(row.total_count || 0);
    const ownedCount = Number(row.owned_count || 0);

    return {
      totalCount,
      ownedCount,
      missingCount: Math.max(0, totalCount - ownedCount),
      seriesCount: Number(row.series_count || 0),
      directCount: Number(row.direct_count || 0),
      minorCount: Number(row.minor_count || 0),
      datedCount: Number(row.dated_count || 0),
      writersCount: Number(row.writers_count || 0),
      completionPercent: totalCount ? Number(((ownedCount / totalCount) * 100).toFixed(2)) : 0,
      lastSourceSyncAt: row.last_source_sync_at || "",
      lastComicDate: row.last_comic_date || ""
    };
  }

  listCatalogIssues(filters = {}) {
    const scope = this.getCatalogScope(filters.character || "", filters.universeGroup || "main");
    const conditions = [...scope.conditions];
    const params = [...scope.params];
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 60));
    const offset = Math.max(0, Number(filters.offset) || 0);

    if (filters.query) {
      conditions.push("(i.title LIKE ? OR i.series_name LIKE ? OR i.writers_json LIKE ? OR i.owned_edition LIKE ?)");
      const search = `%${filters.query}%`;
      params.push(search, search, search, search);
    }

    if (filters.from) {
      conditions.push("i.release_date >= ?");
      params.push(filters.from);
    }

    if (filters.to) {
      conditions.push("i.release_date <= ?");
      params.push(filters.to);
    }

    if (filters.ownership === "owned") {
      conditions.push("i.owned = 1");
    } else if (filters.ownership === "missing") {
      conditions.push("i.owned = 0");
    }

    if (filters.appearance === "direct" || filters.appearance === "minor") {
      conditions.push("ci.appearance_type = ?");
      params.push(filters.appearance);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const orders = {
      series: "i.series_name COLLATE NOCASE ASC, COALESCE(i.volume_number, -1) ASC, COALESCE(i.issue_number, -1) ASC, i.issue_label COLLATE NOCASE ASC",
      "date-desc": "i.release_date IS NULL ASC, i.release_date DESC, i.title COLLATE NOCASE ASC",
      "date-asc": "i.release_date IS NULL ASC, i.release_date ASC, i.title COLLATE NOCASE ASC",
      title: "i.title COLLATE NOCASE ASC"
    };
    const orderBy = orders[filters.sort] || orders.series;
    const total = Number(this.db.prepare(`
      SELECT COUNT(DISTINCT i.id) AS count
      FROM catalog_characters c
      JOIN catalog_character_issues ci ON ci.character_id = c.id
      JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
      ${where}
    `).get(...params).count || 0);
    const rows = this.db.prepare(`
      SELECT i.*,
             CASE WHEN MAX(CASE WHEN ci.appearance_type = 'direct' THEN 1 ELSE 0 END) = 1
               THEN 'direct' ELSE 'minor' END AS character_appearance_type
      FROM catalog_characters c
      JOIN catalog_character_issues ci ON ci.character_id = c.id
      JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
      ${where}
      GROUP BY i.id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return {
      items: rows.map((row) => this.mapCatalogIssue(row)),
      total,
      limit,
      offset
    };
  }

  listCatalogIssuesMissingCovers() {
    return this.db.prepare(`
      SELECT fandom_page_id AS fandomPageId, page_title AS pageTitle,
             appearance_type AS appearanceType
      FROM spiderman_catalog_issues
      WHERE cover_image_url IS NULL OR trim(cover_image_url) = ''
      ORDER BY fandom_page_id ASC
    `).all();
  }

  listCatalogIssuesMissingDates() {
    return this.db.prepare(`
      SELECT fandom_page_id AS fandomPageId, page_title AS pageTitle,
             appearance_type AS appearanceType
      FROM spiderman_catalog_issues
      WHERE release_date IS NULL OR trim(release_date) = ''
      ORDER BY fandom_page_id ASC
    `).all();
  }

  listSpanishEditions(filters = {}) {
    const editionRows = this.db.prepare(`
      SELECT *
      FROM spanish_editions
      ORDER BY CASE purchase_status WHEN 'wanted' THEN 0 ELSE 1 END,
               publisher COLLATE NOCASE ASC,
               collection_name COLLATE NOCASE ASC,
               title COLLATE NOCASE ASC
    `).all();
    const linkedRows = this.db.prepare(`
      SELECT sei.edition_id, sei.position, i.*
      FROM spanish_edition_issues sei
      JOIN spiderman_catalog_issues i ON i.id = sei.issue_id
      ORDER BY sei.edition_id ASC, sei.position ASC,
               i.series_name COLLATE NOCASE ASC,
               COALESCE(i.volume_number, -1) ASC,
               COALESCE(i.issue_number, -1) ASC
    `).all();
    const byEdition = new Map();

    for (const row of linkedRows) {
      if (!byEdition.has(Number(row.edition_id))) {
        byEdition.set(Number(row.edition_id), []);
      }
      byEdition.get(Number(row.edition_id)).push(this.mapCatalogIssue(row));
    }

    const allItems = editionRows.map((row) => this.mapSpanishEdition(row, byEdition.get(Number(row.id)) || []));
    const query = normalizeText(filters.query || "");
    const publisher = normalizeText(filters.publisher || "");
    const character = normalizeText(filters.character || "");
    const status = filters.status === "wanted" || filters.status === "owned" ? filters.status : "";
    const items = allItems.filter((edition) => {
      if (status && edition.purchaseStatus !== status) return false;
      if (publisher && normalizeText(edition.publisher) !== publisher) return false;
      if (character && !edition.characters.some((name) => normalizeText(name) === character)) return false;
      if (!query) return true;
      const haystack = normalizeText([
        edition.title,
        edition.publisher,
        edition.collectionName,
        edition.volumeLabel,
        edition.formatLabel,
        edition.isbn,
        edition.notes,
        ...edition.characters,
        ...edition.issues.map((issue) => `${issue.title} ${issue.seriesName}`)
      ].join(" "));
      return haystack.includes(query);
    });
    const publishers = uniqueStrings(allItems.map((edition) => edition.publisher).filter(Boolean))
      .sort((a, b) => a.localeCompare(b, "es"));
    const characterMap = new Map();

    for (const name of allItems.flatMap((edition) => edition.characters)) {
      const key = normalizeText(name);
      if (key && !characterMap.has(key)) characterMap.set(key, name);
    }

    return {
      items,
      stats: {
        totalCount: allItems.length,
        wantedCount: allItems.filter((edition) => edition.purchaseStatus === "wanted").length,
        ownedCount: allItems.filter((edition) => edition.purchaseStatus === "owned").length,
        linkedIssueCount: allItems.reduce((total, edition) => total + edition.issueCount, 0),
        publisherCount: publishers.length
      },
      filters: {
        publishers,
        characters: [...characterMap.values()].sort((a, b) => a.localeCompare(b, "es"))
      }
    };
  }

  getSpanishEdition(id) {
    return this.listSpanishEditions().items.find((edition) => edition.id === Number(id)) || null;
  }

  saveSpanishEdition(id, payload = {}) {
    const title = String(payload.title || "").trim();
    if (!title) throw new Error("El título es obligatorio.");

    const purchaseStatus = payload.purchaseStatus === "owned" ? "owned" : "wanted";
    const characterMap = new Map();
    for (const value of payload.characters || []) {
      const name = String(value || "").trim();
      const key = normalizeText(name);
      if (key && !characterMap.has(key)) characterMap.set(key, name);
    }
    const issueIds = [...new Set((payload.issueIds || [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0))]
      .filter((issueId) => Boolean(this.statements.catalogById.get(issueId)));
    const values = {
      title,
      publisher: String(payload.publisher || "").trim(),
      collectionName: String(payload.collectionName || "").trim(),
      volumeLabel: String(payload.volumeLabel || "").trim(),
      formatLabel: String(payload.formatLabel || "").trim(),
      publicationDate: String(payload.publicationDate || "").trim() || null,
      isbn: String(payload.isbn || "").trim(),
      coverImageUrl: String(payload.coverImageUrl || "").trim(),
      referenceUrl: String(payload.referenceUrl || "").trim(),
      purchaseStatus,
      charactersJson: JSON.stringify([...characterMap.values()]),
      notes: String(payload.notes || "").trim()
    };
    const now = nowIso();
    let editionId = Number(id) || null;
    this.db.exec("BEGIN;");

    try {
      if (editionId) {
        const result = this.db.prepare(`
          UPDATE spanish_editions
          SET title = ?, publisher = ?, collection_name = ?, volume_label = ?, format_label = ?,
              publication_date = ?, isbn = ?, cover_image_url = ?, reference_url = ?,
              purchase_status = ?, characters_json = ?, notes = ?, updated_at = ?
          WHERE id = ?
        `).run(
          values.title, values.publisher, values.collectionName, values.volumeLabel, values.formatLabel,
          values.publicationDate, values.isbn, values.coverImageUrl, values.referenceUrl,
          values.purchaseStatus, values.charactersJson, values.notes, now, editionId
        );
        if (!result.changes) throw new Error("Edición en español no encontrada.");
      } else {
        const result = this.db.prepare(`
          INSERT INTO spanish_editions (
            title, publisher, collection_name, volume_label, format_label, publication_date,
            isbn, cover_image_url, reference_url, purchase_status, characters_json, notes,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          values.title, values.publisher, values.collectionName, values.volumeLabel, values.formatLabel,
          values.publicationDate, values.isbn, values.coverImageUrl, values.referenceUrl,
          values.purchaseStatus, values.charactersJson, values.notes, now, now
        );
        editionId = Number(result.lastInsertRowid);
      }

      this.db.prepare("DELETE FROM spanish_edition_issues WHERE edition_id = ?").run(editionId);
      const insertIssue = this.db.prepare(`
        INSERT INTO spanish_edition_issues (edition_id, issue_id, position, created_at)
        VALUES (?, ?, ?, ?)
      `);
      issueIds.forEach((issueId, position) => insertIssue.run(editionId, issueId, position, now));
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }

    return this.getSpanishEdition(editionId);
  }

  deleteSpanishEdition(id) {
    return Boolean(this.db.prepare("DELETE FROM spanish_editions WHERE id = ?").run(Number(id)).changes);
  }

  searchCatalogIssues(query, limit = 30) {
    const value = String(query || "").trim();
    if (value.length < 2) return [];

    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 30));
    const like = `%${value}%`;
    const numericId = /^\d+$/.test(value) ? Number(value) : -1;
    return this.db.prepare(`
      SELECT *
      FROM spiderman_catalog_issues
      WHERE id = ? OR title LIKE ? OR series_name LIKE ? OR page_title LIKE ? OR fandom_url LIKE ?
      ORDER BY title COLLATE NOCASE ASC
      LIMIT ?
    `).all(numericId, like, like, like, like, safeLimit).map((row) => this.mapCatalogIssue(row));
  }

  listAllCatalogMemberships() {
    return this.db.prepare(`
      SELECT i.*, ci.appearance_type AS character_appearance_type,
             c.slug AS character_slug, c.display_name AS character_display_name,
             c.fandom_entity AS character_fandom_entity, c.kind AS character_kind,
             c.reality AS character_reality
      FROM catalog_characters c
      JOIN catalog_character_issues ci ON ci.character_id = c.id
      JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
      WHERE c.active = 1
      ORDER BY CASE c.kind WHEN 'spider' THEN 0 ELSE 1 END,
               c.display_name COLLATE NOCASE ASC,
               i.series_name COLLATE NOCASE ASC,
               COALESCE(i.volume_number, -1) ASC,
               COALESCE(i.issue_number, -1) ASC,
               i.issue_label COLLATE NOCASE ASC
    `).all().map((row) => ({
      character: {
        slug: row.character_slug,
        displayName: row.character_display_name,
        fandomEntity: row.character_fandom_entity,
        kind: row.character_kind,
        reality: row.character_reality
      },
      issue: this.mapCatalogIssue(row)
    }));
  }

  createBackupSnapshot(targetPath) {
    const absoluteTarget = path.resolve(targetPath);
    fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });

    if (fs.existsSync(absoluteTarget)) {
      fs.unlinkSync(absoluteTarget);
    }

    this.db.exec("PRAGMA wal_checkpoint(FULL);");
    this.db.exec(`VACUUM main INTO '${absoluteTarget.replace(/'/g, "''")}';`);

    return absoluteTarget;
  }

  close() {
    this.db.close();
  }
}

module.exports = {
  ComicDatabase
};
