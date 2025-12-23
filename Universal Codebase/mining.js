import { formatNumber } from './types.js';
import { MINING_ADDRESS, ValidateAddress } from './addresses.js';
import { state } from './client.js';
import { SendTransactionToNetwork } from './transactions.js';
import { promptUser, formatDuration } from './wallet.js';

// Helper function to format numbers with commas while preserving all digits
function formatNumberWithCommas(num) {
  if (typeof num !== 'number' || !isFinite(num)) {
    return num;
  }
  // Convert to string to preserve all digits, then format with commas
  return num.toLocaleString('en-US', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 20,
    useGrouping: true 
  });
}

// Mining Constants
const MAX_MINABLE_SUPPLY = 50000000; // 50 million coins
const MINABLE_SUPPLY = 50000000; // Total minable supply
const TOTAL_SUPPLY = 100000000; // Total supply including non-minable coins
const MINING_BLOCK_MAX_TRANSACTIONS = 1000;
const MINING_DURATION = 86400; // 24 hours in seconds
const NETWORK_TIMEOUT = 60; // 60 seconds timeout

// Global variables for local mining (will be fetched from network)
let currentMiningRate = null; // Will be updated from network, no default fallback

// Mining session management
let activeMiningSession = null;

// MiningSession represents an active mining session
class MiningSession {
  constructor() {
    this.startTime = new Date();
    this.elapsedSeconds = 0;
    this.remainingSeconds = 0;
    this.currentRate = 0;
    this.totalMined = 0;
    this.blockIndex = 0;
    this.minerAddress = '';
    this.rewards = 0;
    this.stopChan = null;
  }
}

// MiningBlock represents a block of mining transactions
class MiningBlock {
  constructor() {
    this.index = 0;
    this.transactions = [];
    this.transactionCount = 0;
    this.minersCount = 0;
    this.type = '';
  }
}

// MiningSessionStatus represents the status of a mining session
class MiningSessionStatus {
  constructor() {
    this.status = '';
    this.blockIndex = 0;
    this.currentReward = 0;
    this.miningRate = 0;
    this.minersInBlock = 0;
    this.startTime = new Date();
  }
}

// MiningNetworkStats represents network-wide mining statistics
class MiningNetworkStats {
  constructor() {
    this.totalMined = 0;
    this.remainingSupply = 0;
    this.currentMiningRate = 0;
    this.activeMiners = 0;
    this.miningBlocks = 0;
    this.blockUtilization = 0;
  }
}

// MinerReward represents a miner's reward
class MinerReward {
  constructor() {
    this.address = '';
    this.amount = 0;
  }
}

// MiningRewardStats represents mining reward statistics
class MiningRewardStats {
  constructor() {
    this.totalDistributed = 0;
    this.minersCount = 0;
    this.averageReward = 0;
    this.yourRewards = 0;
    this.topMiners = [];
  }
}

// HandleMiningMenu displays the mining menu
export async function HandleMiningMenu(wallet) {
  // Check if we're connected to the network
  if (!state.connectedToNetwork) {
    console.log("\n❌ Error: Could not connect to any TheeCoin nodes");
    return;
  }

  while (true) {
    // Get total mined to calculate current mining rate
    let networkRate = 0;
    let totalMined = 0;

    try {
      const { sendHyperswarmRequest } = await import('./client.js');
      const statsResponse = await sendHyperswarmRequest('api_mining_stats');
      
      if (statsResponse.status === "ok") {
        totalMined = statsResponse.total_mined || 0;
        
        // Get mining rate directly from network
        const rateResponse = await sendHyperswarmRequest('api_mining_rate');
        if (rateResponse && rateResponse.status === "ok" && rateResponse.rate) {
          networkRate = rateResponse.rate;
        } else {
          console.log("\n❌ Error: Could not get mining rate from network");
          console.log("Mining requires network connection to ensure accurate rates.");
          return;
        }
      }
    } catch (err) {
      // If we can't get network stats, don't allow mining
      console.log("\n❌ Error: Could not get mining stats from network");
      console.log("Mining requires network connection to ensure accurate rates.");
      return;
    }

    // Update our local mining rate to match calculated rate
    currentMiningRate = networkRate;

    // Check if we're currently mining
    const isMining = activeMiningSession !== null;

    console.log("\n=== Mining Menu ===");
    console.log(`Current Mining Rate: ${formatNumber(networkRate, true)} TheeCoin/sec`);
    console.log(`Total Mined on Network: ${formatNumberWithCommas(totalMined)} TheeCoin`);

    if (isMining) {
      console.log("\nMining Status: ACTIVE");
    } else {
      console.log("\nMining Status: INACTIVE");
    }

    console.log("\n1. Start Mining");
    console.log("2. Stop Mining");
    console.log("3. View Mining Stats");
    console.log("4. Back to Main Menu");

    const choice = await promptUser("\nSelect option: ");

    switch (choice) {
      case "1":
        if (isMining) {
          console.log("\nAlready mining! Please stop current session first.");
        } else {
          await StartMiningSession(wallet);
        }
        break;

      case "2":
        if (isMining) {
          await StopMiningSession(wallet);
        } else {
          console.log("\nNo active mining session to stop.");
        }
        break;

      case "3":
        await DisplayMiningStats(wallet);
        break;

      case "4":
        return;

      default:
        console.log("Invalid choice. Please try again.");
    }
  }
}

