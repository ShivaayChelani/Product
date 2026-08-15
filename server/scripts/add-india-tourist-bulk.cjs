/**
 * Add named local gems + India tourist attractions into places-curated.json
 * (idempotent by id / name), then seed with:
 *   npm run db:seed:places
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../prisma/seed-data/places-curated.json');
const places = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const STATE_MP = 'Madhya Pradesh';
const INDIA = 'India';

/** @type {Array<Record<string, any>>} */
const newPlaces = [
  // ─── User-requested Jabalpur local gems ───
  {
    id: 'nidan-katangi-falls',
    name: 'Nidan Falls (Katangi Waterfall)',
    city: 'Katangi',
    state: STATE_MP,
    latitude: 23.44,
    longitude: 79.79,
    category: 'waterfall',
    mustVisit: true,
    isHiddenGem: true,
    description:
      'Also called Katangi Waterfall / Nidan Kund, about 40 km from Jabalpur. Twin cascades drop over 100 feet between dark step-like rocks; best in monsoon with a short trek from the main road.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 110,
    rating: 4.6,
    country: INDIA,
  },
  {
    id: 'paat-baba-mandir-jabalpur',
    name: 'Paat Baba Mandir (Pat Baba Hanuman)',
    city: 'Jabalpur',
    state: STATE_MP,
    latitude: 23.175,
    longitude: 79.95,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Historic Hanuman temple inside the Gun Carriage Factory estate, established 12 August 1903 by British officer Stanley Smith after a buried Hanuman idol was unearthed. Famous Tuesday aarti; deeply revered in Jabalpur.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 100,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'hanumantal-bada-jain-mandir',
    name: 'Hanumantal Bada Jain Mandir',
    city: 'Jabalpur',
    state: STATE_MP,
    latitude: 23.1689,
    longitude: 79.9336,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Large Digambar Jain temple complex around Hanumantal tank in old Jabalpur — ornate shrines and a major local pilgrimage landmark.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 90,
    rating: 4.5,
    country: INDIA,
  },
  {
    id: 'kachnar-city-shiva-statue',
    name: 'Kachnar City Lord Shiva Statue',
    city: 'Jabalpur',
    state: STATE_MP,
    latitude: 23.181,
    longitude: 79.986,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'Tall sitting Shiva statue at Kachnar City temple complex — popular photo and devotion stop in Jabalpur (related to Kachnar City Shiva Temple).',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 80,
    rating: 4.4,
    country: INDIA,
  },

  // From expand-2 batch (quality MP gaps) — safe if already present
  {
    id: 'rahatgarh-waterfalls',
    name: 'Rahatgarh Waterfalls',
    city: 'Rahatgarh',
    state: STATE_MP,
    latitude: 23.7631,
    longitude: 78.3979,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Multi-tier waterfall near Sagar–Rahatgarh, strongest in monsoon. Popular local picnic and photography spot.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 90,
    rating: 4.4,
    country: INDIA,
  },
  {
    id: 'purwa-falls-rewa',
    name: 'Purwa Falls',
    city: 'Rewa',
    state: STATE_MP,
    latitude: 24.55,
    longitude: 81.35,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Powerful Rewa-region waterfall on the plateau circuit with Chachai and Keoti. Raw monsoon force and village landscapes.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 100,
    rating: 4.5,
    country: INDIA,
  },
  {
    id: 'manav-sangrahalaya-bhopal',
    name: 'Indira Gandhi Rashtriya Manav Sangrahalaya',
    city: 'Bhopal',
    state: STATE_MP,
    latitude: 23.2329,
    longitude: 77.3788,
    category: 'museum',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'National Museum of Mankind on Shamla Hills — open-air tribal habitats, ethnographic galleries, and lakeside trails.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 120,
    rating: 4.6,
    country: INDIA,
  },
  {
    id: 'tribal-museum-bhopal',
    name: 'Madhya Pradesh Tribal Museum',
    city: 'Bhopal',
    state: STATE_MP,
    latitude: 23.2343,
    longitude: 77.3849,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Award-winning museum of MP tribal cultures with immersive installations and crafts — a modern cultural highlight of Bhopal.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 110,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'rewa-fort',
    name: 'Rewa Fort',
    city: 'Rewa',
    state: STATE_MP,
    latitude: 24.532,
    longitude: 81.296,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Historic seat of the Rewa royals with museum galleries and White Tiger heritage. Anchor site for the Rewa waterfall circuit.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 95,
    rating: 4.3,
    country: INDIA,
  },
  {
    id: 'deur-kothar',
    name: 'Deur Kothar Stupas',
    city: 'Rewa',
    state: STATE_MP,
    latitude: 24.9167,
    longitude: 81.6667,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Mauryan-era Buddhist stupa complex near Rewa — among India’s earliest Buddhist remains and a true archaeological gem.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 110,
    rating: 4.5,
    country: INDIA,
  },
  {
    id: 'ahukhana-burhanpur',
    name: 'Ahukhana Burhanpur',
    city: 'Burhanpur',
    state: STATE_MP,
    latitude: 21.3089,
    longitude: 76.2467,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Mughal garden-tomb complex where Mumtaz Mahal was temporarily buried before the Taj Mahal. Quiet riverside heritage of Burhanpur.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 100,
    rating: 4.5,
    country: INDIA,
  },
  {
    id: 'man-singh-palace-gwalior',
    name: 'Man Singh Palace (Gwalior Fort)',
    city: 'Gwalior',
    state: STATE_MP,
    latitude: 26.2309,
    longitude: 78.1692,
    category: 'palace',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Iconic blue-tiled palace of Raja Man Singh Tomar on Gwalior Fort — geometric glaze work and underground chambers.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 120,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'ratapani-wildlife-sanctuary',
    name: 'Ratapani Wildlife Sanctuary',
    city: 'Raisen',
    state: STATE_MP,
    latitude: 22.9,
    longitude: 77.7,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Large forest tract near Bhopal–Raisen with tiger habitat significance. Quiet wilderness day-trip alternative to city parks.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 95,
    rating: 4.3,
    country: INDIA,
  },
  {
    id: 'nauradehi-wildlife-sanctuary',
    name: 'Nauradehi Wildlife Sanctuary',
    city: 'Sagar',
    state: STATE_MP,
    latitude: 23.5,
    longitude: 79.2,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'One of MP’s largest sanctuaries across Sagar–Damoh–Narsinghpur — expansive forests and landscape conservation importance.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 100,
    rating: 4.3,
    country: INDIA,
  },
  {
    id: 'parsvanath-temple-khajuraho',
    name: 'Parsvanath Temple Khajuraho',
    city: 'Khajuraho',
    state: STATE_MP,
    latitude: 24.8447,
    longitude: 79.9358,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Largest Jain temple of Khajuraho’s Eastern Group with exquisite exterior carving — beyond the famous Western Group.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 95,
    rating: 4.5,
    country: INDIA,
  },
  {
    id: 'canopy-walk-mukki',
    name: 'Kanha Canopy Walk Mukki',
    city: 'Balaghat',
    state: STATE_MP,
    latitude: 22.1447,
    longitude: 80.6659,
    category: 'adventure',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Tree-top canopy walk near Mukki gate of Kanha — elevated forest views as a safari trip add-on.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 85,
    rating: 4.4,
    country: INDIA,
  },

  // ─── More India must-visit / gems (states beyond MP) ───
  {
    id: 'taj-mahal-agra',
    name: 'Taj Mahal',
    city: 'Agra',
    state: 'Uttar Pradesh',
    latitude: 27.1751,
    longitude: 78.0421,
    category: 'monument',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'UNESCO World Heritage ivory-white marble mausoleum built by Shah Jahan — India’s most iconic monument.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Taj_Mahal_%28Edited%29.jpeg/600px-Taj_Mahal_%28Edited%29.jpeg',
    points: 200,
    rating: 4.9,
    country: INDIA,
  },
  {
    id: 'red-fort-delhi',
    name: 'Red Fort',
    city: 'Delhi',
    state: 'Delhi',
    latitude: 28.6562,
    longitude: 77.241,
    category: 'fort',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Mughal-era red sandstone fort and UNESCO site — symbol of Delhi’s imperial history and Independence Day address.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Delhi_Red_Fort.jpg/600px-Delhi_Red_Fort.jpg',
    points: 170,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'qutub-minar-delhi',
    name: 'Qutub Minar',
    city: 'Delhi',
    state: 'Delhi',
    latitude: 28.5245,
    longitude: 77.1855,
    category: 'monument',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Tallest brick minaret in the world, begun by Qutb-ud-din Aibak — UNESCO World Heritage complex in Mehrauli.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Qutb_Minar_tower.jpg/600px-Qutb_Minar_tower.jpg',
    points: 150,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'hawa-mahal-jaipur',
    name: 'Hawa Mahal',
    city: 'Jaipur',
    state: 'Rajasthan',
    latitude: 26.9239,
    longitude: 75.8267,
    category: 'palace',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Iconic five-storey “Palace of Winds” with honeycomb windows in Jaipur’s Pink City.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Hawa_Mahal_2011.jpg/600px-Hawa_Mahal_2011.jpg',
    points: 140,
    rating: 4.6,
    country: INDIA,
  },
  {
    id: 'amber-fort-jaipur',
    name: 'Amber Fort',
    city: 'Jaipur',
    state: 'Rajasthan',
    latitude: 26.9855,
    longitude: 75.8513,
    category: 'fort',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Hilltop Rajput fort-palace overlooking Maota Lake — Sheesh Mahal and grand courtyards.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Amber_Fort.jpg/600px-Amber_Fort.jpg',
    points: 160,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'mehrangarh-jodhpur',
    name: 'Mehrangarh Fort',
    city: 'Jodhpur',
    state: 'Rajasthan',
    latitude: 26.298,
    longitude: 73.018,
    category: 'fort',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Massive fort rising above the Blue City — palaces, museums, and dramatic ramparts.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Mehrangarh_Fort_Jodhpur.jpg/600px-Mehrangarh_Fort_Jodhpur.jpg',
    points: 160,
    rating: 4.8,
    country: INDIA,
  },
  {
    id: 'city-palace-udaipur',
    name: 'City Palace Udaipur',
    city: 'Udaipur',
    state: 'Rajasthan',
    latitude: 24.576,
    longitude: 73.6835,
    category: 'palace',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Palatial complex on Lake Pichola — courtyards, museums, and classic Mewar architecture.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/City_Palace%2C_Udaipur.jpg/600px-City_Palace%2C_Udaipur.jpg',
    points: 150,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'gateway-of-india-mumbai',
    name: 'Gateway of India',
    city: 'Mumbai',
    state: 'Maharashtra',
    latitude: 18.922,
    longitude: 72.8347,
    category: 'monument',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Iconic arch-monument on Mumbai’s waterfront, built to commemorate the 1911 royal visit.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Mumbai_03-2016_30_Gateway_of_India.jpg/600px-Mumbai_03-2016_30_Gateway_of_India.jpg',
    points: 140,
    rating: 4.6,
    country: INDIA,
  },
  {
    id: 'ajanta-caves',
    name: 'Ajanta Caves',
    city: 'Aurangabad',
    state: 'Maharashtra',
    latitude: 20.5519,
    longitude: 75.7033,
    category: 'monument',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'UNESCO rock-cut Buddhist caves famous for ancient murals and chaitya halls.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Ajanta_%2863%29.jpg/600px-Ajanta_%2863%29.jpg',
    points: 180,
    rating: 4.8,
    country: INDIA,
  },
  {
    id: 'ellora-caves',
    name: 'Ellora Caves',
    city: 'Aurangabad',
    state: 'Maharashtra',
    latitude: 20.0268,
    longitude: 75.1771,
    category: 'monument',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'UNESCO complex of Buddhist, Hindu and Jain rock-cut temples including the Kailasa temple.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Kailasa_temple_at_ellora.JPG/600px-Kailasa_temple_at_ellora.JPG',
    points: 180,
    rating: 4.8,
    country: INDIA,
  },
  {
    id: 'golden-temple-amritsar',
    name: 'Golden Temple (Harmandir Sahib)',
    city: 'Amritsar',
    state: 'Punjab',
    latitude: 31.62,
    longitude: 74.8765,
    category: 'gurudwara',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Holiest Gurdwara of Sikhism, golden sanctum amid the Amrit Sarovar — spiritual heart of Amritsar.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Golden_Temple_Amritsar_Punjab_India.jpg/600px-Golden_Temple_Amritsar_Punjab_India.jpg',
    points: 200,
    rating: 4.9,
    country: INDIA,
  },
  {
    id: 'hampi-virupaksha',
    name: 'Hampi (Virupaksha Temple)',
    city: 'Hampi',
    state: 'Karnataka',
    latitude: 15.335,
    longitude: 76.46,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Living temple at the heart of the UNESCO Hampi ruins — Vijayanagara capital landscape of boulder hills and monuments.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Virupaksha_Temple_from_hemakuta_hills.JPG/600px-Virupaksha_Temple_from_hemakuta_hills.JPG',
    points: 170,
    rating: 4.8,
    country: INDIA,
  },
  {
    id: 'meenakshi-temple-madurai',
    name: 'Meenakshi Amman Temple',
    city: 'Madurai',
    state: 'Tamil Nadu',
    latitude: 9.9195,
    longitude: 78.1193,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Dravidian temple complex with towering gopurams dedicated to Meenakshi and Sundareswarar — soul of Madurai.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Meenakshi_Amman_Temple_Tower.jpg/600px-Meenakshi_Amman_Temple_Tower.jpg',
    points: 180,
    rating: 4.8,
    country: INDIA,
  },
  {
    id: 'konark-sun-temple',
    name: 'Konark Sun Temple',
    city: 'Konark',
    state: 'Odisha',
    latitude: 19.8876,
    longitude: 86.0945,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      '13th-century UNESCO chariot temple to Surya — masterpiece of Kalinga architecture on the Odisha coast.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Konarka_Temple.jpg/600px-Konarka_Temple.jpg',
    points: 170,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'kaziranga-national-park',
    name: 'Kaziranga National Park',
    city: 'Golaghat',
    state: 'Assam',
    latitude: 26.5775,
    longitude: 93.1711,
    category: 'park',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'UNESCO park famous for the world’s largest population of one-horned rhinoceroses and rich Brahmaputra floodplain wildlife.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/One_horned_Rhinoceros_at_Kaziranga_National_Park.jpg/600px-One_horned_Rhinoceros_at_Kaziranga_National_Park.jpg',
    points: 170,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'valley-of-flowers',
    name: 'Valley of Flowers National Park',
    city: 'Chamoli',
    state: 'Uttarakhand',
    latitude: 30.7283,
    longitude: 79.605,
    category: 'park',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'UNESCO alpine valley of endemic Himalayan flowers, reached via trek from Govindghat–Ghangaria.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Valley_of_flowers_uttaranchal_full_view.JPG/600px-Valley_of_flowers_uttaranchal_full_view.JPG',
    points: 160,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'living-root-bridges-mawlynnong',
    name: 'Living Root Bridges (Nongriat)',
    city: 'Nongriat',
    state: 'Meghalaya',
    latitude: 25.247,
    longitude: 91.725,
    category: 'trek',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Famous double-decker living root bridge grown from rubber-tree roots — iconic Meghalaya jungle trek.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Double_Decker_Living_Root_Bridge.jpg/600px-Double_Decker_Living_Root_Bridge.jpg',
    points: 140,
    rating: 4.8,
    country: INDIA,
  },
  {
    id: 'pangong-tso',
    name: 'Pangong Tso',
    city: 'Leh',
    state: 'Ladakh',
    latitude: 33.759,
    longitude: 78.663,
    category: 'lake',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'High-altitude brackish lake changing shades of blue — legendary Ladakh landscape beyond Leh.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Pangong_Tso.jpg/600px-Pangong_Tso.jpg',
    points: 160,
    rating: 4.8,
    country: INDIA,
  },
  {
    id: 'statue-of-unity',
    name: 'Statue of Unity',
    city: 'Kevadia',
    state: 'Gujarat',
    latitude: 21.838,
    longitude: 73.7191,
    category: 'monument',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'World’s tallest statue honouring Sardar Vallabhbhai Patel on the Narmada near Kevadia.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Statue_of_Unity.jpg/600px-Statue_of_Unity.jpg',
    points: 140,
    rating: 4.6,
    country: INDIA,
  },
  {
    id: 'rann-of-kutch',
    name: 'White Rann of Kutch',
    city: 'Dhordo',
    state: 'Gujarat',
    latitude: 23.838,
    longitude: 69.518,
    category: 'trek',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Vast salt desert famous for Rann Utsav full-moon nights, crafts, and endless white landscapes.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/White_Rann.jpg/600px-White_Rann.jpg',
    points: 150,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'alappuzha-backwaters',
    name: 'Alappuzha Backwaters',
    city: 'Alappuzha',
    state: 'Kerala',
    latitude: 9.4981,
    longitude: 76.3388,
    category: 'lake',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Classic Kerala houseboat waterways of canals, lagoons, and paddy fields — the Venice of the East.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/Houseboat_in_Alleppey_backwaters.jpg/600px-Houseboat_in_Alleppey_backwaters.jpg',
    points: 150,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'munnar-tea-gardens',
    name: 'Munnar Tea Gardens',
    city: 'Munnar',
    state: 'Kerala',
    latitude: 10.0889,
    longitude: 77.0595,
    category: 'park',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Rolling Western Ghats tea estates, viewpoints, and cool climate — Kerala’s premier hill-station landscape.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Munnar_tea_plantations.jpg/600px-Munnar_tea_plantations.jpg',
    points: 140,
    rating: 4.7,
    country: INDIA,
  },
  {
    id: 'darjeeling-tiger-hill',
    name: 'Tiger Hill Darjeeling',
    city: 'Darjeeling',
    state: 'West Bengal',
    latitude: 27.0,
    longitude: 88.28,
    category: 'trek',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Famous sunrise viewpoint over Kanchenjunga from the Queen of the Hills.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/Kanchenjunga_from_Tiger_Hill.jpg/600px-Kanchenjunga_from_Tiger_Hill.jpg',
    points: 130,
    rating: 4.6,
    country: INDIA,
  },
  {
    id: 'gangtok-tsomgo-lake',
    name: 'Tsomgo Lake',
    city: 'Gangtok',
    state: 'Sikkim',
    latitude: 27.375,
    longitude: 88.764,
    category: 'lake',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Glacial lake on the road to Nathula — sacred high-altitude water body near Gangtok.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Tsomgo_Lake.jpg/600px-Tsomgo_Lake.jpg',
    points: 130,
    rating: 4.6,
    country: INDIA,
  },
  {
    id: 'andaman-radhanagar-beach',
    name: 'Radhanagar Beach',
    city: 'Havelock Island',
    state: 'Andaman and Nicobar Islands',
    latitude: 11.984,
    longitude: 92.953,
    category: 'beach',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Asia’s celebrated white-sand beach on Swaraj Dweep (Havelock) — turquoise Andaman waters and sunsets.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Radhanagar_Beach_Havelock.jpg/600px-Radhanagar_Beach_Havelock.jpg',
    points: 150,
    rating: 4.8,
    country: INDIA,
  },
];

let added = 0;
const skipped = [];
for (const np of newPlaces) {
  const exists = places.some(
    (p) => p.id === np.id || String(p.name).toLowerCase() === String(np.name).toLowerCase()
  );
  if (!exists) {
    places.push(np);
    added++;
  } else {
    skipped.push(np.id);
  }
}

fs.writeFileSync(filePath, JSON.stringify(places, null, 2), 'utf-8');
const mp = places.filter((p) => p.state === STATE_MP);
console.log('Added ' + added + ' places (skipped ' + skipped.length + ' duplicates).');
console.log('Total curated: ' + places.length + ' | MP: ' + mp.length);
console.log(
  'Includes Nidan/Katangi: ' +
    places.some((p) => /nidan|katangi/i.test(p.name)) +
    ' | Paat Baba: ' +
    places.some((p) => /paat baba|pat baba|pathbaba/i.test(p.name))
);
