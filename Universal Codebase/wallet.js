#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { 
  globalState, 
  getScriptDir, 
  writeFileWithRetry, 
  formatNumber,
  Wallet,
  WalletDetails,
  initializeState
} from './types.js';
import { GenerateMnemonic, MnemonicToPrivateKey, ValidateMnemonic } from './mnemonics.js';
import { DerivePublicKey, DeriveAddress, ValidateAddress } from './addresses.js';


// Wallet Constants
const WALLETS_DIR = "wallets";
const WALLET_VERSION = "1.0.0";

// Expected node hash for verification
const EXPECTED_NODE_HASH = 'b1a6f1d075ee7f182ccb936bad12004261353f1a9bc6c51cd3496af5c8b80416';

// Price management variables (fetched from network)
let currentPrice = 0; // Will be fetched from network

// Initialize state
async function initializeWalletState() {
  const scriptDir = await getScriptDir();
  
  // Initialize state if needed
  await initializeState();
  
  // Reset all connection maps
  globalState.nodeState.connectedPeers = new Map();
  globalState.nodeState.peerConnections = new Map();
  
  // Ensure running state is set to true
  globalState.nodeState.running = true;
  
  // Check if nodes.txt exists, if not create it
  const nodesFile = path.join(scriptDir, "nodes.txt");
  if (!fs.existsSync(nodesFile)) {
    // Create default nodes.txt with header
    const defaultContent = `# TheeCoin Network Nodes
# Add one node per line, format: nodeId
# Your wallet will connect to these nodes for transactions

`;
    await writeFileWithRetry(nodesFile, defaultContent);
    

  }
  
  console.log(`Wallet state initialized in: ${scriptDir}`);
}

