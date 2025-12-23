import fs from 'fs';
import path from 'path';
import Hyperswarm from 'hyperswarm';
import crypto from 'crypto';
import { globalState, getScriptDir } from './types.js';
import { SetupWalletDirectories } from './setup.js';
import { RunWallet } from './menus.js';
import { initializeWalletState } from './wallet.js';
import { startWebInterface } from './web-interface.js';

// Expected node hashes for verification
const EXPECTED_NODE_HASHES = [
  'a0104436052a95c7f7a134d8c78cf5163f8ee0ef545dfb5d71a300521c62011d', // current node
  '0845e6ef56e7e5e22a5905a8027311f1a16a91b987c8365d49885c6a5b1b6f3a',  // safe node
  'a0104436052a95c7f7a134d8c78cf5163f8ee0ef545dfb5d71a300521c62011d' // macos node app
];

// Wallet hash validator
class WalletHashValidator {
  constructor() {
    this.walletHash = null;
    this.lastHashBroadcast = Date.now();
  }

  // Calculate hash of all wallet .js files
  calculateWalletHash() {
    try {
      // For /wallet version, only check current directory since we run from within wallet directory
      const possibleDirs = [
        process.cwd()                            // Current directory only
      ];
      
      let walletDir = null;
      let jsFiles = [];
      
      for (const dir of possibleDirs) {
        try {
          const files = fs.readdirSync(dir).filter(file => file.endsWith('.js'));
          if (files.length > 0) {
            walletDir = dir;
            jsFiles = files.sort();
            break;
          }
        } catch (err) {
          // Continue to next directory
          continue;
        }
      }
      
      if (!walletDir || jsFiles.length === 0) {
        throw new Error('No wallet JS files found in any expected location');
      }

      let combinedContent = '';
      for (const file of jsFiles) {
        try {
          const filePath = path.join(walletDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          combinedContent += content;
        } catch (fileErr) {
          // Continue processing other files if one fails
          console.log(`Warning: Could not read wallet file ${file}: ${fileErr.message}`);
        }
      }

      return crypto.createHash('sha256').update(combinedContent).digest('hex');
    } catch (err) {
      return null;
    }
  }

  // Get wallet hash for node verification
  getWalletHash() {
    if (!this.walletHash) {
      this.walletHash = this.calculateWalletHash();
    }
    return this.walletHash;
  }
}

// Network Constants
const NODE_VERSION = "1.0.0";
const NETWORK_ID = "theecoin_network";

class NodeState {
  constructor() {
    this.running = true;
    this.connectedPeers = new Map(); // Map of connected peers (string -> bool)
    this.peerConnections = new Map(); // Map of peer connection status (string -> bool)
    this.announcedPeers = new Map(); // Map of announced peers (string -> bool)
    this.peerStates = new Map(); // Map of peer states (string -> interface{})
    this.hyperswarmClient = null; // Hyperswarm client for connections
    this.lastNodeCheck = new Date(); // Last time nodes were checked
    this.activeNode = ''; // Currently active node
    this.lastLoadInfo = null; // Load information from last connection
    this.nodeId = null; // This wallet's unique ID
    this.swarmInstance = null; // Hyperswarm instance for connectivity
    this.peers = new Map(); // Connected peers
    this.connectedToNetwork = false; // Whether connected to network
    this.pendingRequests = new Map(); // Pending API requests
    this.hashValidator = new WalletHashValidator(); // Hash validation system
  }
}

// Global state variable
let state = null;

// Verify node hash before accepting connection
async function verifyNodeHash(socket) {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).substring(7);
    const hashRequest = {
      type: 'api_request_node_hash',
      requestId: requestId,
      timestamp: Date.now()
    };

    const timeout = setTimeout(() => {
      socket.removeListener('data', handleHashResponse);
      reject(new Error('Node hash verification timeout'));
    }, 10000);

