import { describe, expect, it } from 'vitest';
import {
  ANCHOR_SEPARATION_KM,
  CO_FIVE_STAR_JOIN_KM,
  MAX_PRIMARY_CLUSTER_DIAMETER_KM,
  absoluteMinTier,
  assignDaysByClusterValue,
  buildCandidateClusterMembers,
  buildDayCluster,
  candidateScore,
  clusterDiameterKm,
  isPrimaryClusterMember,
  journeyValueScore,
  minAllowedTier,
  priorityTier,
  proximityBonus,
  resolveActiveTierFloor,
  scoreAnchorCluster,
  scoreCandidateCluster,
  scoreDayExcursion,
  selectBestCandidateCluster,
  selectBestDayExcursion,
  visitMinutes,
  pickVariedCandidate,
  type ClusterPlace,
} from '../modules/trips/itineraryCluster';

/** ~1° latitude ≈ 111 km */
const ORIGIN = { lat: 23.17, lng: 79.94 };

function place(
  id: string,
  name: string,
  opts: {
    lat: number;
    lng: number;
    rating?: number;
    editorialPriority?: number;
    category?: string;
    isPinned?: boolean;
    estimatedDurationMinutes?: number;
  },
): ClusterPlace {
  return {
    id,
    name,
    category: opts.category || 'heritage',
    latitude: opts.lat,
    longitude: opts.lng,
    rating: opts.rating ?? null,
    editorialPriority: opts.editorialPriority ?? 3,
    estimatedDurationMinutes: opts.estimatedDurationMinutes ?? null,
    isPinned: !!opts.isPinned,
  };
}

describe('itinerary cluster philosophy', () => {
  it('TEST 1: two close 5★ places can share the same day cluster', () => {
    const a = place('a', 'A 5★', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.8, editorialPriority: 5 });
    const b = place('b', 'B 5★', { lat: ORIGIN.lat + 0.018, lng: ORIGIN.lng, rating: 4.7, editorialPriority: 5 }); // ~2 km
    const c = place('c', 'C 4★', { lat: ORIGIN.lat + 0.03, lng: ORIGIN.lng, rating: 4.0, category: 'waterfall' });
    const used = new Set<string>();
    const day = buildDayCluster(a, [a, b, c], used, {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 480,
      speedKmh: 30,
    }, []);
    expect(day.map((p) => p.id)).toContain('a');
    expect(day.map((p) => p.id)).toContain('b');
  });

  it('TEST 2: 5★ places ~15 km apart become separate anchors/days', () => {
    const a = place('a', 'A 5★', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.9, editorialPriority: 5 });
    const b = place('b', 'B 5★', {
      lat: ORIGIN.lat + 0.14, // ~15.5 km
      lng: ORIGIN.lng,
      rating: 4.8,
      editorialPriority: 5,
    });
    const used = new Set<string>();
    const day1 = buildDayCluster(a, [a, b], used, {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 480,
      speedKmh: 30,
    }, []);
    expect(day1.map((p) => p.id)).toContain('a');
    expect(day1.map((p) => p.id)).not.toContain('b');
    expect(haversineApproxKm(a, b)).toBeGreaterThanOrEqual(ANCHOR_SEPARATION_KM);

    const { days } = assignDaysByClusterValue([a, b], {
      days: 2,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin: ORIGIN,
      speedKmh: 30,
    });
    const flat = days.map((d) => d.map((p) => p.id));
    expect(flat.some((d) => d.includes('a'))).toBe(true);
    expect(flat.some((d) => d.includes('b'))).toBe(true);
    // Not the same day
    expect(flat.some((d) => d.includes('a') && d.includes('b'))).toBe(false);
  });

  it('TEST 3: 1-day local 4★ cluster can beat isolated far 5★', () => {
    const far = place('A', 'Far 5★', {
      lat: ORIGIN.lat + 0.36, // ~40 km
      lng: ORIGIN.lng,
      rating: 5,
      editorialPriority: 5,
    });
    const b = place('B', 'Local 4★ B', { lat: ORIGIN.lat + 0.036, lng: ORIGIN.lng, rating: 4.2, category: 'fort' });
    const c = place('C', 'Local 4★ C', { lat: ORIGIN.lat + 0.054, lng: ORIGIN.lng, rating: 4.0, category: 'waterfall' });
    const d = place('D', 'Local 3★ D', { lat: ORIGIN.lat + 0.072, lng: ORIGIN.lng, rating: 3.2, category: 'temple' });

    const pool = [far, b, c, d];
    const farScore = scoreAnchorCluster(far, pool, new Set(), 1, 5, ORIGIN);
    const localScore = scoreAnchorCluster(b, pool, new Set(), 1, 5, ORIGIN);
    expect(localScore).toBeGreaterThan(farScore);

    const { days } = assignDaysByClusterValue(pool, {
      days: 1,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 480,
      origin: ORIGIN,
      speedKmh: 30,
    });
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids).toContain('B');
    expect(ids).not.toContain('A');
  });

  it('TEST 4: user-selected far 5★ becomes the anchor', () => {
    const far = place('A', 'Far 5★ pinned', {
      lat: ORIGIN.lat + 0.36,
      lng: ORIGIN.lng,
      rating: 5,
      editorialPriority: 5,
      isPinned: true,
    });
    const b = place('B', 'Local 4★', { lat: ORIGIN.lat + 0.036, lng: ORIGIN.lng, rating: 4.2 });
    const nearFar = place('N', 'Near far 4★', {
      lat: ORIGIN.lat + 0.37,
      lng: ORIGIN.lng,
      rating: 4.1,
      category: 'museum',
    });

    const { days } = assignDaysByClusterValue([far, b, nearFar], {
      days: 1,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 480,
      origin: ORIGIN,
      speedKmh: 30,
    });
    expect(days[0]?.[0]?.id).toBe('A');
  });

  it('TEST 5: 4★ nearby support joins compact region; route proximity still rewards short hops', () => {
    const a = place('A', 'A 5★', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.9, editorialPriority: 5, category: 'fort' });
    const b = place('B', 'B 4★', { lat: ORIGIN.lat + 0.072, lng: ORIGIN.lng, rating: 4.1, category: 'waterfall' }); // ~8 km
    // Stay inside compact continuum (~10 km from A) — not a foreign region
    const c = place('C', 'C 4★', { lat: ORIGIN.lat + 0.090, lng: ORIGIN.lng, rating: 4.0, category: 'temple' }); // ~10 km from A

    const score = candidateScore(c, 2, 10);
    expect(score).toBeGreaterThan(QUALITY_SOFT_FLOOR);
    expect(proximityBonus(8)).toBeGreaterThan(0);

    const used = new Set<string>();
    const day = buildDayCluster(a, [a, b, c], used, {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 540,
      speedKmh: 35,
    }, []);
    expect(day.map((p) => p.id)).toEqual(expect.arrayContaining(['A', 'B', 'C']));
  });

  it('TEST 6: 1-day trip only allows ★★★–★★★★★', () => {
    expect(minAllowedTier(1)).toBe(3);
    const weak = place('w', 'Weak', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 1.2 });
    expect(priorityTier(weak)).toBeLessThan(3);
  });

  it('TEST 7: 4-day trip makes ★★ eligible but not automatic', () => {
    expect(minAllowedTier(4)).toBe(2);
    const twoStar = place('t2', 'Two star', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 2.0 });
    expect(priorityTier(twoStar)).toBe(2);

    const anchor = place('a', 'A 5★', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.9, editorialPriority: 5 });
    const strong = place('s', 'Strong 4★', {
      lat: ORIGIN.lat + 0.02,
      lng: ORIGIN.lng,
      rating: 4.2,
      category: 'waterfall',
    });
    const weak = place('w', 'Pad 2★', {
      lat: ORIGIN.lat + 0.025,
      lng: ORIGIN.lng + 0.01,
      rating: 1.8,
      category: 'garden',
    });
    const used = new Set<string>();
    const day = buildDayCluster(anchor, [anchor, strong, weak], used, {
      days: 4,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 540,
      speedKmh: 30,
    }, []);
    // Quality gate / diversity should prefer strong 4★; 2★ may or may not appear but must not displace 4★
    expect(day.map((p) => p.id)).toContain('s');
    if (day.map((p) => p.id).includes('w')) {
      expect(day.findIndex((p) => p.id === 's')).toBeLessThan(day.findIndex((p) => p.id === 'w'));
    }
  });

  it('TEST 8: 5+ day trip makes ★ eligible optionally', () => {
    expect(minAllowedTier(5)).toBe(1);
    const oneStar = place('o', 'One star', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 1.0 });
    expect(priorityTier(oneStar)).toBe(1);
  });

  it('TEST 9: many low-quality places do not pad the day', () => {
    const anchor = place('a', 'A 5★', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.8, editorialPriority: 5 });
    const fillers: ClusterPlace[] = [];
    for (let i = 0; i < 12; i++) {
      fillers.push(
        place(`f${i}`, `Filler ${i}`, {
          lat: ORIGIN.lat + 0.01 + i * 0.002,
          lng: ORIGIN.lng + 0.01,
          rating: 1.1,
          category: 'garden',
        }),
      );
    }
    const used = new Set<string>();
    const day = buildDayCluster(anchor, [anchor, ...fillers], used, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 480,
      speedKmh: 30,
    }, []);
    // 1-day minTier=3 → fillers ineligible; day should be anchor-only (or very short)
    expect(day.length).toBe(1);
    expect(day[0].id).toBe('a');
  });

  it('TEST 10: prefer 5★ with best surrounding cluster, not isolated highest raw score', () => {
    const isolated = place('iso', 'Isolated 5★', {
      lat: ORIGIN.lat + 0.3,
      lng: ORIGIN.lng,
      rating: 5,
      editorialPriority: 5,
    });
    const clustered = place('clu', 'Clustered 5★', {
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      rating: 4.6,
      editorialPriority: 5,
    });
    const n1 = place('n1', 'Near 4★', { lat: ORIGIN.lat + 0.02, lng: ORIGIN.lng, rating: 4.2, category: 'waterfall' });
    const n2 = place('n2', 'Near 4★b', { lat: ORIGIN.lat + 0.03, lng: ORIGIN.lng, rating: 4.0, category: 'temple' });
    const pool = [isolated, clustered, n1, n2];
    const isoScore = scoreAnchorCluster(isolated, pool, new Set(), 2, 5, ORIGIN);
    const cluScore = scoreAnchorCluster(clustered, pool, new Set(), 2, 5, ORIGIN);
    expect(cluScore).toBeGreaterThan(isoScore);
  });

  it('TEST 11: multi-day assignment yields coherent separate clusters', () => {
    const a1 = place('a1', 'Cluster1 5★', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.8, editorialPriority: 5 });
    const a1b = place('a1b', 'Cluster1 4★', { lat: ORIGIN.lat + 0.02, lng: ORIGIN.lng, rating: 4.1, category: 'waterfall' });
    const a2 = place('a2', 'Cluster2 5★', {
      lat: ORIGIN.lat + 0.2,
      lng: ORIGIN.lng,
      rating: 4.7,
      editorialPriority: 5,
    });
    const a2b = place('a2b', 'Cluster2 4★', {
      lat: ORIGIN.lat + 0.22,
      lng: ORIGIN.lng,
      rating: 4.0,
      category: 'temple',
    });

    const { days } = assignDaysByClusterValue([a1, a1b, a2, a2b], {
      days: 2,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin: ORIGIN,
      speedKmh: 30,
    });
    expect(days.length).toBeGreaterThanOrEqual(2);
    const day0 = new Set(days[0].map((p) => p.id));
    const day1 = new Set(days[1].map((p) => p.id));
    // Clusters should not fully mix across both days
    const mixed =
      (day0.has('a1') && day0.has('a2')) ||
      (day1.has('a1') && day1.has('a2'));
    expect(mixed).toBe(false);
  });

  it('TEST 12: prefer category diversity when scores are similar', () => {
    const anchor = place('a', 'A 5★ fort', {
      lat: ORIGIN.lat,
      lng: ORIGIN.lng,
      rating: 4.8,
      editorialPriority: 5,
      category: 'fort',
    });
    const fort2 = place('f2', 'Another fort', {
      lat: ORIGIN.lat + 0.02,
      lng: ORIGIN.lng,
      rating: 4.1,
      category: 'fort',
    });
    const waterfall = place('w', 'Waterfall', {
      lat: ORIGIN.lat + 0.021,
      lng: ORIGIN.lng + 0.005,
      rating: 4.1,
      category: 'waterfall',
    });
    const used = new Set<string>();
    const day = buildDayCluster(anchor, [anchor, fort2, waterfall], used, {
      days: 2,
      maxStopsPerDay: 3,
      maxMinutesPerDay: 480,
      speedKmh: 30,
    }, []);
    // With max 2 same category and one slot after anchor, waterfall should win over second fort
    // (hasTooManySameCategory allows 1 fort already = anchor, so fort2 blocked at maxSame=2? 
    //  anchor is fort, fort2 would make 2 forts which is allowed at maxSame=2.
    // Diversity is soft via cluster scoring; for buildDayCluster, same-category limit is 2.
    // Force diversity: add a third fort so fort category hits limit, waterfall wins second pick.
    expect(day.length).toBeGreaterThanOrEqual(2);
    const cats = day.map((p) => p.category);
    expect(new Set(cats).size).toBeGreaterThanOrEqual(Math.min(2, day.length));
  });
});