// Web-friendly wallet creation (no terminal interaction)
async function createWalletWeb(autoSave = true, walletName = null) {
  // Generate secure private key and mnemonic
  const mnemonic = GenerateMnemonic();
  const privateKey = await MnemonicToPrivateKey(mnemonic);
  const publicKey = DerivePublicKey(privateKey);
  const address = DeriveAddress(publicKey);
  
  // Validate the generated address format
  if (!ValidateAddress(address)) {
    throw new Error('generated address failed validation');
  }
  
  const wallet = new Wallet();
  wallet.mnemonic = mnemonic;
  wallet.privateKey = privateKey;
  wallet.publicKey = publicKey;
  wallet.address = address;
  wallet.created = new Date().toISOString();
  
  if (autoSave) {
    // Auto-save new wallet
    const scriptDir = await getScriptDir();
    
    // Use wallets directory from script directory
    const walletDir = path.join(scriptDir, "wallets");
    
    // Check if directory exists before reading
    if (!fs.existsSync(walletDir)) {
      throw new Error('wallets directory does not exist. Please start node first');
    }
    
    const files = fs.readdirSync(walletDir);
    
    let filename;
    if (walletName) {
      // Use custom name
      let customName = walletName.trim();
      // Replace invalid characters
      const invalid = ["/", "\\", ":", "*", "?", "\"", "<", ">", "|"];
      for (const char of invalid) {
        customName = customName.split(char).join("_");
      }
      filename = customName + ".dat";
    } else {
      // Find highest existing wallet number
      let maxNum = 0;
      for (const file of files) {
        if (file.startsWith("wallet_") && file.endsWith(".dat")) {
          const numStr = file.replace("wallet_", "").replace(".dat", "");
          const num = parseInt(numStr);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
      // Create new wallet with next number
      const nextNum = maxNum + 1;
      filename = `wallet_${nextNum}.dat`;
    }
    
    const walletPath = path.join(walletDir, filename);
    
    // Save wallet with proper JSON format
    const data = JSON.stringify(wallet, null, 4);
    fs.writeFileSync(walletPath, data);
    
    wallet.filename = filename;
  }

  // Initialize payment tracker for this wallet
  try {
    const { getPaymentTracker } = await import('./payments.js');
    await getPaymentTracker(wallet.address);
  } catch (err) {
    console.log(`Warning: Could not initialize payment tracker: ${err.message}`);
  }

  return wallet;
}

// Basic wallet creation functions (terminal version)
async function createWallet() {
  console.log("\nLoading...");
  
  // Generate secure private key and mnemonic
  const mnemonic = GenerateMnemonic();
  const privateKey = await MnemonicToPrivateKey(mnemonic);
  const publicKey = DerivePublicKey(privateKey);
  const address = DeriveAddress(publicKey);
  
  // Validate the generated address format
  if (!ValidateAddress(address)) {
    throw new Error('generated address failed validation');
  }
  
  const wallet = new Wallet();
  wallet.mnemonic = mnemonic;
  wallet.privateKey = privateKey;
  wallet.publicKey = publicKey;
  wallet.address = address;
  wallet.created = new Date().toISOString();
  
  // Show wallet details
  console.log("\n✅ Wallet created successfully!");
  console.log(`\n🔐 Secret Recovery Phrase: ${wallet.mnemonic}`);
  console.log(`\n🔑 Private Key: ${wallet.privateKey}`);
  console.log(`\n📢 Public Key: ${wallet.publicKey}`);
  console.log(`\n🏠 Address: ${wallet.address}\n`);
  
  console.log("\n⚠️  IMPORTANT: Write down your Secret Recovery Phrase and store it safely!");
  console.log("   This is the ONLY way to recover your wallet if you lose access.\n");
  
  // Auto-save new wallet
  const scriptDir = await getScriptDir();
  
  // Use wallets directory from script directory
  const walletDir = path.join(scriptDir, "wallets");
  
  // Check if directory exists before reading
  if (!fs.existsSync(walletDir)) {
    throw new Error('wallets directory does not exist. Please start node first');
  }
  
  const files = fs.readdirSync(walletDir);
  
  const response = await promptUser("\nWould you like to save this wallet to your wallets folder?\nIf yes, enter a name for it (or just type yes for a number)\nIf no, type no and save your wallet info somewhere else): ");
  
  // If they don't want to save, return wallet without saving
  if (response.toLowerCase() === "no") {
    console.log("\nWallet not saved to file. Make sure you have saved your wallet information somewhere safe!");
    return wallet;
  }
  
  let filename;
  if (response.toLowerCase() === "yes") {
    // Find highest existing wallet number
    let maxNum = 0;
    for (const file of files) {
      if (file.startsWith("wallet_") && file.endsWith(".dat")) {
        const numStr = file.replace("wallet_", "").replace(".dat", "");
        const num = parseInt(numStr);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    // Create new wallet with next number
    const nextNum = maxNum + 1;
    filename = `wallet_${nextNum}.dat`;
  } else {
    // Use custom name
    let customName = response.trim();
    // Replace invalid characters
    const invalid = ["/", "\\", ":", "*", "?", "\"", "<", ">", "|"];
    for (const char of invalid) {
      customName = customName.split(char).join("_");
    }
    filename = customName + ".dat";
  }
  
  const walletPath = path.join(walletDir, filename);
  
  // Save wallet with proper JSON format
  const data = JSON.stringify(wallet, null, 4);
  fs.writeFileSync(walletPath, data);
  
  console.log(`\n📁 Wallet saved as: ${filename}\n`);
  return wallet;
}

// Load wallet from file or by filename
async function loadWallet(filename) {
  const scriptDir = await getScriptDir();
  
  // Use wallets directory from script directory
  const walletDir = path.join(scriptDir, "wallets");
  
  // Check if directory exists
  if (!fs.existsSync(walletDir)) {
    throw new Error('wallets directory does not exist. Please start node first');
  }
  
  let walletPath;
  if (filename) {
    walletPath = path.join(walletDir, filename);
  } else {
    console.log("\n1. Enter private key");
    console.log("2. Enter Secret Phrase");
    console.log("3. Load a wallet.dat file");
    
    const choice = await promptUser("\nSelect option: ");
    
    switch (choice) {
      case "1":
        const privateKey = await promptUser("\nEnter 64-character hex private key: ");
        
        // Validate key format
        if (privateKey.length !== 64) {
          throw new Error('private key must be exactly 64 characters');
        }
        
        // Validate hex format
        try {
          Buffer.from(privateKey, 'hex');
        } catch (err) {
          throw new Error('private key must be in hexadecimal format');
        }
        
        // Create wallet from private key without saving
        const publicKey = DerivePublicKey(privateKey);
        const address = DeriveAddress(publicKey);
        
        // Validate generated address
        if (!ValidateAddress(address)) {
          throw new Error('generated address failed validation');
        }
        
        const wallet = new Wallet();
        wallet.privateKey = privateKey;
        wallet.publicKey = publicKey;
        wallet.address = address;
        wallet.created = new Date().toISOString();

        // Initialize payment tracker for this wallet
        try {
          const { getPaymentTracker } = await import('./payments.js');
          await getPaymentTracker(wallet.address);
        } catch (err) {
          console.log(`Warning: Could not initialize payment tracker: ${err.message}`);
        }

        return wallet;
      
      case "2":
        const mnemonicPhrase = await promptUser("\nEnter your 24-word Secret Recovery Phrase (separated by spaces): ");
        
        // Validate mnemonic format
        const words = mnemonicPhrase.trim().split(/\s+/);
        if (words.length !== 24) {
          throw new Error('secret Recovery Phrase must be exactly 24 words');
        }
        
        // Validate mnemonic and derive private key
        if (!ValidateMnemonic(mnemonicPhrase)) {
          throw new Error('invalid Secret Recovery Phrase');
        }
        
        const privateKeyFromMnemonic = await MnemonicToPrivateKey(mnemonicPhrase);
        const publicKeyFromMnemonic = DerivePublicKey(privateKeyFromMnemonic);
        const addressFromMnemonic = DeriveAddress(publicKeyFromMnemonic);
        
        // Validate generated address
        if (!ValidateAddress(addressFromMnemonic)) {
          throw new Error('generated address failed validation');
        }
        
        const walletFromMnemonic = new Wallet();
        walletFromMnemonic.mnemonic = mnemonicPhrase;
        walletFromMnemonic.privateKey = privateKeyFromMnemonic;
        walletFromMnemonic.publicKey = publicKeyFromMnemonic;
        walletFromMnemonic.address = addressFromMnemonic;
        walletFromMnemonic.created = new Date().toISOString();

        // Initialize payment tracker for this wallet
        try {
          const { getPaymentTracker } = await import('./payments.js');
          await getPaymentTracker(walletFromMnemonic.address);
        } catch (err) {
          console.log(`Warning: Could not initialize payment tracker: ${err.message}`);
        }

        return walletFromMnemonic;
      
      case "3":
        // List available wallets
        const files = fs.readdirSync(walletDir);
        
        const walletFiles = files.filter(f => f.endsWith('.dat'));
        
        if (walletFiles.length === 0) {
          throw new Error('no wallet files found');
        }
        
        console.log("\nAvailable wallets:");
        for (let i = 0; i < walletFiles.length; i++) {
          console.log(`${i + 1}. ${walletFiles[i]}`);
        }
        
        const fileChoice = parseInt(await promptUser("\nSelect wallet number: "));
        if (fileChoice < 1 || fileChoice > walletFiles.length) {
          throw new Error('invalid wallet selection');
        }
        walletPath = path.join(walletDir, walletFiles[fileChoice - 1]);
        break;
      
      default:
        throw new Error('invalid choice');
    }
  }
  
  if (walletPath) {
    const data = fs.readFileSync(walletPath, 'utf8');
    const walletData = JSON.parse(data);
    
    // Handle both snake_case and camelCase field names for compatibility
    const privateKey = walletData.privateKey || walletData.private_key;
    const publicKey = walletData.publicKey || walletData.public_key;
    const address = walletData.address;
    
    if (!privateKey || !publicKey || !address) {
      throw new Error('invalid wallet data');
    }
    
    // Normalize to camelCase format
    walletData.privateKey = privateKey;
    walletData.publicKey = publicKey;
    walletData.address = address;
    
    // CRITICAL SECURITY: Validate loaded wallet address format
    if (!ValidateAddress(walletData.address)) {
      // Try to fix address format
      walletData.address = walletData.address.toUpperCase();
      if (!ValidateAddress(walletData.address)) {
        throw new Error('invalid address format in wallet file');
      }
    }

    // CRITICAL SECURITY: Verify that the address actually corresponds to the private/public keys
    // This prevents tampering with .dat files to claim arbitrary wallet addresses
    const derivedPublicKey = DerivePublicKey(walletData.privateKey);
    const derivedAddress = DeriveAddress(derivedPublicKey);

    if (walletData.publicKey !== derivedPublicKey) {
      throw new Error('SECURITY ERROR: Public key in wallet file does not match private key');
    }

    if (walletData.address !== derivedAddress) {
      throw new Error('SECURITY ERROR: Address in wallet file does not match derived address from keys');
    }

    const wallet = new Wallet();
    Object.assign(wallet, walletData);

    // Initialize payment tracker for this wallet
    try {
      const { getPaymentTracker } = await import('./payments.js');
      await getPaymentTracker(wallet.address);
    } catch (err) {
      console.log(`Warning: Could not initialize payment tracker: ${err.message}`);
    }

    return wallet;
  }
  
  throw new Error('no wallet loaded');
}

async function handleExportWallet(wallet) {
  const scriptDir = await getScriptDir();
  
  // Use wallets directory from script directory
  const walletDir = path.join(scriptDir, "wallets");
  
  // Check if directory exists
  if (!fs.existsSync(walletDir)) {
    console.log("Error: Wallets directory does not exist. Please start node first\n");
    return;
  }
  
  let filename = await promptUser("\nEnter name for wallet file: ");
  
  // Clean filename and add .dat extension
  filename = filename.trim();
  if (!filename.endsWith(".dat")) {
    filename = filename + ".dat";
  }
  
  const exportPath = path.join(walletDir, filename);
  
  // Check if file already exists
  if (fs.existsSync(exportPath)) {
    const confirm = await promptUser("File already exists. Overwrite? (yes/no): ");
    if (confirm.toLowerCase() !== "yes") {
      return;
    }
  }
  
  // Export wallet
  const data = JSON.stringify(wallet, null, 4);
  fs.writeFileSync(exportPath, data);
  
  console.log(`\nWallet exported successfully as: ${filename}\n`);
}

async function getNextWalletNumber() {
  try {
    const scriptDir = await getScriptDir();
    
    // Use wallets directory from script directory
    const walletDir = path.join(scriptDir, "wallets");
    
    // Check if directory exists
    if (!fs.existsSync(walletDir)) {
      return 1;
    }
    
    const files = fs.readdirSync(walletDir);
    
    let maxNum = 0;
    for (const file of files) {
      if (file.startsWith("wallet") && file.endsWith(".dat")) {
        const numStr = file.replace("wallet", "").replace(".dat", "");
        const num = parseInt(numStr);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    return maxNum + 1;
  } catch (err) {
    return 1;
  }
}

async function handleViewPrivateKey(wallet) {
  const confirm = await promptUser("\nWarning: Never share your private key or Secret Recovery Phrase! View them? (yes/no): ");
  
  if (confirm.toLowerCase() === "yes") {
    if (wallet.mnemonic) {
      console.log(`\n🔐 Secret Recovery Phrase: ${wallet.mnemonic}`);
    }
    console.log(`\n🔑 Private Key: ${wallet.privateKey}`);
    console.log(`\n📢 Public Key: ${wallet.publicKey}`);
    console.log(`\n🏠 Address: ${wallet.address}\n`);
    
    await promptUser("\nPress Enter to continue...");
  }
}

// Prompt user for input
function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// formatDuration formats seconds into a human-readable duration
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)} minutes, ${seconds % 60} seconds`;
  } else if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} hours, ${minutes} minutes`;
  } else {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return `${days} days, ${hours} hours`;
  }
}

function enforceMinimumPrice() {
  return currentPrice > 0 ? currentPrice : 0;
}

// Main execution
async function main() {
  // Import StartWallet dynamically to avoid circular imports
  const { StartWallet } = await import('./client.js');
  StartWallet();
}

// Export functions for other modules
export {
  createWallet,
  createWalletWeb,
  loadWallet,
  handleExportWallet,
  handleViewPrivateKey,
  formatDuration,
  enforceMinimumPrice,
  initializeWalletState,
  getNextWalletNumber,
  promptUser,
  WALLETS_DIR,
  WALLET_VERSION
};

export default {
  createWallet,
  createWalletWeb,
  loadWallet,
  handleExportWallet,
  handleViewPrivateKey,
  formatDuration,
  enforceMinimumPrice,
  initializeWalletState,
  getNextWalletNumber,
  promptUser
};

// If this file is run directly, start the wallet
if (import.meta.url === `file://${process.argv[1]}`) {
  // Add global error handlers for wallet
  process.on('uncaughtException', (err) => {
    console.log(`Wallet Uncaught Exception: ${err.message}`);
    console.log('Wallet continuing to run...');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.log(`Wallet Unhandled Rejection at: ${promise}, reason: ${reason}`);
    console.log('Wallet continuing to run...');
  });

  main().catch(err => {
    console.log(`Wallet startup error: ${err.message}`);
    console.log('Wallet will attempt to continue...');
  });
}
