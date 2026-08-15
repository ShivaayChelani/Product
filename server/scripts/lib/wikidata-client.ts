import type { WikidataExtract } from './factual-enrichment-types';
import { pipelineFetch } from './pipeline-reliability/http-agent';

const USER_AGENT = 'PalSafar-FactualEnrichment/1.0 (https://palsafar.com; ops@palsafar.local)';

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await pipelineFetch(url, { headers: { 'User-Agent': USER_AGENT } });
  try {
    if (!res.ok) return null;
    return (await res.json()) as T;
  } finally {
    await res.body?.cancel?.().catch(() => undefined);
  }
}

const UNESCO_DESIGNATION_QIDS = new Set(['Q9259', 'Q43113623', 'Q10387575']);
const ASI_HERITAGE_QIDS = new Set(['Q17032519', 'Q17047561', 'Q17047562']);

const RELIGIOUS_INSTANCE_QIDS: Record<string, string> = {
  Q1420: 'Hindu temple',
  Q32815: 'mosque',
  Q16970: 'church building',
  Q13685: 'Buddhist temple',
  Q34627: 'synagogue',
  Q697295: 'Sikh temple',
  Q56242235: 'Jain temple',
};

const NATURAL_CULTURAL_QIDS: Record<string, string> = {
  Q839954: 'archaeological site',
  Q570116: 'tourist attraction',
  Q33506: 'museum',
  Q41176: 'building',
  Q54050: 'hill',
  Q8502: 'mountain',
  Q23397: 'lake',
  Q4022: 'river',
  Q473972: 'protected area',
  Q179049: 'national park',
};

const NATURAL_FEATURE_QIDS: Record<string, string> = {
  Q8502: 'mountain',
  Q54050: 'hill',
  Q23397: 'lake',
  Q4022: 'river',
  Q1065891: 'waterfall',
  Q755849: 'valley',
  Q107425: 'cave',
};

const TRANSPORT_RAILWAY_QIDS = new Set(['Q55488', 'Q22808404', 'Q12813115']);
const TRANSPORT_AIRPORT_QIDS = new Set(['Q1248784', 'Q94993988', 'Q24342327']);
const TRANSPORT_BUS_QIDS = new Set(['Q953806', 'Q12819564']);

type TransportHub = { qid: string; distanceM?: number };

function claimStrings(entity: Record<string, unknown>, pid: string): string[] {
  const claims = (entity as { claims?: Record<string, unknown[]> })?.claims?.[pid];
  if (!Array.isArray(claims)) return [];
  const out: string[] = [];
  for (const c of claims) {
    const dv = (c as { mainsnak?: { datavalue?: { type?: string; value?: unknown } } })?.mainsnak?.datavalue;
    if (!dv) continue;
    if (dv.type === 'string') out.push(String(dv.value).trim());
    if (dv.type === 'wikibase-entityid') {
      const id = (dv.value as { id?: string })?.id;
      if (id) out.push(id);
    }
    if (dv.type === 'time') {
      const t = String((dv.value as { time?: string })?.time || '');
      const year = t.match(/^\+?(-?\d{4})/);
      if (year) out.push(year[1]);
    }
    if (dv.type === 'quantity') {
      const amount = parseFloat(String((dv.value as { amount?: string })?.amount || ''));
      if (Number.isFinite(amount)) out.push(String(amount));
    }
  }
  return out.filter(Boolean);
}

function parseTransportHubs(entity: Record<string, unknown>): TransportHub[] {
  const claims = (entity as { claims?: { P931?: unknown[] } })?.claims?.P931;
  if (!Array.isArray(claims)) return [];
  const hubs: TransportHub[] = [];
  for (const c of claims) {
    const claim = c as {
      mainsnak?: { datavalue?: { type?: string; value?: { id?: string } } };
      qualifiers?: { P2043?: { datavalue?: { value?: { amount?: string; unit?: string } } }[] };
    };
    const hubQid = claim.mainsnak?.datavalue?.value?.id;
    if (!hubQid) continue;
    let distanceM: number | undefined;
    const distClaim = claim.qualifiers?.P2043?.[0]?.datavalue?.value;
    if (distClaim?.amount) {
      const amount = parseFloat(String(distClaim.amount));
      if (Number.isFinite(amount)) {
        const unit = String(distClaim.unit || '');
        distanceM = unit.includes('Q828224') ? amount * 1000 : amount;
      }
    }
    hubs.push({ qid: hubQid, distanceM });
  }
  return hubs;
}

