const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { manualSpiderRoster } = require("./catalog-characters");
const { deriveVolumeInfo } = require("./marvel");
const { matchContainsToCatalog, sourceKeyFromUrl } = require("./panini");
const {
  buildWeekKey,
  normalizeText,
  nowIso,
  safeJsonParse,
  uniqueStrings
} = require("./utils");

const MAJOR_ENEMY_APPEARANCE_THRESHOLD = 100;

function addEnemyCount(counts, rawName, increment = 1) {
  const name = String(rawName || "").trim();
  const normalized = normalizeText(name);

  if (!name || !normalized) {
    return;
  }

  const current = counts.get(normalized) || { name, count: 0 };
  current.count += increment;
  counts.set(normalized, current);
}

function buildEnemyOptionGroups(counts) {
  const sortByName = (a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  const items = [...counts.values()].sort(sortByName);
  const major = items
    .filter((item) => item.count >= MAJOR_ENEMY_APPEARANCE_THRESHOLD)
    .sort(sortByName);
  const other = items
    .filter((item) => item.count < MAJOR_ENEMY_APPEARANCE_THRESHOLD)
    .sort(sortByName);

  return {
    threshold: MAJOR_ENEMY_APPEARANCE_THRESHOLD,
    total: items.length,
    items,
    groups: [
      {
        key: "major",
        label: `${MAJOR_ENEMY_APPEARANCE_THRESHOLD} apariciones o más`,
        items: major
      },
      {
        key: "other",
        label: `Menos de ${MAJOR_ENEMY_APPEARANCE_THRESHOLD} apariciones`,
        items: other
      }
    ]
  };
}

function cleanEnemyNameForStorage(value) {
  return String(value || "")
    .trim()
    .replace(/\s+\b(?:1st|first appearance|mentioned|referenced|recap|flashback|dream|illusion|past|death|on[\s-]?screen)\b.*$/i, "")
    .replace(/^[-–—]\s*/, "")
    .replace(/\s*[-–—]$/, "")
    .trim();
}

function uniqueEnemyNames(items) {
  return uniqueStrings((items || []).map(cleanEnemyNameForStorage).filter(Boolean));
}

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

const TRACKED_TO_CATALOG_ENTITY = {
  "Peter Parker": "Peter Parker (Earth-616)",
  "Miles Morales": "Miles Morales (Earth-1610)",
  "Ghost-Spider": "Gwendolyn Stacy (Earth-65)",
  Silk: "Cindy Moon (Earth-616)",
  "Spider-Woman": "Jessica Drew (Earth-616)",
  "Spider-Boy": "Bailey Briggs (Earth-616)",
  "Scarlet Spider": "Benjamin Reilly (Earth-616)",
  "Spider-Man 2099": "Miguel O'Hara (Earth-928)",
  Venom: "Venom (Symbiote) (Earth-616)",
  Carnage: "Carnage (Symbiote) (Earth-616)",
  "Black Cat": "Felicia Hardy (Earth-616)",
  "Mary Jane Watson": "Mary Jane Watson (Earth-616)",
  "Gwen Stacy": "Gwendolyne Stacy (Earth-616)",
  Knull: "Knull (Earth-616)"
};

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
    this.migrateTrackedCharactersToCatalog();
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
        antagonists_json TEXT NOT NULL DEFAULT '[]',
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
        aliases_json TEXT NOT NULL DEFAULT '[]',
        weekly_enabled INTEGER NOT NULL DEFAULT 1,
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

      CREATE TABLE IF NOT EXISTS panini_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        product_url TEXT NOT NULL UNIQUE,
        cover_image_url TEXT NOT NULL DEFAULT '',
        publication_date TEXT,
        pages INTEGER,
        isbn TEXT NOT NULL DEFAULT '',
        format_label TEXT NOT NULL DEFAULT '',
        contains_raw TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending_contains' CHECK(status IN ('pending_contains', 'pending_match', 'matched', 'error')),
        matched_edition_id INTEGER REFERENCES spanish_editions(id) ON DELETE SET NULL,
        unresolved_json TEXT NOT NULL DEFAULT '[]',
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT NOT NULL DEFAULT '',
        first_seen_at TEXT NOT NULL,
        last_checked_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS spanish_source_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        source_key TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        product_url TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'error')),
        error_message TEXT NOT NULL DEFAULT '',
        discovered_at TEXT NOT NULL,
        last_attempt_at TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        UNIQUE(source, source_key)
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
      CREATE INDEX IF NOT EXISTS idx_panini_products_status ON panini_products(status, last_checked_at);
      CREATE INDEX IF NOT EXISTS idx_spanish_source_queue_pending ON spanish_source_queue(source, status, priority DESC, id);
    `);

    this.ensureColumn("comics", "volume_id INTEGER REFERENCES volumes(id)");
    this.ensureColumn("comics", "issue_label TEXT");
    this.ensureColumn("comics", "issue_number INTEGER");
    this.ensureColumn("comics", "originality_status TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn("comics", "originality_reason TEXT");
    this.ensureColumn("spiderman_catalog_issues", "date_source TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("spiderman_catalog_issues", "date_precision TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("spiderman_catalog_issues", "antagonists_json TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("catalog_character_issues", "appearance_detail TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("catalog_characters", "aliases_json TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("catalog_characters", "weekly_enabled INTEGER NOT NULL DEFAULT 1");
    this.ensureColumn("spanish_editions", "source TEXT NOT NULL DEFAULT 'manual'");
    this.ensureColumn("spanish_editions", "source_key TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("spanish_editions", "pages INTEGER");
    this.ensureColumn("spanish_editions", "contains_raw TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("spanish_editions", "last_checked_at TEXT NOT NULL DEFAULT ''");
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_spanish_editions_source_key
      ON spanish_editions(source, source_key) WHERE source_key != '';`);
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

  migrateTrackedCharactersToCatalog() {
    const alreadyMigrated = this.db.prepare("SELECT value FROM app_state WHERE key = 'unified_character_tracking_v1'").get();
    if (alreadyMigrated) return;
    const trackedRows = this.db.prepare("SELECT * FROM tracked_characters").all();
    const findCatalog = this.db.prepare("SELECT * FROM catalog_characters WHERE fandom_entity = ?");
    const updateCatalog = this.db.prepare(`
      UPDATE catalog_characters
      SET aliases_json = ?, weekly_enabled = ?, updated_at = ?
      WHERE id = ?
    `);
    let migrated = 0;

    for (const tracked of trackedRows) {
      const entity = TRACKED_TO_CATALOG_ENTITY[tracked.display_name];
      if (!entity) continue;
      const catalog = findCatalog.get(entity);
      if (!catalog) continue;
      const aliases = uniqueStrings([
        ...safeJsonParse(catalog.aliases_json, []),
        ...safeJsonParse(tracked.aliases_json, [])
      ]);
      updateCatalog.run(JSON.stringify(aliases), tracked.active ? 1 : 0, nowIso(), catalog.id);
      migrated += 1;
    }

    this.db.prepare(`
      INSERT INTO app_state (key, value) VALUES ('unified_character_tracking_v1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify({ migrated, retiredGroups: ["Spider-Verse (all variants)", "Symbiotes (all variants)"], migratedAt: nowIso() }));
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
        FROM catalog_characters
        WHERE active = 1 AND weekly_enabled = 1
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
          issue_label, issue_number, release_date, date_source, date_precision, cover_image_url, writers_json, antagonists_json,
          appearance_type, source_defaultsort, source_synced_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          antagonists_json = excluded.antagonists_json,
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
               COUNT(CASE WHEN i.release_date IS NULL OR trim(i.release_date) = '' OR i.release_date <= date('now', 'localtime') THEN ci.issue_id END) AS issue_count,
               SUM(CASE WHEN i.owned = 1 AND (i.release_date IS NULL OR trim(i.release_date) = '' OR i.release_date <= date('now', 'localtime')) THEN 1 ELSE 0 END) AS owned_count,
               SUM(CASE WHEN ci.appearance_type = 'direct' AND (i.release_date IS NULL OR trim(i.release_date) = '' OR i.release_date <= date('now', 'localtime')) THEN 1 ELSE 0 END) AS direct_count,
               SUM(CASE WHEN ci.appearance_type = 'minor' AND (i.release_date IS NULL OR trim(i.release_date) = '' OR i.release_date <= date('now', 'localtime')) THEN 1 ELSE 0 END) AS minor_count,
               MAX(CASE WHEN i.release_date <= date('now', 'localtime') THEN i.release_date END) AS computed_last_comic_date
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
        INSERT INTO catalog_character_issues (character_id, issue_id, appearance_type, appearance_detail, source_synced_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(character_id, issue_id) DO UPDATE SET
          appearance_type = CASE
            WHEN catalog_character_issues.appearance_type = 'direct' OR excluded.appearance_type = 'direct' THEN 'direct'
            ELSE 'minor'
          END,
          appearance_detail = CASE
            WHEN catalog_character_issues.appearance_type = 'direct' OR excluded.appearance_type = 'direct' THEN ''
            ELSE excluded.appearance_detail
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
                AND (i.release_date IS NULL OR trim(i.release_date) = '' OR i.release_date <= date('now', 'localtime'))
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

    const scopedCharacters = safeJsonParse(row.scoped_characters_json || "[]", [])
      .filter((item) => item && item.slug)
      .filter((item, index, all) => all.findIndex((other) => other.slug === item.slug) === index)
      .map((item) => ({
        slug: item.slug,
        displayName: item.displayName,
        reality: item.reality || "",
        appearanceType: item.appearanceType || "direct",
        appearanceDetail: item.appearanceDetail || ""
      }));

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
      antagonists: safeJsonParse(row.antagonists_json, []),
      appearanceType: row.character_appearance_type || row.appearance_type,
      appearanceDetail: scopedCharacters.length === 1 ? scopedCharacters[0].appearanceDetail : "",
      characters: scopedCharacters,
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
      aliases: safeJsonParse(row.aliases_json, []),
      weeklyEnabled: Boolean(row.weekly_enabled),
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
      source: row.source || "manual",
      sourceKey: row.source_key || "",
      pages: row.pages === null || row.pages === undefined ? null : Number(row.pages),
      containsRaw: row.contains_raw || "",
      lastCheckedAt: row.last_checked_at || "",
      characters: safeJsonParse(row.characters_json, []),
      notes: row.notes,
      issues,
      issueCount: issues.length,
      preferredIssueCount: 0,
      alternativeIssueCount: 0,
      duplicateCoverageCount: 0,
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
    return this.listCatalogCharacters().map((character) => ({
      id: character.id,
      displayName: character.displayName,
      aliases: character.aliases,
      active: character.weeklyEnabled,
      fandomEntity: character.fandomEntity,
      kind: character.kind,
      reality: character.reality,
      issueCount: character.issueCount,
      source: "catalog"
    }));
  }

  createTrackedCharacter({ displayName, aliases, active }) {
    throw new Error("Los personajes se agregan desde el catálogo unificado de Marvel Fandom.");
  }

  getTrackedCharacterById(id) {
    return this.getTrackedCharacters().find((character) => character.id === Number(id)) || null;
  }

  updateTrackedCharacter(id, { displayName, aliases, active }) {
    this.db.prepare(`
      UPDATE catalog_characters
      SET aliases_json = ?, weekly_enabled = ?, updated_at = ?
      WHERE id = ? AND active = 1
    `).run(JSON.stringify(uniqueStrings(aliases)), active ? 1 : 0, nowIso(), id);
    return this.getTrackedCharacterById(id);
  }

  deleteTrackedCharacter(id) {
    return this.db.prepare(`
      UPDATE catalog_characters SET weekly_enabled = 0, updated_at = ? WHERE id = ?
    `).run(nowIso(), id);
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
        JSON.stringify(uniqueEnemyNames(comic.antagonists || [])),
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
        JSON.stringify(uniqueEnemyNames(comic.antagonists || [])),
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
      const name = character.section === "antagonists"
        ? cleanEnemyNameForStorage(character.name)
        : String(character.name || "").trim();

      if (!name) {
        continue;
      }

      this.statements.comicCharacterInsert.run(
        comicId,
        name,
        normalizeText(name),
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
    const conditions = [
      "c.decision IN ('auto_added', 'manual_added')",
      "(c.release_date IS NULL OR trim(c.release_date) = '' OR c.release_date <= date('now', 'localtime'))"
    ];
    const params = [];

    if (filters.scope === "latest-week") {
      conditions.push(`
        c.week_key = COALESCE((
          SELECT sr.week_key
          FROM sync_runs sr
          WHERE sr.status = 'completed'
          ORDER BY sr.started_at DESC
          LIMIT 1
        ), '')
      `);
    } else if (filters.scope === "history") {
      conditions.push(`
        c.week_key != COALESCE((
          SELECT sr.week_key
          FROM sync_runs sr
          WHERE sr.status = 'completed'
          ORDER BY sr.started_at DESC
          LIMIT 1
        ), '')
      `);
    }

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

    if (filters.enemy) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM comic_characters cc3
          WHERE cc3.comic_id = c.id
            AND cc3.section = 'antagonists'
            AND cc3.normalized_name = ?
        )
      `);
      params.push(normalizeText(filters.enemy));
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

  listComicEnemies(filters = {}) {
    const conditions = [
      "c.decision IN ('auto_added', 'manual_added')",
      "(c.release_date IS NULL OR trim(c.release_date) = '' OR c.release_date <= date('now', 'localtime'))"
    ];
    const params = [];

    if (filters.scope === "latest-week") {
      conditions.push(`
        c.week_key = COALESCE((
          SELECT sr.week_key
          FROM sync_runs sr
          WHERE sr.status = 'completed'
          ORDER BY sr.started_at DESC
          LIMIT 1
        ), '')
      `);
    } else if (filters.scope === "history") {
      conditions.push(`
        c.week_key != COALESCE((
          SELECT sr.week_key
          FROM sync_runs sr
          WHERE sr.status = 'completed'
          ORDER BY sr.started_at DESC
          LIMIT 1
        ), '')
      `);
    }

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
        cc.normalized_name AS normalized_name,
        MIN(cc.character_name) AS name,
        COUNT(DISTINCT c.id) AS count
      FROM comics c
      JOIN comic_characters cc ON cc.comic_id = c.id
      WHERE ${conditions.join(" AND ")}
        AND cc.section = 'antagonists'
        AND trim(cc.character_name) != ''
      GROUP BY cc.normalized_name
    `).all(...params);
    const counts = new Map();

    for (const row of rows) {
      addEnemyCount(counts, row.name, Number(row.count || 0));
    }

    return buildEnemyOptionGroups(counts);
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
          JSON.stringify(uniqueEnemyNames(issue.antagonists || [])),
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

    const existingRows = this.db.prepare(`
      SELECT issue_id, appearance_type, appearance_detail
      FROM catalog_character_issues WHERE character_id = ?
    `).all(characterRow.id);
    const existing = new Map(existingRows.map((row) => [Number(row.issue_id), row]));
    const resolved = [];

    for (const member of members) {
      const issue = this.statements.catalogByFandomPageId.get(member.pageId);

      if (issue) {
        resolved.push({
          issueId: Number(issue.id),
          appearanceType: member.appearanceType,
          appearanceDetail: member.appearanceType === "minor"
            ? String(member.appearanceDetail || existing.get(Number(issue.id))?.appearance_detail || "")
            : ""
        });
      }
    }

    const unique = new Map();

    for (const item of resolved) {
      const previous = unique.get(item.issueId);
      unique.set(item.issueId, {
        issueId: item.issueId,
        appearanceType: previous?.appearanceType === "direct" || item.appearanceType === "direct" ? "direct" : "minor",
        appearanceDetail: previous?.appearanceType === "direct" || item.appearanceType === "direct"
          ? ""
          : (item.appearanceDetail || previous?.appearanceDetail || "")
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
          item.appearanceDetail,
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
    scope.conditions.push("(i.release_date IS NULL OR trim(i.release_date) = '' OR i.release_date <= date('now', 'localtime'))");
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
    conditions.push("(i.release_date IS NULL OR trim(i.release_date) = '' OR i.release_date <= date('now', 'localtime'))");
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 60));
    const offset = Math.max(0, Number(filters.offset) || 0);

    if (filters.query) {
      conditions.push("(i.title LIKE ? OR i.series_name LIKE ? OR i.writers_json LIKE ? OR i.owned_edition LIKE ?)");
      const search = `%${filters.query}%`;
      params.push(search, search, search, search);
    }

    if (filters.enemy) {
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM json_each(i.antagonists_json) enemy
          WHERE enemy.value = ? COLLATE NOCASE
        )
      `);
      params.push(filters.enemy);
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
    } else if (["flashback", "dream", "vision", "recap"].includes(filters.appearance)) {
      conditions.push("ci.appearance_type = 'minor' AND ci.appearance_detail = ?");
      params.push(filters.appearance);
    } else if (filters.appearance === "other-minor") {
      conditions.push("ci.appearance_type = 'minor' AND ci.appearance_detail NOT IN ('flashback', 'dream', 'vision', 'recap')");
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const orders = {
      series: "i.series_name COLLATE NOCASE ASC, COALESCE(i.volume_number, -1) ASC, COALESCE(i.issue_number, -1) ASC, i.issue_label COLLATE NOCASE ASC",
      "date-desc": "i.release_date IS NULL ASC, i.release_date DESC, i.title COLLATE NOCASE ASC",
      "date-asc": "i.release_date IS NULL ASC, i.release_date ASC, i.title COLLATE NOCASE ASC",
      title: "i.title COLLATE NOCASE ASC"
    };
    const orderBy = orders[filters.sort] || orders["date-asc"];
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
               THEN 'direct' ELSE 'minor' END AS character_appearance_type,
             json_group_array(json_object(
               'slug', c.slug,
               'displayName', c.display_name,
               'reality', c.reality,
               'appearanceType', ci.appearance_type,
               'appearanceDetail', ci.appearance_detail
             )) AS scoped_characters_json
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

  listCatalogEnemies(filters = {}) {
    const scope = this.getCatalogScope(filters.character || "", filters.universeGroup || "main");
    const conditions = [...scope.conditions];
    const params = [...scope.params];
    conditions.push("(i.release_date IS NULL OR trim(i.release_date) = '' OR i.release_date <= date('now', 'localtime'))");

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
    } else if (["flashback", "dream", "vision", "recap"].includes(filters.appearance)) {
      conditions.push("ci.appearance_type = 'minor' AND ci.appearance_detail = ?");
      params.push(filters.appearance);
    } else if (filters.appearance === "other-minor") {
      conditions.push("ci.appearance_type = 'minor' AND ci.appearance_detail NOT IN ('flashback', 'dream', 'vision', 'recap')");
    }

    const rows = this.db.prepare(`
      SELECT i.id, i.antagonists_json
      FROM catalog_characters c
      JOIN catalog_character_issues ci ON ci.character_id = c.id
      JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
      WHERE ${conditions.join(" AND ")}
      GROUP BY i.id
    `).all(...params);
    const counts = new Map();

    for (const row of rows) {
      const seen = new Set();
      for (const name of safeJsonParse(row.antagonists_json, [])) {
        const normalized = normalizeText(name);
        if (!normalized || seen.has(normalized)) {
          continue;
        }
        seen.add(normalized);
        addEnemyCount(counts, name);
      }
    }

    return buildEnemyOptionGroups(counts);
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

  listCatalogIssuesForEnemyBackfill({ missingOnly = false, limit = 0, offset = 0 } = {}) {
    const conditions = missingOnly
      ? ["(antagonists_json IS NULL OR trim(antagonists_json) = '' OR antagonists_json = '[]')"]
      : ["1 = 1"];
    const params = [];
    const safeLimit = Math.max(0, Number(limit) || 0);
    const safeOffset = Math.max(0, Number(offset) || 0);
    const pagination = safeLimit ? "LIMIT ? OFFSET ?" : "";

    if (safeLimit) {
      params.push(safeLimit, safeOffset);
    }

    return this.db.prepare(`
      SELECT
        fandom_page_id AS fandomPageId,
        page_title AS pageTitle,
        appearance_type AS appearanceType,
        antagonists_json AS antagonistsJson
      FROM spiderman_catalog_issues
      WHERE ${conditions.join(" AND ")}
      ORDER BY fandom_page_id ASC
      ${pagination}
    `).all(...params);
  }

  updateCatalogIssueAntagonists(items) {
    const update = this.db.prepare(`
      UPDATE spiderman_catalog_issues
      SET antagonists_json = ?, source_synced_at = ?, updated_at = ?
      WHERE fandom_page_id = ?
    `);
    const syncAt = nowIso();
    let changes = 0;

    this.db.exec("BEGIN;");
    try {
      for (const item of items || []) {
        changes += Number(update.run(
          JSON.stringify(uniqueEnemyNames(item.antagonists || [])),
          syncAt,
          syncAt,
          Number(item.fandomPageId)
        ).changes || 0);
      }
      this.db.exec("COMMIT;");
      return changes;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  listCatalogMembershipsMissingAppearanceDetails() {
    return this.db.prepare(`
      SELECT ci.character_id AS characterId, ci.issue_id AS issueId,
             c.fandom_entity AS fandomEntity,
             i.fandom_page_id AS fandomPageId, i.page_title AS pageTitle
      FROM catalog_character_issues ci
      JOIN catalog_characters c ON c.id = ci.character_id
      JOIN spiderman_catalog_issues i ON i.id = ci.issue_id
      WHERE ci.appearance_type = 'minor' AND trim(ci.appearance_detail) = ''
      ORDER BY i.fandom_page_id, c.id
    `).all();
  }

  updateCatalogAppearanceDetails(items) {
    const update = this.db.prepare(`
      UPDATE catalog_character_issues
      SET appearance_detail = ?, source_synced_at = ?
      WHERE character_id = ? AND issue_id = ? AND appearance_type = 'minor'
    `);
    const syncAt = nowIso();
    let changes = 0;
    this.db.exec("BEGIN;");
    try {
      for (const item of items || []) {
        changes += Number(update.run(String(item.appearanceDetail || "other"), syncAt, item.characterId, item.issueId).changes || 0);
      }
      this.db.exec("COMMIT;");
      return changes;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
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
    const issueCoverage = new Map();
    for (const edition of allItems) {
      for (const issue of edition.issues) {
        if (!issueCoverage.has(issue.id)) issueCoverage.set(issue.id, []);
        issueCoverage.get(issue.id).push(edition);
      }
    }
    for (const editions of issueCoverage.values()) {
      editions.sort((a, b) => Number(b.pages || 0) - Number(a.pages || 0) || a.id - b.id);
      const preferredId = editions[0]?.id;
      for (const edition of editions) {
        const issue = edition.issues.find((item) => issueCoverage.get(item.id) === editions);
        if (issue) {
          issue.spanishEditionCount = editions.length;
          issue.isPreferredSpanishEdition = edition.id === preferredId;
        }
        if (edition.id === preferredId) edition.preferredIssueCount += 1;
        else edition.alternativeIssueCount += 1;
        if (editions.length > 1) edition.duplicateCoverageCount += 1;
      }
    }
    const query = normalizeText(filters.query || "");
    const publisher = normalizeText(filters.publisher || "");
    const character = normalizeText(filters.character || "");
    const status = filters.status === "wanted" || filters.status === "owned" ? filters.status : "";
    const filteredItems = allItems.filter((edition) => {
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
    const limit = Math.max(1, Math.min(10_000, Number(filters.limit) || 20));
    const offset = Math.max(0, Number(filters.offset) || 0);
    const items = filteredItems.slice(offset, offset + limit);
    const publishers = uniqueStrings(allItems.map((edition) => edition.publisher).filter(Boolean))
      .sort((a, b) => a.localeCompare(b, "es"));
    const paniniStats = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending_contains' THEN 1 ELSE 0 END) AS pending_contains,
        SUM(CASE WHEN status = 'pending_match' THEN 1 ELSE 0 END) AS pending_match,
        SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END) AS matched,
        MAX(last_checked_at) AS last_checked_at
      FROM panini_products
    `).get() || {};
    const characterMap = new Map();

    for (const name of allItems.flatMap((edition) => edition.characters)) {
      const key = normalizeText(name);
      if (key && !characterMap.has(key)) characterMap.set(key, name);
    }

    return {
      items,
      total: filteredItems.length,
      limit,
      offset,
      stats: {
        totalCount: allItems.length,
        wantedCount: allItems.filter((edition) => edition.purchaseStatus === "wanted").length,
        ownedCount: allItems.filter((edition) => edition.purchaseStatus === "owned").length,
        linkedIssueCount: allItems.reduce((total, edition) => total + edition.issueCount, 0),
        publisherCount: publishers.length,
        paniniPendingContains: Number(paniniStats.pending_contains || 0),
        paniniPendingMatch: Number(paniniStats.pending_match || 0),
        paniniMatchedCount: Number(paniniStats.matched || 0),
        paniniLastCheckedAt: paniniStats.last_checked_at || ""
      },
      filters: {
        publishers,
        characters: [...characterMap.values()].sort((a, b) => a.localeCompare(b, "es"))
      }
    };
  }

  getSpanishEdition(id) {
    return this.listSpanishEditions({ limit: 10_000 }).items.find((edition) => edition.id === Number(id)) || null;
  }

  listSpanishEditionsMissingCovers() {
    return this.db.prepare(`
      SELECT id, title, source, source_key AS sourceKey, reference_url AS referenceUrl
      FROM spanish_editions
      WHERE trim(COALESCE(cover_image_url, '')) = '' AND trim(COALESCE(reference_url, '')) != ''
      ORDER BY source, title COLLATE NOCASE
    `).all();
  }

  updateSpanishEditionCover(id, coverImageUrl) {
    return Boolean(this.db.prepare(`
      UPDATE spanish_editions SET cover_image_url = ?, updated_at = ? WHERE id = ?
    `).run(String(coverImageUrl || ""), nowIso(), Number(id)).changes);
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

  listKnownPaniniProductUrls() {
    return this.db.prepare("SELECT product_url FROM panini_products").all().map((row) => row.product_url);
  }

  listPendingPaniniProducts() {
    return this.db.prepare(`
      SELECT source_key AS sourceKey, title, product_url AS productUrl, status, retry_count AS retryCount
      FROM panini_products
      WHERE status IN ('pending_contains', 'pending_match', 'error')
      ORDER BY last_checked_at ASC
    `).all();
  }

  listCatalogIssuesForPaniniMatching() {
    return this.db.prepare(`
      SELECT id, series_name, volume_number, issue_number, issue_label, release_date, title
      FROM spiderman_catalog_issues
      WHERE issue_number IS NOT NULL
      ORDER BY series_name COLLATE NOCASE, volume_number, issue_number
    `).all();
  }

  queueSpanishSourceProducts(source, products) {
    const now = nowIso();
    const insert = this.db.prepare(`
      INSERT INTO spanish_source_queue (
        source, source_key, title, product_url, priority, status, discovered_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      ON CONFLICT(source, source_key) DO UPDATE SET
        title = CASE WHEN spanish_source_queue.title = '' THEN excluded.title ELSE spanish_source_queue.title END,
        product_url = excluded.product_url,
        priority = MAX(spanish_source_queue.priority, excluded.priority),
        updated_at = excluded.updated_at
    `);
    let changes = 0;
    for (const product of products || []) {
      changes += Number(insert.run(
        source,
        String(product.sourceKey || sourceKeyFromUrl(product.productUrl)),
        String(product.title || ""),
        String(product.productUrl || ""),
        Number(product.priority || 0),
        now,
        now
      ).changes || 0);
    }
    return changes;
  }

  listPendingSpanishSourceProducts(source, limit = 50) {
    return this.db.prepare(`
      SELECT id, source, source_key AS sourceKey, title, product_url AS productUrl, priority
      FROM spanish_source_queue
      WHERE source = ? AND status IN ('pending', 'error')
      ORDER BY priority DESC, id ASC
      LIMIT ?
    `).all(source, Math.max(1, Math.min(500, Number(limit) || 50)));
  }

  resolveSpanishSourceQueueItem(id, errorMessage = "") {
    return this.db.prepare(`
      UPDATE spanish_source_queue
      SET status = ?, error_message = ?, last_attempt_at = ?, updated_at = ?
      WHERE id = ?
    `).run(errorMessage ? "error" : "completed", String(errorMessage || ""), nowIso(), nowIso(), id);
  }

  getSpanishSourceQueueStats(source) {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
             SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
      FROM spanish_source_queue WHERE source = ?
    `).get(source) || {};
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value || 0)]));
  }

  requeueSpanishSourceProducts(source) {
    return this.db.prepare(`
      UPDATE spanish_source_queue
      SET status = 'pending', error_message = '', updated_at = ?
      WHERE source = ? AND status = 'completed'
    `).run(nowIso(), source);
  }

  processPaniniProduct(product = {}) {
    const now = nowIso();
    const productUrl = String(product.productUrl || "").trim();
    const sourceKey = String(product.sourceKey || sourceKeyFromUrl(productUrl)).trim();
    const source = String(product.source || "panini").trim();
    const publisher = String(product.publisher || "Panini Comics").trim();
    if (!sourceKey || !productUrl) throw new Error("El producto de Panini no tiene URL o identificador.");
    const existingProduct = this.db.prepare("SELECT * FROM panini_products WHERE source_key = ?").get(sourceKey);

    if (product.errorMessage) {
      this.db.prepare(`
        INSERT INTO panini_products (
          source_key, title, product_url, status, retry_count, error_message,
          first_seen_at, last_checked_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'error', 1, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          title = excluded.title,
          product_url = excluded.product_url,
          status = 'error',
          retry_count = panini_products.retry_count + 1,
          error_message = excluded.error_message,
          last_checked_at = excluded.last_checked_at,
          updated_at = excluded.updated_at
      `).run(sourceKey, String(product.title || existingProduct?.title || sourceKey), productUrl,
        String(product.errorMessage), existingProduct?.first_seen_at || now, now, now, now);
      return { status: "error", sourceKey };
    }

    const containsRaw = String(product.containsRaw || "").trim();
    const match = containsRaw
      ? matchContainsToCatalog(containsRaw, this.listCatalogIssuesForPaniniMatching(), product.publicationDate || "")
      : { issueIds: [], issues: [], unresolved: [], recognizedSeries: [] };
    const status = !containsRaw ? "pending_contains" : (match.issueIds.length ? "matched" : "pending_match");
    let editionId = existingProduct?.matched_edition_id ? Number(existingProduct.matched_edition_id) : null;
    this.db.exec("BEGIN;");

    try {
      if (status === "matched") {
        const placeholders = match.issueIds.map(() => "?").join(", ");
        const characterRows = this.db.prepare(`
          SELECT DISTINCT c.display_name
          FROM catalog_character_issues ci
          JOIN catalog_characters c ON c.id = ci.character_id
          WHERE ci.issue_id IN (${placeholders})
          ORDER BY c.display_name COLLATE NOCASE
        `).all(...match.issueIds);
        const charactersJson = JSON.stringify(characterRows.map((row) => row.display_name));
        const existingEdition = this.db.prepare(`
          SELECT id, purchase_status, notes, source, source_key FROM spanish_editions
          WHERE (source = ? AND source_key = ?)
             OR (? != '' AND isbn = ? AND publisher = ?)
          ORDER BY CASE WHEN source = ? AND source_key = ? THEN 0 ELSE 1 END
          LIMIT 1
        `).get(source, sourceKey, product.isbn || "", product.isbn || "", publisher, source, sourceKey);

        if (existingEdition) {
          editionId = Number(existingEdition.id);
          if (existingEdition.source === source && existingEdition.source_key === sourceKey) {
            this.db.prepare(`
              UPDATE spanish_editions
              SET title = ?, publisher = ?, publication_date = ?, isbn = ?, cover_image_url = ?,
                  reference_url = ?, format_label = ?, characters_json = ?, source = ?, source_key = ?,
                  pages = ?, contains_raw = ?, last_checked_at = ?, updated_at = ?
              WHERE id = ?
            `).run(
              product.title || sourceKey, publisher, product.publicationDate || null, product.isbn || "", product.coverImageUrl || "",
              productUrl, product.formatLabel || "", charactersJson, source, sourceKey, product.pages || null,
              containsRaw, now, now, editionId
            );
          } else {
            this.db.prepare(`
              UPDATE spanish_editions
              SET pages = MAX(COALESCE(pages, 0), ?),
                  contains_raw = CASE WHEN trim(contains_raw) = '' THEN ? ELSE contains_raw END,
                  characters_json = ?, last_checked_at = ?, updated_at = ?
              WHERE id = ?
            `).run(product.pages || 0, containsRaw, charactersJson, now, now, editionId);
          }
        } else {
          const result = this.db.prepare(`
            INSERT INTO spanish_editions (
              title, publisher, collection_name, volume_label, format_label, publication_date,
              isbn, cover_image_url, reference_url, purchase_status, characters_json, notes,
              source, source_key, pages, contains_raw, last_checked_at, created_at, updated_at
            ) VALUES (?, ?, '', '', ?, ?, ?, ?, ?, 'wanted', ?, '', ?, ?, ?, ?, ?, ?, ?)
          `).run(
            product.title || sourceKey, publisher, product.formatLabel || "", product.publicationDate || null,
            product.isbn || "", product.coverImageUrl || "", productUrl, charactersJson, source,
            sourceKey, product.pages || null, containsRaw, now, now, now
          );
          editionId = Number(result.lastInsertRowid);
        }

        this.db.prepare("DELETE FROM spanish_edition_issues WHERE edition_id = ?").run(editionId);
        const insertLink = this.db.prepare(`
          INSERT INTO spanish_edition_issues (edition_id, issue_id, position, created_at)
          VALUES (?, ?, ?, ?)
        `);
        match.issueIds.forEach((issueId, position) => insertLink.run(editionId, issueId, position, now));
      }

      this.db.prepare(`
        INSERT INTO panini_products (
          source_key, title, product_url, cover_image_url, publication_date, pages, isbn, format_label,
          contains_raw, status, matched_edition_id, unresolved_json, retry_count, error_message,
          first_seen_at, last_checked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '', ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          title = excluded.title,
          product_url = excluded.product_url,
          cover_image_url = excluded.cover_image_url,
          publication_date = excluded.publication_date,
          pages = excluded.pages,
          isbn = excluded.isbn,
          format_label = excluded.format_label,
          contains_raw = excluded.contains_raw,
          status = excluded.status,
          matched_edition_id = COALESCE(excluded.matched_edition_id, panini_products.matched_edition_id),
          unresolved_json = excluded.unresolved_json,
          retry_count = panini_products.retry_count + 1,
          error_message = '',
          last_checked_at = excluded.last_checked_at,
          updated_at = excluded.updated_at
      `).run(
        sourceKey, product.title || sourceKey, productUrl, product.coverImageUrl || "", product.publicationDate || null,
        product.pages || null, product.isbn || "", product.formatLabel || "", containsRaw, status, editionId,
        JSON.stringify(match.unresolved || []), existingProduct?.first_seen_at || now, now, now, now
      );
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }

    return {
      status,
      sourceKey,
      editionId,
      matchedIssueCount: match.issueIds.length,
      unresolved: match.unresolved
    };
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
