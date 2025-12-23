#!/usr/bin/env node

import TheeCoinChat from './chat.js';

async function startChat() {
  try {
    console.log("\n🚀 TheeCoin Chat Interface");
    console.log("===========================");
    console.log("Initializing chat system...\n");
    
    const chat = new TheeCoinChat();
    await chat.initialize();
    
    // Small delay to let the swarm initialize
    setTimeout(() => {
      chat.join();
    }, 1000);
  } catch (err) {
    console.error(`❌ Error starting chat: ${err.message}`);
    console.log("Press any key to exit...");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
  }
}

startChat();