describe('PRIMARY CLUSTER LOCK — Jabalpur / multi-cluster', () => {
  /**
   * Approximate real geography (WGS84):
   * Bhedaghat / Dhuandhar / Chausath Yogini are the marble-rocks cluster.
   * Madan Mahal Fort sits ~12–15 km toward central Jabalpur.
   */
  const bhedaghat = place('bhedaghat', 'Bhedaghat', {
    lat: 23.1254,
    lng: 79.8012,
    rating: 4.8,
    editorialPriority: 5,
    category: 'viewpoint',
  });
  const chausath = place('chausath', 'Chausath Yogini Mandir', {
    lat: 23.1298,
    lng: 79.7955,
    rating: 4.7,
    editorialPriority: 5,
    category: 'temple',
  });
  const dhuandhar = place('dhuandhar', 'Dhuandhar Falls', {
    lat: 23.1250,
    lng: 79.8134,
    rating: 4.6,
    editorialPriority: 5,
    category: 'waterfall',
  });
  const nearby4 = place('balancing', 'Balancing Rock', {
    lat: 23.1180,
    lng: 79.8080,
    rating: 4.0,
    category: 'viewpoint',
  });
  const nearby3 = place('marble', 'Marble Rocks Ghat', {
    lat: 23.1320,
    lng: 79.8000,
    rating: 3.3,
    category: 'nature',
  });
  const madanMahal = place('madan', 'Madan Mahal Fort', {
    lat: 23.1780, // ~18+ km from Bhedaghat marble-rocks cluster
    lng: 79.9450,
    rating: 4.7,
    editorialPriority: 5,
    category: 'fort',
  });
  const madanNearby = place('rani', 'Rani Durgavati Museum area', {
    lat: 23.1850,
    lng: 79.9550,
    rating: 4.0,
    category: 'museum',
  });

  it('Jabalpur 1-day: Bhedaghat cluster stays locked; Madan Mahal does not jump in', () => {
    expect(haversineApproxKm(bhedaghat, chausath)).toBeLessThan(ANCHOR_SEPARATION_KM);
    expect(haversineApproxKm(bhedaghat, madanMahal)).toBeGreaterThanOrEqual(ANCHOR_SEPARATION_KM);

    const pool = [bhedaghat, chausath, dhuandhar, nearby4, nearby3, madanMahal, madanNearby];
    // Origin near city center (closer to Madan) — cluster-first must still prefer Bhedaghat richness
    const cityOrigin = { lat: 23.1815, lng: 79.9864 };
    const { days } = assignDaysByClusterValue(pool, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 480,
      origin: cityOrigin,
      speedKmh: 30,
    });

    const ids = days[0]?.map((p) => p.id) || [];
    expect(days[0]?.[0]?.id).not.toBe('madan');
    expect(ids).toContain('bhedaghat');
    expect(ids).toContain('chausath');
    expect(ids.some((id) => id === 'dhuandhar' || id === 'balancing' || id === 'marble')).toBe(true);
    expect(ids).not.toContain('madan');
  });

  it('Jabalpur CLUSTER-FIRST: Bhedaghat aggregate beats Madan individual score', () => {
    const pool = [bhedaghat, chausath, dhuandhar, nearby4, nearby3, madanMahal, madanNearby];
    const cityOrigin = { lat: 23.1815, lng: 79.9864 }; // Jabalpur center — nearer Madan
    const used = new Set<string>();

    const bhedScore = scoreCandidateCluster(bhedaghat, pool, used, 1, 6, cityOrigin, 30);
    const madanScore = scoreCandidateCluster(madanMahal, pool, used, 1, 6, cityOrigin, 30);
    const winner = selectBestCandidateCluster(
      [bhedaghat, chausath, dhuandhar, madanMahal],
      pool,
      used,
      1,
      6,
      cityOrigin,
      30,
    );

    // Persist scores in assertion messages for CI/debug reports
    expect(
      bhedScore.score,
      `Bhedaghat cluster (${bhedScore.reason}) must beat Madan (${madanScore.reason})`,
    ).toBeGreaterThan(madanScore.score);
    expect(winner?.anchor.id, `winner=${winner?.anchor.name} :: ${winner?.reason}`).not.toBe('madan');
    expect(['bhedaghat', 'chausath', 'dhuandhar']).toContain(winner?.anchor.id);
    expect(winner?.members.some((m) => m.id === 'bhedaghat' || m.id === 'chausath')).toBe(true);
    expect(winner?.members.some((m) => m.id === 'madan')).toBe(false);

    // Soft log for local debugging
     
    console.log('[Jabalpur scores]', {
      bhedaghat: bhedScore.reason,
      madan: madanScore.reason,
      selectedAnchor: winner?.anchor.name,
      selectedMembers: winner?.members.map((m) => m.name),
    });
  });

  it('generalized CLUSTER-FIRST: rich Cluster A beats higher individual B1', () => {
    const a1 = place('A1', 'A1 5★', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.6, editorialPriority: 5, category: 'fort' });
    const a2 = place('A2', 'A2 5★', { lat: ORIGIN.lat + 0.02, lng: ORIGIN.lng, rating: 4.6, editorialPriority: 5, category: 'temple' });
    const a3 = place('A3', 'A3 4★', { lat: ORIGIN.lat + 0.03, lng: ORIGIN.lng, rating: 4.1, category: 'waterfall' });
    const a4 = place('A4', 'A4 3★', { lat: ORIGIN.lat + 0.04, lng: ORIGIN.lng, rating: 3.2, category: 'museum' });
    // Keep B clearly outside CLUSTER_SUPPORT_KM so membership cannot bleed into A
    const b1 = place('B1', 'B1 5★', {
      lat: ORIGIN.lat + 0.20, // ~22 km
      lng: ORIGIN.lng,
      rating: 5.0, // individually stronger than A1
      editorialPriority: 5,
      category: 'palace',
    });
    const b2 = place('B2', 'B2 4★', { lat: ORIGIN.lat + 0.21, lng: ORIGIN.lng, rating: 4.0, category: 'garden' });

    const pool = [a1, a2, a3, a4, b1, b2];
    // Origin nearer B1 — still must pick Cluster A on aggregate / 1-day excursion value
    const originNearB = { lat: ORIGIN.lat + 0.18, lng: ORIGIN.lng };
    const winner = selectBestCandidateCluster([a1, a2, b1], pool, new Set(), 1, 6, originNearB, 30);
    expect(winner?.anchor.id).not.toBe('B1');
    expect(['A1', 'A2']).toContain(winner?.anchor.id);

    const { days } = assignDaysByClusterValue(pool, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 480,
      origin: originNearB,
      speedKmh: 30,
    });
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids).toEqual(expect.arrayContaining(['A1', 'A2', 'A3', 'A4']));
    expect(ids).not.toContain('B1');
  });

  it('generalized: Cluster A completes before distant Cluster B on 1-day', () => {
    const a1 = place('A1', 'A1 5★', { lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.9, editorialPriority: 5, category: 'fort' });
    const a2 = place('A2', 'A2 5★', { lat: ORIGIN.lat + 0.02, lng: ORIGIN.lng, rating: 4.8, editorialPriority: 5, category: 'temple' });
    const a3 = place('A3', 'A3 4★', { lat: ORIGIN.lat + 0.03, lng: ORIGIN.lng, rating: 4.1, category: 'waterfall' });
    const a4 = place('A4', 'A4 3★', { lat: ORIGIN.lat + 0.04, lng: ORIGIN.lng, rating: 3.2, category: 'museum' });
    const b1 = place('B1', 'B1 5★', {
      lat: ORIGIN.lat + 0.13, // ~14.4 km
      lng: ORIGIN.lng,
      rating: 4.9,
      editorialPriority: 5,
      category: 'palace',
    });
    const b2 = place('B2', 'B2 4★', { lat: ORIGIN.lat + 0.14, lng: ORIGIN.lng, rating: 4.0, category: 'garden' });

    const used = new Set<string>();
    const day = buildDayCluster(a1, [a1, a2, a3, a4, b1, b2], used, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 480,
      speedKmh: 30,
    }, []);
    const ids = day.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['A1', 'A2', 'A3', 'A4']));
    expect(ids).not.toContain('B1');
  });

  it('pinned Madan Mahal still becomes the day anchor (user intent)', () => {
    const pinnedMadan = { ...madanMahal, isPinned: true };
    const { days } = assignDaysByClusterValue(
      [bhedaghat, chausath, dhuandhar, pinnedMadan, madanNearby],
      {
        days: 1,
        maxStopsPerDay: 5,
        maxMinutesPerDay: 480,
        origin: { lat: 23.13, lng: 79.80 },
        speedKmh: 30,
      },
    );
    expect(days[0]?.[0]?.id).toBe('madan');
  });

  it('2-day trip: Bhedaghat cluster day 1, Madan Mahal cluster day 2', () => {
    const pool = [bhedaghat, chausath, dhuandhar, nearby3, madanMahal, madanNearby];
    const { days } = assignDaysByClusterValue(pool, {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 420,
      origin: { lat: 23.13, lng: 79.80 },
      speedKmh: 30,
    });
    expect(days.length).toBeGreaterThanOrEqual(2);
    const day1 = new Set(days[0].map((p) => p.id));
    const day2 = new Set(days[1].map((p) => p.id));
    expect(day1.has('bhedaghat') || day1.has('chausath') || day1.has('dhuandhar')).toBe(true);
    expect(day1.has('madan')).toBe(false);
    expect(day2.has('madan')).toBe(true);
  });
});

const QUALITY_SOFT_FLOOR = 30;

function haversineApproxKm(a: ClusterPlace, b: ClusterPlace): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

describe('REGIONAL JOURNEY CONTINUITY', () => {
  // Approximate real WGS84 (examples only — production uses coordinates, not names)
  const cityOrigin = { lat: 23.1815, lng: 79.9864 };
  const bhedaghat = place('bhedaghat', 'Bhedaghat', {
    lat: 23.1254, lng: 79.8012, rating: 4.8, editorialPriority: 5, category: 'viewpoint',
  });
  const chausath = place('chausath', 'Chausath Yogini', {
    lat: 23.1298, lng: 79.7955, rating: 4.7, editorialPriority: 5, category: 'temple',
  });
  const dhuandhar = place('dhuandhar', 'Dhuandhar Falls', {
    lat: 23.1250, lng: 79.8134, rating: 4.6, editorialPriority: 5, category: 'waterfall',
  });
  const nearby3 = place('marble', 'Marble Rocks boat', {
    lat: 23.1320, lng: 79.8000, rating: 3.5, category: 'activity',
  });
  const madanMahal = place('madan', 'Madan Mahal', {
    lat: 23.1780, lng: 79.9450, rating: 4.9, editorialPriority: 5, category: 'fort',
  });
  const payli = place('payli', 'Payli Island', {
    lat: 22.9800, lng: 79.8800, rating: 4.6, editorialPriority: 5, category: 'island',
  });
  const bargi = place('bargi', 'Bargi Dam', {
    lat: 22.9400, lng: 79.9000, rating: 4.5, editorialPriority: 5, category: 'dam',
  });
  const bargiNearby = place('bargi-n', 'Bargi viewpoint', {
    lat: 22.9450, lng: 79.9100, rating: 3.6, category: 'viewpoint',
  });

  it('TEST 1 — ONE DAY: stay in Bhedaghat region; no Madan jump', () => {
    const pool = [bhedaghat, chausath, dhuandhar, nearby3, madanMahal];
    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 480,
      origin: cityOrigin,
      speedKmh: 30,
    });
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids).toEqual(expect.arrayContaining(['bhedaghat', 'chausath', 'dhuandhar']));
    expect(ids).not.toContain('madan');
    expect(plannedDays[0]?.dayStart.label).toBe('trip-origin');
    expect(['bhedaghat', 'chausath', 'dhuandhar']).toContain(plannedDays[0]?.regionAnchorId);
  });

  it('TEST 2 — TWO DAYS: Day2 prefers Payli→Bargi over Payli→Madan→Bargi', () => {
    const pool = [bhedaghat, chausath, dhuandhar, payli, bargi, bargiNearby, madanMahal];
    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 420,
      origin: cityOrigin,
      speedKmh: 30,
      debug: false,
    });
    expect(days.length).toBe(2);
    const day1 = new Set(days[0].map((p) => p.id));
    const day2Ids = days[1].map((p) => p.id);
    expect(day1.has('bhedaghat') || day1.has('chausath') || day1.has('dhuandhar')).toBe(true);
    expect(day1.has('madan')).toBe(false);

    // Day 2 region should be Payli/Bargi (near each other), not Madan inserted between them
    expect(day2Ids).toEqual(expect.arrayContaining(['payli', 'bargi']));
    expect(day2Ids).not.toContain('madan');
    const payliIdx = day2Ids.indexOf('payli');
    const bargiIdx = day2Ids.indexOf('bargi');
    const madanIdx = day2Ids.indexOf('madan');
    if (payliIdx >= 0 && bargiIdx >= 0 && madanIdx >= 0) {
      // Madan must not sit between Payli and Bargi
      const between = (madanIdx - payliIdx) * (bargiIdx - madanIdx) > 0;
      expect(between).toBe(false);
    }

    // Day 2 starts from Day 1 end — not city center
    expect(plannedDays[1]?.dayStart.label).toBe(plannedDays[0]?.dayEnd.label);
    expect(plannedDays[1]?.dayStart.label).not.toBe('trip-origin');
  });

  it('TEST 3 — DAY START PROPAGATION: from Payli end, Bargi (5km) beats Madan (20km)', () => {
    const day1End = { lat: payli.latitude, lng: payli.longitude };
    const bargiScore = scoreCandidateCluster(
      bargi, [payli, bargi, bargiNearby, madanMahal], new Set(['payli']), 2, 5, day1End, 30, true,
    );
    const madanScore = scoreCandidateCluster(
      madanMahal, [payli, bargi, bargiNearby, madanMahal], new Set(['payli']), 2, 5, day1End, 30, true,
    );
    expect(bargiScore.score).toBeGreaterThan(madanScore.score);

    // Wrong origin (city center) must NOT be used for this comparison in assignDays
    const { plannedDays } = assignDaysByClusterValue(
      [bhedaghat, chausath, dhuandhar, payli, bargi, madanMahal],
      {
        days: 2,
        maxStopsPerDay: 4,
        maxMinutesPerDay: 420,
        origin: cityOrigin,
        speedKmh: 30,
      },
    );
    expect(plannedDays[1]?.dayStart.lat).toBeCloseTo(plannedDays[0]!.dayEnd.lat, 3);
    expect(plannedDays[1]?.dayStart.lng).toBeCloseTo(plannedDays[0]!.dayEnd.lng, 3);
  });

  it('TEST 4 — HIGH PRIORITY FAR AWAY: in-region 4★@3km before out-region 5★@35km', () => {
    const anchor = place('A', 'Region A 5★', {
      lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.6, editorialPriority: 5, category: 'fort',
    });
    const near4 = place('N4', 'Near 4★', {
      lat: ORIGIN.lat + 0.027, // ~3 km
      lng: ORIGIN.lng,
      rating: 4.1,
      category: 'temple',
    });
    const far5 = place('F5', 'Far 5★', {
      lat: ORIGIN.lat + 0.315, // ~35 km
      lng: ORIGIN.lng,
      rating: 5.0,
      editorialPriority: 5,
      category: 'palace',
    });

    const used = new Set<string>();
    const day = buildDayCluster(anchor, [anchor, near4, far5], used, {
      days: 1,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 360, // tight — cannot afford second region
      speedKmh: 30,
    }, []);
    const ids = day.map((p) => p.id);
    expect(ids).toContain('N4');
    expect(ids).not.toContain('F5');

    const jvNear = journeyValueScore({
      place: near4,
      distFromLastKm: 3,
      distFromRegionKm: 3,
      inRegion: true,
      remainingMinutes: 200,
      visitMins: 60,
      travelMins: 20,
      categoryRepeat: false,
    });
    const jvFar = journeyValueScore({
      place: far5,
      distFromLastKm: 35,
      distFromRegionKm: 35,
      inRegion: false,
      remainingMinutes: 200,
      visitMins: 90,
      travelMins: 80,
      categoryRepeat: false,
      regionExhausted: false,
    });
    expect(jvNear.decision).toBe('IN_REGION');
    expect(jvFar.decision).toBe('REJECTED');
    expect(jvNear.score).toBeGreaterThan(jvFar.score);
  });

  it('TEST 5 — REGION EXHAUSTION: foreign region deferred to next day (no same-day escape)', () => {
    const a1 = place('A1', 'A alone 5★', {
      lat: ORIGIN.lat, lng: ORIGIN.lng, rating: 4.7, editorialPriority: 5, category: 'fort',
    });
    // Second region ~14 km away (outside CLUSTER_SUPPORT_KM=12) with multiple strong attractions
    const b1 = place('B1', 'B area 4★', {
      lat: ORIGIN.lat + 0.126, lng: ORIGIN.lng, rating: 4.2, category: 'waterfall',
    });
    const b2 = place('B2', 'B area 4★b', {
      lat: ORIGIN.lat + 0.134, lng: ORIGIN.lng, rating: 4.0, category: 'temple',
    });
    const b3 = place('B3', 'B area 3★', {
      lat: ORIGIN.lat + 0.140, lng: ORIGIN.lng, rating: 3.3, category: 'museum',
    });

    const used = new Set<string>();
    const debugLog: string[] = [];
    const day = buildDayCluster(a1, [a1, b1, b2, b3], used, {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 540,
      speedKmh: 30,
      debug: true,
    }, debugLog);
    expect(day[0].id).toBe('A1');
    // Remaining time must NOT pull Region B onto the same day
    expect(day.some((p) => p.id.startsWith('B'))).toBe(false);
    expect(debugLog.some((l) =>
      l.includes('next region deferred to next day') || l.includes('day ends'),
    )).toBe(true);

    // Region B belongs on Day 2 when planning multi-day
    const { days, plannedDays } = assignDaysByClusterValue([a1, b1, b2, b3], {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 540,
      origin: ORIGIN,
      speedKmh: 30,
    });
    expect(days.length).toBe(2);
    // Richer Region B may win Day 1 from origin; Day 2 gets the remaining region.
    // Neither day may mix A and B (no same-day foreign-region escape).
    const d1 = days[0].map((p) => p.id);
    const d2 = days[1].map((p) => p.id);
    const d1HasA = d1.some((id) => id.startsWith('A'));
    const d1HasB = d1.some((id) => id.startsWith('B'));
    expect(d1HasA && d1HasB).toBe(false);
    expect(d2.some((id) => id.startsWith('A')) && d2.some((id) => id.startsWith('B'))).toBe(false);
    expect(d1HasA || d1HasB).toBe(true);
    expect(d2.some((id) => id.startsWith('A')) || d2.some((id) => id.startsWith('B'))).toBe(true);
    expect(plannedDays[1].dayStart.label).toBe(plannedDays[0].dayEnd.label);
  });

  it('hotel base overrides previous day end for next day start', () => {
    const hotel = { lat: 23.18, lng: 79.99, label: 'hotel-jabalpur' };
    const { plannedDays } = assignDaysByClusterValue(
      [bhedaghat, chausath, dhuandhar, madanMahal, place('m2', 'Madan garden', {
        lat: 23.165, lng: 79.925, rating: 4.0, category: 'garden',
      })],
      {
        days: 2,
        maxStopsPerDay: 4,
        maxMinutesPerDay: 420,
        origin: cityOrigin,
        hotelBaseByDay: { 2: hotel },
        speedKmh: 30,
      },
    );
    expect(plannedDays[1]?.dayStart.label).toBe('hotel-jabalpur');
    expect(plannedDays[1]?.dayStart.lat).toBeCloseTo(hotel.lat, 4);
  });
});