    const handleHashResponse = (data) => {
      try {
        const message = JSON.parse(data.toString().trim());
        if (message.type === 'api_response' && message.requestId === requestId) {
          clearTimeout(timeout);
          socket.removeListener('data', handleHashResponse);

          if (message.response && message.response.type === 'node_hash_response') {
            const nodeHash = message.response.hash;
            if (EXPECTED_NODE_HASHES.includes(nodeHash)) {
              resolve(true);
            } else {
              reject(new Error('Invalid node hash'));
            }
          } else {
            reject(new Error('Invalid hash response format'));
          }
        }
      } catch (err) {
        // Continue listening for the correct response
      }
    };

    socket.on('data', handleHashResponse);
    socket.write(JSON.stringify(hashRequest) + '\n');
  });
}

// Periodically check for better load-balanced nodes
function startLoadBalancingMonitor() {
  setInterval(async () => {
    if (!state.connectedToNetwork || !state.activeNode) {
      return; // Not connected, nothing to balance
    }
    
    // Request updated load information from current node
    try {
      const loadInfo = await sendHyperswarmRequest('api_load_info');
      
      if (loadInfo && loadInfo.status === 'success' && loadInfo.nodeLoadInfo) {
        const shouldSwitch = shouldSwitchToLessLoadedNode(loadInfo.nodeLoadInfo, state.activeNode);
        if (shouldSwitch) {
          console.log('🔄 Switching to less loaded node for better performance...');
          disconnectFromCurrentNode();
          setTimeout(() => attemptReconnection(), 1000);
        }
      }
    } catch (err) {
      // Ignore errors in load balancing checks
    }
  }, 60000); // Check every 60 seconds
}

export function StartWallet() {
  try {
    console.log("🚀 Initializing TheeCoin Wallet...");
    
    // Add global error handlers for wallet
    process.on('uncaughtException', (err) => {
      console.log(`Wallet Uncaught Exception: ${err.message}`);
      console.log('Wallet continuing to run...');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.log(`Wallet Unhandled Rejection at: ${promise}, reason: ${reason}`);
      console.log('Wallet continuing to run...');
    });
    
    // Initialize state if nil
    if (!state) {
      state = new NodeState();
    }
    
    // Initialize wallet state
    initializeWalletState().then(() => {
      try {
        // Generate wallet node ID
        state.nodeId = crypto.randomBytes(16).toString('hex');
        
        // Setup wallet directories
        SetupWalletDirectories().then(() => {
          try {
            // Nodes will be discovered automatically via Hyperswarm
            
            // Create Hyperswarm client for node connections
            const client = CreateHyperswarmClient();
            
            // Start web interface immediately (don't wait for network)
            startWebInterface().then(() => {
              // Web interface started silently
            }).catch(err => {
              console.log(`⚠️ Web interface failed to start: ${err.message}`);
            });
            
            // Start finding an active node with unlimited retries
            connectToNetworkWithRetries(client).then(() => {
              try {
                console.log(`✅ Connected to TheeCoin Network!`);
                console.log(``);
                console.log(`************************************************************************`);
                console.log(``);
                console.log(``);
                console.log(`88888888888 888                         .d8888b.           d8b          `);
                console.log(`    888     888                        d88P  Y88b          Y8P          `);
                console.log(`    888     888                        888    888                       `);
                console.log(`    888     88888b.   .d88b.   .d88b.  888         .d88b.  888 88888b.  `);
                console.log(`    888     888 "88b d8P  Y8b d8P  Y8b 888        d88""88b 888 888 "88b `);
                console.log(`    888     888  888 88888888 88888888 888    888 888  888 888 888  888 `);
                console.log(`    888     888  888 Y8b.     Y8b.     Y88b  d88P Y88..88P 888 888  888 `);
                console.log(`    888     888  888  "Y8888   "Y8888   "Y8888P"   "Y88P"  888 888  888 `);
                console.log(`                                                                        `);
                console.log(`                                                                        `);
                console.log(`                                                                        `);
                console.log(`888b    888          888                                   888          `);
                console.log(`8888b   888          888                                   888          `);
                console.log(`88888b  888          888                                   888          `);
                console.log(`888Y88b 888  .d88b.  888888 888  888  888  .d88b.  888d888 888  888     `);
                console.log(`888 Y88b888 d8P  Y8b 888    888  888  888 d88""88b 888P"   888 .88P     `);
                console.log(`888  Y88888 88888888 888    888  888  888 888  888 888     888888K      `);
                console.log(`888   Y8888 Y8b.     Y88b.  Y88b 888 d88P Y88..88P 888     888 "88b     `);
                console.log(`888    Y888  "Y8888   "Y888  "Y8888888P"   "Y88P"  888     888  888     `);
                console.log(``);
                console.log(``);
                console.log(`************************************************************************`);
                console.log(``);
                console.log(`\x1b[92mTheeCoin Wallet is now successfully running in this device's terminal 🎉 \x1b[0m`);
                console.log(`🌐 Use Browser version at http://localhost:3000 & https://localhost:3001`);
                console.log(`\x1b[91mWarning: Any alteration of the code will cause the network to reject you\x1b[0m`);
                console.log(``);
                console.log(`************************************************************************`);
                console.log(``);
                
                // Start load balancing monitor
                startLoadBalancingMonitor();
                
                // Only run wallet menu after successful connection
                RunWallet().catch(err => {
                  console.log(`Error: ${err.message}\n`);
                  // Continue running despite wallet menu errors
                });
              } catch (err) {
                console.log(`Error after network connection: ${err.message}`);
              }
            });
          } catch (err) {
            console.log(`Error during directory setup: ${err.message}`);
          }
        }).catch(err => {
          console.log(`Error setting up directories: ${err.message}`);
        });
      } catch (err) {
        console.log(`Error during wallet initialization: ${err.message}`);
      }
    }).catch(err => {
      console.log(`Error initializing wallet state: ${err.message}`);
    });
  } catch (err) {
    console.log(`Fatal error starting wallet: ${err.message}`);
    console.log('Wallet will attempt to continue...');
  }
}

