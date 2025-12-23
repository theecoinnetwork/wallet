import crypto from 'crypto';
import { formatNumber } from './types.js';
import { state, CalculateCurrentPriceFromNetwork, GetWalletDetails } from './client.js';

import { createWallet, loadWallet, handleViewPrivateKey, handleExportWallet, promptUser } from './wallet.js';
import { ShowEncryptionInfo, ShowDecryptionInfo } from './info.js';
import { DisplayTransactionHistory, HandleReceivePayment, HandleSendTransaction, HandlePurchaseTheeCoin } from './transactions.js';
import { HandleMiningMenu } from './mining.js';
import TheeCoinChat from './chat.js';
import { startWebInterface, stopWebInterface } from './web-interface.js';
import { HandleShoppingMenu } from './shopping.js';

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

// monitorNetworkConnection keeps checking network connectivity and tries to reconnect
function monitorNetworkConnection() {
  const checkInterval = 30 * 1000; // 30 seconds
  
  // Track if we've shown the connection message
  let connectionMessageShown = false;
  // Track if we were previously connected
  let wasConnected = false;

  // Check initial connection state
  wasConnected = state.connectedToNetwork;
  if (wasConnected) {
    connectionMessageShown = true;
  }

  setInterval(async () => {
    // Check if we have an active connection
    const currentlyConnected = state.connectedToNetwork;
    
    // If we were connected but now we're not, show disconnection message
    if (wasConnected && !currentlyConnected) {
      console.log('\nDisconnected from network\n');
      connectionMessageShown = false; // Reset so we can show connection message again
    }
    
    // If we're not connected but now we are, show connection message
    if (!wasConnected && currentlyConnected) {
      if (!connectionMessageShown) {
        console.log('\nSuccessfully connected to TheeCoin Network\n');
        connectionMessageShown = true;
      }
    }
    
    // Connection monitoring only - nodes discovered via Hyperswarm
    if (!currentlyConnected) {
      // Hyperswarm will handle automatic node discovery
    } else {
      // Check if current connection is still responsive
      try {
        // Simple ping test by trying to get current price
        await CalculateCurrentPriceFromNetwork();
      } catch (err) {
        // Connection test failed, but hyperswarm will handle reconnection automatically
      }
    }
    
    // Update connection state for next check
    wasConnected = currentlyConnected;
  }, checkInterval);
}

// RunWallet displays the main wallet interface
export async function RunWallet() {
  // Nodes will be discovered automatically via Hyperswarm

  // Set up a background connection monitor
  monitorNetworkConnection();

  // Initialize price from network
  CalculateCurrentPriceFromNetwork().catch(() => {
    // Ignore errors during initialization
  });

  console.log("\n\x1b[1m\x1b[97mTheeCoin Wallet Main Menu\x1b[0m");
  console.log("=========================");

  while (true) {
    // Check connection status and display
    let connectionStatus = "❌ Not Connected";
    if (state && state.connectedToNetwork) {
      connectionStatus = `✅ Connected to TheeCoin Network`;
      if (state.activeNode) {
        connectionStatus += ` via ${state.activeNode}`;
      }
    }

    console.log("1. Create New Wallet");
    console.log("2. Load Existing Wallet");
    console.log("3. Open Chat Interface");
    console.log("4. Encryption Information");
    console.log("5. Decryption Information");
    console.log("6. Exit");

    const choice = await promptUser("\nSelect option: ");

    switch (choice) {
      case "1":
        try {
          const wallet = await createWallet();
          await WalletMenu(wallet);
        } catch (err) {
          console.log(`Error creating wallet: ${err.message}`);
        }
        break;
      case "2":
        try {
          const wallet = await loadWallet("");
          await WalletMenu(wallet);
        } catch (err) {
          console.log(`Error loading wallet: ${err.message}`);
        }
        break;
      case "3":
        try {
          console.log("\nOpening TheeCoin Chat Interface in new window...");
          const { spawn } = await import('child_process');
          const path = await import('path');
          const { fileURLToPath } = await import('url');
          
          const __filename = fileURLToPath(import.meta.url);
          const __dirname = path.dirname(__filename);
          
          // Create a chat launcher script
          const chatScript = path.join(__dirname, 'chat-launcher.js');
          
          // Determine the appropriate terminal command based on OS
          let terminal, args;
          if (process.platform === 'darwin') { // macOS
            terminal = 'osascript';
            args = ['-e', `tell application "Terminal" to do script "cd '${__dirname}' && node chat-launcher.js"`];
          } else if (process.platform === 'win32') { // Windows
            terminal = 'cmd';
            args = ['/c', 'start', 'cmd', '/k', `cd /d "${__dirname}" && node chat-launcher.js`];
          } else { // Linux
            terminal = 'gnome-terminal';
            args = ['--', 'bash', '-c', `cd "${__dirname}" && node chat-launcher.js; exec bash`];
          }
          
          spawn(terminal, args, { detached: true, stdio: 'ignore' });
          console.log("Chat interface opened in new terminal window.");
        } catch (err) {
          console.log(`Error opening chat interface: ${err.message}`);
          console.log("Falling back to in-terminal chat...");
          try {
            const chat = new TheeCoinChat();
            await chat.initialize();
            setTimeout(() => {
              chat.join();
            }, 1000);
          } catch (fallbackErr) {
            console.log(`Error starting fallback chat: ${fallbackErr.message}`);
          }
        }
        break;
      case "4":
        ShowEncryptionInfo();
        await promptUser("\nPress Enter to continue...");
        break;
      case "5":
        ShowDecryptionInfo();
        await promptUser("\nPress Enter to continue...");
        break;
      case "6":
        // Clean shutdown
        return;
      default:
        console.log("Invalid choice. Please try again.");
    }
  }
}

