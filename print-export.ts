import { buildTripExportText } from './src/utils/tripExport.ts';

const trip: any = {
  title: 'Jabalpur Escape',
  destination: 'Jabalpur',
  days: 3,
  travelers: 'FAMILY',
  budget: 'MEDIUM',
  totalDistance: 45.2,
  tripDays: [
    {
      dayNumber: 1,
      theme: 'Nature & Wonders',
      stops: [
        {
          order: 0,
          startTime: '09:00',
          endTime: '11:00',
          duration: 120,
          entryFee: 150,
          distanceFromPrev: 0,
          place: {
            name: 'Bhedaghat Boating',
            category: 'riverfront_/_nature'
          }
        },
        {
          order: 1,
          startTime: '11:15',
          endTime: '12:15',
          duration: 60,
          entryFee: 0,
          distanceFromPrev: 2.3,
          place: {
            name: 'Marble Rocks',
            category: 'viewpoint'
          }
        }
      ]
    },
    {
      dayNumber: 2,
      theme: 'Wildlife & Heritage',
      stops: [
        {
          order: 0,
          startTime: '10:00',
          endTime: '12:00',
          duration: 120,
          entryFee: 50,
          distanceFromPrev: 0,
          place: {
            name: 'Dumna Nature Reserve',
            category: 'wildlife_/_nature'
          }
        },
        {
          order: 1,
          startTime: '12:30',
          endTime: '14:30',
          duration: 120,
          entryFee: 200,
          distanceFromPrev: 15.4,
          place: {
            name: 'Madan Mahal Fort',
            category: 'fort_/_heritage'
          }
        }
      ]
    }
  ]
};

console.log(buildTripExportText(trip));