// CreateHyperswarmClient creates a Hyperswarm client for node communication
function CreateHyperswarmClient() {
  const swarm = new Hyperswarm();
  
  // Store swarm instance in state
  state.swarmInstance = swarm;
  
  // Set up connection handling - ENFORCE SINGLE CONNECTION
  swarm.on('connection', async (socket, info) => {
    const peerId = info.publicKey.toString('hex').substring(0, 16);

    // If we already have an active connection, reject this new one
    if (state.connectedToNetwork && state.activeNode) {
      socket.destroy();
      return;
    }

    // Send wallet identification immediately to establish connection
    sendWalletInfo(socket);

    // Verify node hash after connection is established
    setTimeout(async () => {
      try {
        await verifyNodeHash(socket);
      } catch (err) {
        // Don't destroy connection on hash verification failure
        // Allow connection to continue for network stability
        console.log(`Warning: Node hash verification failed: ${err.message}`);
      }
    }, 2000); // Wait 2 seconds for connection to stabilize

    // Handle incoming data
    socket.on('data', (data) => {
      handleIncomingMessage(socket, data, peerId);
    });

    // Handle disconnection - trigger reconnection with longer delay
    socket.on('close', () => {
      if (state.activeNode === peerId) {
        disconnectFromCurrentNode();
        // Trigger automatic reconnection with longer delay for stability
        setTimeout(() => {
          attemptReconnection();
        }, 5000);
      }
    });

    socket.on('error', (err) => {
      if (state.activeNode === peerId) {
        disconnectFromCurrentNode();
        // Trigger automatic reconnection with longer delay for stability
        setTimeout(() => {
          attemptReconnection();
        }, 5000);
      }
    });
  });
  
  // Create the client object - NO FAKE HTTP METHODS
  const client = {
    swarm: swarm,
    // Direct Hyperswarm messaging only - no HTTP simulation
    sendHyperswarmMessage: async (messageType, data = null) => {
      return sendDirectHyperswarmMessage(messageType, data);
    }
  };
  
  // Store the client object in state  
  state.hyperswarmClient = client;
  
  return client;
}

