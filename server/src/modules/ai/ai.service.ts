import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache, cacheKey } from '../../config/cache';
import { haversineDistance } from '../../shared/utils/geo';
import { geocodeLocation, resolveDestinationCentroid } from '../../shared/utils/geocode';
import { canonicalizeDestination, placeBelongsToDestination } from '../../shared/utils/destination';
import { ApiError } from '../../shared/utils/ApiError';
import { resolvePlace } from '../places/services/places.helpers';
import { appendPublicPlaceSqlConditions } from '../places/services/places-public-visibility';
import { env } from '../../config/env';
import type { PlaceScore, TripPlanResult, TripPlanDay, TripStop, DiscoveryResult, UserPreferenceVector } from './ai.types';

function aiTouristPlaceConditions(): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.status = 'APPROVED'`,
    Prisma.sql`p.merged_into_id IS NULL`,
  ];
  appendPublicPlaceSqlConditions(conditions);
  return conditions;
}

function joinConditions(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return conditions.reduce((acc, c) => Prisma.sql`${acc} AND ${c}`);
}

function joinOr(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) return Prisma.sql`FALSE`;
  return conditions.reduce((acc, c) => Prisma.sql`${acc} OR ${c}`);
}

const SIMILARITY_WEIGHTS = {
  categoryMatch: 0.30,
  tagSimilarity: 0.25,
  textSimilarity: 0.15,
  distanceScore: 0.15,
  popularityScore: 0.15,
};

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'some', 'them', 'than', 'what', 'when', 'that', 'this', 'with', 'from', 'they', 'been', 'also', 'its', 'over', 'such', 'very'].includes(t));
}

function textSimilarity(textA: string, textB: string): number {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const freqA = new Map<string, number>();
  const freqB = new Map<string, number>();
  for (const t of tokensA) freqA.set(t, (freqA.get(t) || 0) + 1);
  for (const t of tokensB) freqB.set(t, (freqB.get(t) || 0) + 1);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [t, f] of freqA) {
    const fb = freqB.get(t) || 0;
    dot += f * fb;
    normA += f * f;
  }
  for (const f of freqB.values()) normB += f * f;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function inverseDistance(lat1: number, lng1: number, lat2: number, lng2: number, maxDist: number = 50000): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Math.max(0, 1 - dist / maxDist);
}

function normalizePopularity(value: number, max: number): number {
  if (max === 0) return 0;
  return value / max;
}

export const aiService = {
  async getRecommendations(query: {
    userId?: string;
    placeId?: string;
    lat?: string;
    lng?: string;
    limit?: string;
  }) {
    const lim = Math.min(parseInt(query.limit || '10', 10), 30);
    const userId = query.userId;
    const placeId = query.placeId;
    const userLat = query.lat ? parseFloat(query.lat) : undefined;
    const userLng = query.lng ? parseFloat(query.lng) : undefined;

    let preferenceVector: UserPreferenceVector | null = null;

    if (userId) {
      preferenceVector = await this.getUserVector(userId);
    }

    let targetPlace: any = null;
    let resolvedPlaceId: string | undefined;
    if (placeId) {
      try {
        const resolved = await resolvePlace(placeId);
        resolvedPlaceId = resolved.id;
      } catch {
        throw new ApiError(404, 'Place not found.');
      }
      targetPlace = await prisma.place.findUnique({
        where: { id: resolvedPlaceId },
        select: { id: true, name: true, description: true, latitude: true, longitude: true, category: true, tags: true },
      });
    }

    const allApproved = await prisma.place.findMany({
      where: { status: 'APPROVED', id: resolvedPlaceId ? { not: resolvedPlaceId } : undefined, latitude: { not: null }, longitude: { not: null } },
      select: {
        id: true, name: true, description: true, latitude: true, longitude: true,
        category: true, images: true, tags: true, createdAt: true,
        popularityScore: true,
      },
      take: 200,
      orderBy: { popularityScore: 'desc' },
    });

    const scored: PlaceScore[] = allApproved.map((place) => {
      const pl = place as typeof place & { latitude: number; longitude: number };
      const signals = {
        categoryMatch: targetPlace
          ? (pl.category === targetPlace.category ? 1 : 0)
          : preferenceVector?.categories[pl.category]
            ? Math.min(1, (preferenceVector.categories[pl.category] || 0) / (preferenceVector.totalInteractions || 1) * 5)
            : 0,
        tagSimilarity: targetPlace
          ? jaccardSimilarity(pl.tags, targetPlace.tags)
          : preferenceVector
            ? this.tagsToVectorSimilarity(pl.tags, preferenceVector.tags)
            : 0,
        textSimilarity: targetPlace
          ? textSimilarity(pl.description || '', targetPlace.description || '')
          : 0,
        distanceScore: (userLat && userLng)
          ? inverseDistance(userLat, userLng, pl.latitude, pl.longitude)
          : preferenceVector
            ? 0.3
            : 0,
        popularityScore: pl.popularityScore ?? 0,
      };

      const score = (
        signals.categoryMatch * SIMILARITY_WEIGHTS.categoryMatch +
        signals.tagSimilarity * SIMILARITY_WEIGHTS.tagSimilarity +
        signals.textSimilarity * SIMILARITY_WEIGHTS.textSimilarity +
        signals.distanceScore * SIMILARITY_WEIGHTS.distanceScore +
        signals.popularityScore * SIMILARITY_WEIGHTS.popularityScore
      );

      return {
        id: pl.id,
        name: pl.name,
        description: pl.description,
        latitude: pl.latitude,
        longitude: pl.longitude,
        category: pl.category,
        images: pl.images,
        tags: pl.tags,
        score: Math.round(score * 1000) / 1000,
        signals,
        distance: (userLat && userLng) ? Math.round(haversineDistance(userLat, userLng, pl.latitude, pl.longitude)) : undefined,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, lim);
  },

  async getSimilar(id: string, limit: number = 10) {
    return this.getRecommendations({ placeId: id, limit: String(limit) });
  },

  async getUserVector(userId: string): Promise<UserPreferenceVector> {
    const ck = cacheKey('ai', 'user-vector', userId);
    const cached = await cache.get<UserPreferenceVector>(ck);
    if (cached) return cached;

    const userInteractions = await prisma.placeStat.findMany({
      where: { userId, action: { in: ['like', 'save', 'share', 'view'] } },
      include: { place: { select: { category: true, tags: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const actionWeight: Record<string, number> = { view: 1, like: 3, save: 4, share: 5 };
    const categories: Record<string, number> = {};
    const tags: Record<string, number> = {};

    for (const interaction of userInteractions) {
      const weight = actionWeight[interaction.action] || 1;
      if (interaction.place) {
        categories[interaction.place.category] = (categories[interaction.place.category] || 0) + weight;
        for (const tag of interaction.place.tags) {
          tags[tag] = (tags[tag] || 0) + weight;
        }
      }
    }

    const totalInteractions = Object.values(categories).reduce((a, b) => a + b, 0);
    const sortedCats = Object.entries(categories).sort(([, a], [, b]) => b - a);
    const sortedTags = Object.entries(tags).sort(([, a], [, b]) => b - a);

    const vector: UserPreferenceVector = {
      categories,
      tags,
      totalInteractions,
      topCategory: sortedCats[0]?.[0] || null,
      topTags: sortedTags.slice(0, 10).map(([t]) => t),
    };

    await cache.set(ck, vector, 600);
    return vector;
  },

  tagsToVectorSimilarity(placeTags: string[], userTagWeights: Record<string, number>): number {
    if (placeTags.length === 0 || Object.keys(userTagWeights).length === 0) return 0;
    let score = 0;
    const maxWeight = Math.max(...Object.values(userTagWeights), 1);
    for (const tag of placeTags) {
      const weight = userTagWeights[tag] || 0;
      score += weight / maxWeight;
    }
    return Math.min(1, score / placeTags.length);
  },

  async planTrip(query: {
    prompt?: string;
    location?: string;
    lat?: string;
    lng?: string;
    days?: string;
    interests?: string;
    radius?: string;
    pace?: string;
  }): Promise<TripPlanResult> {
    const prompt = query.prompt;
    const apiKey = env.geminiApiKey;

    if (prompt && apiKey) {
      try {
        return await this.planTripLLM(prompt, apiKey, query);
      } catch (err) {
        console.warn('[aiService] LLM trip planning failed, falling back to algorithmic:', err);
      }
    }

    // Fallback to algorithmic — never invent a different city than the user asked for.
    let fallbackLocation = (query.location || '').trim();
    if (!fallbackLocation && prompt) {
      // Heuristic when Gemini key is missing: "trip to Rajasthan", "visit Goa", etc.
      const match = prompt.match(
        /\b(?:to|in|visit(?:ing)?|around)\s+([A-Za-z][A-Za-z\s.'-]{1,40}?)(?=\s+(?:for|with|on|in\s+\d|and|,|\.|!|\?|$)|$)/i,
      );
      fallbackLocation = (match?.[1] || '').trim().replace(/\s+/g, ' ');
    }
    if (!fallbackLocation) {
      throw new ApiError(422, 'A destination city is required to plan a trip.');
    }
    const daysFromPrompt = prompt?.match(/\b(\d{1,2})\s*-?\s*day/i);
    const fallbackDays = query.days || daysFromPrompt?.[1] || '3';
    return this.planTripAlgorithmic({
      ...query,
      location: fallbackLocation,
      days: fallbackDays,
    });
  },

  async planTripLLM(prompt: string, apiKey: string, query: any): Promise<TripPlanResult> {
    // 1. First stage: Parse prompt using LLM
    const parsePrompt = `Parse the following natural language travel request and return ONLY a JSON object containing the extracted travel parameters.
