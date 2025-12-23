// TheeCoin Wallet Types and Utilities

import fs from 'fs';
import path from 'path';

// Self-contained wallet types and utilities
export class Wallet {
  constructor() {
    this.mnemonic = '';
    this.privateKey = '';
    this.publicKey = '';
    this.address = '';
    this.created = '';
  }
}

export class WalletDetails {
  constructor() {
    this.address = '';
    this.balance = 0;
    this.frozenBalance = 0;
    this.spendableBalance = 0;
    this.valueUSD = 0;
    this.currentPrice = 0.01;
    this.priceChanging = false;
    this.totalSent = 0;
    this.totalReceived = 0;
    this.transactionCount = 0;
  }
}

export class Transaction {
  constructor() {
    this.SENDER = '';
    this.RECIPIENT = '';
    this.AMOUNT = 0;
    this.TYPE = '';
    this.TIMESTAMP = '';
    this.SIGNATURE = '';
  }
}

export class GlobalState {
  constructor() {
    this.nodeState = {
      running: true,
      connectedPeers: new Map(),
      peerConnections: new Map(),
      announcedPeers: new Map(),
      peerStates: new Map(),
      httpClient: null,
      lastNodeCheck: new Date(),
      activeNode: '',
      nodeId: null,
      swarmInstance: null,
      peers: new Map()
    };
  }
}

export const globalState = new GlobalState();

// Utility functions
export function formatNumber(num, includeDecimals = false) {
  if (num === Infinity) {
    return "∞";
  }
  if (includeDecimals) {
    return num.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 8 
    });
  }
  return num.toLocaleString('en-US');
}

export async function getScriptDir() {
  // For wallet programs, we need the directory where the wallet program files are located
  // This should be the directory containing run.js, wallet.js, etc.

  // Use the directory of the current script file
  const scriptPath = import.meta.url;
  const scriptUrl = new URL(scriptPath);
  let scriptDir = path.dirname(scriptUrl.pathname);

  // Decode URL encoding (e.g., %20 -> space)
  scriptDir = decodeURIComponent(scriptDir);

  // On Windows, fix the path format
  if (process.platform === 'win32') {
    // Remove leading slash and convert to Windows format
    return path.resolve(scriptDir.substring(1));
  }

  return path.resolve(scriptDir);
}

export async function writeFileWithRetry(filePath, content, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.writeFileSync(filePath, content);
      return;
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  throw lastError;
}

export async function initializeState() {
  // Initialize global state if needed
  if (!globalState.nodeState) {
    globalState.nodeState = {
      running: true,
      connectedPeers: new Map(),
      peerConnections: new Map(),
      announcedPeers: new Map(),
      peerStates: new Map(),
      httpClient: null,
      lastNodeCheck: new Date(),
      activeNode: '',
      nodeId: null,
      swarmInstance: null,
      peers: new Map()
    };
  }
}