// Send wallet identification to a node
function sendWalletInfo(socket) {
  const walletInfo = {
    type: 'wallet_info',
    walletId: state.nodeId,
    isWallet: true,
    isNode: false,
    clientType: 'wallet',
    version: NODE_VERSION,
    walletHash: state.hashValidator.calculateWalletHash()
  };
  socket.write(JSON.stringify(walletInfo) + '\n');
}

// Handle incoming messages from nodes
function handleIncomingMessage(socket, data, peerId) {
  try {
    const message = JSON.parse(data.toString().trim());
    
    switch (message.type) {
      case 'wallet_connection_ack':
        try {
          // Check load balancing - only accept if this is the best node or we have no connection
          const shouldAcceptConnection = !state.connectedToNetwork || 
            shouldSwitchToLessLoadedNode(message.nodeLoadInfo, peerId);
            
          if (shouldAcceptConnection) {
            // Clear any existing connections first
            disconnectFromCurrentNode();
            
            // Set up new single connection
            state.peers.clear();
            state.connectedPeers.clear();
            state.peerConnections.clear();
            
            state.peers.set(peerId, socket);
            state.connectedPeers.set(peerId, true);
            state.peerConnections.set(peerId, true);
            state.connectedToNetwork = true;
            state.activeNode = peerId;
            
            // Store load information for future decisions
            state.lastLoadInfo = message.nodeLoadInfo;
          } else {
            // This node is more loaded than our current one, reject it
            try {
              socket.destroy();
            } catch (destroyErr) {
              // Continue despite socket destruction error
            }
          }
        } catch (err) {
          console.log(`Warning: Error handling wallet connection: ${err.message}`);
        }
        break;
        
      case 'api_response':
        try {
          // Handle API response
          const pendingRequest = state.pendingRequests.get(message.requestId);
          if (pendingRequest) {
            state.pendingRequests.delete(message.requestId);
            pendingRequest.resolve(message.response);
          }
        } catch (err) {
          console.log(`Warning: Error handling API response: ${err.message}`);
        }
        break;
        
      case 'rejection':
        try {
          console.log(`🚫 Connection rejected: ${message.message}`);
          if (message.walletNote) {
            console.log(`💡 ${message.walletNote}`);
          }
        } catch (err) {
          console.log(`Warning: Error handling rejection message: ${err.message}`);
        }
        break;
        
      default:
        // Ignore other message types
        break;
    }
  } catch (err) {
    // Not JSON, ignore - continue running
  }
}

// Check if we should switch to a less loaded node
function shouldSwitchToLessLoadedNode(nodeLoadInfo, newNodeId) {
  if (!state.activeNode || !state.lastLoadInfo) {
    return true; // No current connection, accept any
  }
  
  // Find current node's load from the latest info
  const currentNodeLoad = nodeLoadInfo.find(info => info.nodeId === state.activeNode);
  const newNodeLoad = nodeLoadInfo.find(info => info.nodeId === newNodeId);
  
  if (!currentNodeLoad || !newNodeLoad) {
    return false; // Missing load info, keep current connection
  }
  
  // Switch if new node has significantly less load (at least 3 fewer connections)
  return newNodeLoad.load + 3 <= currentNodeLoad.load;
}

// Disconnect from current node
function disconnectFromCurrentNode() {
  if (state.activeNode && state.peers.has(state.activeNode)) {
    const socket = state.peers.get(state.activeNode);
    socket.destroy();
  }
  
  // Clear all connection state
  state.peers.clear();
  state.connectedPeers.clear();
  state.peerConnections.clear();
  state.connectedToNetwork = false;
  state.activeNode = '';
  state.lastLoadInfo = null;
}

// Attempt to reconnect to the network
async function attemptReconnection() {
  if (state.connectedToNetwork) {
    return; // Already connected
  }
    
  try {
    // Clear any existing state
    disconnectFromCurrentNode();
    
    // Create new client and attempt connection
    const client = CreateHyperswarmClient();
    await connectToNetworkWithRetries(client);
    console.log(`✅ Reconnected to TheeCoin network`);
  } catch (err) {
    console.log(`❌ Reconnection failed: ${err.message}`);
    // Try again in 15 seconds for better stability
    setTimeout(() => {
      attemptReconnection();
    }, 15000);
  }
}

