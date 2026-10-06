#!/usr/bin/env node

/**
 * Generate VAPID keys for Web Push Notifications
 * 
 * Run this script once and copy the keys to your .env file
 * Usage: node generate-vapid-keys.js
 */

import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

console.log('🔐 Generating VAPID keys for Web Push Notifications...\n');

// Generate keys
const vapid = webpush.generateVAPIDKeys();

console.log('✓ Keys generated successfully!\n');
console.log('='.repeat(70));
console.log('VAPID_PUBLIC_KEY:');
console.log(vapid.publicKey);
console.log('\nVAPID_PRIVATE_KEY:');
console.log(vapid.privateKey);
console.log('='.repeat(70));

// Check if .env exists
if (fs.existsSync(envPath)) {
  console.log('\n⚠️  .env file already exists. Keys not written automatically.');
  console.log('   Please manually add to your .env file:\n');
} else {
  console.log('\n✓ .env file will be created with these keys.\n');
}

const envContent = `# Web Push Notifications
VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
ADMIN_EMAIL=kshirasagarvishal1@gmail.com
`;

console.log('📋 Add these lines to your .env file:\n');
console.log(envContent);

// Offer to write to .env
if (!fs.existsSync(envPath)) {
  try {
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log('✓ Saved to .env file!');
  } catch (error) {
    console.error('❌ Error writing to .env:', error.message);
    console.log('   Please manually create .env and add the keys above.');
  }
}

// Update .env.example
if (fs.existsSync(envExamplePath)) {
  try {
    let exampleContent = fs.readFileSync(envExamplePath, 'utf8');
    
    // Check if VAPID keys already in example
    if (!exampleContent.includes('VAPID_PUBLIC_KEY')) {
      exampleContent += '\n\n# Web Push Notifications (generate with: node generate-vapid-keys.js)\nVAPID_PUBLIC_KEY=your_public_key_here\nVAPID_PRIVATE_KEY=your_private_key_here\nADMIN_EMAIL=admin@example.com\n';
      fs.writeFileSync(envExamplePath, exampleContent, 'utf8');
      console.log('✓ Updated .env.example with VAPID key placeholders');
    }
  } catch (error) {
    console.warn('⚠️  Could not update .env.example:', error.message);
  }
}

console.log('\n✨ Setup complete! Your application can now send push notifications.');
console.log('📚 See PUSH_NOTIFICATIONS_SETUP.md for complete setup instructions.\n');