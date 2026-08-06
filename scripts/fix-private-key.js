# scripts/fix-private-key.js
const fs = require('fs');

// Read your original JSON key file
const keyData = JSON.parse(fs.readFileSync('service-account-key.json', 'utf8'));

// Format for .env: escape newlines and quotes
const formattedKey = keyData.private_key
  .replace(/\n/g, '\\n')  // Actual newlines → \n
  .replace(/"/g, '\\"');  // Quotes → \"

// Output the exact line for .env.local
console.log(`FIREBASE_PRIVATE_KEY="${formattedKey}"`);
console.log('\n👉 Copy the line above and replace FIREBASE_PRIVATE_KEY in your .env.local');