Do not include any markdown format blocks like \`\`\`json. Return only the raw JSON.

Request: "${prompt}"

JSON Schema:
{
  "location": string (city or state name in India as stated by the user — NEVER invent a different city; leave empty string if none detected),
  "days": number (integer number of days, default to 3, clamped between 1 and 14),
  "interests": string[] (array of categories like "spiritual", "nature", "history", "adventure", "culture", "food", "relaxation"),
  "pace": "relaxed" | "moderate" | "intensive" (default "moderate")
}`;

    const parsedParams = {
      location: (query.location || '').trim(),
      days: 3,
      interests: [] as string[],
      pace: 'moderate',
    };
    try {
      const parseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const parseResponse = await fetch(parseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: parsePrompt }] }]
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (parseResponse.ok) {
        const parseJson: any = await parseResponse.json();
        const text = parseJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanText);
        if (parsed.location) parsedParams.location = parsed.location;
        if (parsed.days) parsedParams.days = Math.min(14, Math.max(1, parsed.days));
        if (parsed.interests) parsedParams.interests = parsed.interests;
        if (parsed.pace) parsedParams.pace = parsed.pace;
      }
    } catch (e) {
      console.warn('[aiService] Failed to parse prompt using LLM, using simple heuristics:', e);
    }

    // 2. Fetch candidate places ONLY for the requested destination (never dump all APPROVED places).
    const resolution = await resolveDestinationCentroid(parsedParams.location || prompt);
    if (!resolution.resolved && !parsedParams.location) {
      throw new ApiError(422, 'Could not determine a destination from your request. Please name a city (e.g. Nainital, Jaipur).');
    }

    const dest = canonicalizeDestination(parsedParams.location || '') || parsedParams.location || '';
    let places = await prisma.place.findMany({
      where: {
        status: 'APPROVED',
        latitude: { not: null },
        longitude: { not: null },
        OR: dest
          ? [
              { city: { equals: dest, mode: 'insensitive' } },
              { city: { contains: dest, mode: 'insensitive' } },
              { state: { equals: dest, mode: 'insensitive' } },
              { name: { contains: dest, mode: 'insensitive' } },
            ]
          : [{ id: '__none__' }],
      },
      orderBy: [
        { popularityScore: 'desc' },
        { rating: 'desc' },
      ],
      take: 80,
    });

    places = places.filter((p) => placeBelongsToDestination(p, dest || parsedParams.location || ''));

    if (resolution.resolved) {
      const maxKm = 80;
      places = places.filter((p) => {
        if (p.latitude == null || p.longitude == null) return false;
        return haversineDistance(resolution.lat, resolution.lng, p.latitude, p.longitude) / 1000 <= maxKm;
      });
    }

    if (places.length < 4 && resolution.resolved) {
      const radiusDeg = 80 / 111;
      const nearby = await prisma.place.findMany({
        where: {
          status: 'APPROVED',
          latitude: { not: null, gte: resolution.lat - radiusDeg, lte: resolution.lat + radiusDeg },
          longitude: { not: null, gte: resolution.lng - radiusDeg, lte: resolution.lng + radiusDeg },
        },
        orderBy: [{ popularityScore: 'desc' }, { rating: 'desc' }],
        take: 60,
      });
      const seen = new Set(places.map((p) => p.id));
      for (const p of nearby) {
        if (seen.has(p.id)) continue;
        if (p.latitude == null || p.longitude == null) continue;
        if (haversineDistance(resolution.lat, resolution.lng, p.latitude, p.longitude) / 1000 > 80) continue;
        if (!placeBelongsToDestination(p, dest || parsedParams.location || '')) continue;
        places.push(p);
        seen.add(p.id);
      }
    }

    if (places.length === 0) {
      throw new ApiError(
        422,
        `We don't have enough places for "${parsedParams.location || 'that destination'}" yet. Try a nearby city.`,
      );
    }

    // Map database places to compact representation to fit in prompt context
    const placesContext = places.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      city: p.city,
      state: p.state,
      description: p.description.slice(0, 150),
      tags: p.tags,
      latitude: p.latitude,
      longitude: p.longitude,
    }));

    // 3. Second stage: Generate the actual itinerary using Gemini structured output
    const itineraryPrompt = `You are an expert travel planner for PalSafar. Create a detailed daily travel itinerary for a ${parsedParams.days}-day trip.
The travel request is: "${prompt}".
The pace is: ${parsedParams.pace}.

You MUST select places ONLY from the provided list of spots in our database:
${JSON.stringify(placesContext, null, 2)}

Instructions:
1. Distribute stops across ${parsedParams.days} days.
2. Group nearby places in the same day to minimize travel distance.
3. For each day, assign a theme name and stops.
4. For each stop, choose a slot ("morning", "afternoon", or "evening") and set a realistic "distanceFromPrev" in meters.
5. Do not invent places not present in the list above. Use their exact names and place IDs.

You must return the response as a JSON object matching this schema:
{
  "title": string (e.g. "3-Day Trip in Rajasthan"),
  "days": [
    {
      "day": number,
      "theme": string,
      "stops": [
        {
          "placeId": string (must match the database spot ID),
          "name": string,
          "category": string,
          "latitude": number,
          "longitude": number,
          "timeSlot": "morning" | "afternoon" | "evening",
          "order": number,
          "distanceFromPrev": number (distance in meters from previous stop, 0 for first stop),
          "description": string (short description)
        }
      ]
    }
  ],
  "totalPlaces": number (total number of stops scheduled),
  "totalDistance": number (sum of distanceFromPrev of all stops in meters),
  "note": string (a short helpful note or summary of the trip)
}`;

    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: itineraryPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              totalPlaces: { type: 'INTEGER' },
              totalDistance: { type: 'INTEGER' },
              note: { type: 'STRING' },
              days: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    day: { type: 'INTEGER' },
                    theme: { type: 'STRING' },
                    stops: {
                      type: 'ARRAY',
                      items: {
                        type: 'OBJECT',
                        properties: {
                          placeId: { type: 'STRING' },
                          name: { type: 'STRING' },
                          category: { type: 'STRING' },
                          latitude: { type: 'NUMBER' },
                          longitude: { type: 'NUMBER' },
                          timeSlot: { type: 'STRING', enum: ['morning', 'afternoon', 'evening'] },
                          order: { type: 'INTEGER' },
                          distanceFromPrev: { type: 'INTEGER' },
                          description: { type: 'STRING' },
                        },
                        required: ['placeId', 'name', 'category', 'latitude', 'longitude', 'timeSlot', 'order', 'description'],
                      },
                    },
                  },
                  required: ['day', 'theme', 'stops'],
                },
              },
            },
            required: ['title', 'days', 'totalPlaces', 'totalDistance', 'note'],
          },
        },
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini generation API failed with status ${response.status}: ${errorText}`);
    }

    const resultJson: any = await response.json();
    const text = resultJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const itinerary = JSON.parse(text);
    return itinerary;
  },

  async planTripAlgorithmic(query: {
    location: string;
    lat?: string;
    lng?: string;
    days: string;
    interests?: string;
    radius?: string;
    pace?: string;
  }): Promise<TripPlanResult> {
    const days = Math.min(parseInt(query.days, 10), 14);
    const radius = parseInt(query.radius || '80000', 10);
    const lim = days * 8;
    const interests = query.interests?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) || [];
    const pace = query.pace || 'moderate';

    let sourceLat: number;
    let sourceLng: number;
    if (query.lat && query.lng) {
      sourceLat = parseFloat(query.lat);
      sourceLng = parseFloat(query.lng);
    } else {
      const resolution = await resolveDestinationCentroid(query.location);
      if (!resolution.resolved) {
        throw new ApiError(
          422,
          `We couldn't locate "${query.location}". Try a major nearby city.`,
        );
      }
      sourceLat = resolution.lat;
      sourceLng = resolution.lng;
    }

    const places = await prisma.place.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          {
            latitude: { not: null, gte: sourceLat - 0.75, lte: sourceLat + 0.75 },
            longitude: { not: null, gte: sourceLng - 0.75, lte: sourceLng + 0.75 },
          },
          { city: { equals: query.location, mode: 'insensitive' } },
          { city: { contains: query.location, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, name: true, description: true, latitude: true, longitude: true,
        category: true, images: true, tags: true,
        _count: { select: { stats: true } },
      },
      take: 200,
    });

    // Hard geographic filter — never mix in a default city's places.
    const nearbyPlaces = places.filter((p) => {
      if (p.latitude == null || p.longitude == null) return false;
      return haversineDistance(sourceLat, sourceLng, p.latitude, p.longitude) <= radius;
    });

    if (nearbyPlaces.length === 0) {
      throw new ApiError(
        422,
        `No approved places found near "${query.location}". Try a different destination.`,
      );
    }

    const categoryMap: Record<string, string[]> = {
      spiritual: ['temple', 'mosque', 'monument', 'church'],
      nature: ['waterfall', 'lake', 'park', 'beach', 'wildlife', 'garden'],
      history: ['fort', 'palace', 'monument', 'museum'],
      heritage: ['fort', 'palace', 'monument', 'museum'],
      adventure: ['waterfall', 'park', 'trek', 'wildlife'],
      culture: ['museum', 'market', 'monument', 'palace'],
      cultural: ['museum', 'market', 'monument', 'palace'],
      food: ['market'],
      beaches: ['beach', 'lake'],
      beach: ['beach', 'lake'],
      shopping: ['market'],
      relaxation: ['lake', 'park', 'beach'],
    };

    const interestCategories = new Set<string>();
    for (const interest of interests) {
      const mapped = categoryMap[interest];
      if (mapped) mapped.forEach((c) => interestCategories.add(c));
    }

    const scored = nearbyPlaces
      .filter((p) => {
        if (interestCategories.size === 0) return true;
        return interestCategories.has(p.category);
      })
      .map((p) => {
        const pl = p as typeof p & { latitude: number; longitude: number };
        const dist = haversineDistance(sourceLat, sourceLng, pl.latitude, pl.longitude);
        let score = normalizePopularity(pl._count.stats, 100);
        if (interestCategories.has(pl.category)) score += 0.3;
        score *= Math.max(0.3, 1 - dist / radius);
        return { ...pl, dist, score };
      })
      .filter((p) => p.dist <= radius)
      .sort((a, b) => b.score - a.score)
      .slice(0, lim);

    const stopsPerDay = pace === 'relaxed' ? 3 : pace === 'intensive' ? 7 : 5;
    const allStops = scored.slice(0, days * stopsPerDay);

    const daysResult: TripPlanDay[] = [];
    for (let d = 0; d < days; d++) {
      const dayStops = allStops.slice(d * stopsPerDay, (d + 1) * stopsPerDay);
      const categories = [...new Set(dayStops.map((s) => s.category))];
      const themeNames: Record<string, string> = {
        temple: 'Spiritual & Heritage', fort: 'Historical Exploration', palace: 'Royal Heritage',
        lake: 'Nature & Relaxation', waterfall: 'Nature & Adventure', park: 'Nature Walk',
        museum: 'Cultural Discovery', market: 'Local Culture & Shopping', monument: 'Heritage Tour',
        mosque: 'Spiritual & Architecture', beach: 'Beach & Relaxation', other: 'Exploration',
      };
      const primaryTheme = categories.length > 0
        ? themeNames[categories[0]] || `${categories[0].charAt(0).toUpperCase() + categories[0].slice(1)} Tour`
        : 'Exploration Day';

      const stops: TripStop[] = dayStops.map((s, i) => {
        const stop = s as typeof s & { latitude: number; longitude: number };
        return {
          placeId: stop.id,
          name: stop.name,
          category: stop.category,
          latitude: stop.latitude,
          longitude: stop.longitude,
          images: stop.images,
          timeSlot: i < Math.ceil(dayStops.length / 3) ? 'morning' : i < Math.ceil(2 * dayStops.length / 3) ? 'afternoon' : 'evening' as 'morning' | 'afternoon' | 'evening',
          order: i + 1,
          distanceFromPrev: i === 0 ? Math.round(stop.dist) : Math.round(haversineDistance(dayStops[i - 1].latitude!, dayStops[i - 1].longitude!, stop.latitude, stop.longitude)),
          description: stop.description.slice(0, 200),
        };
      });

      daysResult.push({ day: d + 1, theme: primaryTheme, stops });
    }

    const totalDistance = daysResult.reduce(
      (sum, day) => sum + day.stops.reduce((s, stop) => s + (stop.distanceFromPrev || 0), 0),
      0,
    );

    const note = interests.length > 0
      ? `Optimized for: ${interests.join(', ')}. Pace: ${pace}. Adjust radius & days for different results.`
      : `General exploration trip. Pace: ${pace}. Add interests (spiritual, nature, history, adventure, culture) for personalized results.`;

    return {
      title: `${days}-Day Trip near ${query.location}`,
      days: daysResult,
      totalPlaces: allStops.length,
      totalDistance: Math.round(totalDistance),
      note,
    };
  },

  async discover(query: {
    query: string;
    limit?: string;
  }): Promise<DiscoveryResult> {
    const lim = Math.min(parseInt(query.limit || '20', 10), 50);
    const raw = query.query.toLowerCase();

    const sentimentWords: Record<string, string[]> = {
      hidden_gem: ['hidden', 'underrated', 'undiscovered', 'secret', 'offbeat', 'lesser-known', 'unknown', 'quiet', 'peaceful'],
      popular: ['popular', 'famous', 'top', 'best', 'must-visit', 'iconic', 'crowded'],
      trending: ['trending', 'trendy', 'upcoming', 'rising', 'hot'],
      adventurous: ['adventure', 'trek', 'hike', 'climb', 'wild', 'remote'],
      spiritual: ['spiritual', 'sacred', 'holy', 'divine', 'blessed', 'temple', 'pilgrimage'],
    };

    const categoryKeywords: Record<string, string[]> = {
      temple: ['temple', 'mandir', 'spiritual site'],
      fort: ['fort', 'qila', 'stronghold'],
      palace: ['palace', 'mahal', 'royal residence'],
      waterfall: ['waterfall', 'falls', 'cascade'],
      lake: ['lake', 'sarovar', 'talab'],
      park: ['park', 'garden', 'national park', 'sanctuary'],
      museum: ['museum', 'gallery', 'exhibition'],
      monument: ['monument', 'memorial', 'statue', 'tomb'],
      mosque: ['mosque', 'masjid'],
      market: ['market', 'bazaar', 'haat'],
      beach: ['beach', 'coast', 'sea'],
    };

    let detectedSentiment = 'general';
    for (const [sentiment, words] of Object.entries(sentimentWords)) {
      if (words.some((w) => raw.includes(w))) {
        detectedSentiment = sentiment === 'hidden_gem' ? 'underrated' : sentiment;
        break;
      }
    }

    const locationPatterns = [
      /near\s+(\w+(?:\s+\w+)?)/i,
      /in\s+(\w+(?:\s+\w+)?)/i,
      /around\s+(\w+(?:\s+\w+)?)/i,
      /at\s+(\w+(?:\s+\w+)?)/i,
    ];
    let detectedLocation: string | null = null;
    for (const pattern of locationPatterns) {
      const match = raw.match(pattern);
      if (match) {
        detectedLocation = match[1];
        break;
      }
    }

    let detectedCategory: string | null = null;
    for (const [cat, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some((kw) => raw.includes(kw))) {
        detectedCategory = cat;
        break;
      }
    }

    if (!detectedCategory) {
      for (const [cat, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some((kw) => raw.includes(kw))) {
          detectedCategory = cat;
          break;
        }
      }
    }

    let sourceLat = 23.2599;
    let sourceLng = 77.4126;
    if (detectedLocation) {
      try {
        const geo = await geocodeLocation(detectedLocation);
        sourceLat = geo.lat;
        sourceLng = geo.lng;
      } catch {
        // Geocoding is best-effort for AI recommendations
      }
    }

    const conditions: Prisma.Sql[] = aiTouristPlaceConditions();

    if (detectedCategory) {
      conditions.push(Prisma.sql`p.category = ${detectedCategory}`);
    }

    const queryTerms = raw
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'some', 'them', 'than', 'what', 'when', 'that', 'this', 'with', 'from', 'they', 'also', 'its', 'over', 'such', 'very', 'near', 'in', 'at', 'around'].includes(t))
      .filter((t) => !detectedLocation?.toLowerCase().includes(t))
      .filter((t) => !Object.values(categoryKeywords).flat().includes(t));

    if (queryTerms.length > 0 && detectedSentiment !== 'underrated') {
      conditions.push(Prisma.sql`p.search_vector @@ plainto_tsquery('english', ${queryTerms.join(' ')})`);
    }

    let havingClause: Prisma.Sql = Prisma.sql``;
    if (detectedSentiment === 'underrated') {
      havingClause = Prisma.sql`
        HAVING COUNT(ps.id) FILTER (WHERE ps.action = 'view') BETWEEN 10 AND 200
          AND COUNT(ps.id) FILTER (WHERE ps.action = 'like') > 0
      `;
    }

    const orderClause: Prisma.Sql = detectedSentiment === 'trending'
      ? Prisma.sql`total_engagement DESC`
      : detectedSentiment === 'underrated'
        ? Prisma.sql`like_ratio DESC, p.created_at DESC`
        : Prisma.sql`total_engagement DESC, p.created_at DESC`;

    const whereClause = joinConditions(conditions);

    let rawData: any[];
    try {
      rawData = await prisma.$queryRaw`
        SELECT
          p.id, p.name, p.description, p.latitude, p.longitude,
          p.category, p.images, p.tags, p.created_at,
          COUNT(ps.id) AS total_engagement,
          COUNT(ps.id) FILTER (WHERE ps.action = 'view') AS views,
          COUNT(ps.id) FILTER (WHERE ps.action = 'like') AS likes,
          CASE
            WHEN COUNT(ps.id) FILTER (WHERE ps.action = 'view') > 0
            THEN ROUND(
              (COUNT(ps.id) FILTER (WHERE ps.action = 'like'))::numeric /
              NULLIF((COUNT(ps.id) FILTER (WHERE ps.action = 'view'))::numeric, 0) * 100, 1
            )
            ELSE 0
          END AS like_ratio,
          (6371000 * 2 * ASIN(SQRT(POWER(SIN((radians(${sourceLat}) - radians(p.latitude)) / 2), 2)
            + COS(radians(${sourceLat})) * COS(radians(p.latitude))
            * POWER(SIN((radians(${sourceLng}) - radians(p.longitude)) / 2), 2)))) AS distance
        FROM places p
        LEFT JOIN place_stats ps ON ps."placeId" = p.id
        WHERE ${whereClause}
        GROUP BY p.id
        ${havingClause}
        ORDER BY ${orderClause}
        LIMIT ${lim}
      `;
    } catch {
      return {
        query: query.query,
        parsed: {
          sentiment: detectedSentiment,
          category: detectedCategory,
          location: detectedLocation,
          tags: queryTerms,
        },
        places: [],
        note: 'Search is temporarily unavailable. Please try again later.',
      };
    }

    const places = rawData.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      category: r.category,
      images: r.images || [],
      tags: r.tags || [],
      engagement: Number(r.total_engagement),
      views: Number(r.views),
      likes: Number(r.likes),
      likeRatio: Number(r.like_ratio),
      distance: Math.round(Number(r.distance)),
      createdAt: r.created_at,
    }));

    let note = '';
    if (detectedSentiment === 'underrated') {
      note = `Showing underrated ${detectedCategory || 'places'} with high appreciation but fewer visitors`;
    } else if (places.length === 0) {
      note = `No results found for "${query.query}". Try a different category, location, or broader terms.`;
    }

    return {
      query: query.query,
      parsed: {
        sentiment: detectedSentiment,
        category: detectedCategory,
        location: detectedLocation,
        tags: queryTerms,
      },
      places,
      note,
    };
  },

  async structuredDiscovery(query: {
    sentiment?: string;
    category?: string;
    location?: string;
    tags?: string;
    lat?: string;
    lng?: string;
    radius?: string;
    limit?: string;
  }) {
    const lim = Math.min(parseInt(query.limit || '20', 10), 50);
    const radius = parseInt(query.radius || '50000', 10);

    let sourceLat: number;
    let sourceLng: number;
    if (query.lat && query.lng) {
      sourceLat = parseFloat(query.lat);
      sourceLng = parseFloat(query.lng);
    } else if (query.location) {
      const geo = await geocodeLocation(query.location);
      sourceLat = geo.lat;
      sourceLng = geo.lng;
    } else {
      sourceLat = 23.2599;
      sourceLng = 77.4126;
    }

    const conditions: Prisma.Sql[] = aiTouristPlaceConditions();

    if (query.category && query.category !== 'any') {
      const cats = query.category.split(',').map((c) => c.trim()).filter(Boolean);
      if (cats.length === 1) {
        conditions.push(Prisma.sql`p.category = ${cats[0]}`);
      } else {
        const orCats = cats.map((c) => Prisma.sql`p.category = ${c}`);
        conditions.push(Prisma.sql`(${joinOr(orCats)})`);
      }
    }

    if (query.tags) {
      const tagList = query.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        const tagConditions = tagList.map((t) => Prisma.sql`${t} = ANY(p.tags)`);
        conditions.push(Prisma.sql`(${joinOr(tagConditions)})`);
      }
    }

    let havingClause: Prisma.Sql = Prisma.sql``;
    if (query.sentiment === 'underrated') {
      havingClause = Prisma.sql`
        HAVING COUNT(ps.id) FILTER (WHERE ps.action = 'view') BETWEEN 10 AND 200
          AND COUNT(ps.id) FILTER (WHERE ps.action = 'like') > 0
      `;
    }

    const orderClause: Prisma.Sql = query.sentiment === 'trending'
      ? Prisma.sql`total_engagement DESC`
      : query.sentiment === 'underrated'
        ? Prisma.sql`like_ratio DESC, p.created_at DESC`
        : Prisma.sql`distance ASC`;

    const whereClause = joinConditions(conditions);

    const rawData: any[] = await prisma.$queryRaw`
      SELECT
        p.id, p.name, p.description, p.latitude, p.longitude,
        p.category, p.images, p.tags, p.created_at,
        COUNT(ps.id) AS total_engagement,
        COUNT(ps.id) FILTER (WHERE ps.action = 'view') AS views,
        COUNT(ps.id) FILTER (WHERE ps.action = 'like') AS likes,
        CASE
          WHEN COUNT(ps.id) FILTER (WHERE ps.action = 'view') > 0
          THEN ROUND(
            (COUNT(ps.id) FILTER (WHERE ps.action = 'like'))::numeric /
            NULLIF((COUNT(ps.id) FILTER (WHERE ps.action = 'view'))::numeric, 0) * 100, 1
          )
          ELSE 0
        END AS like_ratio,
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${sourceLng}, ${sourceLat}), 4326)) AS distance
      FROM places p
      LEFT JOIN place_stats ps ON ps."placeId" = p.id
      WHERE ${whereClause}
        AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${sourceLng}, ${sourceLat}), 4326), ${radius})
      GROUP BY p.id
      ${havingClause}
      ORDER BY ${orderClause}
      LIMIT ${lim}
    `;

    return rawData.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      category: r.category,
      images: r.images || [],
      tags: r.tags || [],
      engagement: Number(r.total_engagement),
      views: Number(r.views),
      likes: Number(r.likes),
      likeRatio: Number(r.like_ratio),
      distance: Math.round(Number(r.distance)),
      createdAt: r.created_at,
    }));
  },
};