export function parseOsmExternalIdFromP402(raw: string): string | null {
  const v = raw.trim();
  const m = v.match(/^(node|way|relation)[/:]\s*(\d+)$/i) || v.match(/^(\d+)$/);
  if (!m) return null;
  if (m.length === 3) return `osm:${m[1].toLowerCase()}:${m[2]}`;
  return `osm:node:${m[1]}`;
}

function parseCoordinate(entity: Record<string, unknown>): { lat: number; lng: number } | undefined {
  const claims = (entity as { claims?: { P625?: unknown[] } })?.claims?.P625;
  if (!Array.isArray(claims) || !claims[0]) return undefined;
  const v = (claims[0] as { mainsnak?: { datavalue?: { value?: { latitude?: number; longitude?: number } } } })
    ?.mainsnak?.datavalue?.value;
  const lat = v?.latitude;
  const lng = v?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat: lat!, lng: lng! };
}

function sitelinkTitle(entity: Record<string, unknown>, site = 'enwiki'): string | undefined {
  const title = (entity as { sitelinks?: Record<string, { title?: string }> })?.sitelinks?.[site]?.title;
  return title ? String(title).trim() : undefined;
}

export async function resolveEntityLabels(qids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(qids.filter((q) => /^Q\d+$/.test(q)))];
  const result = new Map<string, string>();
  if (!unique.length) return result;

  const chunkSize = 50;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: chunk.join('|'),
      props: 'labels',
      languages: 'en',
      format: 'json',
    });
    const json = await fetchJson<{ entities?: Record<string, { labels?: { en?: { value?: string } } }> }>(
      `https://www.wikidata.org/w/api.php?${params}`,
    );
    if (!json) continue;
    for (const qid of chunk) {
      const label = json.entities?.[qid]?.labels?.en?.value?.trim();
      if (label) result.set(qid, label);
    }
    await sleep(250);
  }
  return result;
}

async function resolveInstanceQids(qids: string[]): Promise<Map<string, string[]>> {
  const unique = [...new Set(qids.filter((q) => /^Q\d+$/.test(q)))];
  const result = new Map<string, string[]>();
  if (!unique.length) return result;

  const chunkSize = 50;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: chunk.join('|'),
      props: 'claims',
      format: 'json',
    });
    const json = await fetchJson<{ entities?: Record<string, Record<string, unknown>> }>(
      `https://www.wikidata.org/w/api.php?${params}`,
    );
    if (!json) continue;
    for (const qid of chunk) {
      const entity = json.entities?.[qid];
      if (!entity) continue;
      result.set(qid, claimStrings(entity, 'P31').filter((x) => x.startsWith('Q')));
    }
    await sleep(250);
  }
  return result;
}

function classifyTransportHub(qid: string, instanceQids: string[]): 'railway' | 'airport' | 'bus' | null {
  if (instanceQids.some((q) => TRANSPORT_RAILWAY_QIDS.has(q))) return 'railway';
  if (instanceQids.some((q) => TRANSPORT_AIRPORT_QIDS.has(q))) return 'airport';
  if (instanceQids.some((q) => TRANSPORT_BUS_QIDS.has(q))) return 'bus';
  return null;
}

