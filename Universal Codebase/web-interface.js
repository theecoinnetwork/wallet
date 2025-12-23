#!/usr/bin/env node

import express from 'express';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Import wallet functionality
import { createWallet, createWalletWeb, loadWallet, handleViewPrivateKey, promptUser } from './wallet.js';
import { CalculateCurrentPriceFromNetwork, GetWalletDetails, CalculateAddressBalanceFromNetwork, GetFrozenBalanceFromNetwork, GetTotalMinedFromNetwork } from './client.js';
import { GetTransactionHistoryFromNetwork, SendTransactionToNetwork, GetTransactionAmount, CreateTransaction } from './transactions.js';
import { StartMiningSession, StartMiningSessionWeb, StopMiningSession, StopMiningSessionWeb } from './mining.js';
import { GenerateMnemonic, MnemonicToPrivateKey, ValidateMnemonic } from './mnemonics.js';
import { DerivePublicKey, DeriveAddress, ValidateAddress, MINING_ADDRESS, REWARDS_ADDRESS } from './addresses.js';
import { Wallet } from './types.js';
import TheeCoinChat from './chat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let httpsServer = null;
let httpServer = null;
let app = null;
let io = null;

// Store active wallet sessions
const walletSessions = new Map();

// Store chat instances per socket
const chatInstances = new Map();

// Generate self-signed certificate for HTTPS (for development)
function getHTTPSOptions() {
  try {
    // Load real SSL certificates
    const key = fs.readFileSync(path.join(__dirname, 'key.pem'), 'utf8');
    const cert = fs.readFileSync(path.join(__dirname, 'cert.pem'), 'utf8');
    
    return { key, cert };
  } catch (error) {
    console.error('Failed to load SSL certificates:', error.message);
    throw new Error('HTTPS certificates required but not found');
  }
}

export async function startWebInterface() {
  return new Promise((resolve, reject) => {
    try {
      app = express();
      
      // Create HTTPS options with real SSL certificates (REQUIRED)
      const httpsOptions = getHTTPSOptions();
      
      // Create HTTPS server (no fallback)
      httpsServer = createHttpsServer(httpsOptions, app);
      
      // Add error handling to HTTPS server
      httpsServer.on('error', (error) => {
        console.log('HTTPS server error (non-fatal):', error.message);
        // Don't crash the terminal program
      });
      
      // Create HTTP server (independent, same content)
      httpServer = createServer(app);
      
      // Add error handling to HTTP server
      httpServer.on('error', (error) => {
        console.log('HTTP server error (non-fatal):', error.message);
        // Don't crash the terminal program
      });
      
      // Create Socket.IO server for HTTPS
      io = new Server(httpsServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });
      
      // Add error handling to Socket.IO HTTPS
      io.on('error', (error) => {
        console.log('Socket.IO HTTPS error (non-fatal):', error.message);
        // Don't crash the terminal program
      });
      
      // Create Socket.IO server for HTTP (same handlers)
      const ioHttp = new Server(httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });
      
      // Add error handling to Socket.IO HTTP
      ioHttp.on('error', (error) => {
        console.log('Socket.IO HTTP error (non-fatal):', error.message);
        // Don't crash the terminal program
      });

      // Middleware
      app.use(cors());
      app.use(express.json());
      app.use(express.static(path.join(__dirname, 'web-public')));

      // Setup socket handlers for both servers
      setupSocketHandlers(io);
      setupSocketHandlers(ioHttp);

      // Serve the web interface
      app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'web-public', 'index.html'));
      });

      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({ 
          status: 'ok', 
          timestamp: new Date().toISOString(),
          activeSessions: walletSessions.size
        });
      });

      // DEBUG: Direct wallet info endpoint
      app.get('/debug/wallet/:sessionId', (req, res) => {
        const sessionId = req.params.sessionId;
        const session = walletSessions.get(sessionId);
        
        if (!session || !session.wallet) {
          res.json({ error: 'No wallet found for session' });
          return;
        }
        
        res.json({
          wallet: session.wallet,
          keys: {
            privateKey: session.wallet.privateKey,
            publicKey: session.wallet.publicKey,
            address: session.wallet.address,
            mnemonic: session.wallet.mnemonic
          }
        });
      });

      const HTTP_PORT = process.env.HTTP_PORT || 3000;
      const HTTPS_PORT = process.env.HTTPS_PORT || 3001;

      // Start HTTPS server
      httpsServer.listen(HTTPS_PORT, () => {
        resolve(HTTPS_PORT);
      });

      // Start HTTP server
      httpServer.listen(HTTP_PORT, () => {
      });

      httpsServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${HTTPS_PORT} is in use, trying HTTP fallback...`);
          // Fall back to HTTP if HTTPS port is in use
          const fallbackServer = createServer(app);
          fallbackServer.listen(HTTPS_PORT, () => {
            console.log(`⚠️  Fallback: Web interface running on http://localhost:${HTTPS_PORT} (HTTPS unavailable)`);
            resolve(HTTPS_PORT);
          });
        } else {
          reject(err);
        }
      });

      httpServer.on('error', (err) => {
        // Don't fail if HTTP server can't start
        console.log(`⚠️  HTTP server could not start on port ${HTTP_PORT}: ${err.message}`);
      });

    } catch (error) {
      reject(error);
    }
  });
}

