// clean-deep.js
const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      if (f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx') || f.endsWith('.js')) {
        callback(path.join(dir, f));
      }
    }
  });
}

function cleanCode(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Fix spaces inside import strings: from "react " -> from "react"
  content = content.replace(/from\s+"([^"]+?)\s+"/g, 'from "$1"');
  content = content.replace(/import\s+"([^"]+?)\s+"/g, 'import "$1"');
  
  // 2. Fix spaces in JSX tags: < div -> <div, < /div -> </div
  content = content.replace(/<\s+([a-zA-Z])/g, '<$1');
  content = content.replace(/<\/\s+([a-zA-Z])/g, '</$1');
  content = content.replace(/<\/([a-zA-Z0-9]+)\s+>/g, '</$1>');
  content = content.replace(/<([a-zA-Z0-9]+)\s+\/>/g, '<$1/>');
  content = content.replace(/<([a-zA-Z0-9]+)\s+>/g, '<$1>');

  // 3. Fix broken arrow functions: () = > -> () =>
  content = content.replace(/\)\s*=\s+>/g, ') =>');
  content = content.replace(/=\s+>/g, '=>');

  // 4. Fix broken logical operators: & & -> &&
  content = content.replace(/&\s+&/g, '&&');

  // 5. Fix broken variable names
  content = content.replace(/selectedDurati\s+on/g, 'selectedDuration');
  content = content.replace(/option\.\s+months/g, 'option.months');
  content = content.replace(/option\.\s+days/g, 'option.days');

  // 6. Fix trailing spaces in simple string literals: "Lagos " -> "Lagos"
  content = content.replace(/"([a-zA-Z0-9_]+)\s+"/g, '"$1"');

  // 7. Fix "use client "; -> "use client";
  content = content.replace(/"use client\s+";/g, '"use client";');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Cleaned: ${filePath}`);
  }
}

console.log('🔍 Aggressively scanning and cleaning project...');
const foldersToClean = ['app', 'components', 'lib'];
foldersToClean.forEach(folder => {
  const fullPath = path.join(process.cwd(), folder);
  walkDir(fullPath, cleanCode);
});
console.log('🎉 Deep cleanup complete!');