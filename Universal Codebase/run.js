#!/usr/bin/env node

import { StartWallet } from './client.js';

// Direct wallet launcher - no encryption
console.log('🚀 TheeCoin Wallet Launcher v1.0');
console.log('=================================');

try {
  // Start the wallet application directly
  StartWallet();
} catch (err) {
  console.log(`❌ Launch failed: ${err.message}`);
  process.exit(1);
}
