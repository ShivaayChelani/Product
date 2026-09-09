// Check TypeScript errors in MapScreen.tsx
const fs = require('fs');
const path = require('path');

const filePath = path.join('D:/PalSafar', 'src/screens/MapScreen.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find lines with TypeScript-relevant syntax issues
// Look for unbalanced parens, missing semicolons, etc.
let balance = 0;
let issues = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (const ch of line) {
    if (ch === '(') balance++;
    if (ch === ')') {
      balance--;
      if (balance < 0) {
        issues.push({ line: i + 1, type: 'extra_close', content: line.substring(0, 50) });
        balance = 0; // reset to continue checking
      }
    }
  }
}

// Check for lines with just ');' or similar patterns that might cause TS errors
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line === ');' || line === '})' || line === ']' || line === '}' && !line.includes('return')) {
    // Check if this is a problem
    if (i > 0 && lines[i-1].trim() && !lines[i-1].trim().endsWith('{') && !lines[i-1].trim().endsWith('return') && !lines[i-1].trim().endsWith('}')) {
      issues.push({ line: i + 1, type: 'suspicious_close', content: line });
    }
  }
}

console.log('Total unbalanced opens:', balance);
console.log('Issues found:', issues.length);
if (issues.length > 0) {
  console.log('First 10 issues:');
  issues.slice(0, 10).forEach((issue, idx) => {
    console.log(`  ${idx + 1}. Line ${issue.line}: ${issue.type} - ${issue.content}`);
  });
} else {
  console.log('No major syntax issues found via this heuristic');
}