describe('SAMPLE ITINERARY TRACES (city scenarios)', () => {
  function printTrace(label: string, result: ReturnType<typeof assignDaysByClusterValue>, speed = 30) {
     
    console.log('\n========== ' + label + ' ==========');
    for (const pd of result.plannedDays) {
       
      console.log(`\nDAY ${pd.dayNumber}`);
       
      console.log(`  dayStart: ${pd.dayStart.label} (${pd.dayStart.lat.toFixed(4)}, ${pd.dayStart.lng.toFixed(4)})`);
       
      console.log(`  anchor: ${pd.regionAnchorName}`);
      let prev = pd.dayStart;
      for (let i = 0; i < pd.stops.length; i++) {
        const s = pd.stops[i];
        const dist = haversineApproxKm(
          { ...s, latitude: prev.lat, longitude: prev.lng } as any,
          s,
        );
        // fix distance calc
        const R = 6371;
        const toRad = (d: number) => (d * Math.PI) / 180;
        const dLat = toRad(s.latitude - prev.lat);
        const dLng = toRad(s.longitude - prev.lng);
        const x =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(prev.lat)) * Math.cos(toRad(s.latitude)) * Math.sin(dLng / 2) ** 2;
        const km = 2 * R * Math.asin(Math.sqrt(x));
        const travelMin = Math.round((km / speed) * 60) + 10;
        const why = i === 0
          ? 'regional anchor selected for day'
          : km <= 12
            ? 'in-region high-value + route-efficient'
            : 'journey-value after region progression';
         
        console.log(
          `  ${i + 1}. ${s.name} | +${km.toFixed(1)} km / ~${travelMin} min | reason: ${why}`,
        );
        prev = { lat: s.latitude, lng: s.longitude, label: s.name };
      }
       
      console.log(`  dayEnd: ${pd.dayEnd.label} (${pd.dayEnd.lat.toFixed(4)}, ${pd.dayEnd.lng.toFixed(4)})`);
    }
  }

  it('1. Jabalpur — 1 day', () => {
    const origin = { lat: 23.1815, lng: 79.9864 };
    const pool = [
      place('bhedaghat', 'Bhedaghat', { lat: 23.1254, lng: 79.8012, rating: 4.8, editorialPriority: 5, category: 'viewpoint' }),
      place('chausath', 'Chausath Yogini', { lat: 23.1298, lng: 79.7955, rating: 4.7, editorialPriority: 5, category: 'temple' }),
      place('dhuandhar', 'Dhuandhar Falls', { lat: 23.1250, lng: 79.8134, rating: 4.6, editorialPriority: 5, category: 'waterfall' }),
      place('marble', 'Marble Rocks', { lat: 23.1320, lng: 79.8000, rating: 3.5, category: 'activity' }),
      place('madan', 'Madan Mahal', { lat: 23.1780, lng: 79.9450, rating: 4.9, editorialPriority: 5, category: 'fort' }),
      place('gwarighat', 'Gwarighat', { lat: 23.1500, lng: 79.9400, rating: 3.8, category: 'ghat' }),
    ];
    const result = assignDaysByClusterValue(pool, {
      days: 1, maxStopsPerDay: 5, maxMinutesPerDay: 480, origin, speedKmh: 30, debug: true,
    });
    printTrace('Jabalpur 1 day', result);
    const ids = result.days[0].map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['bhedaghat', 'chausath', 'dhuandhar']));
    expect(ids).not.toContain('madan');
  });

  it('2. Jabalpur — 2 days', () => {
    const origin = { lat: 23.1815, lng: 79.9864 };
    const pool = [
      place('bhedaghat', 'Bhedaghat', { lat: 23.1254, lng: 79.8012, rating: 4.8, editorialPriority: 5, category: 'viewpoint' }),
      place('chausath', 'Chausath Yogini', { lat: 23.1298, lng: 79.7955, rating: 4.7, editorialPriority: 5, category: 'temple' }),
      place('dhuandhar', 'Dhuandhar Falls', { lat: 23.1250, lng: 79.8134, rating: 4.6, editorialPriority: 5, category: 'waterfall' }),
      place('payli', 'Payli Island', { lat: 22.9800, lng: 79.8800, rating: 4.6, editorialPriority: 5, category: 'island' }),
      place('bargi', 'Bargi Dam', { lat: 22.9400, lng: 79.9000, rating: 4.5, editorialPriority: 5, category: 'dam' }),
      place('bargi-n', 'Bargi viewpoint', { lat: 22.9450, lng: 79.9100, rating: 3.6, category: 'viewpoint' }),
      place('madan', 'Madan Mahal', { lat: 23.1780, lng: 79.9450, rating: 4.9, editorialPriority: 5, category: 'fort' }),
    ];
    const result = assignDaysByClusterValue(pool, {
      days: 2, maxStopsPerDay: 5, maxMinutesPerDay: 420, origin, speedKmh: 30, debug: true,
    });
    printTrace('Jabalpur 2 days', result);
    expect(result.plannedDays[1].dayStart.label).toBe(result.plannedDays[0].dayEnd.label);
    const day2 = result.days[1].map((p) => p.id);
    expect(day2).toEqual(expect.arrayContaining(['payli', 'bargi']));
    expect(day2).not.toContain('madan');
  });

  it('3. Jaipur — 1 day', () => {
    const origin = { lat: 26.9124, lng: 75.7873 };
    const pool = [
      place('amber', 'Amber Fort', { lat: 26.9855, lng: 75.8513, rating: 4.8, editorialPriority: 5, category: 'fort' }),
      place('jaigarh', 'Jaigarh Fort', { lat: 26.9851, lng: 75.8456, rating: 4.6, editorialPriority: 5, category: 'fort' }),
      place('nahargarh', 'Nahargarh Fort', { lat: 26.9373, lng: 75.8155, rating: 4.5, editorialPriority: 5, category: 'fort' }),
      place('jalmahal', 'Jal Mahal', { lat: 26.9539, lng: 75.8460, rating: 4.2, category: 'palace' }),
      place('hawa', 'Hawa Mahal', { lat: 26.9239, lng: 75.8267, rating: 4.7, editorialPriority: 5, category: 'palace' }),
      place('city', 'City Palace', { lat: 26.9258, lng: 75.8237, rating: 4.6, editorialPriority: 5, category: 'palace' }),
    ];
    const result = assignDaysByClusterValue(pool, {
      days: 1, maxStopsPerDay: 5, maxMinutesPerDay: 480, origin, speedKmh: 28, debug: true,
    });
    printTrace('Jaipur 1 day', result);
    // One coherent region — Amber/Jaigarh cluster OR old-city cluster, not random hops across both
    const ids = new Set(result.days[0].map((p) => p.id));
    const amberSide = ['amber', 'jaigarh', 'jalmahal'].filter((id) => ids.has(id)).length;
    const citySide = ['hawa', 'city'].filter((id) => ids.has(id)).length;
    // Prefer staying mostly in one side; allow at most soft secondary if region exhausted
    expect(Math.max(amberSide, citySide)).toBeGreaterThanOrEqual(2);
  });

  it('4. Udaipur — 2 days', () => {
    const origin = { lat: 24.5854, lng: 73.7125 };
    const pool = [
      place('citypalace', 'City Palace', { lat: 24.5764, lng: 73.6835, rating: 4.8, editorialPriority: 5, category: 'palace' }),
      place('jagdish', 'Jagdish Temple', { lat: 24.5795, lng: 73.6839, rating: 4.6, editorialPriority: 5, category: 'temple' }),
      place('gangaur', 'Gangaur Ghat', { lat: 24.5780, lng: 73.6805, rating: 4.2, category: 'ghat' }),
      place('saheliyon', 'Saheliyon ki Bari', { lat: 24.5995, lng: 73.6850, rating: 4.3, category: 'garden' }),
      place('monsoon', 'Monsoon Palace', { lat: 24.5620, lng: 73.6450, rating: 4.5, editorialPriority: 5, category: 'palace' }),
      place('sajjangarh', 'Sajjangarh viewpoint', { lat: 24.5600, lng: 73.6420, rating: 4.0, category: 'viewpoint' }),
      place('fatehsagar', 'Fateh Sagar Lake', { lat: 24.6010, lng: 73.6780, rating: 4.4, category: 'lake' }),
    ];
    const result = assignDaysByClusterValue(pool, {
      days: 2, maxStopsPerDay: 5, maxMinutesPerDay: 420, origin, speedKmh: 28, debug: true,
    });
    printTrace('Udaipur 2 days', result);
    expect(result.plannedDays.length).toBe(2);
    expect(result.plannedDays[1].dayStart.label).toBe(result.plannedDays[0].dayEnd.label);
    // Day 1 should be lake-palace core; Day 2 remaining region
    expect(result.days[0].length).toBeGreaterThanOrEqual(2);
    expect(result.days[1].length).toBeGreaterThanOrEqual(1);
  });

  it('5. Manali — 3 days', () => {
    const origin = { lat: 32.2432, lng: 77.1892 };
    const pool = [
      place('hadimba', 'Hadimba Temple', { lat: 32.2440, lng: 77.1870, rating: 4.6, editorialPriority: 5, category: 'temple' }),
      place('mall', 'Mall Road', { lat: 32.2420, lng: 77.1895, rating: 4.2, category: 'market' }),
      place('manu', 'Manu Temple', { lat: 32.2500, lng: 77.1850, rating: 4.0, category: 'temple' }),
      place('solang', 'Solang Valley', { lat: 32.3160, lng: 77.1570, rating: 4.7, editorialPriority: 5, category: 'adventure' }),
      place('anjan', 'Anjani Mahadev', { lat: 32.3100, lng: 77.1500, rating: 4.1, category: 'temple' }),
      place('rohtang', 'Rohtang Pass viewpoint', { lat: 32.3720, lng: 77.2480, rating: 4.8, editorialPriority: 5, category: 'viewpoint' }),
      place('gulaba', 'Gulaba', { lat: 32.3500, lng: 77.2200, rating: 4.0, category: 'viewpoint' }),
      place('vashisht', 'Vashisht Hot Springs', { lat: 32.2650, lng: 77.1880, rating: 4.3, category: 'hotspring' }),
      place('jogini', 'Jogini Falls', { lat: 32.2700, lng: 77.1950, rating: 4.2, category: 'waterfall' }),
    ];
    const result = assignDaysByClusterValue(pool, {
      days: 3, maxStopsPerDay: 4, maxMinutesPerDay: 420, origin, speedKmh: 25, debug: true,
    });
    printTrace('Manali 3 days', result);
    expect(result.plannedDays.length).toBe(3);
    // Day starts propagate
    expect(result.plannedDays[1].dayStart.label).toBe(result.plannedDays[0].dayEnd.label);
    expect(result.plannedDays[2].dayStart.label).toBe(result.plannedDays[1].dayEnd.label);
    // Regional progression: town → Solang → Rohtang (or similar), not random remix
    const dayAnchors = result.plannedDays.map((d) => d.regionAnchorId);
    expect(new Set(dayAnchors).size).toBeGreaterThanOrEqual(2);
  });
});

