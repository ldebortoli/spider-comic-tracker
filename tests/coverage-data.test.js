const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { ComicDatabase } = require('../src/database');
const { deriveVolumeInfo } = require('../src/marvel');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-database-coverage-'));
  const db = new ComicDatabase(path.join(dir, 'test.sqlite'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { db, dir };
}
function issue(id, overrides = {}) {
  return {
    fandomPageId: id, pageTitle: `Amazing Spider-Man Vol 1 ${id}`,
    title: `Amazing Spider-Man #${id}`, fandomUrl: `https://example.test/wiki/Amazing_Spider-Man_Vol_1_${id}`,
    seriesName: 'Amazing Spider-Man', volumeNumber: 1, issueLabel: String(id), issueNumber: id,
    releaseDate: '1963-03-01', dateSource: 'release', datePrecision: 'day', coverImageUrl: '',
    writers: ['Stan Lee'], antagonists: ['Goblin'], appearanceType: 'direct', ...overrides
  };
}
function comic(id, overrides = {}) {
  const pageTitle = `Amazing Spider-Man Vol 1 ${id}`;
  return {
    ...deriveVolumeInfo({ pageTitle, title: `Amazing Spider-Man #${id}`, fandomUrl: `https://example.test/${id}` }),
    title: `Amazing Spider-Man #${id}`, pageTitle, fandomUrl: `https://example.test/${id}`,
    releaseDate: '1963-03-01', coverImageUrl: '', weekYear: 2026, weekNumber: 1,
    weekKey: '2026-W01', decision: 'auto_added', ...overrides
  };
}

test('database migration upgrades legacy rows and preserves volume identity on repeated upgrades', (t) => {
  const { db } = fixture(t);
  db.ensureColumn('comics', 'legacy_test TEXT');
  assert.equal(db.hasColumn('comics', 'legacy_test'), true);
  db.upsertComic(comic(1)); db.upsertComic(comic(2));
  db.db.exec('UPDATE comics SET volume_id = NULL, issue_label = NULL, issue_number = NULL; DELETE FROM volumes;');
  db.backfillComicVolumes();
  assert.equal(db.getComicByPageTitle('Amazing Spider-Man Vol 1 1').issueNumber, 1);
  assert.equal(db.getComicByPageTitle('Amazing Spider-Man Vol 1 2').volumeId, db.getComicByPageTitle('Amazing Spider-Man Vol 1 1').volumeId);
  db.db.exec("UPDATE comics SET page_title='Standalone',title='Standalone',volume_id=NULL,issue_label='legacy',issue_number=42 WHERE id=1;");
  db.backfillComicVolumes();assert.equal(db.getComicById(1).issueLabel,'legacy');assert.equal(db.getComicById(1).issueNumber,42);
  db.db.exec('UPDATE comics SET volume_id=NULL,issue_label=NULL,issue_number=NULL WHERE id=1;');
  db.backfillComicVolumes();assert.equal(db.getComicById(1).issueLabel,'');assert.equal(db.getComicById(1).issueNumber,null);
  db.seedTrackedCharacters();
  db.migrateTrackedCharactersToCatalog();
  db.db.exec("DELETE FROM app_state WHERE key = 'unified_character_tracking_v1'; UPDATE tracked_characters SET active = 0 WHERE display_name = 'Peter Parker'; DELETE FROM catalog_characters WHERE fandom_entity = 'Miles Morales (Earth-1610)';");
  db.migrateTrackedCharactersToCatalog();
  assert.equal(db.getCatalogCharacter('peter-parker-earth-616').weeklyEnabled, false);
  db.upsertCatalogIssues([issue(1)]);
  db.seedPeterCatalogMembership(); db.seedPeterCatalogMembership();
  assert.equal(db.listAllCatalogMemberships().length, 1);
  db.db.exec("DELETE FROM catalog_characters WHERE fandom_entity = 'Peter Parker (Earth-616)';");
  db.seedPeterCatalogMembership();
  assert.equal(db.listAllCatalogMemberships().length, 0);
});

test('database mapping, tracked-character edits and absent records expose stable public contracts', (t) => {
  const { db } = fixture(t);
  assert.equal(db.getComicById(-1), null); assert.equal(db.getCatalogIssue(-1), null);
  assert.equal(db.getCatalogCharacter('absent'), null); assert.equal(db.getReviewById(-1), null);
  assert.equal(db.mapTrackedCharacter(null), null); assert.equal(db.mapCatalogCharacter(null), null);
  assert.equal(db.mapSpanishEdition(null), null);
  assert.equal(db.mapTrackedCharacter({ id: 7, display_name: 'Test', aliases_json: 'broken', active: 0 }).active, false);
  const tracked = db.getTrackedCharacters()[0];
  assert.throws(() => db.createTrackedCharacter({}), /catálogo unificado/);
  assert.equal(db.updateTrackedCharacter(tracked.id, { aliases: ['Alpha', 'Alpha'], active: true }).active, true);
  assert.deepEqual(db.getTrackedCharacterById(tracked.id).aliases, ['Alpha']);
  db.updateTrackedCharacter(tracked.id, { aliases: [], active: false });
  db.deleteTrackedCharacter(tracked.id);
  assert.equal(db.getTrackedCharacterById(tracked.id).active, false);
  assert.equal(db.getTrackedCharacterById(-1), null);
  assert.equal(db.mapCatalogCharacter({ aliases_json: '[]', issue_count: 1, owned_count: 2, computed_last_comic_date: '2000-01-01' }).missingCount, 0);
  const mapped = db.mapCatalogIssue({ scoped_characters_json: JSON.stringify([null, {}, {slug:'a',displayName:'A'}, {slug:'a'}, {slug:'b', reality:'Earth-X', appearanceType:'minor', appearanceDetail:'vision'}]) });
  assert.equal(mapped.characters.length, 2); assert.equal(mapped.characters[0].appearanceType, 'direct');
  assert.equal(db.mapSpanishEdition({ id: 1, pages: 12, characters_json: '[]' }).pages, 12);
  assert.equal(db.getState('missing'), null);
  assert.equal(db.mapWeeklyFetchFailure(null),null);
  assert.equal(db.mapWeeklyFetchFailure({id:1,week_year:2026,week_number:1}).lastError,'');
});

test('database reviews atomically resolve approval/rejection, rollback faults and resist stale writes', (t) => {
  const { db } = fixture(t);
  const a = db.upsertComic(comic(1, { decision: 'pending_review' }));
  const b = db.upsertComic(comic(2, { decision: 'pending_review' }));
  const review = db.createOrGetPendingReview(a.id);
  assert.equal(db.listPendingReviews().length,1);
  assert.equal(db.createOrGetPendingReview(a.id).id, review.id);
  assert.equal(db.attachTelegramMessage(review.id, { chatId: '42', messageId: '7' }).telegramMessageId, '7');
  assert.equal(db.resolveReviewDecision(-1, 'approve', { id: 1, first_name: 'Tester' }).status, 'not_found');
  assert.equal(db.resolveReviewDecision(review.id, 'approve', { id: 1, firstName: 'Tester' }).comic.decision, 'manual_added');
  assert.equal(db.createOrGetPendingReview(a.id).status, 'approved');
  assert.equal(db.resolveReviewDecision(review.id, 'approve', { id: 1, username: 'tester' }).status, 'already_resolved');
  const reviewB = db.createOrGetPendingReview(b.id);
  db.db.exec("CREATE TRIGGER reject_review_write BEFORE UPDATE ON review_queue BEGIN SELECT RAISE(ABORT, 'synthetic write fault'); END;");
  assert.throws(() => db.resolveReviewDecision(reviewB.id, 'reject', { id: 1 }), /synthetic write fault/);
  assert.equal(db.getReviewById(reviewB.id).status, 'pending');
  db.db.exec('DROP TRIGGER reject_review_write; CREATE TRIGGER ignore_review_write BEFORE UPDATE ON review_queue BEGIN SELECT RAISE(IGNORE); END;');
  assert.equal(db.resolveReviewDecision(reviewB.id, 'reject', { id: 1 }).status, 'already_resolved');
  db.db.exec('DROP TRIGGER ignore_review_write;');
  assert.equal(db.resolveReviewDecision(reviewB.id, 'reject', { id: 1, username: 'tester', source: 'web' }).comic.decision, 'manual_rejected');
  assert.equal(db.listPendingReviews().length, 0);
  assert.equal(db.getDashboardStats().includedCount, 1);
});

test('database weekly filters and enemy aggregation honor date, character and issue scope', (t) => {
  const { db } = fixture(t);
  const a = db.upsertComic(comic(1)); const b = db.upsertComic(comic(2, { weekKey: '2026-W02', weekNumber: 2 }));
  db.replaceComicCharacters(a.id, [{name: 'Peter Parker', section:'featured',isMatch:true},{name:'Goblin',section:'antagonists'}]);
  db.replaceComicCharacters(b.id, [{name:'---',section:'antagonists'}]);
  const run = db.createSyncRun({weekYear:2026,weekNumber:2,triggerSource:'test'});
  db.finishSyncRun(run,{status:'completed',summary:{}});
  const filters = {query:'Spider-Man',from:'1960-01-01',to:'1970-01-01',character:'Peter'};
  assert.equal(db.listIncludedComics({...filters,enemy:'Goblin',scope:'history'}).length,1);
  assert.equal(db.listComicEnemies({...filters,scope:'history'}).total,1);
  assert.equal(db.listComicEnemies({scope:'latest-week'}).total,0);
  assert.equal(db.listIncludedComics({scope:'latest-week'})[0].allCharacters[0],'-');
  db.replaceComicCharacters(b.id, [{name:null,section:'supporting'},{name:' ',section:'antagonists'}]);
  assert.deepEqual(db.listIncludedComics({scope:'latest-week'})[0].matchedCharacters,[]);
  const empty=db.upsertComic(comic(3,{issueLabel:'',issueNumber:null}));
  db.upsertComic(comic(1,{featuredCharacters:['Peter'],supportingCharacters:['May'],otherCharacters:['Mary'],antagonists:[null,'Goblin'],synopsis:'Test',matchSummary:['Peter'],originalityStatus:'original',originalityReason:'Weekly',decisionReason:'Strong match',lastSyncRunId:run}));
  db.upsertComic(comic(1,{issueLabel:'',issueNumber:null}));
  assert.equal(db.getComicById(empty.id).issueNumber,null);
  assert.equal(db.getComicById(a.id).issueNumber,null);
  db.finishSyncRun(run,{status:'completed'});
  assert.equal(db.getLastSyncRun().summary && Object.keys(db.getLastSyncRun().summary).length,0);
  db.queueWeeklyFetchFailure({weekYear:2026,weekNumber:1});
  assert.equal(db.getWeeklyFetchFailure().lastError,'Error desconocido');
  assert.equal(db.listPendingWeeklyFetchFailures(0).length,1);
  assert.equal(db.resolveWeeklyFetchFailure().status,'resolved');
});

test('database catalog memberships, facets and repair operations preserve atomic updates', (t) => {
  const { db } = fixture(t);
  const peter=db.listCatalogCharacters().find(c=>c.fandomEntity==='Peter Parker (Earth-616)');
  db.upsertCatalogIssues([issue(1), issue(2,{appearanceType:'minor',coverImageUrl:'https://example.test/cover',releaseDate:null,antagonists:[]}), issue(3,{antagonists:['"Goblin"','---','goblin']})]);
  assert.equal(db.upsertCatalogIssues([]),0);
  assert.throws(()=>db.upsertCatalogIssues([issue(4),issue(5,{appearanceType:'invalid'})]),/CHECK/);
  assert.equal(db.getCatalogIssueByFandomPageId(4),null);
  assert.throws(()=>db.replaceCatalogCharacterIssues('absent',[]),/inexistente/);
  let result=db.replaceCatalogCharacterIssues(peter.slug,[{pageId:1,appearanceType:'minor'},{pageId:1,appearanceType:'minor',appearanceDetail:'flashback'},{pageId:2,appearanceType:'minor'},{pageId:3,appearanceType:'direct'},{pageId:999,appearanceType:'direct'}]);
  assert.equal(result.linkedCount,3);
  assert.equal(db.listCatalogMembershipsMissingAppearanceDetails().length,1);
  result=db.replaceCatalogCharacterIssues(peter.slug,[{pageId:1,appearanceType:'minor'},{pageId:1,appearanceType:'direct'},{pageId:2,appearanceType:'minor'},{pageId:2,appearanceType:'minor'}]);
  assert.equal(result.addedCount,0);
  const i2=db.getCatalogIssueByFandomPageId(2);
  assert.equal(db.updateCatalogAppearanceDetails([{characterId:peter.id,issueId:i2.id,appearanceDetail:'dream'}]),1);
  assert.equal(db.updateCatalogAppearanceDetails(),0);
  assert.equal(db.updateCatalogIssueAntagonists(),0);
  assert.equal(db.updateCatalogIssueAntagonists([{fandomPageId:2,antagonists:[' Goblin first appearance','Goblin','---']}]),1);
  db.updateCatalogCollection(i2.id,{owned:true,publisher:' Test ',editionTitle:' Tome ',notes:' Note '});
  assert.equal(db.getCatalogIssue(i2.id).ownedPublisher,'Test');
  assert.equal(db.updateCatalogCollection(-1,{owned:false}),null);
  assert.equal(db.listCatalogIssuesMissingCovers().length,2);
  assert.equal(db.listCatalogIssuesMissingDates().length,1);
  assert.equal(db.listCatalogIssuesForEnemyBackfill().length,3);
  assert.equal(db.listCatalogIssuesForEnemyBackfill({missingOnly:true,limit:1,offset:0}).length,0);
  db.db.exec("CREATE TRIGGER reject_antagonist_write BEFORE UPDATE ON spiderman_catalog_issues BEGIN SELECT RAISE(ABORT, 'synthetic antagonist fault'); END;");
  assert.throws(()=>db.updateCatalogIssueAntagonists([{fandomPageId:2}]),/synthetic antagonist/);
  db.db.exec('DROP TRIGGER reject_antagonist_write;');
  db.db.exec("CREATE TRIGGER reject_membership_write BEFORE INSERT ON catalog_character_issues BEGIN SELECT RAISE(ABORT, 'synthetic membership fault'); END;");
  assert.throws(()=>db.replaceCatalogCharacterIssues(peter.slug,[{pageId:3,appearanceType:'direct'}]),/synthetic membership/);
  assert.equal(db.listCatalogIssues({character:peter.slug}).total,2);
  db.db.exec('DROP TRIGGER reject_membership_write;');
  db.db.exec("CREATE TRIGGER reject_detail_write BEFORE UPDATE ON catalog_character_issues BEGIN SELECT RAISE(ABORT, 'synthetic detail fault'); END;");
  assert.throws(()=>db.updateCatalogAppearanceDetails([{characterId:peter.id,issueId:i2.id}]),/synthetic detail/);
  db.db.exec('DROP TRIGGER reject_detail_write;');
  db.markCatalogCharacterSyncFailed('absent'); db.markCatalogCharacterSyncFailed(peter.slug);
  assert.equal(db.getCatalogCharacter(peter.slug).lastSyncStatus,'failed');
  for (const [group, expected] of [['all',2],['ultimate',0],['featured',0],['other',0],['main',2]]) {
    assert.equal(db.getCatalogStats('',group).totalCount,expected);
  }
  for (const appearance of ['direct','minor','flashback','dream','vision','recap','other-minor','']) {
    for (const ownership of ['owned','missing','']) {
      const filters={character:peter.slug,appearance,ownership,query:'Spider',from:'1900-01-01',to:'2000-01-01',sort:'title'};
      const expected = ['', 'direct'].includes(appearance) && ownership !== 'owned' ? 1 : 0;
      assert.equal(db.listCatalogIssues(filters).total,expected);
      assert.equal(db.listCatalogEnemies(filters).total,expected);
    }
  }
  assert.equal(db.searchCatalogIssues('S').length,0);
  assert.equal(db.searchCatalogIssues('Spider').length,3);
  assert.equal(db.searchCatalogIssues(String(i2.id).padStart(2,'0'),1).length,1);
  assert.equal(db.searchCatalogIssues().length,0);assert.equal(db.searchCatalogIssues('Spider',0).length,3);
  db.upsertCatalogCharacters([{slug:'test',displayName:'Test',fandomEntity:'Test',kind:'spider'}]);
  assert.equal(db.getCatalogCharacter('test').source,'manual');
  db.upsertCatalogIssues([issue(20,{volumeNumber:null,issueLabel:'',issueNumber:null})]);
  db.db.exec("CREATE TRIGGER ignore_catalog_insert BEFORE INSERT ON spiderman_catalog_issues BEGIN SELECT RAISE(IGNORE); END;");
  assert.equal(db.upsertCatalogIssues([issue(21)]),0);db.db.exec('DROP TRIGGER ignore_catalog_insert;');
  assert.equal(db.updateCatalogIssueAntagonists([{fandomPageId:-1}]),0);
  assert.equal(db.updateCatalogAppearanceDetails([{characterId:-1,issueId:-1}]),0);
  assert.equal(db.listCatalogEnemies().total,1);
  db.db.prepare('UPDATE spiderman_catalog_issues SET antagonists_json = ? WHERE fandom_page_id=1').run(JSON.stringify(['Zulu!','???']));
  db.db.prepare('UPDATE spiderman_catalog_issues SET antagonists_json = ? WHERE fandom_page_id=2').run(JSON.stringify(['Zulu']));
  assert.equal(db.listCatalogEnemies({character:peter.slug}).total,1);
  db.db.exec('DELETE FROM catalog_characters;');assert.equal(db.getDashboardStats().trackedCharactersCount,0);
});

test('database Spanish source queue resumes confirmed work without losing retries', (t) => {
  const {db}=fixture(t);
  assert.deepEqual(db.getSpanishSourceQueueStats('test'),{total:0,pending:0,completed:0,errors:0});
  assert.equal(db.queueSpanishSourceProducts('test'),0);
  db.queueSpanishSourceProducts('test',[{sourceKey:'first',productUrl:'https://example.test/a'},{title:'Second',productUrl:'https://example.test/b',priority:9}]);
  db.queueSpanishSourceProducts('test',[{sourceKey:'first',title:'First',productUrl:'https://example.test/a',priority:20}]);
  const first=db.listPendingSpanishSourceProducts('test',1)[0];
  assert.equal(first.title,'First');
  db.resolveSpanishSourceQueueItem(first.id,'retry');
  assert.equal(db.getSpanishSourceQueueStats('test').errors,1);
  db.resolveSpanishSourceQueueItem(first.id);
  assert.equal(db.listPendingSpanishSourceProducts('test').length,1);
  db.requeueSpanishSourceProducts('test');
  assert.equal(db.listPendingSpanishSourceProducts('test',0).length,2);
  db.queueSpanishSourceProducts('test',[{sourceKey:'empty'}]);
  db.db.exec("CREATE TRIGGER ignore_source_insert BEFORE INSERT ON spanish_source_queue BEGIN SELECT RAISE(IGNORE); END;");
  assert.equal(db.queueSpanishSourceProducts('test',[{sourceKey:'ignored'}]),0);db.db.exec('DROP TRIGGER ignore_source_insert;');
});

test('database Spanish editions validate edits and missing covers, filter complete linked metadata', (t) => {
  const {db}=fixture(t);
  db.upsertCatalogIssues([issue(1)]); const id=db.getCatalogIssueByFandomPageId(1).id;
  assert.throws(()=>db.saveSpanishEdition(),/título/);
  assert.throws(()=>db.saveSpanishEdition(-1,{title:'Unknown'}),/no encontrada/);
  const edition=db.saveSpanishEdition(null,{title:'Tomo',publisher:'Panini',publicationDate:'2000-01-01',referenceUrl:'https://example.test/a',characters:['Peter','Peter',null,'Mary'],issueIds:[id,id,-1,1.5,999],notes:'Rare'});
  assert.equal(edition.issueCount,1); assert.deepEqual(edition.characters,['Peter','Mary']);
  assert.equal(db.listSpanishEditionsMissingCovers().length,1);
  assert.equal(db.updateSpanishEditionCover(edition.id,'https://example.test/cover'),true);
  assert.equal(db.updateSpanishEditionCover(-1),false);
  assert.equal(db.listSpanishEditionsMissingCovers().length,0);
  db.saveSpanishEdition(null,{title:'Other',publisher:'Other',purchaseStatus:'owned',characters:['Other']});
  db.saveSpanishEdition(null,{title:'Alternative',issueIds:[id]});db.saveSpanishEdition(null,{title:'Another alternative',issueIds:[id]});
  assert.equal(db.listSpanishEditions({status:'wanted',publisher:'Panini',character:'Peter',query:'Rare'}).total,1);
  assert.equal(db.listSpanishEditions({publisher:'Missing'}).total,0);
  assert.equal(db.listSpanishEditions({character:'Absent'}).total,0);
  assert.equal(db.getSpanishEdition(-1),null);
  assert.equal(db.deleteSpanishEdition(edition.id),true);
  assert.equal(db.deleteSpanishEdition(edition.id),false);
});

test('database Panini errors, incomplete contents and ISBN reconciliation preserve manual ownership', (t) => {
  const {db,dir}=fixture(t);
  assert.throws(()=>db.processPaniniProduct(),/URL o identificador/);
  const product={sourceKey:'a',productUrl:'https://example.test/a'};
  assert.equal(db.processPaniniProduct({...product,errorMessage:'temporary'}).status,'error');
  assert.equal(db.processPaniniProduct({...product,errorMessage:'again'}).status,'error');
  assert.equal(db.listPendingPaniniProducts()[0].retryCount,2);
  assert.equal(db.processPaniniProduct(product).status,'pending_contains');
  assert.equal(db.processPaniniProduct({...product,containsRaw:'Unknown Series 1'}).status,'pending_match');
  db.upsertCatalogIssues([issue(1)]);
  const manual=db.saveSpanishEdition(null,{title:'Manual',publisher:'Panini Comics',isbn:'isbn',purchaseStatus:'owned'});
  const matched=db.processPaniniProduct({...product,containsRaw:'Amazing Spider-Man 1',isbn:'isbn',pages:100});
  assert.equal(matched.editionId,manual.id); assert.equal(db.getSpanishEdition(manual.id).purchaseStatus,'owned');
  const b={sourceKey:'b',productUrl:'https://example.test/b',containsRaw:'Amazing Spider-Man 1'};
  assert.equal(db.processPaniniProduct(b).status,'matched');
  assert.equal(db.processPaniniProduct({...b,title:'Updated',pages:150}).status,'matched');
  assert.equal(db.processPaniniProduct({...b,title:'Updated',pages:150,publicationDate:'2000-01-01',isbn:'other-isbn',coverImageUrl:'https://example.test/cover',formatLabel:'Tomo'}).status,'matched');
  assert.equal(db.processPaniniProduct(b).status,'matched');
  assert.equal(db.processPaniniProduct({sourceKey:'same-isbn',productUrl:'https://example.test/same-isbn',containsRaw:'Amazing Spider-Man 1',isbn:'isbn'}).editionId,manual.id);
  db.db.exec("CREATE TRIGGER reject_product_write BEFORE INSERT ON panini_products BEGIN SELECT RAISE(ABORT, 'synthetic product fault'); END;");
  assert.throws(()=>db.processPaniniProduct({productUrl:'https://example.test/c'}),/synthetic product fault/);
  db.db.exec('DROP TRIGGER reject_product_write;');
  assert.equal(db.listKnownPaniniProductUrls().length,3);
  const target=path.join(dir,"backup's.sqlite"); fs.writeFileSync(target,'old');
  assert.equal(db.createBackupSnapshot(target),target);
  const restored=new DatabaseSync(target); assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM panini_products').get().n,3); restored.close();
});
