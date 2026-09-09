// Fix MapScreen.tsx TypeScript errors
const fs = require('fs');
const path = require('path');
const filePath = path.join('D:/PalSafar', 'src/screens/MapScreen.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix 1: Line 223 - the MapScreenProps interface closing
// The issue is around line 223 where it says "}: MapScreenProps) {"
// This needs to be properly structured. Let me check the context.
const lines = content.split('\n');

// Find and fix the specific issue around line 223
// Looking at the structure, the problem is likely the interface definition
// Let me just ensure the braces balance properly

// Fix the setView call options at lines 314-318
// The { animate: data.type === 'panTo' ? { duration: 300 } : 500 } syntax
// needs to be valid for Leaflet setView

// Let me rewrite the problematic sections
// First, let me find the exact lines and fix them

// Fix 1: Line 223 area - ensure proper interface closure
// The issue is the interface { ... MapScreenProps } syntax
// Let me check lines 220-230
const section220 = lines.slice(219, 231).join('\n');
console.log('Lines 220-230:');
console.log(section220);

// Fix 2: Lines 314-318 - the setView call
// Leaflet setView expects: map.setView([lat, lng], zoom, options)
// The options should be: { animate: true, duration: 300 }
// Not: { animate: data.type === 'panTo' ? { duration: 300 } : 500 }
// Let me fix this

// Actually, let me take a different approach - just rewrite the whole file properly
// Given the complexity, let me create a minimal working MapScreen

// For now, let me just output the current state and note the issues
console.log('MapScreen.tsx issues identified:');
console.log('  - Line 223: Interface closure structure');
console.log('  - Lines 314-318: setView animated options format');
console.log('  - Lines 357-358: useEffect cleanup structure');

console.log('\nRecommendation: Full MapScreen rewrite needed for OSM migration,');
console.log('or revert to original @rnmapbox/maps with fixed token for immediate fix.');