describe('1-DAY COMPLETE EXCURSION SELECTION', () => {
  const cityOrigin = { lat: 23.1815, lng: 79.9864 };

  const bhedaghat = place('bhedaghat', 'Bhedaghat', {
    lat: 23.1254, lng: 79.8012, rating: 4.8, editorialPriority: 5, category: 'viewpoint',
  });
  const dhuandhar = place('dhuandhar', 'Dhuandhar Falls', {
    lat: 23.1250, lng: 79.8134, rating: 4.7, editorialPriority: 5, category: 'waterfall',
  });
  const marble = place('marble', 'Marble Rocks', {
    lat: 23.1320, lng: 79.8000, rating: 4.6, editorialPriority: 5, category: 'nature',
  });
  const chausath = place('chausath', 'Chausath Yogini', {
    lat: 23.1298, lng: 79.7955, rating: 4.7, editorialPriority: 5, category: 'temple',
  });
  const madan = place('madan', 'Madan Mahal', {
    lat: 23.1780, lng: 79.9450, rating: 4.9, editorialPriority: 5, category: 'fort',
  });
  const madan4 = place('rani', 'Rani Durgavati Museum', {
    lat: 23.1850, lng: 79.9550, rating: 4.1, category: 'museum',
  });

  it('Jabalpur 1-day: Bhedaghat excursion beats nearer Madan; Madan not included', () => {
    const pool = [bhedaghat, dhuandhar, marble, chausath, madan, madan4];
    const debugLog: string[] = [];
    const bhedScore = scoreDayExcursion(bhedaghat, pool, new Set(), {
      maxStops: 6, maxMinutes: 480, origin: cityOrigin, speedKmh: 30,
    });
    const madanScore = scoreDayExcursion(madan, pool, new Set(), {
      maxStops: 6, maxMinutes: 480, origin: cityOrigin, speedKmh: 30,
    });

     
    console.log('[1-day excursion scores]', {
      bhedaghat: bhedScore.reason,
      madan: madanScore.reason,
    });

    expect(bhedScore.fiveStarCount).toBeGreaterThanOrEqual(3);
    expect(madanScore.fiveStarCount).toBeLessThanOrEqual(2);
    expect(bhedScore.score).toBeGreaterThan(madanScore.score);

    const winner = selectBestDayExcursion(
      [bhedaghat, dhuandhar, marble, chausath, madan],
      pool,
      new Set(),
      { maxStops: 6, maxMinutes: 480, origin: cityOrigin, speedKmh: 30, debug: true },
      debugLog,
    );
    expect(winner).toBeTruthy();
    expect(['bhedaghat', 'dhuandhar', 'marble', 'chausath']).toContain(winner!.anchor.id);
    expect(debugLog.some((l) => l.startsWith('EXCURSION:'))).toBe(true);
    expect(debugLog.some((l) => l.startsWith('SELECTED EXCURSION:'))).toBe(true);

    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 480,
      origin: cityOrigin,
      speedKmh: 30,
      debug: true,
    });
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids).toEqual(expect.arrayContaining(['bhedaghat', 'dhuandhar', 'marble', 'chausath']));
    expect(ids).not.toContain('madan');
    expect(plannedDays[0]?.dayStart.label).toBe('trip-origin');
    expect(['bhedaghat', 'dhuandhar', 'marble', 'chausath']).toContain(plannedDays[0]?.regionAnchorId);
  });

  it('pinned Madan overrides automatic Bhedaghat excursion', () => {
    const pinned = { ...madan, isPinned: true };
    const pool = [bhedaghat, dhuandhar, marble, chausath, pinned, madan4];
    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 1,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 480,
      origin: cityOrigin,
      speedKmh: 30,
    });
    expect(plannedDays[0]?.regionAnchorId).toBe('madan');
    expect(days[0]?.[0]?.id).toBe('madan');
  });

  it('far rich Cluster A (25km, 4×5★) beats near thin Cluster B (5km, 1×5★)', () => {
    const origin = { lat: 0, lng: 0 };
    const a1 = place('a1', 'A1 5★', { lat: 0.225, lng: 0, rating: 4.8, editorialPriority: 5, category: 'fort' });
    const a2 = place('a2', 'A2 5★', { lat: 0.230, lng: 0, rating: 4.7, editorialPriority: 5, category: 'temple' });
    const a3 = place('a3', 'A3 5★', { lat: 0.235, lng: 0, rating: 4.6, editorialPriority: 5, category: 'waterfall' });
    const a4 = place('a4', 'A4 5★', { lat: 0.240, lng: 0, rating: 4.6, editorialPriority: 5, category: 'palace' });
    const a5 = place('a5', 'A5 4★', { lat: 0.242, lng: 0, rating: 4.1, category: 'museum' });
    const a6 = place('a6', 'A6 4★', { lat: 0.245, lng: 0, rating: 4.0, category: 'garden' });
    const b1 = place('b1', 'B1 5★', { lat: 0.045, lng: 0, rating: 4.9, editorialPriority: 5, category: 'fort' });
    const b2 = place('b2', 'B2 4★', { lat: 0.050, lng: 0, rating: 4.1, category: 'temple' });

    const pool = [a1, a2, a3, a4, a5, a6, b1, b2];
    const scoreA = scoreDayExcursion(a1, pool, new Set(), {
      maxStops: 6, maxMinutes: 540, origin, speedKmh: 35,
    });
    const scoreB = scoreDayExcursion(b1, pool, new Set(), {
      maxStops: 6, maxMinutes: 540, origin, speedKmh: 35,
    });
    expect(scoreA.score).toBeGreaterThan(scoreB.score);

    const { days } = assignDaysByClusterValue(pool, {
      days: 1, maxStopsPerDay: 6, maxMinutesPerDay: 540, origin, speedKmh: 35,
    });
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids.some((id) => id.startsWith('a'))).toBe(true);
    expect(ids).not.toContain('b1');
  });

  it('close thin Cluster A loses to feasible rich Cluster B at 20km', () => {
    const origin = { lat: 0, lng: 0 };
    const a1 = place('a1', 'Thin 5★', { lat: 0.045, lng: 0, rating: 4.8, editorialPriority: 5, category: 'fort' });
    const a2 = place('a2', 'Thin 3★', { lat: 0.048, lng: 0, rating: 3.2, category: 'garden' });
    const b1 = place('b1', 'Rich 5★a', { lat: 0.180, lng: 0, rating: 4.8, editorialPriority: 5, category: 'fort' });
    const b2 = place('b2', 'Rich 5★b', { lat: 0.185, lng: 0, rating: 4.7, editorialPriority: 5, category: 'temple' });
    const b3 = place('b3', 'Rich 5★c', { lat: 0.190, lng: 0, rating: 4.6, editorialPriority: 5, category: 'waterfall' });
    const b4 = place('b4', 'Rich 5★d', { lat: 0.192, lng: 0, rating: 4.6, editorialPriority: 5, category: 'palace' });
    const b5 = place('b5', 'Rich 4★a', { lat: 0.195, lng: 0, rating: 4.1, category: 'museum' });
    const b6 = place('b6', 'Rich 4★b', { lat: 0.198, lng: 0, rating: 4.0, category: 'lake' });

    const pool = [a1, a2, b1, b2, b3, b4, b5, b6];
    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 1, maxStopsPerDay: 6, maxMinutesPerDay: 540, origin, speedKmh: 35, debug: true,
    });
    expect(plannedDays[0]?.regionAnchorId.startsWith('b')).toBe(true);
    expect(days[0]?.map((p) => p.id)).not.toContain('a1');
  });
});

describe('1-DAY HARD EXCURSION LOCK', () => {
  const cityOrigin = { lat: 23.1815, lng: 79.9864 };
  const bhedaghat = place('bhedaghat', 'Bhedaghat', {
    lat: 23.1254, lng: 79.8012, rating: 4.8, editorialPriority: 5, category: 'viewpoint',
  });
  const dhuandhar = place('dhuandhar', 'Dhuandhar Falls', {
    lat: 23.1250, lng: 79.8134, rating: 4.7, editorialPriority: 5, category: 'waterfall',
  });
  const marble = place('marble', 'Marble Rocks', {
    lat: 23.1320, lng: 79.8000, rating: 4.6, editorialPriority: 5, category: 'nature',
  });
  const chausath = place('chausath', 'Chausath Yogini', {
    lat: 23.1298, lng: 79.7955, rating: 4.7, editorialPriority: 5, category: 'temple',
  });
  const madan = place('madan', 'Madan Mahal', {
    lat: 23.1780, lng: 79.9450, rating: 4.9, editorialPriority: 5, category: 'fort',
  });
  const rani = place('rani', 'Rani Durgavati Museum', {
    lat: 23.1850, lng: 79.9550, rating: 4.1, category: 'museum',
  });
  const payli = place('payli', 'Payli Island', {
    lat: 22.9800, lng: 79.8800, rating: 4.6, editorialPriority: 5, category: 'island',
  });
  const bargi = place('bargi', 'Bargi Dam', {
    lat: 22.9400, lng: 79.9000, rating: 4.5, editorialPriority: 5, category: 'dam',
  });

  it('TEST 1: after Bhedaghat wins, Madan never enters even with remaining ≥180m', () => {
    const pool = [bhedaghat, dhuandhar, marble, chausath, madan, rani];
    // Plenty of day budget so secondary escape would have been possible without the lock
    const { days, debugLog } = assignDaysByClusterValue(pool, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 720,
      origin: cityOrigin,
      speedKmh: 30,
      debug: true,
    });
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids).toEqual(expect.arrayContaining(['bhedaghat', 'dhuandhar', 'marble', 'chausath']));
    expect(ids).not.toContain('madan');
    expect(ids).not.toContain('rani');
    expect(debugLog.some((l) => /OUTSIDE_SELECTED_EXCURSION/.test(l) && /Madan/.test(l))).toBe(true);
  });

  it('TEST 2: when Bhedaghat excursion exhausts early, day ends — no Madan second region', () => {
    // Only anchor in the winning region; Madan still in global pool
    const thinBhed = place('bhedaghat', 'Bhedaghat', {
      lat: 23.1254, lng: 79.8012, rating: 4.8, editorialPriority: 5, category: 'viewpoint',
    });
    const pool = [thinBhed, madan, rani, payli];
    const used = new Set<string>();
    const debugLog: string[] = [];
    const allowed = new Set(['bhedaghat']);
    const day = buildDayCluster(thinBhed, pool, used, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 720, // lots of remaining time
      speedKmh: 30,
      debug: true,
      allowedPlaceIds: allowed,
      lockToAllowedSet: true,
    }, debugLog);
    expect(day.map((p) => p.id)).toEqual(['bhedaghat']);
    expect(day.map((p) => p.id)).not.toContain('madan');
    expect(debugLog.some((l) => /OUTSIDE_SELECTED_EXCURSION/.test(l))).toBe(true);
    expect(debugLog.some((l) =>
      /1-day lock/.test(l)
      || /no secondary region on 1-day lock/.test(l)
      || /next region deferred to next day/.test(l)
      || /day ends/.test(l),
    )).toBe(true);
  });

  it('TEST 3: pinned Madan is allowed into locked Bhedaghat excursion allow-list', () => {
    const pinnedMadan = { ...madan, isPinned: true };
    const members = [bhedaghat, dhuandhar, marble, chausath];
    const allowed = new Set([...members.map((m) => m.id), pinnedMadan.id]);
    const pool = [...members, pinnedMadan, rani];
    const used = new Set<string>();
    const debugLog: string[] = [];
    // Pass FULL pool — allow-list must gate before scoring (not rely on pre-filter alone)
    const day = buildDayCluster(bhedaghat, pool, used, {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 720,
      speedKmh: 30,
      debug: true,
      allowedPlaceIds: allowed,
      lockToAllowedSet: true,
    }, debugLog);
    const ids = day.map((p) => p.id);
    expect(ids).toContain('madan');
    expect(ids).not.toContain('rani');
    expect(debugLog.some((l) => /Rani/.test(l) && /OUTSIDE_SELECTED_EXCURSION/.test(l))).toBe(true);
  });

  it('TEST 4: 2-day regional progression still works from previous dayEnd', () => {
    const pool = [bhedaghat, dhuandhar, marble, chausath, payli, bargi, madan];
    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 420,
      origin: cityOrigin,
      speedKmh: 30,
    });
    expect(days.length).toBe(2);
    const day1 = new Set(days[0].map((p) => p.id));
    expect(day1.has('bhedaghat') || day1.has('dhuandhar') || day1.has('chausath')).toBe(true);
    expect(day1.has('madan')).toBe(false);
    expect(plannedDays[1].dayStart.label).toBe(plannedDays[0].dayEnd.label);
    const day2 = days[1].map((p) => p.id);
    expect(day2).toEqual(expect.arrayContaining(['payli', 'bargi']));
  });

  it('TEST 5: generalized Region A lock excludes Region B with remaining time', () => {
    const origin = { lat: 0, lng: 0 };
    const a1 = place('a1', 'A1 5★', { lat: 0.02, lng: 0, rating: 4.8, editorialPriority: 5, category: 'fort' });
    const a2 = place('a2', 'A2 5★', { lat: 0.025, lng: 0, rating: 4.7, editorialPriority: 5, category: 'temple' });
    const a3 = place('a3', 'A3 4★', { lat: 0.03, lng: 0, rating: 4.1, category: 'waterfall' });
    const b1 = place('b1', 'B1 5★', { lat: 0.20, lng: 0, rating: 4.9, editorialPriority: 5, category: 'palace' });
    const b2 = place('b2', 'B2 4★', { lat: 0.21, lng: 0, rating: 4.2, category: 'museum' });

    const { days, debugLog } = assignDaysByClusterValue([a1, a2, a3, b1, b2], {
      days: 1,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 720,
      origin,
      speedKmh: 35,
      debug: true,
    });
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids).toEqual(expect.arrayContaining(['a1', 'a2', 'a3']));
    expect(ids).not.toContain('b1');
    expect(ids).not.toContain('b2');
    expect(debugLog.some((l) => /OUTSIDE_SELECTED_EXCURSION/.test(l))).toBe(true);
  });
});