// StartMiningSession starts a local mining session
async function StartMiningSession(wallet) {
  // Convert address to uppercase and validate
  const minerAddress = wallet.address.toUpperCase();

  if (!ValidateAddress(minerAddress)) {
    console.log("\nInvalid miner address format");
    return;
  }

  // Check if already mining
  if (activeMiningSession !== null) {
    console.log("\nAlready mining! Please stop current session first.");
    return;
  }

  // Check total mined supply from network via Hyperswarm
  let networkStats;
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    networkStats = await sendHyperswarmRequest('api_mining_stats');
    
    if (networkStats.status !== "ok") {
      throw new Error('Failed to get mining stats from network');
    }
  } catch (err) {
    console.log(`\nError checking mining supply: ${err.message}`);
    return;
  }

  if (networkStats.total_mined >= MAX_MINABLE_SUPPLY) {
    console.log("\nMaximum minable supply reached!");
    return;
  }

  console.log(`\nStarting mining session...\n`);

  // Get current mining rate from network first
  let networkMiningRate;
  try {
    networkMiningRate = await GetMiningRate();
    if (!networkMiningRate || networkMiningRate <= 0) {
      throw new Error('Invalid mining rate received from network');
    }
    currentMiningRate = networkMiningRate;
  } catch (err) {
    console.log(`\nError getting mining rate: ${err.message}`);
    console.log("Cannot start mining without valid rate from network");
    return;
  }

  console.log(`Mining rate: ${formatNumber(currentMiningRate, true)} TheeCoin/sec\n`);

  // Get current price from network via Hyperswarm
  let currentPrice = 0;
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const priceData = await sendHyperswarmRequest('api_wallet_price');
    
    if (priceData.status === "ok") {
      currentPrice = priceData.price || priceData.current_price || 0;
    }
    
    if (currentPrice === 0) {
      throw new Error("Invalid price received from network");
    }
  } catch (err) {
    console.log(`\nError getting current price: ${err.message}`);
    console.log("Mining requires valid price data from network.");
    return;
  }

  // Create mining session
  const session = new MiningSession();
  session.startTime = new Date();
  session.currentRate = currentMiningRate;
  session.totalMined = 0;
  session.elapsedSeconds = 0;
  session.remainingSeconds = MINING_DURATION;
  session.minerAddress = minerAddress;
  session.blockIndex = 0;
  session.lastUpdateTime = new Date(); // Track when we last updated the mining amount

  // Store the session
  activeMiningSession = session;

  // Register session with node for fault-tolerance
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    await sendHyperswarmRequest('api_mining_session_register', {
      minerAddress: session.minerAddress,
      currentRate: session.currentRate
    });
  } catch (err) {
    // Silent error - don't prevent mining from starting
  }

  console.log("✅ Mining session started locally");

  // Start monitoring for web interface (no terminal interaction needed)
  startMiningMonitoringWeb(session, wallet, currentPrice);

  console.log("Mining started! Press Enter to stop.");

  // Start terminal monitoring
  const monitoringPromise = startMiningMonitoring(session, wallet, currentPrice);

  // Wait for user input to stop
  await promptUser("");

  // Stop the session
  await StopMiningSession(wallet);
}