// Wallet menu system
async function WalletMenu(wallet) {
  // Check if we're connected to the network
  if (!state.connectedToNetwork) {
    console.log("Error: Not connected to TheeCoin network. Please wait for connection...");
    
    // Wait for connection with timeout
    const connectionTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (!state.connectedToNetwork && (Date.now() - startTime) < connectionTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (!state.connectedToNetwork) {
      console.log("Error: Could not connect to TheeCoin network");
      return;
    }
  }

  // Track the last price to detect changes
  let lastPrice = 0;
  try {
    lastPrice = await CalculateCurrentPriceFromNetwork();
  } catch (err) {
    lastPrice = 0.01; // Default price
  }

  while (true) {
    // Check for price changes at the beginning of each loop
    try {
      const currentPrice = await CalculateCurrentPriceFromNetwork();
      if (currentPrice !== lastPrice && lastPrice > 0) {
        const priceChange = ((currentPrice - lastPrice) / lastPrice) * 100;
        console.log(`\nPrice Update: $${formatNumber(currentPrice, true)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)\n`);
        lastPrice = currentPrice;
      } else if (lastPrice === 0) {
        lastPrice = currentPrice;
      }
    } catch (err) {
      // Ignore price update errors
    }

    let details;
    try {
      details = await GetWalletDetails(wallet.address);
    } catch (err) {
      console.log(`Error getting wallet details: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }

    console.log("\n=== Wallet Status ===");
    if (wallet.mnemonic) {
      console.log("Recovery Phrase Available: Yes");
    }
    console.log(`Address: ${details.address}`);

    // Handle special case for infinity
    if (details.balance === Infinity) {
      console.log("Balance: UNLIMITED TheeCoin");
    } else {
      console.log(`Balance: ${formatNumberWithCommas(details.balance)} TheeCoin`);
    }

    console.log(`Frozen: ${formatNumberWithCommas(details.frozenBalance)} TheeCoin`);

    if (details.spendableBalance === Infinity) {
      console.log("Available: UNLIMITED TheeCoin");
    } else {
      console.log(`Available: ${formatNumberWithCommas(details.spendableBalance)} TheeCoin`);
    }

    if (details.valueUSD === Infinity) {
      console.log("Value: UNLIMITED");
    } else {
      const formattedValue = details.valueUSD.toFixed(20).replace(/\.?0+$/, '');
      console.log(`Value: $${formatNumberWithCommas(parseFloat(formattedValue))}`);
    }

    console.log(`Current Price: $${formatNumber(details.currentPrice, true)}`);
    if (!details.priceChanging) {
      // Price changing indicator could be shown here
    }

    console.log("\nTransaction History:");
    console.log(`Total Sent: ${formatNumberWithCommas(details.totalSent)} TheeCoin`);
    console.log(`Total Received: ${formatNumberWithCommas(details.totalReceived)} TheeCoin`);
    
    // Get total mined directly from network (mining_blocks folder)
    let totalMined = 0;
    try {
      const { GetTotalMinedFromNetwork } = await import('./client.js');
      totalMined = await GetTotalMinedFromNetwork(wallet.address);
    } catch (err) {
      // Fallback: Calculate from transaction history
      try {
        const { GetTransactionHistoryFromNetwork, GetTransactionAmount } = await import('./transactions.js');
        const transactions = await GetTransactionHistoryFromNetwork(wallet.address, 1000000000);

        for (const tx of transactions) {
          if (tx.TYPE === "MINED" && tx.RECIPIENT === wallet.address) {
            const amount = GetTransactionAmount(tx.AMOUNT);
            totalMined += amount;
          }
        }
      } catch (err2) {
        // Ignore errors, show 0
      }
    }
    
    console.log(`Total Mined: ${formatNumberWithCommas(totalMined)} TheeCoin`);
    console.log(`Transaction Count: ${formatNumberWithCommas(details.transactionCount)}`);
    console.log("===================\n");

    console.log("Wallet Menu:");
    
    // Check if this is the genesis address to show unique menu
    const { GENESIS_ADDRESS } = await import('./addresses.js');
    if (wallet.address === GENESIS_ADDRESS) {
        console.log("1. View Transactions");
        console.log("2. Send TheeCoin");
        console.log("3. TheeCoin Shopping");
        console.log("4. Open Chat Interface");
        console.log("5. View Private Info");
        console.log("6. Export Wallet");
        console.log("7. Close Wallet");
        console.log("8. Exit App");
    } else {
        console.log("1. View Transactions");
        console.log("2. Send TheeCoin");
        console.log("3. Receive Payment");
        console.log("4. Purchase TheeCoin");
        console.log("5. Stake Coins");
        console.log("6. Unstake Coins");
        console.log("7. Open Mining Menu");
        console.log("8. TheeCoin Shopping");
        console.log("9. Open Chat Interface");
        console.log("10. View Private Info");
        console.log("11. Export Wallet");
        console.log("12. Close Wallet");
        console.log("13. Exit App");
    }

    const choice = await promptUser("\nChoose an option: ");
    const isGenesis = wallet.address === GENESIS_ADDRESS;

    if (isGenesis) {
      // Genesis Address Menu (8 options)
      switch (choice) {
        case "1":
          await DisplayTransactionHistory(wallet);
          break;
        case "2":
          await HandleSendTransaction(wallet);
          break;
        case "3":
          await HandleShoppingMenu(wallet);
          break;
        case "4":
          await HandleChatInterface();
          break;
        case "5":
          await handleViewPrivateKey(wallet);
          break;
        case "6":
          await handleExportWallet(wallet);
          break;
        case "7":
          return; // Close Wallet
        case "8":
          return; // Exit App
        default:
          console.log("Invalid choice. Please try again.");
      }
    } else {
      // Regular Wallet Menu (13 options)
      switch (choice) {
        case "1":
          await DisplayTransactionHistory(wallet);
          break;
        case "2":
          await HandleSendTransaction(wallet);
          break;
        case "3":
          await HandleReceivePayment(wallet);
          break;
        case "4":
          await HandlePurchaseTheeCoin(wallet);
          break;
        case "5":
          await HandleStakeCoins(wallet);
          break;
        case "6":
          await HandleUnstakeCoins(wallet);
          break;
        case "7":
          await HandleMiningMenu(wallet);
          break;
        case "8":
          await HandleShoppingMenu(wallet);
          break;
        case "9":
          await HandleChatInterface();
          break;
        case "10":
          await handleViewPrivateKey(wallet);
          break;
        case "11":
          await handleExportWallet(wallet);
          break;
        case "12":
          return; // Close Wallet
        case "13":
          return; // Exit App
        default:
          console.log("Invalid choice. Please try again.");
      }
    }
  }
}

// Chat interface handler
async function HandleChatInterface() {
  try {
    console.log("\nOpening TheeCoin Chat Interface in new window...");
    const { spawn } = await import('child_process');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // Determine the appropriate terminal command based on OS
    let terminal, args;
    if (process.platform === 'darwin') { // macOS
      terminal = 'osascript';
      args = ['-e', `tell application "Terminal" to do script "cd '${__dirname}' && node chat-launcher.js"`];
    } else if (process.platform === 'win32') { // Windows
      terminal = 'cmd';
      args = ['/c', 'start', 'cmd', '/k', `cd /d "${__dirname}" && node chat-launcher.js`];
    } else { // Linux
      terminal = 'gnome-terminal';
      args = ['--', 'bash', '-c', `cd "${__dirname}" && node chat-launcher.js; exec bash`];
    }
    
    spawn(terminal, args, { detached: true, stdio: 'ignore' });
    console.log("Chat interface opened in new terminal window.");
  } catch (err) {
    console.log(`Error opening chat interface: ${err.message}`);
    console.log("Falling back to in-terminal chat...");
    try {
      const { TheeCoinChat } = await import('./chat.js');
      const chat = new TheeCoinChat();
      await chat.initialize();
      setTimeout(() => {
        chat.join();
      }, 1000);
    } catch (fallbackErr) {
      console.log(`Error starting fallback chat: ${fallbackErr.message}`);
    }
  }
}

// Staking functionality
async function HandleStakeCoins(wallet) {
  console.log("\n=== Stake TheeCoin ===");
  console.log("Choose your staking period:");
  console.log("1. 1 week   (2.08% reward)");
  console.log("2. 2 weeks  (4.16% reward)");
  console.log("3. 1 month  (8.33% reward)");
  console.log("4. 3 months (25% reward)");
  console.log("5. 6 months (50% reward)");
  console.log("6. 1 year   (100% reward)");
  console.log("7. Cancel");
  
  const periodChoice = await promptUser("\nSelect staking period: ");
  
  const stakingPeriods = {
    "1": { duration: 7 * 24 * 60 * 60 * 1000, reward: 2.08, name: "1 week" },
    "2": { duration: 14 * 24 * 60 * 60 * 1000, reward: 4.16, name: "2 weeks" },
    "3": { duration: 30 * 24 * 60 * 60 * 1000, reward: 8.33, name: "1 month" },
    "4": { duration: 90 * 24 * 60 * 60 * 1000, reward: 25, name: "3 months" },
    "5": { duration: 180 * 24 * 60 * 60 * 1000, reward: 50, name: "6 months" },
    "6": { duration: 365 * 24 * 60 * 60 * 1000, reward: 100, name: "1 year" }
  };
  
  if (periodChoice === "7") {
    console.log("Staking cancelled.");
    return;
  }
  
  const period = stakingPeriods[periodChoice];
  if (!period) {
    console.log("Invalid choice.");
    return;
  }
  
  const amount = await promptUser(`\nEnter amount to stake for ${period.name}: `);
  const stakeAmount = parseFloat(amount);
  
  if (isNaN(stakeAmount) || stakeAmount <= 0) {
    console.log("Invalid amount.");
    return;
  }
  
  console.log(`\nStaking Summary:`);
  console.log(`Amount: ${stakeAmount} TheeCoin`);
  console.log(`Period: ${period.name}`);
  console.log(`Reward: ${period.reward}% (${(stakeAmount * period.reward / 100).toFixed(8)} TheeCoin)`);
  console.log(`Total return: ${(stakeAmount + (stakeAmount * period.reward / 100)).toFixed(8)} TheeCoin`);
  
  const confirm = await promptUser("\nConfirm staking? (yes/no): ");
  if (confirm.toLowerCase() !== 'yes') {
    console.log("Staking cancelled.");
    return;
  }
  
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const response = await sendHyperswarmRequest('api_stake_coins', {}, {
      walletAddress: wallet.address,
      amount: stakeAmount,
      duration: period.duration,
      rewardPercentage: period.reward
    });
    
    if (response.status === 'ok') {
      console.log(`\n✅ Successfully staked ${stakeAmount} TheeCoin for ${period.name}!`);
      console.log(`Unlock date: ${new Date(Date.now() + period.duration).toLocaleString()}`);
    } else {
      console.log(`\n❌ Staking failed: ${response.message}`);
    }
  } catch (error) {
    console.log(`\n❌ Error staking coins: ${error.message}`);
  }
}

// Unstaking functionality
async function HandleUnstakeCoins(wallet) {
  console.log("\n=== Unstake TheeCoin ===");
  console.log("Loading your staked coins...");
  
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const response = await sendHyperswarmRequest('api_get_stakes', {}, {
      walletAddress: wallet.address
    });
    
    if (response.status !== 'ok' || !response.stakes || response.stakes.length === 0) {
      console.log("You have no staked coins.");
      return;
    }
    
    console.log("\nYour staked coins:");
    response.stakes.forEach((stake, index) => {
      const unlockDate = new Date(stake.unlockTime);
      const isUnlocked = Date.now() >= stake.unlockTime;
      const status = isUnlocked ? "✅ UNLOCKED" : "🔒 LOCKED";
      
      console.log(`${index + 1}. ${stake.amount} TheeCoin - ${stake.period} - ${status}`);
      console.log(`   Staked: ${new Date(stake.stakeTime).toLocaleString()}`);
      console.log(`   Unlock: ${unlockDate.toLocaleString()}`);
      console.log(`   Reward: ${stake.rewardPercentage}% (${(stake.amount * stake.rewardPercentage / 100).toFixed(8)} TheeCoin)`);
      console.log('');
    });
    
    const choice = await promptUser("Select stake to unstake (number) or 'cancel': ");
    
    if (choice.toLowerCase() === 'cancel') {
      return;
    }
    
    const stakeIndex = parseInt(choice) - 1;
    if (isNaN(stakeIndex) || stakeIndex < 0 || stakeIndex >= response.stakes.length) {
      console.log("Invalid selection.");
      return;
    }
    
    const selectedStake = response.stakes[stakeIndex];
    const isUnlocked = Date.now() >= selectedStake.unlockTime;
    
    if (isUnlocked) {
      // Normal unstaking for unlocked stakes
      const totalReturn = selectedStake.amount + (selectedStake.amount * selectedStake.rewardPercentage / 100);
      console.log(`\nUnstaking ${selectedStake.amount} TheeCoin + ${(selectedStake.amount * selectedStake.rewardPercentage / 100).toFixed(8)} reward = ${totalReturn.toFixed(8)} total`);
      
      const confirm = await promptUser("Confirm unstaking? (yes/no): ");
      if (confirm.toLowerCase() !== 'yes') {
        console.log("Unstaking cancelled.");
        return;
      }
      
      const unstakeResponse = await sendHyperswarmRequest('api_unstake_coins', {}, {
        walletAddress: wallet.address,
        stakeId: selectedStake.id
      });
      
      if (unstakeResponse.status === 'ok') {
        console.log(`\n✅ Successfully unstaked! Received ${totalReturn.toFixed(8)} TheeCoin.`);
      } else {
        console.log(`\n❌ Unstaking failed: ${unstakeResponse.message}`);
      }
    } else {
      // Locked stake - provide options
      console.log(`\nThis stake is still locked until ${new Date(selectedStake.unlockTime).toLocaleString()}`);
      console.log("Available options:");
      console.log("1. Change Staking - Modify the staking period");
      console.log("2. Unlock TheeCoin - Unlock early with time-based rewards");
      console.log("3. Cancel - Go back to stake list");
      
      const action = await promptUser("Select option (1-3): ");
      
      if (action === '1') {
        await handleChangeStaking(wallet, selectedStake);
        return;
      } else if (action === '2') {
        await handleUnlockCoins(wallet, selectedStake);
        return;
      } else {
        console.log("Cancelled.");
        return;
      }
    }
    
  } catch (error) {
    console.log(`\n❌ Error loading stakes: ${error.message}`);
  }
}

// Handle changing staking period
async function handleChangeStaking(wallet, stake) {
  console.log("\n=== Change Staking Period ===");
  console.log(`Current: ${stake.period} (${stake.rewardPercentage}% reward)`);
  
  const stakingPeriods = [
    { name: "1 week", duration: 604800000, reward: 2.08 },
    { name: "2 weeks", duration: 1209600000, reward: 4.16 },
    { name: "1 month", duration: 2592000000, reward: 8.33 },
    { name: "3 months", duration: 7776000000, reward: 25 },
    { name: "6 months", duration: 15552000000, reward: 50 },
    { name: "1 year", duration: 31536000000, reward: 100 }
  ];
  
  console.log("\nAvailable staking periods:");
  stakingPeriods.forEach((period, index) => {
    const current = period.name === stake.period ? " (CURRENT)" : "";
    console.log(`${index + 1}. ${period.name} - ${period.reward}% reward${current}`);
  });
  
  const choice = await promptUser("Select new staking period (number) or 'cancel': ");
  
  if (choice.toLowerCase() === 'cancel') {
    return;
  }
  
  const periodIndex = parseInt(choice) - 1;
  if (isNaN(periodIndex) || periodIndex < 0 || periodIndex >= stakingPeriods.length) {
    console.log("Invalid selection.");
    return;
  }
  
  const newPeriod = stakingPeriods[periodIndex];
  
  if (newPeriod.name === stake.period) {
    console.log("You've selected the same period that's already set.");
    return;
  }
  
  console.log(`\nChanging staking period to: ${newPeriod.name} (${newPeriod.reward}% reward)`);
  const confirm = await promptUser("Confirm change? (yes/no): ");
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log("Change cancelled.");
    return;
  }
  
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const response = await sendHyperswarmRequest('api_change_staking', {}, {
      walletAddress: wallet.address,
      stakeId: stake.id,
      newDuration: newPeriod.duration,
      newRewardPercentage: newPeriod.reward
    });
    
    if (response.status === 'ok') {
      console.log(`✅ Staking period changed to ${newPeriod.name}!`);
    } else if (response.status === 'past_period') {
      console.log(`\n⚠️ ${response.message}`);
      const accept = await promptUser(`Accept the ${response.newPeriod} reward and receive coins immediately? (yes/no): `);
      
      if (accept.toLowerCase() === 'yes') {
        // This will trigger early completion logic on the server
        console.log("Processing early completion...");
      } else {
        console.log("Change cancelled.");
      }
    } else {
      console.log(`❌ Failed to change staking period: ${response.message}`);
    }
    
  } catch (err) {
    console.log(`Error changing staking period: ${err.message}`);
  }
}

// Handle early unlocking of coins
async function handleUnlockCoins(wallet, stake) {
  console.log("\n=== Unlock TheeCoin Early ===");
  
  const timeStaked = Date.now() - stake.stakeTime;
  const daysStaked = Math.floor(timeStaked / (24 * 60 * 60 * 1000));
  
  console.log(`Amount staked: ${stake.amount} TheeCoin`);
  console.log(`Time staked: ${daysStaked} days`);
  console.log(`Original period: ${stake.period} (${stake.rewardPercentage}% reward)`);
  
  // Calculate what reward they would get based on time staked
  let earnedReward = 0;
  if (daysStaked >= 365) earnedReward = 100;
  else if (daysStaked >= 180) earnedReward = 50;
  else if (daysStaked >= 90) earnedReward = 25;
  else if (daysStaked >= 30) earnedReward = 8.33;
  else if (daysStaked >= 14) earnedReward = 4.16;
  else if (daysStaked >= 7) earnedReward = 2.08;
  
  if (earnedReward > 0) {
    const rewardAmount = stake.amount * (earnedReward / 100);
    console.log(`\nYou will receive:`);
    console.log(`- Original: ${stake.amount} TheeCoin`);
    console.log(`- Reward: ${rewardAmount.toFixed(8)} TheeCoin (${earnedReward}% for ${daysStaked} days)`);
    console.log(`- Total: ${(stake.amount + rewardAmount).toFixed(8)} TheeCoin`);
  } else {
    console.log(`\n⚠️ WARNING: You have not staked for a full week yet.`);
    console.log(`You will only receive your original ${stake.amount} TheeCoin with NO rewards.`);
  }
  
  const confirm = await promptUser("\nAre you sure you want to unlock your TheeCoin early? (yes/no): ");
  
  if (confirm.toLowerCase() !== 'yes') {
    console.log("Unlock cancelled.");
    return;
  }
  
  try {
    const { sendHyperswarmRequest } = await import('./client.js');
    const response = await sendHyperswarmRequest('api_unlock_coins', {}, {
      walletAddress: wallet.address,
      stakeId: stake.id
    });
    
    if (response.status === 'ok') {
      console.log(`\n✅ Successfully unlocked ${response.originalAmount} TheeCoin!`);
      if (response.rewardAmount > 0) {
        console.log(`💰 Earned reward: ${response.rewardAmount.toFixed(8)} TheeCoin (${response.earnedRewardPercentage}%)`);
        console.log(`📊 Total received: ${response.totalAmount.toFixed(8)} TheeCoin`);
      } else {
        console.log(`⚠️ No rewards earned (staked for ${response.timeStaked} days)`);
      }
    } else {
      console.log(`❌ Failed to unlock coins: ${response.message}`);
    }
    
  } catch (err) {
    console.log(`Error unlocking coins: ${err.message}`);
  }
}

export { WalletMenu };

export default {
  RunWallet,
  WalletMenu,
  monitorNetworkConnection
};