describe('exact trip-day selection contract (mobile DAY_OPTIONS)', () => {
  // Mirrors src/features/aiTripPlanner/constants.ts — keep in sync.
  const DAY_OPTIONS = [
    { label: '1 Day', val: 1 },
    { label: '2 Days', val: 2 },
    { label: '3 Days', val: 3 },
    { label: '4 Days', val: 4 },
    { label: '5 Days', val: 5 },
    { label: '6 Days', val: 6 },
    { label: '7 Days', val: 7 },
  ] as const;

  function selectExactTripDays(optionVal: number): number {
    const match = DAY_OPTIONS.find((o) => o.val === optionVal);
    if (!match) throw new Error(`Invalid trip duration option: ${optionVal}`);
    return match.val;
  }

  it('3/4/5/6/7-day chips map to exact input.days', () => {
    expect(selectExactTripDays(3)).toBe(3);
    expect(selectExactTripDays(4)).toBe(4);
    expect(selectExactTripDays(5)).toBe(5);
    expect(selectExactTripDays(6)).toBe(6);
    expect(selectExactTripDays(7)).toBe(7);
  });

  it('rejects legacy silent range midpoints as option values outside 1–7', () => {
    expect(() => selectExactTripDays(9)).toThrow(/Invalid/);
    expect(() => selectExactTripDays(12)).toThrow(/Invalid/);
  });
});

describe('duration-aware tier fallback (no empty days when places remain)', () => {
  const city = { lat: 23.18, lng: 79.98 };

  function jabalpurLikePool(): ClusterPlace[] {
    // 5 high-tier (ep≥5) near Madan / Bhedaghat-ish split + many tier-1 tourist spots in nearby regions
    const high: ClusterPlace[] = [
      place('madan', 'Madan Mahal', { lat: 23.1485, lng: 79.9017, editorialPriority: 5, category: 'fort' }),
      place('boat', 'Bhedaghat Boating', { lat: 23.132, lng: 79.801, editorialPriority: 5, category: 'adventure' }),
      place('marble', 'Marble Rocks', { lat: 23.135, lng: 79.798, editorialPriority: 5, category: 'nature' }),
      place('falls', 'Dhuandhar', { lat: 23.1254, lng: 79.8134, editorialPriority: 5, category: 'waterfall' }),
      place('yogini', 'Chausath Yogini', { lat: 23.13139, lng: 79.79778, editorialPriority: 5, category: 'temple' }),
    ];
    const low: ClusterPlace[] = [];
    // Region near Bhedaghat leftovers / ghat belt (~5–12 km from Bhedaghat)
    for (let i = 0; i < 12; i++) {
      low.push(place(`ghat${i}`, `Ghat ${i}`, {
        lat: 23.14 + i * 0.008,
        lng: 79.86 + i * 0.004,
        editorialPriority: 3,
        rating: 2.0,
        category: i % 2 === 0 ? 'temple' : 'ghat',
      }));
    }
    // Region east (~25–40 km) — should not jump in while nearby remain
    for (let i = 0; i < 8; i++) {
      low.push(place(`east${i}`, `East spot ${i}`, {
        lat: 23.18,
        lng: 80.25 + i * 0.01,
        editorialPriority: 3,
        rating: 2.0,
        category: 'park',
      }));
    }
    // City lakes (~city center)
    for (let i = 0; i < 8; i++) {
      low.push(place(`lake${i}`, `Lake ${i}`, {
        lat: 23.17 + i * 0.005,
        lng: 79.93 + i * 0.005,
        editorialPriority: 3,
        rating: 2.0,
        category: 'lake',
      }));
    }
    return [...high, ...low];
  }

  it('absoluteMinTier: 1-day stays strict; multi-day opens ★ as last resort', () => {
    expect(absoluteMinTier(1)).toBe(3);
    expect(absoluteMinTier(2)).toBe(1);
    expect(absoluteMinTier(3)).toBe(1);
    expect(absoluteMinTier(4)).toBe(1);
    expect(absoluteMinTier(5)).toBe(1);
    expect(minAllowedTier(3)).toBe(3);
    expect(minAllowedTier(4)).toBe(2);
    expect(minAllowedTier(5)).toBe(1);
  });

  it('TEST 1 — Jabalpur-like pool days=4 populates 4 days when lower-tier places remain', () => {
    const pool = jabalpurLikePool();
    const { days } = assignDaysByClusterValue(pool, {
      days: 4,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin: city,
      speedKmh: 30,
    });
    expect(days.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(days[i].length, `day ${i + 1} empty`).toBeGreaterThan(0);
    }
    const used = new Set(days.flat().map((p) => p.id));
    expect(used.size).toBe(days.flat().length);
  });

  it('TEST 2 — same pool days=5 populates 5 days', () => {
    const pool = jabalpurLikePool();
    const { days } = assignDaysByClusterValue(pool, {
      days: 5,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin: city,
      speedKmh: 30,
    });
    expect(days.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(days[i].length, `day ${i + 1} empty`).toBeGreaterThan(0);
    }
  });

  it('TEST 3 — only 5 legitimate places and days=5 → rest days, no invented stops', () => {
    const onlyFive = [
      place('a', 'A', { lat: 23.13, lng: 79.80, editorialPriority: 5, category: 'fort' }),
      place('b', 'B', { lat: 23.132, lng: 79.801, editorialPriority: 5, category: 'nature' }),
      place('c', 'C', { lat: 23.135, lng: 79.798, editorialPriority: 5, category: 'temple' }),
      place('d', 'D', { lat: 23.125, lng: 79.813, editorialPriority: 5, category: 'waterfall' }),
      place('e', 'E', { lat: 23.131, lng: 79.797, editorialPriority: 5, category: 'adventure' }),
    ];
    const { days, plannedDays } = assignDaysByClusterValue(onlyFive, {
      days: 5,
      maxStopsPerDay: 6,
      maxMinutesPerDay: 480,
      origin: city,
      speedKmh: 30,
    });
    expect(days.length).toBeGreaterThanOrEqual(1);
    expect(days.length).toBeLessThanOrEqual(5);
    expect(days.flat().length).toBeLessThanOrEqual(5);
    expect(days.flat().every((p) => onlyFive.some((x) => x.id === p.id))).toBe(true);
    // Remaining requested days are not fabricated with phantom stops
    expect(plannedDays.length).toBe(days.length);
  });

  it('TEST 4 — after high-tier exhaustion, nearby lower-tier beats distant high-tier', () => {
    const nearLow = place('near-low', 'Nearby low temple', {
      lat: 23.14, lng: 79.85, editorialPriority: 3, rating: 2.0, category: 'temple',
    });
    const farHigh = place('far-high', 'Far 5★ fort', {
      lat: 23.18, lng: 80.35, editorialPriority: 5, category: 'fort',
    });
    const day1Anchor = place('a1', 'Day1 Anchor 5★', {
      lat: 23.13, lng: 79.80, editorialPriority: 5, category: 'waterfall',
    });
    const day1Mate = place('a2', 'Day1 Mate 5★', {
      lat: 23.132, lng: 79.802, editorialPriority: 5, category: 'nature',
    });
    const unusedAfter = [nearLow, farHigh];
    // days=4 absolute floor is ★; preferred floor exhausted → activeFloor drops
    expect(resolveActiveTierFloor(unusedAfter, 4)).toBeLessThanOrEqual(2);
    // Cap Day 1 at 2 stops so near-low remains unused (it is ~5km — in-cluster support
    // geographically, but the continuity rule must still prefer it over a 50km 5★ jump).
    const { days } = assignDaysByClusterValue([day1Anchor, day1Mate, nearLow, farHigh], {
      days: 4,
      maxStopsPerDay: 2,
      maxMinutesPerDay: 360,
      origin: { lat: 23.13, lng: 79.80 },
      speedKmh: 30,
    });
    expect(days.length).toBeGreaterThanOrEqual(2);
    const day1Ids = days[0].map((p) => p.id);
    expect(day1Ids).not.toContain('far-high');
    const day2Ids = days[1].map((p) => p.id);
    expect(day2Ids).toContain('near-low');
    expect(day2Ids).not.toContain('far-high');
  });

  it('TEST 5 — 1-day Bhedaghat excursion still rejects Madan and Payali', () => {
    const bhed = place('bhed', 'Bhedaghat', { lat: 23.132, lng: 79.801, editorialPriority: 5, category: 'nature' });
    const marble = place('marble', 'Marble', { lat: 23.135, lng: 79.798, editorialPriority: 5, category: 'nature' });
    const falls = place('falls', 'Dhuandhar', { lat: 23.125, lng: 79.813, editorialPriority: 5, category: 'waterfall' });
    const yogini = place('yogini', 'Chausath', { lat: 23.131, lng: 79.798, editorialPriority: 5, category: 'temple' });
    const madan = place('madan', 'Madan Mahal', { lat: 23.178, lng: 79.945, editorialPriority: 5, category: 'fort' });
    const payali = place('payali', 'Payali', { lat: 23.186, lng: 79.974, editorialPriority: 4, category: 'island' });
    const { days, debugLog } = assignDaysByClusterValue(
      [bhed, marble, falls, yogini, madan, payali],
      {
        days: 1,
        maxStopsPerDay: 6,
        maxMinutesPerDay: 480,
        origin: city,
        speedKmh: 30,
        debug: true,
      },
    );
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids).not.toContain('madan');
    expect(ids).not.toContain('payali');
    expect(ids.some((id) => ['bhed', 'marble', 'falls', 'yogini'].includes(id))).toBe(true);
    expect(debugLog.some((l) => /OUTSIDE_SELECTED_EXCURSION/.test(l) && /Madan|Payali/i.test(l))).toBe(true);
  });

  it('TEST 6 — 2-day: dayStart propagates from day1 end', () => {
    const pool = jabalpurLikePool();
    const { plannedDays } = assignDaysByClusterValue(pool, {
      days: 2,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin: city,
      speedKmh: 30,
    });
    expect(plannedDays.length).toBe(2);
    expect(plannedDays[0].dayStart.label).toBe('trip-origin');
    expect(plannedDays[1].dayStart.label).toBe(plannedDays[0].dayEnd.label);
    expect(plannedDays[1].dayStart.label).not.toBe('trip-origin');
  });

  it('TEST 7 — synthetic 3 regions → A then B then C', () => {
    const origin = { lat: 23.18, lng: 79.98 };
    const pool = [
      place('A1', 'A1 5★', { lat: 23.18, lng: 79.98, rating: 4.9, editorialPriority: 5, category: 'fort' }),
      place('A2', 'A2 4★', { lat: 23.185, lng: 79.985, rating: 4.2, editorialPriority: 4, category: 'temple' }),
      place('A3', 'A3 3★', { lat: 23.175, lng: 79.975, rating: 3.5, editorialPriority: 3, category: 'park' }),
      place('B1', 'B1 5★', { lat: 23.18, lng: 80.28, rating: 4.8, editorialPriority: 5, category: 'waterfall' }),
      place('B2', 'B2 4★', { lat: 23.185, lng: 80.285, rating: 4.1, editorialPriority: 4, category: 'nature' }),
      place('B3', 'B3 3★', { lat: 23.175, lng: 80.275, rating: 3.4, editorialPriority: 3, category: 'viewpoint' }),
      place('C1', 'C1 5★', { lat: 23.18, lng: 80.58, rating: 4.7, editorialPriority: 5, category: 'palace' }),
      place('C2', 'C2 4★', { lat: 23.185, lng: 80.585, rating: 4.0, editorialPriority: 4, category: 'museum' }),
      place('C3', 'C3 3★', { lat: 23.175, lng: 80.575, rating: 3.3, editorialPriority: 3, category: 'market' }),
    ];
    const { days } = assignDaysByClusterValue(pool, {
      days: 3,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin,
      speedKmh: 30,
    });
    expect(days.length).toBe(3);
    expect(days[0].every((p) => p.id.startsWith('A'))).toBe(true);
    expect(days[1].every((p) => p.id.startsWith('B'))).toBe(true);
    expect(days[2].every((p) => p.id.startsWith('C'))).toBe(true);
  });

  it('TEST 8 — no valid candidates remain → rest days, not fake stops', () => {
    const onlyOne = [
      place('solo', 'Only place', { lat: 23.18, lng: 79.98, editorialPriority: 5, category: 'fort' }),
    ];
    const { days, plannedDays } = assignDaysByClusterValue(onlyOne, {
      days: 3,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin: city,
      speedKmh: 30,
    });
    expect(days.length).toBe(1);
    expect(days[0].map((p) => p.id)).toEqual(['solo']);
    expect(plannedDays.length).toBe(1);
  });
});