// Start mining monitoring
async function startMiningMonitoring(session, wallet, currentPrice) {
  return new Promise((resolve) => {
    let updateCounter = 0; // Counter for periodic node updates

    const interval = setInterval(async () => {
      if (!activeMiningSession) {
        clearInterval(interval);
        resolve();
        return;
      }

      const elapsed = Math.floor((new Date() - session.startTime) / 1000);
      session.elapsedSeconds = elapsed;
      session.remainingSeconds = MINING_DURATION - elapsed;

      // Check if mining duration is exceeded
      if (elapsed >= MINING_DURATION) {
        clearInterval(interval);
        StopMiningSession(wallet);
        resolve();
        return;
      }

      // Calculate current mining rate and price based on network state every second
      let realTimeRate = currentMiningRate;
      let realTimePrice = currentPrice;
      
      try {
        const { sendHyperswarmRequest } = await import('./client.js');
        
        // Get mining rate directly from network
        const rateResponse = await sendHyperswarmRequest('api_mining_rate');
        if (rateResponse.status === "ok" && rateResponse.rate) {
          realTimeRate = rateResponse.rate;
          currentMiningRate = realTimeRate; // Update global rate
        } else {
          // If we can't get rate from network, stop mining
          console.log('\n❌ Lost connection to mining rate - stopping session');
          StopMiningSession(wallet);
          resolve();
          return;
        }
        
        // Get current price 
        const priceResponse = await sendHyperswarmRequest('api_wallet_price');
        if (priceResponse.status === "ok" && typeof priceResponse.price === 'number') {
          realTimePrice = priceResponse.price;
          currentPrice = realTimePrice; // Update global price
        }
        
      } catch (err) {
        // Continue with existing rate/price if network request fails
        // This allows mining to continue even with temporary network issues
      }

      // Calculate incremental mining amount for real-time rate changes
      const currentTime = new Date();
      const timeSinceLastUpdate = (currentTime - session.lastUpdateTime) / 1000; // seconds
      const incrementalMining = session.currentRate * timeSinceLastUpdate;
      
      // Add to total mined amount
      session.totalMined += incrementalMining;
      
      // Update session state for next iteration
      session.currentRate = realTimeRate;
      session.lastUpdateTime = currentTime;

      // Send periodic updates to node for fault-tolerance (every 30 seconds)
      updateCounter++;
      if (updateCounter >= 30) {
        updateCounter = 0;
        try {
          const { sendHyperswarmRequest } = await import('./client.js');
          await sendHyperswarmRequest('api_mining_session_update', {
            minerAddress: session.minerAddress,
            totalMined: session.totalMined,
            currentRate: session.currentRate
          });
        } catch (err) {
          // Silent error - don't interrupt mining for network issues
        }
      }

      // Calculate daily rate and USD value using real-time network data
      const dailyRate = realTimeRate * 86400; // seconds in a day
      const valueUSD = session.totalMined * realTimePrice;

      // Clear screen and display mining progress
      console.clear();
      console.log("=== Mining Session ===");
      console.log(`Mining Rate: ${formatNumberWithCommas(dailyRate)} TheeCoin/Day`);
      console.log(`Mined: ${formatNumberWithCommas(session.totalMined)} TheeCoin`);
      console.log(`Current Value: $${valueUSD.toFixed(20).replace(/\.?0+$/, '')}`);
      console.log(`Time Remaining: ${formatDuration(MINING_DURATION - elapsed)}`);
      console.log("\nPress Enter to stop mining");
    }, 1000);
  });
}