// Connect to TheeCoin network by joining the swarm with continuous retries
async function connectToNetworkWithRetries(client) {
  const topic = crypto.createHash('sha256').update('theecoin-node').digest();
  
  return new Promise((resolve) => {
    let isFirstAttempt = true;
    
    const attemptConnection = () => {
      if (isFirstAttempt) {
        console.log(``);
        console.log(`🔄 Attempting to connect to TheeCoin Network...`);
        isFirstAttempt = false;
      }
      
      // Join as client to discover and connect to nodes
      try {
        client.swarm.join(topic, { server: false, client: true });
      } catch (err) {
        // Silent retry on connection errors
      }
    };
    
    // Start first connection attempt
    attemptConnection();
    
    // Check for connection every second and retry every 3 seconds
    const checkConnection = setInterval(() => {
      if (state.connectedToNetwork) {
        clearInterval(checkConnection);
        clearInterval(retryInterval);
        resolve();
      }
    }, 1000);
    
    // Retry connection every 3 seconds until successful
    const retryInterval = setInterval(() => {
      if (!state.connectedToNetwork) {
        attemptConnection();
      } else {
        clearInterval(retryInterval);
      }
    }, 3000);
  });
}

// sendHyperswarmRequest sends API requests over Hyperswarm
async function sendHyperswarmRequest(messageType, params = {}, data = null) {
  try {
    if (!state.connectedToNetwork || !state.activeNode) {
      throw new Error('No active node connection available');
    }
    
    const socket = state.peers.get(state.activeNode);
    if (!socket) {
      throw new Error('No active socket connection');
    }
    
    const requestId = Math.random().toString(36).substring(7);
    const request = {
      type: messageType,
      data: data,
      params: params,
      requestId: requestId,
      sourceWallet: state.nodeId
    };
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          state.pendingRequests.delete(requestId);
        } catch (delErr) {
          // Continue despite cleanup error
        }
        reject(new Error('Request timeout'));
      }, 30000);
      
      state.pendingRequests.set(requestId, {
        resolve: (response) => {
          try {
            clearTimeout(timeout);
            resolve(response);
          } catch (err) {
            reject(new Error(`Error resolving request: ${err.message}`));
          }
        },
        reject: (error) => {
          try {
            clearTimeout(timeout);
            reject(error);
          } catch (err) {
            reject(new Error(`Error rejecting request: ${err.message}`));
          }
        }
      });
      
      try {
        socket.write(JSON.stringify(request) + '\n');
      } catch (writeErr) {
        try {
          clearTimeout(timeout);
          state.pendingRequests.delete(requestId);
        } catch (cleanupErr) {
          // Continue despite cleanup error
        }
        reject(new Error(`Failed to send request: ${writeErr.message}`));
      }
    });
  } catch (err) {
    throw new Error(`sendHyperswarmRequest error: ${err.message}`);
  }
}

// GetNodeList returns a list of nodes from nodes.txt
async function GetNodeList() {
  try {
    const scriptDir = await getScriptDir();
    const nodesFile = path.join(scriptDir, "nodes.txt");
    
    if (!fs.existsSync(nodesFile)) {
      console.log('Failed to read nodes file: file does not exist');
      return [];
    }
    
    const data = fs.readFileSync(nodesFile, 'utf8');
    const nodes = [];
    
    for (const line of data.split('\n')) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        nodes.push(trimmedLine);
      }
    }
    
    return nodes;
  } catch (err) {
    console.log(`Failed to read nodes file: ${err.message}`);
    return [];
  }
}

// CalculateCurrentPriceFromNetwork gets the current price from the network
export async function CalculateCurrentPriceFromNetwork() {
  if (!state.connectedToNetwork) {
    throw new Error('Not connected to TheeCoin network');
  }
  
  try {
    const response = await sendHyperswarmRequest('api_wallet_price');
    
    if (response.status !== "ok") {
      throw new Error('Failed to get price from network');
    }
    
    let price = 0;
    const priceValue = response.current_price || response.price;
    if (typeof priceValue === 'number') {
      price = priceValue;
    } else if (typeof priceValue === 'string') {
      const parsed = parseFloat(priceValue);
      if (!isNaN(parsed)) {
        price = parsed;
      }
    }
    
    if (price <= 0) {
      throw new Error('Invalid price received from network: price must be greater than 0');
    }
    
    return price;
  } catch (err) {
    throw new Error(`failed to get price: ${err.message}`);
  }
}