describe('primary cluster compactness (no mega-cluster / chain merge)', () => {
  /** ~1° lat ≈ 111 km; ~1° lng at lat 23 ≈ 102 km */
  const degLat = (km: number) => km / 111;
  const degLng = (km: number) => km / 102;

  it('exports compactness constants distinct from ANCHOR_SEPARATION', () => {
    expect(MAX_PRIMARY_CLUSTER_DIAMETER_KM).toBeGreaterThan(ANCHOR_SEPARATION_KM);
    expect(CO_FIVE_STAR_JOIN_KM).toBeLessThan(ANCHOR_SEPARATION_KM);
    expect(CO_FIVE_STAR_JOIN_KM).toBeLessThanOrEqual(10);
  });

  it('TEST 1 — false mega-cluster: two ~11 km 5★ regions stay separate', () => {
    const origin = { lat: 23.18, lng: 79.98 };
    const A1 = place('A1', 'A1 5★', {
      lat: origin.lat, lng: origin.lng, editorialPriority: 5, category: 'fort',
    });
    const A2 = place('A2', 'A2 5★', {
      lat: origin.lat + degLat(1.5), lng: origin.lng, editorialPriority: 5, category: 'temple',
    });
    const A3 = place('A3', 'A3 4★', {
      lat: origin.lat + degLat(2), lng: origin.lng + degLng(0.5), rating: 4.1, category: 'museum',
    });
    const A4 = place('A4', 'A4 3★', {
      lat: origin.lat + degLat(1), lng: origin.lng + degLng(1), rating: 3.4, category: 'park',
    });
    // Region B ~11 km east — within old ANCHOR_SEPARATION but outside CO_FIVE join
    const B1 = place('B1', 'B1 5★', {
      lat: origin.lat, lng: origin.lng + degLng(11), editorialPriority: 5, category: 'waterfall',
    });
    const B2 = place('B2', 'B2 5★', {
      lat: origin.lat + degLat(1), lng: origin.lng + degLng(11.2), editorialPriority: 5, category: 'nature',
    });
    const B3 = place('B3', 'B3 4★', {
      lat: origin.lat + degLat(0.5), lng: origin.lng + degLng(11.5), rating: 4.0, category: 'viewpoint',
    });
    const B4 = place('B4', 'B4 3★', {
      lat: origin.lat - degLat(0.5), lng: origin.lng + degLng(10.8), rating: 3.3, category: 'ghat',
    });

    expect(isPrimaryClusterMember(B1, A1, [A1])).toBe(false);
    expect(isPrimaryClusterMember(A1, B1, [B1])).toBe(false);

    const membersA = buildCandidateClusterMembers(A1, [A1, A2, A3, A4, B1, B2, B3, B4], new Set(), 2, 6);
    const membersB = buildCandidateClusterMembers(B1, [A1, A2, A3, A4, B1, B2, B3, B4], new Set(), 2, 6);
    const idsA = new Set(membersA.map((p) => p.id));
    const idsB = new Set(membersB.map((p) => p.id));
    expect(idsA.has('B1')).toBe(false);
    expect(idsA.has('B2')).toBe(false);
    expect(idsB.has('A1')).toBe(false);
    expect(idsB.has('A2')).toBe(false);
    expect(idsA.has('A2') || idsA.has('A3')).toBe(true);
    expect(idsB.has('B2') || idsB.has('B3')).toBe(true);
  });

  it('TEST 2 — chain merging A→B→C does not form one primary cluster', () => {
    const A = place('A', 'A 5★', { lat: 23.18, lng: 79.90, editorialPriority: 5, category: 'fort' });
    const B = place('B', 'B 5★', {
      lat: 23.18, lng: 79.90 + degLng(9), editorialPriority: 5, category: 'temple',
    });
    const C = place('C', 'C 5★', {
      lat: 23.18, lng: 79.90 + degLng(18), editorialPriority: 5, category: 'palace',
    });
    // A↔B ≈ 9 km OK; after A+B, C would push diameter ≈ 18 > MAX
    expect(isPrimaryClusterMember(B, A, [A])).toBe(true);
    expect(isPrimaryClusterMember(C, A, [A, B])).toBe(false);
    expect(clusterDiameterKm([A, B, C])).toBeGreaterThan(MAX_PRIMARY_CLUSTER_DIAMETER_KM);

    const members = buildCandidateClusterMembers(A, [A, B, C], new Set(), 2, 6);
    expect(members.map((p) => p.id).sort()).toEqual(['A', 'B']);
  });

  it('TEST 3 — true compact region A+B+C stays one cluster', () => {
    const A = place('A', 'A 5★', { lat: 23.13, lng: 79.80, editorialPriority: 5, category: 'nature' });
    const B = place('B', 'B 5★', {
      lat: 23.13 + degLat(1.2), lng: 79.80 + degLng(0.8), editorialPriority: 5, category: 'waterfall',
    });
    const C = place('C', 'C 5★', {
      lat: 23.13 + degLat(0.6), lng: 79.80 - degLng(0.5), editorialPriority: 5, category: 'temple',
    });
    expect(clusterDiameterKm([A, B, C])).toBeLessThan(MAX_PRIMARY_CLUSTER_DIAMETER_KM);
    expect(isPrimaryClusterMember(B, A, [A])).toBe(true);
    expect(isPrimaryClusterMember(C, A, [A, B])).toBe(true);
    const members = buildCandidateClusterMembers(A, [A, B, C], new Set(), 2, 6);
    expect(members.map((p) => p.id).sort()).toEqual(['A', 'B', 'C']);
  });

  it('TEST 4 — rich farther region beats thin near-origin landmark', () => {
    const city = { lat: 26.91, lng: 75.79 };
    const thin = place('thin', 'Thin near 5★', {
      lat: city.lat + degLat(2), lng: city.lng, editorialPriority: 5, category: 'fort',
    });
    const rich1 = place('r1', 'Rich 5★ a', {
      lat: city.lat + degLat(18), lng: city.lng + degLng(2), editorialPriority: 5, category: 'palace',
    });
    const rich2 = place('r2', 'Rich 5★ b', {
      lat: city.lat + degLat(18.5), lng: city.lng + degLng(2.5), editorialPriority: 5, category: 'fort',
    });
    const rich3 = place('r3', 'Rich 4★', {
      lat: city.lat + degLat(19), lng: city.lng + degLng(1.8), rating: 4.2, category: 'museum',
    });
    const rich4 = place('r4', 'Rich 3★', {
      lat: city.lat + degLat(18.2), lng: city.lng + degLng(1.5), rating: 3.5, category: 'garden',
    });
    const pool = [thin, rich1, rich2, rich3, rich4];
    const thinScore = scoreCandidateCluster(thin, pool, new Set(), 2, 5, city, 30, false);
    const richScore = scoreCandidateCluster(rich1, pool, new Set(), 2, 5, city, 30, false);
    expect(richScore.members.length).toBeGreaterThan(thinScore.members.length);
    expect(richScore.score).toBeGreaterThan(thinScore.score);

    const winner = selectBestCandidateCluster(
      [thin, rich1, rich2], pool, new Set(), 2, 5, city, 30, false,
    );
    expect(winner?.anchor.id).not.toBe('thin');
    expect(['r1', 'r2']).toContain(winner?.anchor.id);
  });

  it('TEST 5 — Jabalpur regression coords: Day1 Bhedaghat region, not Madan mega-cluster', () => {
    // Production-like WGS84 coordinates (test fixtures only — no city hardcoding in planner).
    const city = { lat: 23.1815, lng: 79.9864 };
    const marble = place('marble', 'Bhedaghat Marble Rocks', {
      lat: 23.1295, lng: 79.8012, editorialPriority: 5, category: 'nature',
    });
    const boat = place('boat', 'Bhedaghat Boating', {
      lat: 23.1305, lng: 79.8005, editorialPriority: 5, category: 'adventure',
    });
    const falls = place('falls', 'Dhuandhar Falls', {
      lat: 23.1254, lng: 79.8134, editorialPriority: 5, category: 'waterfall',
    });
    const yogini = place('yogini', 'Chausath Yogini', {
      lat: 23.13139, lng: 79.79778, editorialPriority: 5, category: 'temple',
    });
    const cable = place('cable', 'Dhuandhar Ropeway', {
      lat: 23.1298, lng: 79.8010, editorialPriority: 3, rating: 2.0, category: 'adventure',
    });
    // ~10.9 km from Marble — previously merged via ANCHOR_SEPARATION=12 alone
    const madan = place('madan', 'Madan Mahal Fort', {
      lat: 23.1667, lng: 79.9067, editorialPriority: 5, category: 'fort',
    });
    const pool = [marble, boat, falls, yogini, cable, madan];

    expect(isPrimaryClusterMember(madan, marble, [marble])).toBe(false);
    expect(isPrimaryClusterMember(marble, madan, [madan])).toBe(false);

    const bhedMembers = buildCandidateClusterMembers(marble, pool, new Set(), 2, 6);
    expect(bhedMembers.map((p) => p.id)).not.toContain('madan');
    expect(bhedMembers.some((p) => ['boat', 'falls', 'yogini'].includes(p.id))).toBe(true);

    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 2,
      maxStopsPerDay: 5,
      maxMinutesPerDay: 420,
      origin: city,
      speedKmh: 30,
    });
    expect(days.length).toBe(2);
    const day1 = days[0].map((p) => p.id);
    const day2 = days[1].map((p) => p.id);
    // Day 1 must not be a Madan+Bhedaghat mega-cluster
    expect(day1).not.toContain('madan');
    expect(day1.some((id) => ['marble', 'boat', 'falls', 'yogini'].includes(id))).toBe(true);
    // Day 2 should pick the remaining valuable region (Madan)
    expect(day2).toContain('madan');
    expect(plannedDays[1].dayStart.label).toBe(plannedDays[0].dayEnd.label);
  });

  it('TEST 6 — synthetic Jaipur / Udaipur / Manali compact vs separate', () => {
    const scenarios: Array<{
      label: string;
      origin: { lat: number; lng: number };
      compact: ClusterPlace[];
      separate: ClusterPlace;
    }> = [
      {
        label: 'Jaipur',
        origin: { lat: 26.9124, lng: 75.7873 },
        compact: [
          place('amber', 'Amber Fort', { lat: 26.9855, lng: 75.8513, editorialPriority: 5, category: 'fort' }),
          place('jaigarh', 'Jaigarh', {
            lat: 26.9855 + degLat(1.5), lng: 75.8513 + degLng(0.8), editorialPriority: 5, category: 'fort',
          }),
          place('palace-view', 'Amber viewpoint', {
            lat: 26.9855 + degLat(0.8), lng: 75.8513 - degLng(0.4), rating: 4.0, category: 'viewpoint',
          }),
        ],
        separate: place('city-palace', 'City Palace', {
          // ~12+ km south of Amber — separate old-city outing, not Amber hill cluster
          lat: 26.9855 - degLat(12.5), lng: 75.8513 - degLng(3), editorialPriority: 5, category: 'palace',
        }),
      },
      {
        label: 'Udaipur',
        origin: { lat: 24.5854, lng: 73.7125 },
        compact: [
          place('city', 'City Palace Udaipur', {
            lat: 24.5764, lng: 73.6835, editorialPriority: 5, category: 'palace',
          }),
          place('jagdish', 'Jagdish Temple', {
            lat: 24.5764 + degLat(0.6), lng: 73.6835 + degLng(0.4), editorialPriority: 5, category: 'temple',
          }),
          place('lake', 'Lake Pichola ghat', {
            lat: 24.5764 - degLat(0.5), lng: 73.6835 - degLng(0.3), rating: 4.1, category: 'lake',
          }),
        ],
        separate: place('sajjangarh', 'Sajjangarh', {
          lat: 24.5764 + degLat(12), lng: 73.6835 + degLng(2), editorialPriority: 5, category: 'palace',
        }),
      },
      {
        label: 'Manali',
        origin: { lat: 32.2432, lng: 77.1892 },
        compact: [
          place('hadimba', 'Hadimba Temple', {
            lat: 32.2666, lng: 77.1752, editorialPriority: 5, category: 'temple',
          }),
          place('mall', 'Mall Road area', {
            lat: 32.2666 - degLat(1), lng: 77.1752 + degLng(0.5), rating: 4.0, category: 'market',
          }),
          place('van', 'Manu Temple area', {
            lat: 32.2666 + degLat(0.8), lng: 77.1752 - degLng(0.6), editorialPriority: 5, category: 'temple',
          }),
        ],
        separate: place('solang', 'Solang Valley', {
          lat: 32.2666 + degLat(14), lng: 77.1752 - degLng(3), editorialPriority: 5, category: 'adventure',
        }),
      },
    ];

    for (const s of scenarios) {
      const pool = [...s.compact, s.separate];
      const anchor = s.compact[0];
      const members = buildCandidateClusterMembers(anchor, pool, new Set(), 2, 6);
      const ids = members.map((p) => p.id);
      expect(ids, s.label).toContain(anchor.id);
      expect(ids, s.label).not.toContain(s.separate.id);
      // Compact companions should generally stay together
      const compactIds = s.compact.map((p) => p.id);
      const kept = compactIds.filter((id) => ids.includes(id));
      expect(kept.length, s.label).toBeGreaterThanOrEqual(2);

      const { days } = assignDaysByClusterValue(pool, {
        days: 2,
        maxStopsPerDay: 4,
        maxMinutesPerDay: 420,
        origin: s.origin,
        speedKmh: 30,
      });
      expect(days.length, s.label).toBe(2);
      const d1 = new Set(days[0].map((p) => p.id));
      const d2 = new Set(days[1].map((p) => p.id));
      // Separate region must not share Day 1 with the compact core when both days exist
      const compactOnD1 = compactIds.filter((id) => d1.has(id));
      if (compactOnD1.length > 0) {
        expect(d1.has(s.separate.id), `${s.label}: separate merged into compact day`).toBe(false);
      }
      expect(d1.has(s.separate.id) && d2.has(s.separate.id)).toBe(false);
    }
  });
});