// Start mining monitoring for web interface only (no terminal output)
async function startMiningMonitoringWeb(session, wallet, currentPrice) {
  let updateCounter = 0; // Counter for periodic node updates

  const interval = setInterval(async () => {
    if (!activeMiningSession) {
      clearInterval(interval);
      return;
    }

    const elapsed = Math.floor((new Date() - session.startTime) / 1000);
    session.elapsedSeconds = elapsed;
    session.remainingSeconds = MINING_DURATION - elapsed;

    // Check if mining duration is exceeded
    if (elapsed >= MINING_DURATION) {
      clearInterval(interval);
      StopMiningSession(wallet);
      return;
    }

    // Calculate current mining rate and price based on network state every second
    let realTimeRate = currentMiningRate;
    let realTimePrice = currentPrice;
    
    try {
      const { sendHyperswarmRequest } = await import('./client.js');
      
      // Get mining rate directly from network
      const rateResponse = await sendHyperswarmRequest('api_mining_rate');
      if (rateResponse && rateResponse.status === "ok" && rateResponse.rate) {
        realTimeRate = rateResponse.rate;
        currentMiningRate = realTimeRate; // Update global rate
      } else {
        // If we can't get rate from network, stop mining
        clearInterval(interval);
        StopMiningSession(wallet);
        return;
      }
      
      // Get current price 
      const priceResponse = await sendHyperswarmRequest('api_wallet_price');
      if (priceResponse && priceResponse.status === "ok" && typeof priceResponse.price === 'number') {
        realTimePrice = priceResponse.price;
        currentPrice = realTimePrice; // Update global price
      }
      
    } catch (err) {
      // Continue with existing rate/price if network request fails - silent failure
    }

    // Calculate incremental mining amount for real-time rate changes
    const currentTime = new Date();
    const timeSinceLastUpdate = (currentTime - session.lastUpdateTime) / 1000; // seconds
    const incrementalMining = session.currentRate * timeSinceLastUpdate;
    
    // Add to total mined amount
    session.totalMined += incrementalMining;
    
    // Update session state for next iteration
    session.currentRate = realTimeRate;
    session.lastUpdateTime = currentTime;

    // Send periodic updates to node for fault-tolerance (every 30 seconds)
    updateCounter++;
    if (updateCounter >= 30) {
      updateCounter = 0;
      try {
        const { sendHyperswarmRequest } = await import('./client.js');
        await sendHyperswarmRequest('api_mining_session_update', {
          minerAddress: session.minerAddress,
          totalMined: session.totalMined,
          currentRate: session.currentRate
        });
      } catch (err) {
        // Silent error - don't interrupt mining for network issues
      }
    }
  }, 1000);
}

// StopMiningSession stops the current mining session
async function StopMiningSession(wallet) {
  if (activeMiningSession === null) {
    return;
  }

  // Get session data before stopping
  const minerAddress = activeMiningSession.minerAddress;
  const totalMined = activeMiningSession.totalMined;

  // Notify node that session is complete for fault-tolerance
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    await sendHyperswarmRequest('api_mining_session_complete', {
      minerAddress: minerAddress
    });
  } catch (err) {
    // Silent error - continue with normal mining transaction
  }

  console.log("✅ Mining session ended locally");

  // Clear the session
  activeMiningSession = null;

  // Get the client and node from the wallet state
  let client = state.hyperswarmClient;
  let nodeAddress = state.activeNode;

  if (!client || !nodeAddress) {
    console.log("\nError: No active node connection");
    return;
  }

  console.log("\nStopping mining session and submitting final mining transaction...");

  // Create a mining transaction
  const tx = {
    SENDER: MINING_ADDRESS,
    RECIPIENT: minerAddress,
    AMOUNT: totalMined,
    TYPE: "MINED",
    TIMESTAMP: new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }),
    SIGNATURE: "MINING_ADDRESS"
  };

  // Send the transaction to the network
  try {
    await SendTransactionToNetwork(tx);

    console.log(`\nMining session completed. Total mined: ${totalMined} TheeCoin`);
    console.log("Transaction successful!");
  } catch (err) {
    console.log(`\nError submitting mining transaction: ${err.message}`);
    console.log(`\nMining session completed. Total mined: ${totalMined} TheeCoin`);
  }

  await promptUser("Press Enter to continue...");
}