function buildExtract(qid: string, entity: Record<string, unknown>): WikidataExtract {
  const labels: Record<string, string> = {};
  for (const [lang, obj] of Object.entries((entity as { labels?: Record<string, { value?: string }> }).labels || {})) {
    const v = obj?.value;
    if (v?.trim()) labels[lang] = v.trim();
  }

  const aliases: Record<string, string[]> = {};
  for (const [lang, arr] of Object.entries((entity as { aliases?: Record<string, { value?: string }[]> }).aliases || {})) {
    const vals = arr.map((a) => a.value?.trim()).filter(Boolean) as string[];
    if (vals.length) aliases[lang] = vals;
  }

  const descriptions: Record<string, string> = {};
  for (const [lang, obj] of Object.entries((entity as { descriptions?: Record<string, { value?: string }> }).descriptions || {})) {
    const v = obj?.value;
    if (v?.trim()) descriptions[lang] = v.trim();
  }

  const heritageQids = claimStrings(entity, 'P1435');
  const instanceQids = claimStrings(entity, 'P31').filter((x) => x.startsWith('Q'));
  const architectureQids = claimStrings(entity, 'P149').filter((x) => x.startsWith('Q'));
  const architectQids = claimStrings(entity, 'P84').filter((x) => x.startsWith('Q'));
  const founderQids = claimStrings(entity, 'P112').filter((x) => x.startsWith('Q'));
  const adminQids = claimStrings(entity, 'P131').filter((x) => x.startsWith('Q'));
  const historicalPeriodQids = claimStrings(entity, 'P921').filter((x) => x.startsWith('Q'));
  const locatedOnQids = claimStrings(entity, 'P706').filter((x) => x.startsWith('Q'));
  const transportHubs = parseTransportHubs(entity);
  const osmExternalIds = claimStrings(entity, 'P402').map(parseOsmExternalIdFromP402).filter(Boolean) as string[];

  const elevationRaw = claimStrings(entity, 'P2044')[0];
  const elevationMeters = elevationRaw ? parseFloat(elevationRaw) : undefined;
  const unescoId = claimStrings(entity, 'P757')[0] || claimStrings(entity, 'P2614')[0];
  const isUnescoDesignation = heritageQids.some((q) => UNESCO_DESIGNATION_QIDS.has(q));

  let religiousType: string | undefined;
  for (const q of instanceQids) {
    if (RELIGIOUS_INSTANCE_QIDS[q]) {
      religiousType = RELIGIOUS_INSTANCE_QIDS[q];
      break;
    }
  }

  let naturalCultural: string | undefined;
  for (const q of instanceQids) {
    if (NATURAL_CULTURAL_QIDS[q]) {
      naturalCultural = NATURAL_CULTURAL_QIDS[q];
      break;
    }
  }

  let naturalFeatureLabel: string | undefined;
  for (const q of locatedOnQids) {
    if (NATURAL_FEATURE_QIDS[q]) {
      naturalFeatureLabel = NATURAL_FEATURE_QIDS[q];
      break;
    }
  }

  return {
    qid,
    labels,
    aliases,
    descriptions,
    website: claimStrings(entity, 'P856')[0],
    phone: claimStrings(entity, 'P1329')[0],
    email: claimStrings(entity, 'P968')[0],
    elevationMeters: Number.isFinite(elevationMeters) ? elevationMeters : undefined,
    postalCode: claimStrings(entity, 'P281')[0],
    streetAddress: claimStrings(entity, 'P6375')[0],
    heritageQids,
    heritageLabels: [],
    inceptionYear: claimStrings(entity, 'P571')[0],
    openingYear: claimStrings(entity, 'P1619')[0],
    adminQids,
    adminEntityLabels: [],
    architectureQids,
    architectureLabels: [],
    architectQids,
    architectLabels: [],
    founderQids,
    founderLabels: [],
    instanceQids,
    instanceLabels: [],
    historicalPeriodQids,
    historicalPeriodLabels: [],
    locatedOnQids,
    transportHubs,
    osmExternalIds,
    unescoId,
    isUnescoDesignation,
    asiProtected: false,
    asiDesignation: undefined,
    religiousType,
    naturalCultural,
    naturalFeatureLabel,
    geologicalFeatureLabel: undefined,
    nearestRailwayLabel: undefined,
    nearestRailwayDistanceM: undefined,
    nearestAirportLabel: undefined,
    nearestAirportDistanceM: undefined,
    nearestBusLabel: undefined,
    nearestBusDistanceM: undefined,
    wikipediaTitle: sitelinkTitle(entity, 'enwiki'),
    coordinates: parseCoordinate(entity),
  };
}