describe('final acceptance — day budget, 5-region progression, sequential time', () => {
  const degLat = (km: number) => km / 111;
  const degLng = (km: number) => km / 102;

  function travelMinsBetween(a: ClusterPlace, b: ClusterPlace, speedKmh = 30): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLng = toRad(b.longitude - a.longitude);
    const x =
      Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    const distKm = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return Math.round((distKm / Math.max(4, speedKmh)) * 60) + 10;
  }

  function visitMinsOf(p: ClusterPlace): number {
    return visitMinutes(p);
  }

  function dayBudgetUsed(stops: ClusterPlace[], speedKmh = 30): { visit: number; travel: number; total: number } {
    let visit = 0;
    let travel = 0;
    for (let i = 0; i < stops.length; i++) {
      visit += visitMinsOf(stops[i]);
      if (i > 0) travel += travelMinsBetween(stops[i - 1], stops[i], speedKmh);
    }
    return { visit, travel, total: visit + travel };
  }

  /** Mirror engine sequential clock: start after previous end + travel. */
  function scheduleSequential(
    stops: ClusterPlace[],
    dayOpenMinutes = 9 * 60,
    speedKmh = 30,
  ): Array<{ id: string; start: number; end: number }> {
    let clock = dayOpenMinutes;
    const out: Array<{ id: string; start: number; end: number }> = [];
    for (let i = 0; i < stops.length; i++) {
      const travel = i === 0 ? 10 : travelMinsBetween(stops[i - 1], stops[i], speedKmh);
      const start = clock + travel;
      const end = start + visitMinsOf(stops[i]);
      out.push({ id: stops[i].id, start, end });
      clock = end;
    }
    return out;
  }

  it('TEST 1 — compact cluster is covered even when catalog visits are 90 min and the pace is tight', () => {
    const origin = { lat: 23.18, lng: 79.90 };
    const marble = place('marble', 'Bhedaghat Marble Rocks', {
      lat: 23.132, lng: 79.800, editorialPriority: 5, category: 'viewpoint', estimatedDurationMinutes: 90,
    });
    const falls = place('falls', 'Dhuandhar Falls', {
      lat: 23.125, lng: 79.813, editorialPriority: 5, category: 'waterfall', estimatedDurationMinutes: 90,
    });
    const yogini = place('yogini', 'Chausath Yogini', {
      lat: 23.130, lng: 79.796, editorialPriority: 5, category: 'temple', estimatedDurationMinutes: 90,
    });
    const ropeway = place('ropeway', 'Dhuandhar Ropeway', {
      lat: 23.126, lng: 79.812, editorialPriority: 5, category: 'adventure', estimatedDurationMinutes: 90,
    });
    const ghughra = place('ghughra', 'Ghughra Falls', {
      lat: 23.104, lng: 79.833, editorialPriority: 5, category: 'waterfall', estimatedDurationMinutes: 90,
    });
    const farCity = place('madan', 'Madan Mahal Fort', {
      lat: 23.178, lng: 79.945, editorialPriority: 5, category: 'fort', estimatedDurationMinutes: 120,
    });

    const { days } = assignDaysByClusterValue(
      [marble, falls, yogini, ropeway, ghughra, farCity],
      {
        days: 1,
        maxStopsPerDay: 2,
        maxMinutesPerDay: 240,
        origin,
        speedKmh: 30,
      },
    );
    const ids = days[0]?.map((p) => p.id) || [];
    expect(ids.length, `day 1 only packed ${ids.join(', ')}`).toBeGreaterThanOrEqual(4);
    expect(ids).toContain('falls');
    expect(ids).toContain('yogini');
    expect(ids).not.toContain('madan');
  });

  it('Regenerate variationSeed opens a different day-1 area than the original plan', () => {
    const origin = { lat: 26.0, lng: 75.0 };
    const pool: ClusterPlace[] = [];
    for (let r = 0; r < 3; r++) {
      const prefix = String.fromCharCode(65 + r);
      const baseLat = origin.lat + degLat(r * 22);
      pool.push(
        place(`${prefix}1`, `Region ${prefix} hub`, {
          lat: baseLat, lng: origin.lng, editorialPriority: 5, category: 'fort',
        }),
        place(`${prefix}2`, `Region ${prefix} mate`, {
          lat: baseLat + degLat(1), lng: origin.lng, editorialPriority: 5, category: 'temple',
        }),
      );
    }
    const original = assignDaysByClusterValue(pool, {
      days: 3, maxStopsPerDay: 4, maxMinutesPerDay: 420, origin, speedKmh: 30,
    });
    const originalHub = original.days[0][0].id;
    const refreshed = assignDaysByClusterValue(pool, {
      days: 3, maxStopsPerDay: 4, maxMinutesPerDay: 420, origin, speedKmh: 30,
      variationSeed: 1,
      avoidHubIds: [originalHub],
    });
    expect(refreshed.days[0][0].id, 'regenerate replayed the same day-1 hub').not.toBe(originalHub);
  });

  it('pickVariedCandidate seed 0 keeps the top-ranked area', () => {
    const ranked = [
      { score: 100, hubId: 'A', pick: 'A' },
      { score: 90, hubId: 'B', pick: 'B' },
      { score: 80, hubId: 'C', pick: 'C' },
    ];
    expect(pickVariedCandidate(ranked, 0, 3)?.hubId).toBe('A');
    expect(pickVariedCandidate(ranked, 1, 3, ['A'])?.hubId).not.toBe('A');
  });

  it('TEST 2 — FIVE REGION PROGRESSION: A→B→C→D→E with dayStart propagation', () => {
    const origin = { lat: 26.0, lng: 75.0 };
    const regionGapKm = 22; // clearly separated ( > diameter / co-5 join )
    const pool: ClusterPlace[] = [];
    const regionIds: string[][] = [];

    for (let r = 0; r < 5; r++) {
      const baseLat = origin.lat + degLat(r * regionGapKm);
      const baseLng = origin.lng;
      const prefix = String.fromCharCode(65 + r); // A..E
      const members = [
        place(`${prefix}1`, `Region ${prefix} 5★ hub`, {
          lat: baseLat, lng: baseLng, editorialPriority: 5, category: 'fort', estimatedDurationMinutes: 75,
        }),
        place(`${prefix}2`, `Region ${prefix} 5★ mate`, {
          lat: baseLat + degLat(1.2), lng: baseLng + degLng(0.6), editorialPriority: 5, category: 'temple', estimatedDurationMinutes: 60,
        }),
        place(`${prefix}3`, `Region ${prefix} 4★`, {
          lat: baseLat + degLat(0.8), lng: baseLng - degLng(0.5), rating: 4.2, category: 'museum', estimatedDurationMinutes: 60,
        }),
      ];
      regionIds.push(members.map((m) => m.id));
      pool.push(...members);
    }

    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 5,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin,
      speedKmh: 30,
    });

    expect(days.length).toBe(5);
    expect(plannedDays.length).toBe(5);

    const allIds = days.flat().map((p) => p.id);
    expect(new Set(allIds).size).toBe(allIds.length);

    for (let i = 0; i < 5; i++) {
      expect(days[i].length, `day ${i + 1} empty`).toBeGreaterThan(0);
      const ids = new Set(days[i].map((p) => p.id));
      // Day i should be dominated by region i (A=0 … E=4)
      const own = regionIds[i].filter((id) => ids.has(id));
      expect(own.length, `day ${i + 1} missing own region`).toBeGreaterThanOrEqual(1);
      // No place from a later uncovered distant region should appear early
      for (let j = 0; j < 5; j++) {
        if (j === i) continue;
        const foreign = regionIds[j].filter((id) => ids.has(id));
        // Adjacent-day bleed is not expected; any foreign id is a failure
        expect(foreign, `day ${i + 1} mixed with region ${String.fromCharCode(65 + j)}`).toEqual([]);
      }
    }

    // Day N start = Day N-1 physical end (not city centroid)
    for (let i = 1; i < 5; i++) {
      expect(plannedDays[i].dayStart.label).toBe(plannedDays[i - 1].dayEnd.label);
      expect(plannedDays[i].dayStart.lat).toBeCloseTo(plannedDays[i - 1].dayEnd.lat, 5);
      expect(plannedDays[i].dayStart.lng).toBeCloseTo(plannedDays[i - 1].dayEnd.lng, 5);
      expect(plannedDays[i].dayStart.label).not.toBe('trip-origin');
    }
  });

  it('TEST 3 — SEQUENTIAL TIME SAFETY: next.start >= previous.end', () => {
    const origin = { lat: 24.0, lng: 74.0 };
    const pool = [
      place('A1', 'A hub', { lat: origin.lat, lng: origin.lng, editorialPriority: 5, category: 'fort', estimatedDurationMinutes: 80 }),
      place('A2', 'A mate', { lat: origin.lat + degLat(1), lng: origin.lng, editorialPriority: 5, category: 'temple', estimatedDurationMinutes: 70 }),
      place('A3', 'A support', { lat: origin.lat + degLat(1.5), lng: origin.lng + degLng(0.8), rating: 4.1, category: 'museum', estimatedDurationMinutes: 60 }),
      place('B1', 'B hub', { lat: origin.lat + degLat(22), lng: origin.lng, editorialPriority: 5, category: 'palace', estimatedDurationMinutes: 90 }),
      place('B2', 'B mate', { lat: origin.lat + degLat(23), lng: origin.lng + degLng(0.5), editorialPriority: 5, category: 'nature', estimatedDurationMinutes: 60 }),
    ];
    const { days } = assignDaysByClusterValue(pool, {
      days: 2,
      maxStopsPerDay: 4,
      maxMinutesPerDay: 420,
      origin,
      speedKmh: 30,
    });
    expect(days.length).toBe(2);

    for (const dayStops of days) {
      const schedule = scheduleSequential(dayStops, 9 * 60, 30);
      for (let i = 1; i < schedule.length; i++) {
        expect(
          schedule[i].start,
          `${schedule[i].id} starts before ${schedule[i - 1].id} ends`,
        ).toBeGreaterThanOrEqual(schedule[i - 1].end);
      }
      const budget = dayBudgetUsed(dayStops, 30);
      expect(budget.total).toBeLessThanOrEqual(420);
    }

    const allIds = days.flat().map((p) => p.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('intra-region intelligence — proximity + continuity', () => {
  const deg = (km: number) => km / 111;

  function travelMinsBetween(a: ClusterPlace, b: ClusterPlace, speedKmh = 30): number {
    const dlat = (b.latitude - a.latitude) * 111;
    const dlng = (b.longitude - a.longitude) * 111 * Math.cos((a.latitude * Math.PI) / 180);
    const km = Math.sqrt(dlat * dlat + dlng * dlng);
    return Math.max(5, Math.round((km / speedKmh) * 60));
  }

  function visitMinsOf(p: ClusterPlace): number {
    return p.estimatedDurationMinutes && p.estimatedDurationMinutes > 0
      ? p.estimatedDurationMinutes
      : 60;
  }

  function scheduleSequential(
    stops: ClusterPlace[],
    dayOpenMinutes = 9 * 60,
    speedKmh = 30,
  ): Array<{ id: string; start: number; end: number }> {
    let clock = dayOpenMinutes;
    const out: Array<{ id: string; start: number; end: number }> = [];
    for (let i = 0; i < stops.length; i++) {
      const travel = i === 0 ? 10 : travelMinsBetween(stops[i - 1], stops[i], speedKmh);
      const start = clock + travel;
      const end = start + visitMinsOf(stops[i]);
      out.push({ id: stops[i].id, start, end });
      clock = end;
    }
    return out;
  }

  it('TEST 1 — highest-priority anchor wins region selection', () => {
    const origin = { lat: 22.0, lng: 75.0 };
    const hub = place('H', 'Hub 5★', {
      lat: origin.lat + deg(8), lng: origin.lng, editorialPriority: 5, rating: 4.9, category: 'fort',
    });
    const mate = place('H2', 'Hub mate', {
      lat: origin.lat + deg(8.5), lng: origin.lng, editorialPriority: 5, rating: 4.7, category: 'temple',
    });
    // Separated thin landmark (~18 km from hub) — must not invade hub day
    const thin = place('T', 'Thin 5★', {
      lat: origin.lat + deg(8) + deg(18), lng: origin.lng, editorialPriority: 5, rating: 4.8, category: 'viewpoint',
    });
    const { days } = assignDaysByClusterValue([hub, mate, thin], {
      days: 1, maxStopsPerDay: 4, maxMinutesPerDay: 420, origin, speedKmh: 30,
    });
    expect(days[0][0].id).toBe('H');
    expect(days[0].map((p) => p.id)).toContain('H2');
    expect(days[0].map((p) => p.id)).not.toContain('T');
  });

  it('TEST 2 — nearby lower-tier beats distant slightly-higher-tier inside region', () => {
    const anchor = place('A', 'Anchor 5★', {
      lat: 23.15, lng: 79.90, editorialPriority: 5, rating: 4.8, category: 'fort',
    });
    // ~1.5 km, tier ~3–4 from rating
    const near = place('NEAR', 'Nearby 4★-ish', {
      lat: 23.15 + deg(1.5), lng: 79.90, rating: 4.0, editorialPriority: 3, category: 'temple',
    });
    // ~7 km, slightly higher rating / editorial
    const far = place('FAR', 'Farther 5★-ish', {
      lat: 23.15 + deg(7), lng: 79.90, rating: 4.6, editorialPriority: 4, category: 'museum',
    });
    const used = new Set<string>();
    const day = buildDayCluster(anchor, [anchor, near, far], used, {
      days: 2, maxStopsPerDay: 3, maxMinutesPerDay: 480, speedKmh: 30,
    }, []);
    const ids = day.map((p) => p.id);
    expect(ids[0]).toBe('A');
    expect(ids).toContain('NEAR');
    const nearIdx = ids.indexOf('NEAR');
    const farIdx = ids.indexOf('FAR');
    if (farIdx >= 0) {
      expect(nearIdx).toBeLessThan(farIdx);
    }
  });

  it('TEST 3 — current-stop proximity beats anchor-only proximity as route continues', () => {
    const byStep = place('C', 'By step', {
      lat: 23.15 + deg(0.8), lng: 79.91, rating: 4.0, editorialPriority: 3, category: 'temple',
    });
    const byAnchor = place('D', 'By anchor only', {
      lat: 23.15 + deg(0.6), lng: 79.90, rating: 4.2, editorialPriority: 3, category: 'museum',
    });

    // From current stop near C: C (0.8km from last) beats D (2.2km) despite D's mild rating edge
    const jvC = journeyValueScore({
      place: byStep,
      distFromLastKm: 0.8,
      distFromRegionKm: 1.2,
      inRegion: true,
      remainingMinutes: 300,
      visitMins: 60,
      travelMins: 5,
      categoryRepeat: false,
    });
    const jvD = journeyValueScore({
      place: byAnchor,
      distFromLastKm: 2.2,
      distFromRegionKm: 0.6,
      inRegion: true,
      remainingMinutes: 300,
      visitMins: 60,
      travelMins: 8,
      categoryRepeat: false,
    });
    expect(jvC.decision).toBe('IN_REGION');
    expect(jvD.decision).toBe('IN_REGION');
    expect(jvC.score).toBeGreaterThan(jvD.score);
  });

  it('TEST 4 — selected region exhausted before any NEW_REGION same day', () => {
    const a1 = place('A1', 'Region A hub', {
      lat: 23.13, lng: 79.80, editorialPriority: 5, rating: 4.9, category: 'waterfall',
    });
    const a2 = place('A2', 'Region A mate', {
      lat: 23.131, lng: 79.801, editorialPriority: 5, rating: 4.8, category: 'viewpoint',
    });
    const b1 = place('B1', 'Region B hub', {
      lat: 23.15, lng: 79.91, editorialPriority: 5, rating: 4.9, category: 'fort',
    });
    const used = new Set<string>();
    const day = buildDayCluster(a1, [a1, a2, b1], used, {
      days: 2, maxStopsPerDay: 5, maxMinutesPerDay: 480, speedKmh: 30,
    }, []);
    expect(day.map((p) => p.id)).not.toContain('B1');
    expect(day.map((p) => p.id)).toEqual(expect.arrayContaining(['A1', 'A2']));
  });

  it('TEST 5 — Bhedaghat compact region does not merge with Madan Mahal', () => {
    const marble = place('marble', 'Bhedaghat Marble Rocks', {
      lat: 23.131, lng: 79.801, editorialPriority: 5, rating: 4.8, category: 'viewpoint',
    });
    const dhuandhar = place('dhuandhar', 'Dhuandhar Falls', {
      lat: 23.131, lng: 79.800, editorialPriority: 5, rating: 4.9, category: 'waterfall',
    });
    const madan = place('madan', 'Madan Mahal Fort', {
      lat: 23.152, lng: 79.906, editorialPriority: 5, rating: 4.7, category: 'fort',
    });
    expect(isPrimaryClusterMember(madan, marble, [marble, dhuandhar])).toBe(false);
    expect(isPrimaryClusterMember(marble, madan, [madan])).toBe(false);
  });

  it('TEST 6 — Madan-like region prefers geographically nearby candidates in order', () => {
    // Synthetic coords mirroring Madan-area geometry (generic names)
    const fort = place('FORT', 'Fort anchor', {
      lat: 23.152, lng: 79.906, editorialPriority: 5, rating: 4.8, category: 'fort',
    });
    const rock = place('ROCK', 'Nearby rock', {
      lat: 23.152, lng: 79.914, rating: 3.8, editorialPriority: 3, category: 'viewpoint',
    });
    const closeTemple = place('CLOSE', 'Close temple', {
      lat: 23.142, lng: 79.891, rating: 4.0, editorialPriority: 4, category: 'temple',
    });
    const farGarden = place('FAR_G', 'Farther garden', {
      lat: 23.163, lng: 79.933, rating: 4.1, editorialPriority: 4, category: 'garden',
    });
    const farLake = place('FAR_L', 'Farther lake', {
      lat: 23.181, lng: 79.941, rating: 4.0, editorialPriority: 4, category: 'lake',
    });
    const used = new Set<string>();
    const day = buildDayCluster(fort, [fort, rock, closeTemple, farGarden, farLake], used, {
      days: 2, maxStopsPerDay: 4, maxMinutesPerDay: 480, speedKmh: 30,
    }, []);
    const ids = day.map((p) => p.id);
    expect(ids[0]).toBe('FORT');
    expect(ids).toContain('ROCK');
    expect(ids).toContain('CLOSE');
    // Nearby temple before farther garden/lake when both compete for slots
    const closeIdx = ids.indexOf('CLOSE');
    const farG = ids.indexOf('FAR_G');
    const farL = ids.indexOf('FAR_L');
    if (farG >= 0) expect(closeIdx).toBeLessThan(farG);
    if (farL >= 0) expect(closeIdx).toBeLessThan(farL);
  });

  it('TEST 7 — valid nearby leftover not postponed past next day when same region continues', () => {
    const origin = { lat: 23.17, lng: 79.94 };
    // Region A: three compact 5★ + one nearby support (capacity forces leftover on day1)
    const a1 = place('A1', 'A hub', {
      lat: 23.131, lng: 79.801, editorialPriority: 5, rating: 4.9, category: 'waterfall',
      estimatedDurationMinutes: 90,
    });
    const a2 = place('A2', 'A mate', {
      lat: 23.131, lng: 79.800, editorialPriority: 5, rating: 4.8, category: 'viewpoint',
      estimatedDurationMinutes: 90,
    });
    const a3 = place('A3', 'A mate2', {
      lat: 23.130, lng: 79.801, editorialPriority: 5, rating: 4.7, category: 'temple',
      estimatedDurationMinutes: 90,
    });
    const a4 = place('A4', 'A leftover nearby', {
      lat: 23.125, lng: 79.805, rating: 4.0, editorialPriority: 4, category: 'nature',
      estimatedDurationMinutes: 60,
    });
    // Region B far away
    const b1 = place('B1', 'B hub', {
      lat: 23.152, lng: 79.906, editorialPriority: 5, rating: 4.8, category: 'fort',
      estimatedDurationMinutes: 120,
    });
    const b2 = place('B2', 'B mate', {
      lat: 23.152, lng: 79.914, rating: 3.9, editorialPriority: 3, category: 'viewpoint',
      estimatedDurationMinutes: 60,
    });

    const { days, plannedDays } = assignDaysByClusterValue(
      [a1, a2, a3, a4, b1, b2],
      { days: 2, maxStopsPerDay: 3, maxMinutesPerDay: 300, origin, speedKmh: 30 },
    );
    expect(days[0].every((p) => p.id.startsWith('A'))).toBe(true);
    expect(days.length).toBe(2);
    // Region A is closed after day 1 — leftover A4 is not a reason to go back.
    expect(days[1].some((p) => p.id.startsWith('A'))).toBe(false);
    expect(days[1].some((p) => p.id.startsWith('B'))).toBe(true);
    expect(plannedDays[1].dayStart.label).toBe(plannedDays[0].dayEnd.label);
  });

  it('TEST 8 — Day N starts from Day N-1 actual endpoint', () => {
    const origin = { lat: 23.17, lng: 79.94 };
    const pool = [
      place('A1', 'A1', { lat: 23.131, lng: 79.801, editorialPriority: 5, category: 'waterfall' }),
      place('A2', 'A2', { lat: 23.132, lng: 79.802, editorialPriority: 5, category: 'viewpoint' }),
      place('B1', 'B1', { lat: 23.152, lng: 79.906, editorialPriority: 5, category: 'fort' }),
      place('B2', 'B2', { lat: 23.152, lng: 79.914, rating: 4.0, category: 'viewpoint' }),
    ];
    const { plannedDays } = assignDaysByClusterValue(pool, {
      days: 2, maxStopsPerDay: 3, maxMinutesPerDay: 420, origin, speedKmh: 30,
    });
    expect(plannedDays[0].dayStart.label).toBe('trip-origin');
    expect(plannedDays[1].dayStart.lat).toBeCloseTo(plannedDays[0].dayEnd.lat, 4);
    expect(plannedDays[1].dayStart.lng).toBeCloseTo(plannedDays[0].dayEnd.lng, 4);
    expect(plannedDays[1].dayStart.label).not.toBe('trip-origin');
  });

  it('TEST 9 — no duplicate IDs across multi-day plan', () => {
    const origin = { lat: 23.17, lng: 79.94 };
    const pool = [
      place('A1', 'A1', { lat: 23.131, lng: 79.801, editorialPriority: 5, category: 'waterfall' }),
      place('A2', 'A2', { lat: 23.132, lng: 79.802, editorialPriority: 5, category: 'viewpoint' }),
      place('A3', 'A3', { lat: 23.130, lng: 79.800, rating: 4.0, category: 'temple' }),
      place('B1', 'B1', { lat: 23.152, lng: 79.906, editorialPriority: 5, category: 'fort' }),
      place('B2', 'B2', { lat: 23.145, lng: 79.917, rating: 4.0, category: 'temple' }),
      place('C1', 'C1', { lat: 23.18, lng: 79.94, editorialPriority: 5, category: 'lake' }),
    ];
    const { days } = assignDaysByClusterValue(pool, {
      days: 3, maxStopsPerDay: 4, maxMinutesPerDay: 420, origin, speedKmh: 30,
    });
    const ids = days.flat().map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('TEST 10 — no overlapping sequential times', () => {
    const origin = { lat: 23.17, lng: 79.94 };
    const pool = [
      place('A1', 'A1', { lat: 23.131, lng: 79.801, editorialPriority: 5, estimatedDurationMinutes: 80 }),
      place('A2', 'A2', { lat: 23.132, lng: 79.802, editorialPriority: 5, estimatedDurationMinutes: 70 }),
      place('B1', 'B1', { lat: 23.152, lng: 79.906, editorialPriority: 5, estimatedDurationMinutes: 90 }),
    ];
    const { days } = assignDaysByClusterValue(pool, {
      days: 2, maxStopsPerDay: 3, maxMinutesPerDay: 420, origin, speedKmh: 30,
    });
    for (const dayStops of days) {
      const schedule = scheduleSequential(dayStops, 9 * 60, 30);
      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].start).toBeGreaterThanOrEqual(schedule[i - 1].end);
      }
    }
  });

  it('TEST 11 — no >25 km intra-day hop in packed region', () => {
    const anchor = place('A', 'A', {
      lat: 23.15, lng: 79.90, editorialPriority: 5, category: 'fort',
    });
    const near = place('N', 'Near', {
      lat: 23.15 + deg(2), lng: 79.90, rating: 4.0, category: 'temple',
    });
    const far = place('X', 'Too far', {
      lat: 23.15 + deg(30), lng: 79.90, editorialPriority: 5, category: 'palace',
    });
    const used = new Set<string>();
    const day = buildDayCluster(anchor, [anchor, near, far], used, {
      days: 2, maxStopsPerDay: 4, maxMinutesPerDay: 480, speedKmh: 30,
    }, []);
    for (let i = 1; i < day.length; i++) {
      const d = Math.sqrt(
        ((day[i].latitude - day[i - 1].latitude) * 111) ** 2
        + ((day[i].longitude - day[i - 1].longitude) * 111 * Math.cos((23.15 * Math.PI) / 180)) ** 2,
      );
      expect(d).toBeLessThan(25);
    }
    expect(day.map((p) => p.id)).not.toContain('X');
  });

  it('TEST 12 — 1-day Bhedaghat excursion unchanged (no Madan)', () => {
    const origin = { lat: 23.17, lng: 79.94 };
    const marble = place('marble', 'Bhedaghat Marble Rocks', {
      lat: 23.131, lng: 79.801, editorialPriority: 5, rating: 4.8, category: 'viewpoint',
    });
    const dhuandhar = place('dhuandhar', 'Dhuandhar Falls', {
      lat: 23.131, lng: 79.800, editorialPriority: 5, rating: 4.9, category: 'waterfall',
    });
    const chausath = place('chausath', 'Chausath Yogini Temple', {
      lat: 23.130, lng: 79.801, editorialPriority: 5, rating: 4.7, category: 'temple',
    });
    const boat = place('boat', 'Bhedaghat Boating', {
      lat: 23.132, lng: 79.802, editorialPriority: 5, rating: 4.6, category: 'adventure',
    });
    const madan = place('madan', 'Madan Mahal Fort', {
      lat: 23.152, lng: 79.906, editorialPriority: 5, rating: 4.7, category: 'fort',
    });
    const { days } = assignDaysByClusterValue(
      [marble, dhuandhar, chausath, boat, madan],
      { days: 1, maxStopsPerDay: 5, maxMinutesPerDay: 420, origin, speedKmh: 30 },
    );
    const ids = days[0].map((p) => p.id);
    expect(ids).not.toContain('madan');
    expect(ids.some((id) => ['marble', 'dhuandhar', 'chausath', 'boat'].includes(id))).toBe(true);
  });

  it('TEST 13 — 2-day: Day1 Bhedaghat region, Day2 Madan-area, no cross mix', () => {
    const origin = { lat: 23.17, lng: 79.94 };
    const bheda = [
      place('marble', 'Bhedaghat Marble Rocks', {
        lat: 23.131, lng: 79.801, editorialPriority: 5, rating: 4.8, category: 'viewpoint',
      }),
      place('dhuandhar', 'Dhuandhar Falls', {
        lat: 23.131, lng: 79.800, editorialPriority: 5, rating: 4.9, category: 'waterfall',
      }),
      place('chausath', 'Chausath Yogini Temple', {
        lat: 23.130, lng: 79.801, editorialPriority: 5, rating: 4.7, category: 'temple',
      }),
      place('boat', 'Bhedaghat Boating', {
        lat: 23.132, lng: 79.802, editorialPriority: 5, rating: 4.6, category: 'adventure',
      }),
    ];
    const madanArea = [
      place('madan', 'Madan Mahal Fort', {
        lat: 23.152, lng: 79.906, editorialPriority: 5, rating: 4.7, category: 'fort',
      }),
      place('rock', 'Balancing Rock', {
        lat: 23.152, lng: 79.914, rating: 3.8, editorialPriority: 3, category: 'viewpoint',
      }),
      place('pisanhari', 'Pisanhari Ki Madiya', {
        lat: 23.142, lng: 79.891, rating: 4.0, editorialPriority: 4, category: 'temple',
      }),
    ];
    const { days } = assignDaysByClusterValue([...bheda, ...madanArea], {
      days: 2, maxStopsPerDay: 4, maxMinutesPerDay: 420, origin, speedKmh: 30,
    });
    const d1 = new Set(days[0].map((p) => p.id));
    const d2 = new Set(days[1].map((p) => p.id));
    expect([...d1].some((id) => bheda.some((p) => p.id === id))).toBe(true);
    expect(d1.has('madan')).toBe(false);
    expect(d2.has('madan') || d2.has('rock') || d2.has('pisanhari')).toBe(true);
    expect([...d2].some((id) => bheda.some((p) => p.id === id))).toBe(false);
  });

  it('TEST 14 — 3–5 day progression continues region-by-region', () => {
    const origin = { lat: 24.0, lng: 74.0 };
    const mk = (prefix: string, baseLat: number) => [
      place(`${prefix}1`, `${prefix} hub`, {
        lat: baseLat, lng: origin.lng, editorialPriority: 5, rating: 4.8, category: 'fort',
      }),
      place(`${prefix}2`, `${prefix} mate`, {
        lat: baseLat + deg(1), lng: origin.lng, editorialPriority: 5, rating: 4.6, category: 'temple',
      }),
      place(`${prefix}3`, `${prefix} support`, {
        lat: baseLat + deg(1.5), lng: origin.lng + deg(0.8), rating: 4.0, category: 'museum',
      }),
    ];
    const pool = [
      ...mk('A', origin.lat),
      ...mk('B', origin.lat + deg(22)),
      ...mk('C', origin.lat + deg(44)),
      ...mk('D', origin.lat + deg(66)),
      ...mk('E', origin.lat + deg(88)),
    ];
    const { days, plannedDays } = assignDaysByClusterValue(pool, {
      days: 5, maxStopsPerDay: 3, maxMinutesPerDay: 420, origin, speedKmh: 30,
    });
    expect(days.filter((d) => d.length > 0).length).toBe(5);
    for (let i = 1; i < plannedDays.length; i++) {
      expect(plannedDays[i].dayStart.lat).toBeCloseTo(plannedDays[i - 1].dayEnd.lat, 4);
      expect(plannedDays[i].dayStart.lng).toBeCloseTo(plannedDays[i - 1].dayEnd.lng, 4);
    }
    const prefixes = days.map((d) => d[0]?.id.charAt(0));
    expect(new Set(prefixes).size).toBe(5);
  });
});