// StopMiningSessionWeb stops the current mining session for web interface (no terminal prompt)
async function StopMiningSessionWeb(wallet) {
  if (activeMiningSession === null) {
    return { success: false, message: "No active mining session" };
  }

  // Get session data before stopping
  const minerAddress = activeMiningSession.minerAddress;
  const totalMined = activeMiningSession.totalMined;

  // Notify node that session is complete for fault-tolerance
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    await sendHyperswarmRequest('api_mining_session_complete', {
      minerAddress: minerAddress
    });
  } catch (err) {
    // Silent error - continue with normal mining transaction
  }

  // Clear the session
  activeMiningSession = null;

  // Get the client and node from the wallet state
  let client = state.hyperswarmClient;
  let nodeAddress = state.activeNode;

  if (!client || !nodeAddress) {
    return { success: false, message: "No active node connection" };
  }

  // Create a mining transaction
  const tx = {
    SENDER: MINING_ADDRESS,
    RECIPIENT: minerAddress,
    AMOUNT: totalMined,
    TYPE: "MINED",
    TIMESTAMP: new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }),
    SIGNATURE: "MINING_ADDRESS"
  };

  // Send the transaction to the network silently (no console output)
  try {
    await SendTransactionToNetwork(tx, true);
    return { 
      success: true, 
      message: "Mining session completed successfully",
      totalMined: totalMined,
      transactionSubmitted: true
    };
  } catch (err) {
    return { 
      success: true, 
      message: "Mining session completed with transaction error",
      totalMined: totalMined,
      transactionSubmitted: false,
      error: err.message
    };
  }
}

// DisplayMiningStats displays mining statistics
async function DisplayMiningStats(wallet) {
  if (!state.connectedToNetwork) {
    console.log("Error: Not connected to network");
    return;
  }

  const minerAddress = wallet.address.toUpperCase();

  // Get mining stats from network via Hyperswarm
  let statsResponse;
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    statsResponse = await sendHyperswarmRequest('api_mining_stats', { address: minerAddress });
    
    if (statsResponse.status !== "ok") {
      throw new Error('Failed to get mining stats from network');
    }
  } catch (err) {
    console.log(`Error getting mining stats: ${err.message}`);
    return;
  }

  // Get current price via Hyperswarm
  let price = 0;
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const priceData = await sendHyperswarmRequest('api_wallet_price');
    
    if (priceData.status === "ok") {
      price = priceData.price || priceData.current_price || 0;
    }
    
    if (price === 0) {
      throw new Error("Invalid price received from network");
    }
  } catch (err) {
    console.log(`Error getting current price: ${err.message}`);
    return;
  }

  // Get network stats via Hyperswarm
  let networkStats;
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    networkStats = await sendHyperswarmRequest('api_mining_stats');
    
    if (networkStats.status !== "ok") {
      throw new Error('Failed to get network mining stats');
    }

  } catch (err) {
    console.log(`Error getting network stats: ${err.message}`);
    return;
  }

  // Calculate values - use the actual current mining rate from network
  const actualMiningRate = statsResponse.current_rate || statsResponse.current_mining_rate || currentMiningRate || 0;
  const dailyRate = actualMiningRate * 86400; // Convert from TheeCoin/sec to TheeCoin/Day
  const totalValue = (statsResponse.total_mined || 0) * price;
  let networkShare = 0;
  if (networkStats.total_mined > 0) {
    networkShare = ((statsResponse.total_mined || 0) / networkStats.total_mined) * 100;
  }

  // Check if there's an active mining session
  const isLocallyMining = activeMiningSession !== null;
  let sessionEarnings = 0;
  let sessionDuration = 0;
  let remainingTime = 0;

  if (isLocallyMining) {
    sessionEarnings = activeMiningSession.totalMined;
    sessionDuration = activeMiningSession.elapsedSeconds;
    remainingTime = activeMiningSession.remainingSeconds;
  }

  // Display mining statistics
  console.log("\n=== Mining Statistics ===");

  // Display current mining rate
  console.log(`Current Mining Rate: ${formatNumber(dailyRate, true)} TheeCoin/Day`);

  // Display active session info if mining
  if (isLocallyMining) {
    const sessionValue = sessionEarnings * price;

    console.log("\n--- Active Session ---");
    console.log(`Session Mined: ${formatNumberWithCommas(sessionEarnings)} TheeCoin/$${sessionValue.toFixed(20).replace(/\.?0+$/, '')}`);
    console.log(`Session Duration: ${formatDuration(sessionDuration)}`);
    console.log(`Time Remaining: ${formatDuration(remainingTime)}`);
  } else if (statsResponse.is_mining) {
    // Mining on network but not locally
    console.log("\n--- Active Network Session ---");
    console.log(`Mining on another device: ${formatNumber(statsResponse.total_mined || 0, true)} TheeCoin mined`);
    console.log(`Mining Time: ${formatDuration(statsResponse.mining_time || 0)}`);
  } else {
    console.log("\nNo active mining session.");
  }

  // Display lifetime earnings
  console.log("\n--- Earnings Summary ---");
  console.log(`Your Total Mined: ${formatNumberWithCommas(statsResponse.total_mined || 0)} TheeCoin/$${totalValue.toFixed(20).replace(/\.?0+$/, '')}`);
  console.log(`Network Share: ${networkShare.toFixed(2)}%`);

  // Show network statistics
  console.log("\n--- Network Status ---");
  console.log(`Active Miners: ${formatNumberWithCommas(networkStats.active_miners || 0)}`);
  console.log(`Total Mined: ${formatNumberWithCommas(networkStats.total_mined || 0)} TheeCoin`);
  console.log(`Remaining Supply: ${formatNumber(networkStats.remaining_supply || 0, true)} TheeCoin`);
  console.log(`Mining Blocks: ${networkStats.mining_blocks || 0}`);
  console.log(`Block Utilization: ${((networkStats.block_utilization || 0) * 100).toFixed(1)}%`);

  // Wait for user input before returning
  await promptUser("\nPress Enter to continue...");
}

