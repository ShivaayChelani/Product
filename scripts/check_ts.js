const { exec } = require('child_process');
exec('cd D:\\PalSafar && npx tsc --noEmit', (error, stdout, stderr) => {
  if (error) {
    console.log('stderr:', stderr.substring(0, 500));
    console.log('error:', error.message.substring(0, 500));
  } else {
    console.log('stdout:', stdout.substring(0, 500));
    console.log('TypeScript check passed');
  }
});