export async function fetchWikidataEntities(qids: string[]): Promise<Map<string, WikidataExtract>> {
  const unique = [...new Set(qids.map((q) => q.replace(/^wikidata:/i, '').toUpperCase()).filter((q) => /^Q\d+$/.test(q)))];
  const result = new Map<string, WikidataExtract>();
  if (!unique.length) return result;

  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: chunk.join('|'),
      props: 'labels|aliases|descriptions|claims|sitelinks',
      languages: 'en|hi|mr|bn|ta|te|kn|ml|gu|pa|or|as|ur',
      format: 'json',
    });
    const json = await fetchJson<{ entities?: Record<string, Record<string, unknown>> }>(
      `https://www.wikidata.org/w/api.php?${params}`,
    );
    if (!json) throw new Error('Wikidata API request failed');
    for (const qid of chunk) {
      const entity = json.entities?.[qid];
      if (!entity || (entity as { missing?: string }).missing) continue;
      result.set(qid, buildExtract(qid, entity));
    }
    await sleep(300);
  }

  const labelQids = new Set<string>();
  const transportQids = new Set<string>();
  for (const ex of result.values()) {
    ex.heritageQids.forEach((q) => labelQids.add(q));
    ex.architectureQids.forEach((q) => labelQids.add(q));
    ex.architectQids.forEach((q) => labelQids.add(q));
    ex.founderQids.forEach((q) => labelQids.add(q));
    ex.adminQids.forEach((q) => labelQids.add(q));
    ex.instanceQids.forEach((q) => labelQids.add(q));
    ex.historicalPeriodQids.forEach((q) => labelQids.add(q));
    ex.locatedOnQids.forEach((q) => labelQids.add(q));
    ex.transportHubs.forEach((h) => transportQids.add(h.qid));
  }

  const [labelMap, transportInstances] = await Promise.all([
    resolveEntityLabels([...labelQids, ...transportQids]),
    resolveInstanceQids([...transportQids]),
  ]);

  for (const ex of result.values()) {
    ex.heritageLabels = ex.heritageQids.map((q) => labelMap.get(q)).filter(Boolean) as string[];
    ex.architectureLabels = ex.architectureQids.map((q) => labelMap.get(q)).filter(Boolean) as string[];
    ex.architectLabels = ex.architectQids.map((q) => labelMap.get(q)).filter(Boolean) as string[];
    ex.founderLabels = ex.founderQids.map((q) => labelMap.get(q)).filter(Boolean) as string[];
    ex.adminEntityLabels = ex.adminQids.map((q) => labelMap.get(q)).filter(Boolean) as string[];
    ex.instanceLabels = ex.instanceQids.map((q) => labelMap.get(q)).filter(Boolean) as string[];
    ex.historicalPeriodLabels = ex.historicalPeriodQids.map((q) => labelMap.get(q)).filter(Boolean) as string[];

    ex.asiProtected = ex.heritageQids.some((q) => ASI_HERITAGE_QIDS.has(q))
      || ex.heritageLabels.some((l) => /archaeological survey of india|monument of national importance/i.test(l));
    if (ex.asiProtected) {
      ex.asiDesignation = ex.heritageLabels.find((l) => /archaeological survey|national importance|protected monument/i.test(l))
        || ex.heritageLabels[0];
    }

    for (const hub of ex.transportHubs) {
      const label = labelMap.get(hub.qid);
      if (!label) continue;
      const kind = classifyTransportHub(hub.qid, transportInstances.get(hub.qid) || []);
      if (kind === 'railway' && !ex.nearestRailwayLabel) {
        ex.nearestRailwayLabel = label;
        ex.nearestRailwayDistanceM = hub.distanceM;
      } else if (kind === 'airport' && !ex.nearestAirportLabel) {
        ex.nearestAirportLabel = label;
        ex.nearestAirportDistanceM = hub.distanceM;
      } else if (kind === 'bus' && !ex.nearestBusLabel) {
        ex.nearestBusLabel = label;
        ex.nearestBusDistanceM = hub.distanceM;
      }
    }

    if (!ex.naturalFeatureLabel && ex.locatedOnQids.length) {
      const label = labelMap.get(ex.locatedOnQids[0]);
      if (label) ex.naturalFeatureLabel = label;
    }
  }

  return result;
}

export async function fetchWikipediaLead(wikiTitle: string): Promise<{ extract?: string; sourceUri: string } | null> {
  const title = encodeURIComponent(wikiTitle.replace(/ /g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
  const json = await fetchJson<{ extract?: string; content_urls?: { desktop?: { page?: string } } }>(url);
  if (!json) return null;
  const extract = json.extract?.trim();
  if (!extract || extract.length < 40) return null;
  return {
    extract,
    sourceUri: json.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${title}`,
  };
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
