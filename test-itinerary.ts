import { generateItineraryPlan } from './server/src/modules/trips/itineraryEngine.ts';
import * as fs from 'fs';
import { buildTripExportText } from './src/utils/tripExport.ts';

async function testEngine() {
  const params1Day: any = {
    destination: 'Jabalpur',
    days: 1,
    travelers: 'FAMILY',
    budget: 'MEDIUM',
    interests: ['NATURE', 'HISTORY'],
    pace: 'BALANCED',
    avoid: [],
  };

  const params2Day: any = {
    ...params1Day,
    days: 2,
  };

  const params3Day: any = {
    ...params1Day,
    days: 3,
  };

  function toTripPlan(engineResult: any, daysCount: number): any {
    const tripDays = Array.from({ length: daysCount }, (_, i) => ({
      dayNumber: i + 1,
      theme: engineResult.daysInfo.find((d: any) => d.dayNumber === i + 1)?.theme || `Day ${i + 1}`,
      stops: engineResult.stops
        .filter((s: any) => s.dayNumber === i + 1)
        .map((s: any) => ({
          order: s.order,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration,
          entryFee: s.entryFee,
          distanceFromPrev: s.distanceFromPrev,
          place: {
            name: s.name,
            category: s.category
          }
        }))
    }));

    return {
      destination: 'Jabalpur',
      days: daysCount,
      travelers: 'FAMILY',
      budget: 'MEDIUM',
      tripDays
    };
  }

  try {
    const trip1 = await generateItineraryPlan(params1Day);
    fs.writeFileSync('trip1.txt', buildTripExportText(toTripPlan(trip1, 1)));
    fs.writeFileSync('trip1.json', JSON.stringify(trip1, null, 2));

    const trip2 = await generateItineraryPlan(params2Day);
    fs.writeFileSync('trip2.txt', buildTripExportText(toTripPlan(trip2, 2)));
    fs.writeFileSync('trip2.json', JSON.stringify(trip2, null, 2));

    const trip3 = await generateItineraryPlan(params3Day);
    fs.writeFileSync('trip3.txt', buildTripExportText(toTripPlan(trip3, 3)));
    fs.writeFileSync('trip3.json', JSON.stringify(trip3, null, 2));

    console.log("Success! Wrote files.");
  } catch (error) {
    console.error(error);
  }
}

testEngine();