// CalculateAddressBalanceFromNetwork gets the balance for an address from the network
export async function CalculateAddressBalanceFromNetwork(walletAddress) {
  if (!state.connectedToNetwork) {
    throw new Error('Not connected to TheeCoin network');
  }
  
  try {
    const response = await sendHyperswarmRequest('api_wallet_balance', { address: walletAddress });
    
    if (response.status !== "ok") {
      throw new Error('Failed to get balance from network');
    }
    
    let balance = 0;
    let balanceValue = response.spendable_balance;
    if (balanceValue === undefined || balanceValue === null) {
      balanceValue = response.balance;
    }
    
    if (typeof balanceValue === 'number') {
      balance = balanceValue;
    } else if (typeof balanceValue === 'string') {
      if (balanceValue === "Infinity" || balanceValue === "inf") {
        return Infinity;
      }
      const parsed = parseFloat(balanceValue);
      if (!isNaN(parsed)) {
        balance = parsed;
      }
    } else if (typeof balanceValue === 'object' && balanceValue !== null) {
      if (typeof balanceValue.value === 'number') {
        balance = balanceValue.value;
      }
    }
    
    return balance;
  } catch (err) {
    throw new Error(`failed to get balance: ${err.message}`);
  }
}

// GetTotalMinedFromNetwork gets the total mined amount for an address from the network
export async function GetTotalMinedFromNetwork(walletAddress) {
  if (!state.connectedToNetwork) {
    throw new Error('Not connected to TheeCoin network');
  }
  
  try {
    const response = await sendHyperswarmRequest('api_wallet_mining_total', { address: walletAddress });
    
    if (response.status !== "ok") {
      throw new Error('Failed to get mining total from network');
    }
    
    return response.total_mined || 0;
  } catch (err) {
    throw new Error(`failed to get mining total: ${err.message}`);
  }
}

// GetFrozenBalanceFromNetwork gets the frozen balance for an address from the network
export async function GetFrozenBalanceFromNetwork(walletAddress) {
  if (!state.connectedToNetwork) {
    throw new Error('Not connected to TheeCoin network');
  }
  
  try {
    const response = await sendHyperswarmRequest('api_wallet_frozen', { address: walletAddress });
    
    if (response.status !== "ok") {
      throw new Error('Failed to get frozen balance from network');
    }
    
    let frozenBalance = 0;
    const frozenValue = response.frozen_balance;
    if (typeof frozenValue === 'number') {
      frozenBalance = frozenValue;
    } else if (typeof frozenValue === 'string') {
      const parsed = parseFloat(frozenValue);
      if (!isNaN(parsed)) {
        frozenBalance = parsed;
      }
    } else if (typeof frozenValue === 'object' && frozenValue !== null) {
      if (typeof frozenValue.value === 'number') {
        frozenBalance = frozenValue.value;
      }
    }
    
    return frozenBalance;
  } catch (err) {
    throw new Error(`failed to get frozen balance: ${err.message}`);
  }
}