export async function stopWebInterface() {
  return new Promise(async (resolve) => {
    if (server) {
      // Stop all wallet sessions
      for (const [socketId, session] of walletSessions) {
        if (session.miningActive) {
          try {
            await StopMiningSession(session.wallet);
          } catch (error) {
            // Silent error handling
          }
        }
      }
      
      server.close(() => {
        // Silent shutdown
        server = null;
        app = null;
        io = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

function setupSocketHandlers(ioInstance) {
  // Add error protection to the Socket.IO instance
  ioInstance.on('error', (error) => {
    console.log('Socket.IO instance error (non-fatal):', error.message);
    // Don't crash the terminal program
  });
  
  ioInstance.on('connection', (socket) => {
    // Add error protection to individual socket connections
    socket.on('error', (error) => {
      console.log('Socket connection error (non-fatal):', error.message);
      // Don't crash the terminal program
    });
    // Silent connection handling

    // Create wallet
    socket.on('createWallet', async (data, callback) => {
      try {
        const wallet = await createWalletWeb(true, data?.walletName);
        
        // Store complete wallet object directly
        walletSessions.set(socket.id, {
          wallet: wallet,
          connected: true,
          miningActive: false
        });
        
        callback({
          success: true,
          wallet: {
            address: wallet.address,
            publicKey: wallet.publicKey,
            mnemonic: wallet.mnemonic,
            privateKey: wallet.privateKey,
            filename: wallet.filename
          }
        });
      } catch (error) {
        console.error('Create wallet error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Load wallet from mnemonic - use EXACT same process as terminal version
    socket.on('loadWallet', async (data, callback) => {
      try {
        if (!data || !data.mnemonic) {
          callback({ success: false, error: 'Mnemonic is required' });
          return;
        }

        const mnemonicPhrase = data.mnemonic.trim();

        // Validate mnemonic format (same as terminal)
        const words = mnemonicPhrase.split(/\s+/);
        if (words.length !== 24) {
          callback({ success: false, error: 'Secret Recovery Phrase must be exactly 24 words' });
          return;
        }

        // Validate mnemonic and derive private key (same as terminal)
        if (!ValidateMnemonic(mnemonicPhrase)) {
          callback({ success: false, error: 'Invalid Secret Recovery Phrase' });
          return;
        }

        // Use EXACT same derivation sequence as terminal createWallet
        const privateKeyFromMnemonic = await MnemonicToPrivateKey(mnemonicPhrase);
        const publicKeyFromMnemonic = DerivePublicKey(privateKeyFromMnemonic);
        const addressFromMnemonic = DeriveAddress(publicKeyFromMnemonic);

        // Validate generated address (same as terminal)
        if (!ValidateAddress(addressFromMnemonic)) {
          callback({ success: false, error: 'Generated address failed validation' });
          return;
        }

        const wallet = new Wallet();
        wallet.mnemonic = mnemonicPhrase;
        wallet.privateKey = privateKeyFromMnemonic;
        wallet.publicKey = publicKeyFromMnemonic;
        wallet.address = addressFromMnemonic;
        wallet.created = new Date().toISOString();

        // Store complete wallet object directly
        walletSessions.set(socket.id, {
          wallet: wallet,
          connected: true,
          miningActive: false
        });

        callback({
          success: true,
          wallet: {
            address: wallet.address,
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey,
            mnemonic: wallet.mnemonic
          }
        });
      } catch (error) {
        console.error('Load wallet error:', error);
        callback({ success: false, error: error.message || 'Failed to load wallet from mnemonic' });
      }
    });

    // Get wallet balance
    socket.on('getBalance', async (callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        if (!session.wallet || !session.wallet.address) {
          callback({ success: false, error: 'Invalid wallet session' });
          return;
        }

        // Check if connected to network first
        const { state } = await import('./client.js');
        if (!state || !state.connectedToNetwork) {
          callback({ 
            success: true, 
            balance: { available: 0, frozen: 0, total: 0 },
            warning: 'Not connected to network - showing default values',
            connected: false
          });
          return;
        }

        const balance = await CalculateAddressBalanceFromNetwork(session.wallet.address) || 0;
        const frozenBalance = await GetFrozenBalanceFromNetwork(session.wallet.address) || 0;
        
        callback({ 
          success: true, 
          balance: {
            available: balance,
            frozen: frozenBalance,
            total: balance + frozenBalance
          },
          connected: true
        });
      } catch (error) {
        callback({ 
          success: true, 
          balance: { available: 0, frozen: 0, total: 0 },
          warning: 'Could not fetch balance from network',
          connected: false
        });
      }
    });

    // Send transaction
    socket.on('sendTransaction', async (data, callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        // Check network connection first
        const { state } = await import('./client.js');
        if (!state || !state.connectedToNetwork) {
          callback({ success: false, error: 'Not connected to network - cannot send transaction' });
          return;
        }

        // Validate wallet has required keys
        const wallet = session.wallet;
        if (!wallet || !wallet.privateKey || !wallet.publicKey || !wallet.address) {
          console.error('Transaction failed - wallet keys missing:', {
            hasPrivateKey: !!wallet?.privateKey,
            hasPublicKey: !!wallet?.publicKey,
            hasAddress: !!wallet?.address,
            walletKeys: wallet ? Object.keys(wallet) : 'No wallet'
          });
          callback({ success: false, error: 'Wallet missing required keys - please reload wallet' });
          return;
        }

        if (!data || !data.toAddress || !data.amount) {
          callback({ success: false, error: 'Transaction data is incomplete' });
          return;
        }

        if (!ValidateAddress(data.toAddress)) {
          callback({ success: false, error: 'Invalid recipient address' });
          return;
        }

        if (isNaN(data.amount) || data.amount <= 0) {
          callback({ success: false, error: 'Amount must be a positive number' });
          return;
        }

        // Create properly signed transaction using the same function as terminal version
        const transaction = CreateTransaction(wallet, data.toAddress, parseFloat(data.amount), "TRANSFER");
        
        const result = await SendTransactionToNetwork(transaction, true); // Silent mode for web interface
        
        // Add 10-second delay for wallet information update (same as terminal version)
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        callback({ success: true, result });
      } catch (error) {
        console.error('Send transaction error:', error);
        callback({ success: false, error: error.message || 'Failed to send transaction' });
      }
    });

    // Get transaction history
    socket.on('getTransactionHistory', async (callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        if (!session.wallet || !session.wallet.address) {
          callback({ success: false, error: 'Invalid wallet session' });
          return;
        }

        // Always try to fetch history, even if not connected to show mining data
        let history = [];
        let connected = false;
        
        try {
          const { state } = await import('./client.js');
          if (state && state.connectedToNetwork) {
            connected = true;
            history = await GetTransactionHistoryFromNetwork(session.wallet.address, 1000000000) || [];
          } else {
            console.log('Not connected to network, skipping transaction history fetch');
          }
        } catch (err) {
          console.log('Error fetching transaction history:', err.message);
        }
        
        // Get total mined amount from network
        let totalMined = 0;
        
        if (connected) {
          try {
            totalMined = await GetTotalMinedFromNetwork(session.wallet.address);
          } catch (err) {
            // Continue with 0 if mining total fetch fails
          }
        }
        
        // Also add current mining session if active
        try {
          const { GetMiningSessionInfo } = await import('./mining.js');
          const miningInfo = GetMiningSessionInfo();
          if (miningInfo && miningInfo.active) {
            totalMined += miningInfo.totalMined || 0;
          }
        } catch (err) {
          // Continue without mining session data
        }
        
        // Create formatted history like terminal version
        const formattedHistory = [];
        
        // Always add mining summary like terminal version (even if 0)
        formattedHistory.push({
          from: MINING_ADDRESS,
          to: session.wallet.address,
          amount: totalMined,
          timestamp: Date.now(),
          type: 'MINED',
          timeDisplay: 'All Mining Sessions Combined'
        });

        // Calculate and add hosting rewards summary (only NODE_REWARD transactions)
        const hostingRewardTransactions = history.filter(tx =>
          tx.TYPE === "REWARD" && tx.RECIPIENT === session.wallet.address &&
          tx.SENDER === REWARDS_ADDRESS && tx.NODE_REWARD === true
        );

        if (hostingRewardTransactions.length > 0) {
          const totalHostingRewards = hostingRewardTransactions.reduce((sum, tx) => {
            return sum + GetTransactionAmount(tx.AMOUNT || tx.amount);
          }, 0);

          formattedHistory.push({
            from: REWARDS_ADDRESS,
            to: session.wallet.address,
            amount: totalHostingRewards,
            timestamp: hostingRewardTransactions[0].TIMESTAMP || Date.now(),
            type: 'REWARD',
            timeDisplay: 'Node Hosting Rewards'
          });
        }

        // Add other transactions (excluding individual mining and hosting reward transactions)
        for (const tx of history) {
          // Skip individual mining transactions since we show the summary above
          if (tx.TYPE === "MINED" && tx.RECIPIENT === session.wallet.address) {
            continue;
          }

          // Skip individual hosting reward transactions since we show the summary above
          if (tx.TYPE === "REWARD" && tx.RECIPIENT === session.wallet.address &&
              tx.SENDER === REWARDS_ADDRESS && tx.NODE_REWARD === true) {
            continue;
          }

          formattedHistory.push({
            from: tx.SENDER || tx.from || 'Unknown',
            to: tx.RECIPIENT || tx.to || 'Unknown',
            amount: GetTransactionAmount(tx.AMOUNT || tx.amount) || 0,
            timestamp: tx.TIMESTAMP || tx.timestamp || Date.now(),
            type: tx.TYPE || 'TRANSFER'
          });
        }
        
        callback({ 
          success: true, 
          history: formattedHistory, 
          connected: connected,
          warning: !connected ? 'Not connected to network - showing local mining data only' : null
        });
      } catch (error) {
        console.error('Get transaction history error:', error);
        // Return empty history on network error
        callback({ 
          success: true, 
          history: [],
          warning: 'Could not fetch transaction history from network',
          connected: false
        });
      }
    });

    // Start mining
    socket.on('startMining', async (callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        if (session.miningActive) {
          callback({ success: false, error: 'Mining is already active' });
          return;
        }

        // Check network connection first
        const { state } = await import('./client.js');
        if (!state || !state.connectedToNetwork) {
          callback({ success: false, error: 'Not connected to network - cannot start mining' });
          return;
        }

        const result = await StartMiningSessionWeb(session.wallet);
        session.miningActive = true;
        
        // Send immediate success response
        callback({ 
          success: true, 
          message: result.message || 'Mining started successfully' 
        });
        
        // Start sending real-time mining updates immediately
        const sendMiningUpdates = async () => {
          if (session.miningActive && walletSessions.has(socket.id)) {
            try {
              const { GetMiningSessionInfo } = await import('./mining.js');
              const miningInfo = GetMiningSessionInfo();
              
              if (miningInfo && miningInfo.active) {
                socket.emit('miningUpdate', {
                  active: true,
                  hashRate: miningInfo.hashRate || 0,
                  earnings: miningInfo.earnings || 0,
                  blocksFound: miningInfo.blocksFound || 0,
                  timeRunning: miningInfo.timeRunning || 0,
                  currentRate: miningInfo.currentRate || 0,
                  totalMined: miningInfo.totalMined || 0
                });
              } else {
                // Mining stopped, update UI
                socket.emit('miningUpdate', {
                  active: false,
                  hashRate: 0,
                  earnings: 0,
                  blocksFound: 0,
                  timeRunning: 0
                });
                session.miningActive = false;
                return;
              }
              setTimeout(sendMiningUpdates, 1000);
            } catch (error) {
              // Continue trying even on errors
              setTimeout(sendMiningUpdates, 2000);
            }
          }
        };
        
        // Start updates immediately
        setTimeout(sendMiningUpdates, 500); // Give mining time to initialize
      } catch (error) {
        console.error('Start mining error:', error);
        const session = walletSessions.get(socket.id);
        if (session) session.miningActive = false;
        callback({ success: false, error: error.message || 'Failed to start mining' });
      }
    });

    // Stop mining
    socket.on('stopMining', async (callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        if (!session.miningActive) {
          callback({ success: false, error: 'Mining is not active' });
          return;
        }

        const result = await StopMiningSessionWeb(session.wallet);
        session.miningActive = false;
        
        callback({ 
          success: true, 
          result: result.message,
          totalMined: result.totalMined,
          transactionSubmitted: result.transactionSubmitted
        });
      } catch (error) {
        console.error('Stop mining error:', error);
        const session = walletSessions.get(socket.id);
        if (session) session.miningActive = false;
        callback({ success: false, error: error.message || 'Failed to stop mining' });
      }
    });

    // Get wallet details
    socket.on('getWalletDetails', async (callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        if (!session.wallet || !session.wallet.address) {
          callback({ success: false, error: 'Invalid wallet session' });
          return;
        }

        // Check if connected to network first
        const { state } = await import('./client.js');
        if (!state || !state.connectedToNetwork) {
          callback({ 
            success: true, 
            details: {
              address: session.wallet.address,
              balance: 0,
              frozenBalance: 0,
              spendableBalance: 0,
              valueUSD: 0,
              currentPrice: 0.01,
              totalSent: 0,
              totalReceived: 0,
              transactionCount: 0
            },
            warning: 'Not connected to network - showing default values',
            connected: false
          });
          return;
        }

        const details = await GetWalletDetails(session.wallet.address);
        callback({ success: true, details, connected: true });
      } catch (error) {
        const session = walletSessions.get(socket.id);
        // Provide minimal fallback details on network error
        callback({ 
          success: true, 
          details: {
            address: session?.wallet?.address || 'Unknown',
            balance: 0,
            frozenBalance: 0,
            spendableBalance: 0,
            valueUSD: 0,
            currentPrice: 0.01,
            totalSent: 0,
            totalReceived: 0,
            transactionCount: 0
          },
          warning: 'Could not fetch wallet details from network',
          connected: false
        });
      }
    });

    // Get supported cryptocurrencies for purchase
    socket.on('getSupportedCryptos', async (callback) => {
      try {
        const cryptoPaymentsModule = await import('./crypto-payments.js');
        const cryptoPayments = cryptoPaymentsModule.cryptoPayments || cryptoPaymentsModule.default;
        
        if (!cryptoPayments) {
          callback({ 
            success: true, 
            cryptos: [],
            warning: 'Crypto payments module not available'
          });
          return;
        }
        
        await cryptoPayments.initialize();
        const supportedCryptos = await cryptoPayments.getSupportedCryptos();
        callback({ success: true, cryptos: supportedCryptos });
      } catch (error) {
        console.error('Get supported cryptos error:', error);
        // Provide fallback empty array instead of error
        callback({
          success: true,
          cryptos: [],
          warning: 'Crypto payments not available'
        });
      }
    });

    // Get exchange rate for specific cryptocurrency
    socket.on('getCryptoRate', async (data, callback) => {
      try {
        const { symbol } = data;
        if (!symbol) {
          callback({ success: false, error: 'Symbol is required' });
          return;
        }

        const cryptoPaymentsModule = await import('./crypto-payments.js');
        const cryptoPayments = cryptoPaymentsModule.cryptoPayments || cryptoPaymentsModule.default;

        if (!cryptoPayments) {
          callback({ success: false, error: 'Crypto payments not available' });
          return;
        }

        const rate = await cryptoPayments.exchangeRates.fetchRateForCrypto(symbol);
        callback({ success: true, rate: rate });
      } catch (error) {
        console.error('Get crypto rate error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Create crypto payment
    socket.on('createCryptoPayment', async (data, callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        // Import crypto module to ensure it's available
        const crypto = await import('crypto');
        
        const cryptoPaymentsModule = await import('./crypto-payments.js');
        const cryptoPayments = cryptoPaymentsModule.cryptoPayments || cryptoPaymentsModule.default;
        
        if (!cryptoPayments) {
          callback({ success: false, error: 'Crypto payments module not available' });
          return;
        }
        
        await cryptoPayments.initialize();
        
        const payment = await cryptoPayments.createPayment(
          data.crypto,
          data.usdAmount,
          session.wallet.address
        );
        
        callback({ success: true, payment });
      } catch (error) {
        console.error('Create crypto payment error:', error);
        callback({ success: false, error: error.message || 'Crypto payments not available' });
      }
    });

    // Check payment status
    socket.on('checkPaymentStatus', async (data, callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        const cryptoPaymentsModule = await import('./crypto-payments.js');
        const cryptoPayments = cryptoPaymentsModule.cryptoPayments || cryptoPaymentsModule.default;

        if (!cryptoPayments) {
          callback({ success: false, error: 'Crypto payments module not available' });
          return;
        }

        const status = await cryptoPayments.getPaymentStatus(data.paymentId, session.wallet.address);
        callback({ success: true, status });
      } catch (error) {
        console.error('Check payment status error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Export wallet to file
    socket.on('exportWallet', async (data, callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        // Prepare filename
        let filename = data.filename || 'exported_wallet.dat';
        if (!filename.endsWith('.dat')) {
          filename = filename + '.dat';
        }
        
        // Create wallet export data
        const walletData = JSON.stringify(session.wallet, null, 4);
        
        // Convert to base64 for download
        const base64Data = Buffer.from(walletData).toString('base64');
        
        callback({ 
          success: true, 
          filename,
          data: base64Data,
          mimeType: 'application/octet-stream',
          message: `Wallet ready for download as ${filename}` 
        });
      } catch (error) {
        console.error('Export wallet error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // List saved wallets
    socket.on('listWallets', async (callback) => {
      try {
        const { getScriptDir } = await import('./types.js');
        const scriptDir = await getScriptDir();
        const walletDir = path.join(scriptDir, "wallets");
        
        if (!fs.existsSync(walletDir)) {
          callback({ success: true, wallets: [] });
          return;
        }
        
        const files = fs.readdirSync(walletDir);
        const walletFiles = files.filter(f => f.endsWith('.dat')).map(f => ({
          filename: f,
          name: f.replace('.dat', ''),
          modified: fs.statSync(path.join(walletDir, f)).mtime
        }));
        
        callback({ success: true, wallets: walletFiles });
      } catch (error) {
        console.error('List wallets error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Load wallet from file
    socket.on('loadWalletFromFile', async (data, callback) => {
      try {
        const { getScriptDir } = await import('./types.js');
        const scriptDir = await getScriptDir();
        const walletDir = path.join(scriptDir, "wallets");
        const walletPath = path.join(walletDir, data.filename);
        
        if (!fs.existsSync(walletPath)) {
          callback({ success: false, error: 'Wallet file not found' });
          return;
        }
        
        const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
        
        // Normalize wallet data to use camelCase keys consistently
        const normalizedWallet = {
          address: walletData.address,
          publicKey: walletData.public_key || walletData.publicKey,
          privateKey: walletData.private_key || walletData.privateKey,
          mnemonic: walletData.mnemonic,
          created: walletData.created
        };

        // CRITICAL SECURITY: Verify that the address actually corresponds to the private/public keys
        // This prevents tampering with .dat files to claim arbitrary wallet addresses
        const derivedPublicKey = DerivePublicKey(normalizedWallet.privateKey);
        const derivedAddress = DeriveAddress(derivedPublicKey);

        if (normalizedWallet.publicKey !== derivedPublicKey) {
          callback({ success: false, error: 'SECURITY ERROR: Wallet file has been tampered with - public key does not match private key' });
          return;
        }

        if (normalizedWallet.address !== derivedAddress) {
          callback({ success: false, error: 'SECURITY ERROR: Wallet file has been tampered with - address does not match derived address from keys' });
          return;
        }

        // Store normalized wallet object
        walletSessions.set(socket.id, {
          wallet: normalizedWallet,
          connected: true,
          miningActive: false
        });
        
        callback({
          success: true,
          wallet: {
            address: normalizedWallet.address,
            publicKey: normalizedWallet.publicKey,
            privateKey: normalizedWallet.privateKey,
            mnemonic: normalizedWallet.mnemonic,
            filename: data.filename
          }
        });
      } catch (error) {
        console.error('Load wallet from file error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Load wallet from private key
    socket.on('loadWalletFromPrivateKey', async (data, callback) => {
      try {
        const privateKey = data.privateKey;

        // Validate key format
        if (privateKey.length !== 64) {
          callback({ success: false, error: 'Private key must be exactly 64 characters' });
          return;
        }

        // Validate hex format
        try {
          Buffer.from(privateKey, 'hex');
        } catch (err) {
          callback({ success: false, error: 'Private key must be in hexadecimal format' });
          return;
        }

        // Use EXACT same derivation process as wallet creation
        const publicKey = DerivePublicKey(privateKey);
        const address = DeriveAddress(publicKey);

        // Validate generated address
        if (!ValidateAddress(address)) {
          callback({ success: false, error: 'Generated address failed validation' });
          return;
        }

        const wallet = new Wallet();
        wallet.privateKey = privateKey;
        wallet.publicKey = publicKey;
        wallet.address = address;
        wallet.created = new Date().toISOString();

        // Store complete wallet object directly
        walletSessions.set(socket.id, {
          wallet: wallet,
          connected: true,
          miningActive: false
        });

        callback({
          success: true,
          wallet: {
            address: wallet.address,
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey
          }
        });
      } catch (error) {
        console.error('Load wallet from private key error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Check network connection status
    socket.on('checkNetworkStatus', async (callback) => {
      try {
        const { state } = await import('./client.js');
        callback({
          success: true,
          connected: state && state.connectedToNetwork
        });
      } catch (error) {
        callback({
          success: false,
          connected: false,
          error: error.message
        });
      }
    });

    // Get wallet private info
    socket.on('getWalletPrivateInfo', async (callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session || !session.wallet) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        // Ensure we have the actual wallet data
        const wallet = session.wallet;
        
        callback({
          success: true,
          privateInfo: {
            mnemonic: wallet.mnemonic || 'Not available',
            privateKey: wallet.privateKey || 'Not available',
            publicKey: wallet.publicKey || 'Not available',
            address: wallet.address || 'Not available'
          }
        });
      } catch (error) {
        console.error('Get wallet private info error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Purchase TheeCoin (crypto payments integration)
    socket.on('purchaseTheeCoin', async (data, callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        // Import crypto module to ensure availability
        const crypto = await import('crypto');
        
        const { HandlePurchaseTheeCoin } = await import('./transactions.js');
        // This function handles the purchase flow
        const result = await HandlePurchaseTheeCoin(session.wallet);
        
        callback({ success: true, result });
      } catch (error) {
        console.error('Purchase TheeCoin error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Get encryption/decryption information
    socket.on('getEncryptionInfo', async (callback) => {
      try {
        const { ShowEncryptionInfo } = await import('./info.js');
        const info = await ShowEncryptionInfo();
        callback({ success: true, info });
      } catch (error) {
        console.error('Get encryption info error:', error);
        callback({ success: false, error: error.message || 'Failed to get encryption info' });
      }
    });

    socket.on('getDecryptionInfo', async (callback) => {
      try {
        const { ShowDecryptionInfo } = await import('./info.js');
        const info = await ShowDecryptionInfo();
        callback({ success: true, info });
      } catch (error) {
        console.error('Get decryption info error:', error);
        callback({ success: false, error: error.message || 'Failed to get decryption info' });
      }
    });

    // Get mining session info
    socket.on('getMiningInfo', async (callback) => {
      try {
        const { GetMiningSessionInfo } = await import('./mining.js');
        const miningInfo = GetMiningSessionInfo();
        callback({ success: true, info: miningInfo });
      } catch (error) {
        console.error('Get mining info error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Get current price
    socket.on('getCurrentPrice', async (callback) => {
      try {
        // Check network connection first
        const { state } = await import('./client.js');
        if (!state || !state.connectedToNetwork) {
          callback({ 
            success: true, 
            price: 0.01,
            warning: 'Not connected to network - showing default price',
            connected: false
          });
          return;
        }
        
        const price = await CalculateCurrentPriceFromNetwork();
        callback({ success: true, price, connected: true });
      } catch (error) {
        console.error('Get current price error:', error);
        callback({ 
          success: true, 
          price: 0.01,
          warning: 'Could not fetch price from network - showing default',
          connected: false
        });
      }
    });

    // Receive payment info (for displaying QR codes, etc)
    socket.on('getReceiveInfo', async (callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        callback({ 
          success: true, 
          address: session.wallet.address,
          qrData: `theecoin:${session.wallet.address}`
        });
      } catch (error) {
        console.error('Get receive info error:', error);
        callback({ success: false, error: error.message || 'Failed to get receive info' });
      }
    });

    // Chat handlers
    socket.on('initializeChat', async (data, callback) => {
      try {
        // Create a new chat instance for this socket
        const chat = new TheeCoinChat();
        
        // Enable silent mode for web interface (no console output)
        chat.silentMode = true;
        
        // Set username directly if provided (bypass terminal prompting)
        if (data && data.username) {
          chat.nodeId = data.username;
        }
        
        await chat.initialize(data && data.username ? data.username : null);
        
        // Store the chat instance
        chatInstances.set(socket.id, chat);
        
        // Set up message forwarding from chat to web client
        chat.on = chat.on || function() {}; // Ensure on method exists
        
        // Join the chat network
        chat.join();
        
        // Set up message callback to forward incoming messages to web client
        chat.messageCallback = (senderName, message) => {
          socket.emit('chatMessage', {
            sender: senderName,
            message: message
          });
        };
        
        callback({ 
          success: true, 
          nodeId: chat.nodeId,
          message: 'Chat initialized successfully' 
        });
      } catch (error) {
        console.error('Chat initialization error:', error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on('sendChatMessage', async (data, callback) => {
      try {
        const chat = chatInstances.get(socket.id);
        if (!chat) {
          callback({ success: false, error: 'Chat not initialized' });
          return;
        }

        if (!data.message || !data.username) {
          callback({ success: false, error: 'Message and username required' });
          return;
        }

        // Format message as "username: message" like the terminal version
        const formattedMessage = `${data.username}: ${data.message}`;
        
        // Broadcast the message
        chat.broadcast(formattedMessage);
        
        callback({ success: true });
      } catch (error) {
        console.error('Send chat message error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // General API request handler (shopping, staking, recovery)
    socket.on('sendAPIRequest', async (data, callback) => {
      try {
        const session = walletSessions.get(socket.id);
        if (!session || !session.wallet) {
          callback({ success: false, error: 'No wallet loaded' });
          return;
        }

        let response;
        
        // Handle different API types
        if (data.type.startsWith('api_shopping_')) {
          const { sendShoppingAPIRequest } = await import('./shopping.js');
          response = await sendShoppingAPIRequest(data.type, data.data);
        } else if (['api_stake_coins', 'api_unstake_coins', 'api_get_stakes', 'api_change_staking', 'api_unlock_coins'].includes(data.type)) {
          // Handle staking and recovery APIs through the client
          const { sendHyperswarmRequest } = await import('./client.js');
          response = await sendHyperswarmRequest(data.type, {}, data.data);
        } else {
          throw new Error(`Unknown API type: ${data.type}`);
        }
        
        callback({
          success: true,
          data: response
        });
      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });

    // Disconnect handler with enhanced error protection
    socket.on('disconnect', () => {
      try {
        // Silent disconnection handling
        
        // Clean up wallet session
        const session = walletSessions.get(socket.id);
        if (session) {
          // Stop any mining operations
          if (session.miningActive) {
            try {
              StopMiningSession(session.wallet).catch(() => {}); // Silent error handling
            } catch (error) {
              // Silent error handling - do not let this crash the terminal
            }
          }
          try {
            walletSessions.delete(socket.id);
          } catch (error) {
            // Silent error handling - protect the Map operation
          }
        }
        
        // Clean up chat instance
        const chat = chatInstances.get(socket.id);
        if (chat) {
          try {
            // Clear the message callback
            chat.messageCallback = null;
            chat.destroy();
          } catch (error) {
            // Silent error handling
          }
          try {
            chatInstances.delete(socket.id);
          } catch (error) {
            // Silent error handling - protect the Map operation
          }
        }
      } catch (error) {
        // Ultimate error protection - never crash the terminal program
        console.log('Socket disconnect cleanup error (non-fatal):', error.message);
      }
    });
  });
}

// Helper function to load wallet from mnemonic - EXACT same process as wallet creation
async function loadWalletFromMnemonic(mnemonic) {
  if (!ValidateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Use EXACT same derivation process as createWallet and createWalletWeb
  const privateKey = await MnemonicToPrivateKey(mnemonic);
  const publicKey = DerivePublicKey(privateKey);
  const address = DeriveAddress(publicKey);

  // Validate the generated address format (same as creation)
  if (!ValidateAddress(address)) {
    throw new Error('generated address failed validation');
  }

  const wallet = new Wallet();
  wallet.mnemonic = mnemonic;
  wallet.privateKey = privateKey;
  wallet.publicKey = publicKey;
  wallet.address = address;
  wallet.created = new Date().toISOString();

  return wallet;
}

export default {
  startWebInterface,
  stopWebInterface
};
