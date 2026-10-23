const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { ComicDatabase } = require('../src/database');
const { ComicTrackerService } = require('../src/service');
const { getIsoWeekInfo } = require('../src/utils');

function fixture(t, clients = {}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'comic-service-coverage-'));
  const db=new ComicDatabase(path.join(dir,'test.sqlite'));
  const config={timezone:'UTC',marvelBaseUrl:'https://example.test',schedule:{enabled:false,day:'monday',hour:0,minute:0},telegram:{},backup:{enabled:false,intervalWeeks:1,dir:path.join(dir,'backups'),retentionCount:2,maxBytes:2**30,telegramMaxBytes:2**30},catalogRefresh:{enabled:false,intervalMonths:3,nextRefreshAt:''},panini:{listingUrl:'https://example.test/list',concurrency:2}};
  const service=new ComicTrackerService({db,config,...clients});
  t.after(()=>{if(service.schedulerHandle)clearInterval(service.schedulerHandle);db.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {service,db,config,dir};
}
function simpleIssue(id=1) {return {fandomPageId:id,pageTitle:`Amazing Spider-Man Vol 1 ${id}`,title:`Amazing Spider-Man #${id}`,fandomUrl:`https://example.test/${id}`,seriesName:'Amazing Spider-Man',volumeNumber:1,issueLabel:String(id),issueNumber:id,releaseDate:'1963-03-01',appearanceType:'direct'};}

test('service facade writes real collection and exports escaped CSV with both character groups',t=>{
  const {service,db,config}=fixture(t);
  db.upsertCatalogIssues([simpleIssue()]);
  const characters=service.listCatalogCharacters();const peter=characters.find(c=>c.fandomEntity==='Peter Parker (Earth-616)');const venom=characters.find(c=>c.kind==='symbiote');
  db.replaceCatalogCharacterIssues(peter.slug,[{pageId:1,appearanceType:'direct'}]);db.replaceCatalogCharacterIssues(venom.slug,[{pageId:1,appearanceType:'minor'}]);
  const id=db.getCatalogIssueByFandomPageId(1).id;
  assert.equal(service.listCatalogIssues({character:peter.slug}).total,1);
  assert.equal(service.getCatalogStats(peter.slug).totalCount,1);
  service.updateCatalogCollection(id,{owned:true,publisher:'Test',editionTitle:'"Tome"',notes:'line'});
  assert.match(service.exportCatalogCsv(),/Simbionte/);assert.match(service.exportCatalogCsv(),/Arácnido/);assert.match(service.exportCatalogCsv(),/""Tome""/);
  const edition=service.createSpanishEdition({title:'Edition'});assert.equal(service.listSpanishEditions().total,1);
  assert.equal(service.updateSpanishEdition(edition.id,{title:'Updated'}).title,'Updated');assert.equal(service.deleteSpanishEdition(edition.id),true);
  assert.equal(service.searchCatalogIssues('Spider',1).length,1);assert.deepEqual(service.listComics(),[]);
  assert.throws(()=>service.createTrackedCharacter({}),/catálogo/);
  assert.equal(service.updateTrackedCharacter(peter.id,{aliases:['Alias'],active:false}).active,false);service.deleteTrackedCharacter(peter.id);
  assert.ok(service.listTrackedCharacters().length>0);
  let dashboard=service.getDashboard();assert.equal(dashboard.telegram.configured,false);
  config.telegram={botToken:'synthetic',reviewChatId:'synthetic',allowedUserId:'synthetic'};
  service.attachTelegram({getStatus:()=>({configured:true,running:true})});
  assert.equal(service.getDashboard().config.telegramUserRestricted,true);
  assert.equal(service.getDashboard().telegram.running,true);
  for(const key of ['catalog_import_status','panini_import_status','weekly_update_status','quarterly_refresh_status'])db.setState(key,'invalid');
  assert.equal(service.getCatalogImportStatus().running,false);assert.equal(service.getPaniniImportStatus().running,false);assert.equal(service.getWeeklyUpdateStatus().running,false);assert.equal(service.getQuarterlyRefreshStatus().running,false);
});

test('service enemy pagination clamps malformed input, remembers selections and expires bounded cache',t=>{
  const {service,db}=fixture(t);
  let loads=0;db.listComicEnemies=()=>{loads++;return {threshold:10,total:4,groups:[{key:'x',label:'Enemies',items:[{name:'Zulu',count:2},{name:'Alpha',count:2},{name:'Beta'}, {name:'Gamma',count:1}]}]};};
  let result=service.listComicEnemies(undefined,{limit:0,offset:-1,sort:'invalid',selected:'Alpha'});
  assert.equal(result.selectedItem.name,'Alpha');assert.equal(result.limit,50);
  result=service.listComicEnemies(undefined,{limit:1,offset:0,sort:'name',search:'alp'});assert.equal(result.total,1);assert.equal(loads,1);
  result=service.listComicEnemies(undefined,{limit:1,offset:0,selected:'missing'});assert.equal(result.selectedExists,false);assert.equal(result.hasMore,true);
  service.enemyOptionCache.get('comics:{}').createdAt=0;service.listComicEnemies();assert.equal(loads,2);
  for(let i=0;i<41;i++)service.listComicEnemies({character:String(i)});
  assert.equal(service.enemyOptionCache.size,40);
  db.listCatalogEnemies=()=>({groups:[{key:'empty'}]});assert.equal(service.listCatalogEnemies().total,0);
  db.listCatalogEnemies=()=>({});service.clearEnemyOptionCache();assert.equal(service.listCatalogEnemies().total,0);
});

test('service backup status, interval, real compression, size bounds, notice and transport failures',async t=>{
  const {service,db,config,dir}=fixture(t);
  assert.equal(service.backupIsDue(),false);config.backup.enabled=true;
  assert.equal(service.backupIsDue(),true);db.setState('backup_last_sent_at','invalid');assert.equal(service.backupIsDue(),true);
  db.setState('backup_last_sent_at',new Date().toISOString());assert.equal(service.backupIsDue(),false);
  assert.equal((await service.maybeSendPeriodicBackup({})).reason,'not_due');
  db.setState('backup_last_sent_at','2000-01-01');assert.equal(service.backupIsDue(),true);
  const opts={triggerSource:'test',weekYear:2026,weekNumber:1};
  let notices=[],files=[];service.attachTelegram({canSendBackups:()=>true,sendBackupNotice:async item=>notices.push(item),sendBackupFile:async item=>files.push(item)});
  config.backup.maxBytes=0;assert.equal((await service.createAndSendBackup(opts)).reason,'too_large');assert.equal(service.getBackupStatus().lastStatus,'skipped_too_large');assert.equal(notices.length,1);
  config.backup.maxBytes=-1;await service.createAndSendBackup(opts);assert.match(service.getBackupStatus().lastReason,/desconocido/);
  service.attachTelegram(null);assert.equal((await service.createAndSendBackup(opts)).sent,false);
  config.backup.maxBytes=2**30;await service.createAndSendBackup(opts);assert.equal(service.getBackupStatus().lastStatus,'stored_local');
  const gzip=fs.readdirSync(config.backup.dir).find(f=>f.endsWith('.gz'));assert.equal(zlib.gunzipSync(fs.readFileSync(path.join(config.backup.dir,gzip))).subarray(0,15).toString(),'SQLite format 3');
  service.attachTelegram({canSendBackups:()=>false});await service.createAndSendBackup(opts);assert.equal(service.getBackupStatus().lastStatus,'stored_local');
  service.attachTelegram({canSendBackups:()=>true,sendBackupNotice:async item=>notices.push(item),sendBackupFile:async item=>files.push(item)});
  config.backup.telegramMaxBytes=0;await service.createAndSendBackup(opts);assert.match(service.getBackupStatus().lastReason,/Bot API/);
  config.backup.telegramMaxBytes=NaN;await service.createAndSendBackup(opts);assert.match(service.getBackupStatus().lastReason,/desconocido/);
  config.backup.telegramMaxBytes=2**30;await service.maybeSendPeriodicBackup(opts);assert.equal(service.getBackupStatus().lastStatus,'sent');assert.equal(files.length,1);
  service.telegram.sendBackupFile=async()=>{throw new Error('synthetic transport failure');};
  await assert.rejects(service.createAndSendBackup(opts),/synthetic transport failure/);assert.equal(service.getBackupStatus().lastStatus,'failed');
  service.attachTelegram(null);const snapshot=db.createBackupSnapshot;db.createBackupSnapshot=()=>{throw new Error('synthetic snapshot failure');};
  await assert.rejects(service.createAndSendBackup(opts),/snapshot failure/);db.createBackupSnapshot=snapshot;
  const extra=path.join(config.backup.dir,'old.sqlite.gz');fs.writeFileSync(extra,'old');fs.utimesSync(extra,0,0);config.backup.retentionCount=0;service.pruneBackupDirectory();assert.equal(fs.readdirSync(config.backup.dir).length,0);
  service.cleanupBackupArtifacts([null,path.join(dir,'missing'),dir]);assert.equal(fs.existsSync(dir),true);
  service.setBackupStatus({attemptAt:null,sentAt:null,fileName:null,sizeBytes:null,status:null,reason:null});assert.equal(service.getBackupStatus().lastSizeBytes,0);
  service.setBackupStatus({});
  db.setState('backup_last_size_bytes','');assert.equal(service.getBackupStatus().lastSizeBytes,0);
});

test('service catalog imports exercise actual orchestration with injected remote boundary',async t=>{
  let fail=false,finishedAt='2026-01-01T00:00:00.000Z',calls=[];
  const {service,db}=fixture(t,{catalogClient:{discoverCatalogRoster:async()=>[],importCharacterCatalogs:async options=>{
    calls.push(options);options.onProgress({stage:'pages'});options.hasIssue(1);options.onItems([simpleIssue()]);
    if(options.characters[0])options.onCharacterMembers(options.characters[0],[{pageId:1,appearanceType:'direct'}]);
    if(fail)throw new Error('synthetic catalog failure');return {importedComics:1,errors:[],finishedAt};
  }}});
  const first=db.listCatalogCharacters()[0];let progress=[];
  assert.equal((await service.performCatalogImport({onProgress:p=>progress.push(p)})).importedComics,1);assert.equal(progress.at(-1).running,false);
  assert.equal(db.getState('catalog_full_refresh_last_at'),'2026-01-01T00:00:00.000Z');
  assert.equal((await service.performCatalogImport({characterSlug:first.slug,incremental:true})).characterSlug,first.slug);
  assert.equal(calls.at(-1).refreshExisting,false);
  await service.performCatalogImport({characterSlug:'absent'});assert.equal(calls.at(-1).characters.length,0);
  finishedAt='';await service.performCatalogImport();assert.match(db.getState('catalog_full_refresh_last_at'),/^\d{4}-/);
  assert.equal(service.startCatalogImport().started,true);await service.currentCatalogImportPromise;
  assert.equal(service.startCatalogImport({characterSlug:first.slug}).startingFrom,'1963-03-01');await service.currentCatalogImportPromise;
  fail=true;await assert.rejects(service.performCatalogImport({characterSlug:first.slug}),/catalog failure/);assert.equal(db.getCatalogCharacter(first.slug).lastSyncStatus,'failed');
  await assert.rejects(service.performCatalogImport(),/catalog failure/);assert.equal(service.getCatalogImportStatus().stage,'failed');
  assert.equal(service.startCatalogImport({characterSlug:'missing'}).notFound,true);
  service.currentCatalogImportPromise=Promise.resolve();assert.equal(service.startCatalogImport().started,false);service.currentCatalogImportPromise=null;
  const savedError=console.error;console.error=()=>{};
  try{assert.equal(service.startCatalogImport({characterSlug:first.slug}).started,true);await service.currentCatalogImportPromise;assert.equal(service.currentCatalogImportPromise,null);}finally{console.error=savedError;}
});

test('service Spanish orchestration combines sources, continues official errors and records fatal errors',async t=>{
  let officialMode='full',universeFail=false,universeEmpty=false,seen=[];
  const {service,db}=fixture(t,{paniniClient:{importPaniniCatalog:async options=>{
    seen.push(options);options.onProgress({stage:'official'});options.onProduct({productUrl:'https://example.test/p'});
    if(officialMode==='fail')throw new Error('official unavailable');
    return officialMode==='full'?{catalogPages:2,scannedPages:2,processedProducts:2,matchedProducts:1,pendingContains:1,pendingMatch:1,errors:[{message:'soft'}]}:{};
  },importUniversoMarvelCatalog:async options=>{options.onProgress({stage:'universe'});if(universeFail)throw new Error('universe unavailable');return universeEmpty?{}:{processed:1,matched:1,pendingMatch:1,errors:[]};}}});
  db.processPaniniProduct({sourceKey:'um-fixture',productUrl:'https://example.test/u'});
  let result=await service.performPaniniImport();assert.equal(result.processedProducts,3);assert.equal(seen[0].pendingProducts.length,0);assert.equal(db.getState('panini_full_scan_completed'),'true');
  officialMode='empty';result=await service.performPaniniImport();assert.equal(result.full,false);assert.equal(result.pendingContains,0);
  universeEmpty=true;const pending=db.listPendingPaniniProducts;db.listPendingPaniniProducts=()=>[{sourceKey:''}];result=await service.performPaniniImport();assert.equal(result.processedProducts,0);db.listPendingPaniniProducts=pending;
  officialMode='fail';result=await service.performPaniniImport({full:true});assert.equal(result.status,'completed_with_warnings');assert.equal(result.official,null);
  universeFail=true;await assert.rejects(service.performPaniniImport(),/universe unavailable/);assert.equal(service.getPaniniImportStatus().stage,'failed');
  service.currentWeeklyUpdatePromise=Promise.resolve();assert.equal(service.startPaniniImport().started,false);service.currentWeeklyUpdatePromise=null;
  const savedError=console.error;console.error=()=>{};try{assert.equal(service.startPaniniImport().started,true);await service.currentPaniniImportPromise;assert.equal(service.currentPaniniImportPromise,null);}finally{console.error=savedError;}
});

test('service quarterly metadata refresh enforces deadlines, busy state and failure lifecycle',async t=>{
  const {service,db,config}=fixture(t);
  assert.equal(service.getQuarterlyRefreshDates().nextRefreshAt,'');db.setState('catalog_full_refresh_last_at','invalid');db.setState('catalog_full_refresh_next_at','invalid');assert.equal(service.getQuarterlyRefreshDates().nextRefreshAt,'');
  assert.equal(service.configureQuarterlyRefresh({enabled:false}).nextRefreshAt,'');
  db.setState('catalog_full_refresh_last_at','2000-01-01T00:00:00.000Z');db.setState('catalog_full_refresh_next_at','');config.catalogRefresh.nextRefreshAt='2000-02-01';assert.equal(service.getQuarterlyRefreshDates().nextRefreshAt,'2000-04-01T00:00:00.000Z');
  assert.throws(()=>service.configureQuarterlyRefresh({enabled:true,nextRefreshAt:'invalid'}),/válida/);
  assert.throws(()=>service.configureQuarterlyRefresh({enabled:true}),/válida/);
  assert.throws(()=>service.configureQuarterlyRefresh({enabled:true,nextRefreshAt:'2000-01-02'}),/3 meses/);
  assert.equal(service.configureQuarterlyRefresh({enabled:false}).enabled,false);assert.equal(service.startQuarterlyRefresh().disabled,true);
  config.catalogRefresh.enabled=true;service.currentSyncPromise=Promise.resolve();assert.equal(service.startQuarterlyRefresh().running,true);service.currentSyncPromise=null;
  service.performCatalogImport=async()=>({});assert.equal(service.startQuarterlyRefresh().started,true);await service.currentQuarterlyRefreshPromise;assert.equal(service.getQuarterlyRefreshStatus().status,'completed');
  service.performCatalogImport=async()=>{throw new Error('synthetic quarterly failure');};const savedError=console.error;console.error=()=>{};
  try{service.maybeRunQuarterlyRefresh();await service.currentQuarterlyRefreshPromise;assert.equal(service.getQuarterlyRefreshStatus().status,'failed');}finally{console.error=savedError;}
  service.ensureQuarterlyRefreshBaseline();assert.equal(service.getRuntimeStatus().quarterlyRefreshRunning,false);
});

test('service scheduler guards starts, repeated weeks, shutdown and unexpected task errors',async t=>{
  const {service,db,config}=fixture(t);service.weeklyShutdown.check=async()=>false;
  await service.maybeRunScheduledSync();config.schedule.enabled=true;
  service.currentSyncPromise=Promise.resolve();await service.maybeRunScheduledSync();service.currentSyncPromise=null;
  let calls=0;service.startWeeklyUpdate=()=>{calls++;return {started:true};};
  const now=getIsoWeekInfo(new Date(),'UTC');config.schedule.day=['','monday','tuesday','wednesday','thursday','friday','saturday','sunday'][now.weekdayIndex];config.schedule.hour=0;config.schedule.minute=0;
  await service.maybeRunScheduledSync();assert.equal(calls,1);await service.maybeRunScheduledSync();assert.equal(calls,1);
  db.setState('last_scheduled_attempt_week_key','');service.startWeeklyUpdate=()=>{calls++;return{started:false};};await service.maybeRunScheduledSync();assert.equal(db.getState('last_scheduled_attempt_week_key'),'');
  config.schedule.hour=25;config.schedule.day='sunday';await service.maybeRunScheduledSync();
  let catalogCalls=0;service.maybeRunScheduledSync=async()=>{};service.maybeRunQuarterlyRefresh=()=>{catalogCalls++;};
  await service.runScheduledTasks();assert.equal(catalogCalls,1);service.weeklyShutdown.check=async()=>true;await service.runScheduledTasks();assert.equal(catalogCalls,1);
  service.weeklyShutdown.check=async()=>{throw new Error('scheduler failure');};const savedError=console.error;console.error=()=>{};
  try{await service.runScheduledTasks();}finally{console.error=savedError;}
  service.weeklyShutdown.check=async()=>true;let tick;const interval=global.setInterval;global.setInterval=fn=>{tick=fn;return {test:true};};
  try{service.startScheduler();service.startScheduler();await tick();service.schedulerHandle=null;}finally{global.setInterval=interval;}
});

test('service async starters reset promises after success and failure and retain deliberate decisions',async t=>{
  const {service}=fixture(t);const savedError=console.error;console.error=()=>{};
  try{
    service.currentWeeklyUpdatePromise=Promise.resolve();assert.equal(service.startWeeklyUpdate().started,false);assert.equal(service.startSync().started,false);service.currentWeeklyUpdatePromise=null;
    service.performWeeklyUpdate=async()=>{throw new Error('weekly failure');};assert.equal(service.startWeeklyUpdate().started,true);await service.currentWeeklyUpdatePromise;assert.equal(service.currentWeeklyUpdatePromise,null);
    service.performSync=async()=>({});assert.equal(service.startSync().started,true);await service.currentSyncPromise;assert.equal(service.currentSyncPromise,null);
    assert.equal(service.resolveDecision({decision:'auto_added'},{decision:'auto_rejected'}).decision,'auto_rejected');
    assert.equal(service.resolveDecision({decision:'manual_rejected'},{reason:'new'}).reason,'new');
    assert.equal(service.resolveDecision({decision:'pending_review'},{decision:'pending_review',reason:'new'}).reason,'new');
    const summary={processed:0,pendingReview:0,pendingAlreadyOpen:0,added:0,alreadyIncluded:0,rejected:0,alreadyRejected:0,pendingTitles:[],addedTitles:[],rejectedTitles:[]};
    service.summarizeTransition(summary,'pending_review','pending_review','a');service.summarizeTransition(summary,'auto_added','manual_added','a');service.summarizeTransition(summary,'manual_rejected','manual_rejected','a');service.summarizeTransition(summary,'','unknown','a');
    assert.equal(summary.pendingAlreadyOpen,1);assert.equal(summary.alreadyIncluded,1);assert.equal(summary.alreadyRejected,1);
    assert.equal(service.resolveReview(-1,'approve',{id:1}).status,'not_found');
  }finally{console.error=savedError;}
});

test('service catch-up respects 52 and 53 week years including century calendar boundaries',t=>{
  const {service,db}=fixture(t);
  for(const [year,lastWeek]of [[2014,52],[2015,53],[2020,53],[1800,52],[2000,52]]){
    db.getLastCompletedSyncRun=()=>({weekYear:year,weekNumber:lastWeek-1});
    assert.deepEqual(service.getWeeklyReviewPlan(year+1,1).weeks.map(w=>[w.weekYear,w.weekNumber]),[[year,lastWeek],[year+1,1]]);
  }
  db.getLastCompletedSyncRun=()=>({weekYear:2026,weekNumber:1});assert.equal(service.getWeeklyReviewPlan(2026,1).weeks.length,1);
});

test('service CSV preserves unknown date metadata and optional historical data without leaking null text',t=>{
  const {service,db}=fixture(t);
  db.upsertCatalogIssues([simpleIssue(1),{...simpleIssue(2),releaseDate:null,volumeNumber:null}]);
  const peter=db.listCatalogCharacters().find(c=>c.fandomEntity==='Peter Parker (Earth-616)');
  db.replaceCatalogCharacterIssues(peter.slug,[{pageId:1,appearanceType:'direct'},{pageId:2,appearanceType:'minor'}]);
  assert.match(service.exportCatalogCsv(),/No/);
  db.db.exec("UPDATE spiderman_catalog_issues SET date_source='release' WHERE fandom_page_id=1;");assert.match(service.exportCatalogCsv(),/Release Date/);
  db.db.exec("UPDATE spiderman_catalog_issues SET date_source='cover',date_precision='month' WHERE fandom_page_id=1; UPDATE spiderman_catalog_issues SET date_source='custom' WHERE fandom_page_id=2;");
  assert.match(service.exportCatalogCsv(),/Cover Date/);assert.match(service.exportCatalogCsv(),/custom/);
  db.db.exec('UPDATE spiderman_catalog_issues SET issue_label=NULL;');assert.doesNotMatch(service.exportCatalogCsv(),/null/);
});

test('service sync records outer failures, sends configured alerts and tolerates absent optional retry API',async t=>{
  let summaries=[];
  const {service,db}=fixture(t,{marvelClient:{fetchWeekReleases:async()=>{throw new Error('synthetic weekly outage');}}});
  const opts={triggerSource:'test',weekYear:2026,weekNumber:1};
  await assert.rejects(service.performSync({...opts,runSideEffects:false}),/weekly outage/);assert.equal(db.getLastSyncRun().status,'failed');
  service.attachTelegram({canSendSummary:()=>false});await assert.rejects(service.performSync(opts),/weekly outage/);
  service.attachTelegram({canSendSummary:()=>true,sendSummary:async s=>summaries.push(s)});await assert.rejects(service.performSync(opts),/weekly outage/);assert.equal(summaries[0].failed,true);
  db.listPendingWeeklyFetchFailures=undefined;service.fetchWeekReleases=async()=>({members:[]});
  assert.equal((await service.performSync({...opts,runSideEffects:false})).errors,0);
  db.getWeeklyFetchFailureStats=undefined;assert.deepEqual(service.getDashboard().weeklyFetchFailures,{pending:0,resolved:0});
});

test('service weekly aggregation retains the final error detail for a retried issue',async t=>{
  const {service}=fixture(t);let calls=0;
  service.performSync=async()=>({weekKey:`2026-W0${++calls}`,errorDetails:[{pageTitle:'Issue',message:calls===1?'first':'last'}]});
  service.performCatalogImport=async()=>({});service.performPaniniImport=async()=>({});
  const result=await service.performWeeklyUpdate({triggerSource:'test',weekYear:2026,weekNumber:2,reviewWeeks:[{weekYear:2026,weekNumber:1,weekKey:'2026-W01'},{weekYear:2026,weekNumber:2,weekKey:'2026-W02'}]});
  assert.deepEqual(result.weeklyReview.errorDetails,[{pageTitle:'Issue',message:'last'}]);
});