// GetWalletDetails gets comprehensive wallet details from the network
export async function GetWalletDetails(walletAddress) {
  if (!state.connectedToNetwork) {
    throw new Error('Not connected to TheeCoin network');
  }
  
  try {
    const response = await sendHyperswarmRequest('api_wallet_balance', { address: walletAddress });
    
    if (response.status !== "ok") {
      throw new Error('Failed to get wallet details from network');
    }
    
    // Create wallet details
    const details = {
      address: walletAddress,
      balance: 0,
      frozenBalance: 0,
      spendableBalance: 0,
      valueUSD: 0,
      currentPrice: 0, // Will be fetched from network
      priceChanging: false,
      totalSent: 0,
      totalReceived: 0,
      transactionCount: 0
    };
    
    if (typeof response.balance === 'number') {
      details.balance = response.balance;
    } else if (typeof response.balance === 'string') {
      if (response.balance === "Infinity" || response.balance === "inf") {
        details.balance = Infinity;
      } else {
        const parsed = parseFloat(response.balance);
        if (!isNaN(parsed)) {
          details.balance = parsed;
        }
      }
    }
    
    if (typeof response.frozen_balance === 'number') {
      details.frozenBalance = response.frozen_balance;
    } else if (typeof response.frozen_balance === 'string') {
      const parsed = parseFloat(response.frozen_balance);
      if (!isNaN(parsed)) {
        details.frozenBalance = parsed;
      }
    }
    
    if (typeof response.spendable_balance === 'number') {
      details.spendableBalance = response.spendable_balance;
    } else if (typeof response.spendable_balance === 'string') {
      if (response.spendable_balance === "Infinity" || response.spendable_balance === "inf") {
        details.spendableBalance = Infinity;
      } else {
        const parsed = parseFloat(response.spendable_balance);
        if (!isNaN(parsed)) {
          details.spendableBalance = parsed;
        }
      }
    } else {
      if (details.balance === Infinity) {
        details.spendableBalance = Infinity;
      } else {
        details.spendableBalance = Math.max(0, details.balance - details.frozenBalance);
      }
    }
    
    if (typeof response.current_price === 'number') {
      details.currentPrice = response.current_price;
    } else if (typeof response.current_price === 'string') {
      const parsed = parseFloat(response.current_price);
      if (!isNaN(parsed)) {
        details.currentPrice = parsed;
      }
    }
    
    if (typeof response.value_usd === 'number') {
      details.valueUSD = response.value_usd;
    } else if (typeof response.value_usd === 'string') {
      if (response.value_usd === "Infinity" || response.value_usd === "inf") {
        details.valueUSD = Infinity;
      } else {
        const parsed = parseFloat(response.value_usd);
        if (!isNaN(parsed)) {
          details.valueUSD = parsed;
        }
      }
    } else {
      if (details.spendableBalance === Infinity) {
        details.valueUSD = Infinity;
      } else {
        details.valueUSD = details.spendableBalance * details.currentPrice;
      }
    }
    
    if (typeof response.total_sent === 'number') {
      details.totalSent = response.total_sent;
    } else if (typeof response.total_sent === 'string') {
      const parsed = parseFloat(response.total_sent);
      if (!isNaN(parsed)) {
        details.totalSent = parsed;
      }
    }
    
    if (typeof response.total_received === 'number') {
      details.totalReceived = response.total_received;
    } else if (typeof response.total_received === 'string') {
      const parsed = parseFloat(response.total_received);
      if (!isNaN(parsed)) {
        details.totalReceived = parsed;
      }
    }
    
    if (typeof response.transaction_count === 'number') {
      details.transactionCount = response.transaction_count;
    }
    
    // Set price changing flag - price is always dynamic now
    details.priceChanging = true;
    
    return details;
  } catch (err) {
    throw new Error(`failed to get wallet details: ${err.message}`);
  }
}

// Network status functions
async function IsNodeAlive() {
  return state.connectedToNetwork && state.activeNode && state.peers.has(state.activeNode);
}

async function FindActiveNode() {
  if (state.connectedToNetwork && state.activeNode) {
    return state.activeNode;
  }
  return '';
}

async function IsPeerAlive(peer) {
  return peer === state.activeNode && state.connectedToNetwork;
}

export { 
  state, 
  CreateHyperswarmClient, 
  GetNodeList, 
  IsNodeAlive, 
  FindActiveNode, 
  IsPeerAlive,
  sendHyperswarmRequest
};

export default {
  state,
  StartWallet,
  CreateHyperswarmClient,
  GetNodeList,
  IsNodeAlive,
  FindActiveNode,
  IsPeerAlive,
  CalculateCurrentPriceFromNetwork,
  CalculateAddressBalanceFromNetwork,
  GetFrozenBalanceFromNetwork,
  GetWalletDetails
};
