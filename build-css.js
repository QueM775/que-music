#!/usr/bin/env node

/**
 * CSS Bundler for Que-Music
 * 
 * This script combines all CSS files into a single bundled.css file
 * to eliminate flashing during app startup.
 * 
 * Usage: node build-css.js
 */

const fs = require('fs');
const path = require('path');

// Define the CSS files in the correct loading order
const cssFiles = [
  'styles/core/variables.css',
  'styles/core/reset.css', 
  'styles/core/colors.css',
  'styles/core/typography.css',
  'styles/sections/components.css',
  'styles/sections/favorites.css',
  'styles/sections/folder-browser.css',
  'styles/layout/grid.css',
  'styles/layout/header.css',
  'styles/layout/sidebar.css',
  'styles/layout/footer.css',
  'styles/components/buttons.css',
  'styles/components/cards.css',
  'styles/components/forms.css',
  'styles/components/states.css',
  'styles/features/player.css',
  'styles/features/modals.css',
  'styles/features/notifications.css',
  'styles/features/search.css',
  'styles/utilities/utilities.css',
  'help/help.css',
  'styles/fixes/modal-interaction-fix.css'
];

const clientDir = path.join(__dirname, 'client');
const outputFile = path.join(clientDir, 'styles', 'bundled.css');

console.log('🎨 Building CSS bundle...');

let bundledContent = '';
let totalSize = 0;
let processedFiles = 0;

// Add header comment
bundledContent += '/*\n';
bundledContent += ' * Que-Music Bundled CSS\n';
bundledContent += ' * Generated: ' + new Date().toISOString() + '\n';
bundledContent += ' * \n';
bundledContent += ' * This file combines all CSS files to prevent flashing during startup.\n';
bundledContent += ' * To regenerate, run: node build-css.js\n';
bundledContent += ' */\n\n';

// Process each CSS file
cssFiles.forEach((file, index) => {
  const filePath = path.join(clientDir, file);
  
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileSize = content.length;
      
      // Add file separator comment
      bundledContent += `/* ============================================================================\n`;
      bundledContent += ` * ${file} (${fileSize} bytes)\n`;
      bundledContent += ` * ============================================================================ */\n\n`;
      
      // Add the file content
      bundledContent += content;
      bundledContent += '\n\n';
      
      totalSize += fileSize;
      processedFiles++;
      
      console.log(`✅ ${file} (${fileSize} bytes)`);
    } else {
      console.warn(`⚠️  File not found: ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error reading ${file}:`, error.message);
  }
});

// Write the bundled file
try {
  fs.writeFileSync(outputFile, bundledContent, 'utf8');
  const bundleSize = fs.statSync(outputFile).size;
  
  console.log('\n📦 CSS Bundle created successfully!');
  console.log(`📊 Files processed: ${processedFiles}/${cssFiles.length}`);
  console.log(`📏 Total size: ${totalSize} bytes`);
  console.log(`💾 Bundle size: ${bundleSize} bytes`);
  console.log(`📍 Output: ${outputFile}`);
  console.log('\n🚀 Run the app to see the improved loading performance!');
  
} catch (error) {
  console.error('❌ Error writing bundle file:', error.message);
  process.exit(1);
}