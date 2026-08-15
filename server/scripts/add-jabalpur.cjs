const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../prisma/seed-data/places-curated.json');
const rawData = fs.readFileSync(filePath, 'utf-8');
const places = JSON.parse(rawData);

const jabalpurPlaces = [
  {
    "id": "madan-mahal-fort",
    "name": "Madan Mahal Fort",
    "city": "Jabalpur",
    "state": "Madhya Pradesh",
    "latitude": 23.1555,
    "longitude": 79.9077,
    "category": "history",
    "mustVisit": false,
    "description": "Built by the Gond ruler Madan Shah in the 11th century. This ancient fort perched on a rocky hill offers panoramic views of Jabalpur city.",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Madan_Mahal_Fort.jpg/600px-Madan_Mahal_Fort.jpg",
    "points": 70,
    "isHiddenGem": true,
    "country": "India",
    "shortDescription": "Built by the Gond ruler Madan Shah in the 11th century. This ancient fort perched on a rocky hill offers panoramic vie...",
    "rating": 4.2
  },
  {
    "id": "chausath-yogini-temple",
    "name": "Chausath Yogini Temple",
    "city": "Jabalpur",
    "state": "Madhya Pradesh",
    "latitude": 23.1360,
    "longitude": 79.8090,
    "category": "religious",
    "mustVisit": true,
    "description": "Ancient 10th-century Kalachuri temple situated on a hilltop near Bhedaghat. It features an open courtyard surrounded by statues of 64 yoginis.",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Chausath_Yogini_Temple_Bhedaghat.jpg/600px-Chausath_Yogini_Temple_Bhedaghat.jpg",
    "points": 90,
    "isHiddenGem": false,
    "country": "India",
    "shortDescription": "Ancient 10th-century Kalachuri temple situated on a hilltop near Bhedaghat. It features an open courtyard surrounded by ...",
    "rating": 4.6
  },
  {
    "id": "balancing-rock-jabalpur",
    "name": "Balancing Rock",
    "city": "Jabalpur",
    "state": "Madhya Pradesh",
    "latitude": 23.1530,
    "longitude": 79.9080,
    "category": "nature",
    "mustVisit": false,
    "description": "A huge natural volcanic rock balanced precariously on another rock. A geological marvel that has withstood earthquakes of magnitude up to 6.5.",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Balancing_Rock_Jabalpur.jpg/600px-Balancing_Rock_Jabalpur.jpg",
    "points": 50,
    "isHiddenGem": true,
    "country": "India",
    "shortDescription": "A huge natural volcanic rock balanced precariously on another rock. A geological marvel that has withstood earthquakes...",
    "rating": 4.0
  },
  {
    "id": "bargi-dam",
    "name": "Bargi Dam",
    "city": "Jabalpur",
    "state": "Madhya Pradesh",
    "latitude": 22.9902,
    "longitude": 79.9238,
    "category": "nature",
    "mustVisit": true,
    "description": "A major dam on the Narmada River offering scenic sunset views, boating, water sports, and a resort. It is a popular picnic and weekend getaway spot.",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Bargi_Dam_Jabalpur.jpg/600px-Bargi_Dam_Jabalpur.jpg",
    "points": 80,
    "isHiddenGem": false,
    "country": "India",
    "shortDescription": "A major dam on the Narmada River offering scenic sunset views, boating, water sports, and a resort. It is a popular p...",
    "rating": 4.4
  },
  {
    "id": "dumna-nature-reserve",
    "name": "Dumna Nature Reserve",
    "city": "Jabalpur",
    "state": "Madhya Pradesh",
    "latitude": 23.1706,
    "longitude": 80.0573,
    "category": "nature",
    "mustVisit": false,
    "description": "An ecotourism site spread over 1058 hectares, featuring a lake, wildlife like spotted deer, leopards, and rich birdlife. Perfect for nature walks and cycling.",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Dumna_Nature_Reserve.jpg/600px-Dumna_Nature_Reserve.jpg",
    "points": 85,
    "isHiddenGem": true,
    "country": "India",
    "shortDescription": "An ecotourism site spread over 1058 hectares, featuring a lake, wildlife like spotted deer, leopards, and rich birdlife...",
    "rating": 4.3
  },
  {
    "id": "kachnar-city-shiva-temple",
    "name": "Kachnar City Shiva Temple",
    "city": "Jabalpur",
    "state": "Madhya Pradesh",
    "latitude": 23.1770,
    "longitude": 79.8970,
    "category": "religious",
    "mustVisit": false,
    "description": "Famous for its massive 76-feet tall statue of Lord Shiva housing replicas of the 12 Jyotirlingas inside a cavern beneath the statue.",
    "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Kachnar_City_Shiva_Temple.jpg/600px-Kachnar_City_Shiva_Temple.jpg",
    "points": 75,
    "isHiddenGem": false,
    "country": "India",
    "shortDescription": "Famous for its massive 76-feet tall statue of Lord Shiva housing replicas of the 12 Jyotirlingas inside a cavern benea...",
    "rating": 4.5
  }
];

// Add if not exist
let added = 0;
for (const jp of jabalpurPlaces) {
  if (!places.some(p => p.id === jp.id)) {
    places.push(jp);
    added++;
  }
}

fs.writeFileSync(filePath, JSON.stringify(places, null, 2), 'utf-8');
console.log(`Added ${added} new places for Jabalpur. Total places: ${places.length}`);
