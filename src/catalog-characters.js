const { normalizeText } = require("./utils");

const MANUAL_SPIDER_CHARACTERS = [
  ["Peter Parker / Spider-Man", "Peter Parker (Earth-616)"],
  ["Miles Morales / Spider-Man", "Miles Morales (Earth-1610)"],
  ["Gwen Stacy / Ghost-Spider", "Gwendolyn Stacy (Earth-65)"],
  ["Miguel O'Hara / Spider-Man 2099", "Miguel O'Hara (Earth-928)"],
  ["Jessica Drew / Spider-Woman", "Jessica Drew (Earth-616)"],
  ["Cindy Moon / Silk", "Cindy Moon (Earth-616)"],
  ["Anya Corazón / Araña", "Aña Corazón (Earth-616)"],
  ["Ben Reilly / Scarlet Spider", "Benjamin Reilly (Earth-616)"],
  ["Kaine Parker / Scarlet Spider", "Kaine Parker (Earth-616)"],
  ["Bailey Briggs / Spider-Boy", "Bailey Briggs (Earth-616)"],
  ["Otto Octavius / Superior Spider-Man", "Otto Octavius (Earth-616)"],
  ["Julia Carpenter / Spider-Woman", "Julia Carpenter (Earth-616)"],
  ["Cassandra Webb / Madame Web", "Cassandra Webb (Earth-616)"],
  ["Mattie Franklin / Spider-Woman", "Martha Franklin (Earth-616)"],
  ["Mayday Parker / Spider-Girl", "May Parker (Earth-982)"],
  ["Peter Parker / Spider-Man Noir", "Peter Parker (Earth-90214)"],
  ["Hobie Brown / Spider-Punk", "Hobart Brown (Earth-138)"],
  ["Pavitr Prabhakar / Spider-Man India", "Pavitr Prabhakar (Earth-50101)"],
  ["Billy Braddock / Spider-UK", "William Braddock (Earth-833)"],
  ["Peter Porker / Spider-Ham", "Peter Porker (Earth-8311)"],
  ["Peni Parker / SP//dr", "Peni Parker (Earth-14512)"],
  ["Ben Parker / Spider-Man", "Benjamin Parker (Earth-3145)"],
  ["Takuya Yamashiro / Spider-Man", "Takuya Yamashiro (Earth-51778)"],
  ["Charlotte Webber / Sun-Spider", "Charlotte Webber (Earth-20023)"],
  ["Zarina Zahari / Spider-UK", "Zarina Zahari (Earth-834)"]
];

const MANUAL_RELATED_CHARACTERS = [
  ["Felicia Hardy / Black Cat", "Felicia Hardy (Earth-616)", "spider"],
  ["Knull", "Knull (Earth-616)", "symbiote"],
  ["Mary Jane Watson", "Mary Jane Watson (Earth-616)", "spider"],
  ["Gwen Stacy", "Gwendolyne Stacy (Earth-616)", "spider"]
];

function extractReality(fandomEntity) {
  return String(fandomEntity || "").match(/\((Earth-[^)]+|Multiverse)\)\s*$/)?.[1] || "";
}

function characterSlug(fandomEntity) {
  return normalizeText(fandomEntity).replace(/\s+/g, "-");
}

function characterRecord({ displayName, fandomEntity, kind, source = "manual" }) {
  return {
    slug: characterSlug(fandomEntity),
    displayName,
    fandomEntity,
    kind,
    reality: extractReality(fandomEntity),
    source
  };
}

function manualSpiderRoster() {
  const spiderCharacters = MANUAL_SPIDER_CHARACTERS.map(([displayName, fandomEntity]) => characterRecord({
    displayName,
    fandomEntity,
    kind: "spider"
  }));
  const relatedCharacters = MANUAL_RELATED_CHARACTERS.map(([displayName, fandomEntity, kind]) => characterRecord({
    displayName,
    fandomEntity,
    kind
  }));

  return [...spiderCharacters, ...relatedCharacters];
}

function symbioteDisplayName(fandomEntity) {
  return String(fandomEntity)
    .replace(/\s*\(Symbiote(?: Hive)?\)/g, "")
    .replace(/\s*\((?:Earth-[^)]+|Multiverse)\)\s*$/, "")
    .trim();
}

function rosterFromCategories({ symbioteMembers = [], spiderMembers = [], webWarriorMembers = [] }) {
  const records = [...manualSpiderRoster()];

  for (const fandomEntity of symbioteMembers.filter((title) => /\(Symbiote(?: Hive)?\)/.test(title))) {
    records.push(characterRecord({
      displayName: symbioteDisplayName(fandomEntity),
      fandomEntity,
      kind: "symbiote",
      source: "Category:Symbiotes"
    }));
  }

  for (const fandomEntity of [...spiderMembers, ...webWarriorMembers]) {
    if (fandomEntity === "Karn (Earth-001)") {
      continue;
    }

    if (!extractReality(fandomEntity)) {
      continue;
    }

    records.push(characterRecord({
      displayName: fandomEntity.replace(/\s*\(Earth-[^)]+\)\s*$/, ""),
      fandomEntity,
      kind: "spider",
      source: "Marvel Database spider categories"
    }));
  }

  const unique = new Map();

  for (const record of records) {
    if (!unique.has(record.fandomEntity) || record.source === "manual") {
      unique.set(record.fandomEntity, record);
    }
  }

  return [...unique.values()].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "spider" ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName, "en");
  });
}

module.exports = {
  MANUAL_RELATED_CHARACTERS,
  MANUAL_SPIDER_CHARACTERS,
  characterRecord,
  characterSlug,
  extractReality,
  manualSpiderRoster,
  rosterFromCategories,
  symbioteDisplayName
};