// Helper functions

// GetMiningRate gets the current mining rate from the network
async function GetMiningRate() {
  if (!state.connectedToNetwork) {
    throw new Error('Not connected to network');
  }

  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const response = await sendHyperswarmRequest('api_mining_rate');
    
    if (response.status !== "ok") {
      throw new Error('Failed to get mining rate from network');
    }

    return response.rate || 0;
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }
}

// GetCurrentPrice gets the current price from the network
async function GetCurrentPrice() {
  if (!state.connectedToNetwork) {
    throw new Error('Not connected to network');
  }

  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const response = await sendHyperswarmRequest('api_wallet_price');
    
    if (response.status !== "ok") {
      throw new Error('Failed to get price from network');
    }

    return response.price || response.current_price || 0;
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }
}

// InitializeMining initializes the mining system
async function InitializeMining(client, nodeAddress) {
  // Get current mining rate from network
  const rate = await GetMiningRate();
  currentMiningRate = rate;

  // Get current price from network
  const price = await GetCurrentPrice();
  // Price would be stored globally if needed

  return Promise.resolve();
}

// CheckMiningStatus checks if mining is currently active
function CheckMiningStatus() {
  return activeMiningSession !== null;
}

// GetMiningStats gets mining statistics for display
async function GetMiningStats(minerAddress) {
  if (!state.connectedToNetwork) {
    throw new Error('not connected to network');
  }

  // Get mining stats from network via Hyperswarm
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const response = await sendHyperswarmRequest('api_mining_stats', { address: minerAddress });
    
    if (response.status !== "ok") {
      throw new Error('error: failed to get mining stats from network');
    }

    return response;
  } catch (err) {
    throw new Error(`error getting mining stats: ${err.message}`);
  }
}

// UpdateMiningRate updates the current mining rate from the network
async function UpdateMiningRate(client, nodeAddress) {
  const rate = await GetMiningRate(client, nodeAddress);
  currentMiningRate = rate;
  return rate;
}

// CalculateMiningReward calculates the mining reward for a given duration
function CalculateMiningReward(duration) {
  return currentMiningRate * duration;
}

// CalculateMiningValue calculates the value of mined coins
function CalculateMiningValue(amount, price = 0.01) {
  return amount * price;
}

// GetMiningSessionInfo gets information about the current mining session
function GetMiningSessionInfo() {
  if (activeMiningSession === null) {
    return {
      active: false,
      hashRate: 0,
      earnings: 0,
      blocksFound: 0,
      timeRunning: 0
    };
  }

  const currentTime = new Date();
  const timeRunning = Math.floor((currentTime - activeMiningSession.startTime) / 1000);
  
  return {
    active: true,
    startTime: activeMiningSession.startTime,
    elapsedSeconds: activeMiningSession.elapsedSeconds,
    remainingSeconds: activeMiningSession.remainingSeconds,
    currentRate: activeMiningSession.currentRate,
    totalMined: activeMiningSession.totalMined,
    minerAddress: activeMiningSession.minerAddress,
    hashRate: activeMiningSession.currentRate || 0,
    earnings: activeMiningSession.totalMined || 0,
    blocksFound: activeMiningSession.blockIndex || 0,
    timeRunning: timeRunning
  };
}

// StartMiningSessionWeb starts a mining session for web interface only (no terminal input)
async function StartMiningSessionWeb(wallet) {
  // Convert address to uppercase and validate
  const minerAddress = wallet.address.toUpperCase();

  if (!ValidateAddress(minerAddress)) {
    throw new Error("Invalid miner address format");
  }

  // Check if already mining
  if (activeMiningSession !== null) {
    throw new Error("Already mining! Please stop current session first.");
  }

  // Check total mined supply from network via Hyperswarm
  let networkStats;
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    networkStats = await sendHyperswarmRequest('api_mining_stats');
    
    if (!networkStats || networkStats.status !== "ok") {
      throw new Error('Failed to get mining stats from network');
    }
  } catch (err) {
    throw new Error(`Error checking mining supply: ${err.message}`);
  }

  if (networkStats.total_mined >= MAX_MINABLE_SUPPLY) {
    throw new Error("Maximum minable supply reached!");
  }

  // Get current price from network via Hyperswarm
  let currentPrice = 0;
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const priceData = await sendHyperswarmRequest('api_wallet_price');
    
    if (priceData.status === "ok") {
      currentPrice = priceData.price || priceData.current_price || 0;
    }
    
    if (currentPrice === 0) {
      throw new Error("Invalid price received from network");
    }
  } catch (err) {
    throw new Error(`Error getting current price: ${err.message}`);
  }

  // Create mining session
  const session = new MiningSession();
  session.startTime = new Date();
  session.currentRate = currentMiningRate;
  session.totalMined = 0;
  session.elapsedSeconds = 0;
  session.remainingSeconds = MINING_DURATION;
  session.minerAddress = minerAddress;
  session.blockIndex = 0;
  session.lastUpdateTime = new Date();

  // Store the session
  activeMiningSession = session;

  // Register session with node for fault-tolerance
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    await sendHyperswarmRequest('api_mining_session_register', {
      minerAddress: session.minerAddress,
      currentRate: session.currentRate
    });
  } catch (err) {
    // Silent error - don't prevent mining from starting
  }

  // Start web monitoring only - ensure it starts immediately
  setTimeout(() => startMiningMonitoringWeb(session, wallet, currentPrice), 100);

  return { success: true, message: "Mining session started" };
}

export {
  MAX_MINABLE_SUPPLY,
  MINABLE_SUPPLY,
  TOTAL_SUPPLY,
  MINING_BLOCK_MAX_TRANSACTIONS,
  MINING_DURATION,
  NETWORK_TIMEOUT,
  MiningSession,
  MiningBlock,
  MiningSessionStatus,
  MiningNetworkStats,
  MinerReward,
  MiningRewardStats,
  GetMiningRate,
  GetCurrentPrice,
  InitializeMining,
  CheckMiningStatus,
  GetMiningStats,
  UpdateMiningRate,
  CalculateMiningReward,
  CalculateMiningValue,
  GetMiningSessionInfo,
  StartMiningSession,
  StartMiningSessionWeb,
  StopMiningSession,
  StopMiningSessionWeb
};

export default {
  MAX_MINABLE_SUPPLY,
  MINABLE_SUPPLY,
  TOTAL_SUPPLY,
  MINING_BLOCK_MAX_TRANSACTIONS,
  MINING_DURATION,
  NETWORK_TIMEOUT,
  MiningSession,
  MiningBlock,
  MiningSessionStatus,
  MiningNetworkStats,
  MinerReward,
  MiningRewardStats,
  HandleMiningMenu,
  GetMiningRate,
  GetCurrentPrice,
  InitializeMining,
  CheckMiningStatus,
  GetMiningStats,
  UpdateMiningRate,
  CalculateMiningReward,
  CalculateMiningValue,
  GetMiningSessionInfo,
  StartMiningSession,
  StartMiningSessionWeb,
  StopMiningSession
};
