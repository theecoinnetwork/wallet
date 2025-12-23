import crypto from 'crypto';
import { formatNumber, Transaction } from './types.js';
import {
  GENESIS_ADDRESS,
  MINING_ADDRESS,
  SELLING_ADDRESS,
  STAKING_ADDRESS,
  STIMULUS_ADDRESS,
  CHARITY_ADDRESS,
  REWARDS_ADDRESS,
  PRIVATE_ADDRESS,
  SPECIAL_ADDRESS_PUBLIC_KEYS,
  ValidateAddress,
  DerivePublicKey,
  DeriveAddress
} from './addresses.js';
import { state } from './client.js';
import { promptUser } from './wallet.js';
import { cryptoPayments } from './crypto-payments.js';

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

// Transaction types mapping
const TRANSACTION_TYPES = {
  "GENESIS": "Initial supply distribution",
  "TRANSFER": "Normal coin transfer between wallets",
  "MINED": "Mining rewards from time-based mining",
  "PURCHASED": "Coin purchase transactions",
  "STIMULUS": "Economic stimulus payments",
  "CHARITY": "Charitable distributions",
  "REWARD": "Special rewards and bonuses",
  "STAKED": "Stakeholder rewards and incentives",
  "PRIVATE": "Private transactions",
  "FROZEN": "Frozen coins",
  "UNFROZEN": "Unfrozen coins"
};

// CreateTransaction creates a transaction with proper validation and signing
export function CreateTransaction(wallet, recipient, amount, txType) {
  // Validate recipient address
  if (!ValidateAddress(recipient)) {
    throw new Error('invalid recipient address');
  }

  // Validate amount
  if (amount <= 0) {
    throw new Error('invalid amount');
  }

  // Validate transaction type
  const validTypes = new Set([
    "GENESIS", "TRANSFER", "MINED", "PURCHASED", "STAKED", "UNSTAKED",
    "FROZEN", "UNFROZEN", "STIMULUS", "CHARITY", "REWARD"
  ]);

  if (!validTypes.has(txType)) {
    throw new Error(`invalid transaction type: ${txType}`);
  }

  // Create transaction
  const tx = new Transaction();
  tx.SENDER = wallet.address;
  tx.RECIPIENT = recipient;
  tx.AMOUNT = amount;
  tx.TYPE = txType;
  tx.TIMESTAMP = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  // Handle special address signatures
  const specialAddresses = {
    [GENESIS_ADDRESS]: "GENESIS_ADDRESS",
    [MINING_ADDRESS]: "MINING_ADDRESS",
    [STAKING_ADDRESS]: "STAKING_ADDRESS",
    [SELLING_ADDRESS]: "SELLING_ADDRESS",
    [STIMULUS_ADDRESS]: "STIMULUS_ADDRESS",
    [CHARITY_ADDRESS]: "CHARITY_ADDRESS",
    [REWARDS_ADDRESS]: "REWARDS_ADDRESS",
    [PRIVATE_ADDRESS]: "PRIVATE_ADDRESS"
  };

  if (specialAddresses[wallet.address]) {
    // SECURITY: Validate that this wallet actually owns the special address
    // Check if the wallet's public key matches the expected public key for this special address
    const expectedPublicKey = SPECIAL_ADDRESS_PUBLIC_KEYS[wallet.address];
    if (!expectedPublicKey) {
      throw new Error(`Special address ${wallet.address} not found in authorized list`);
    }

    if (wallet.publicKey !== expectedPublicKey) {
      throw new Error(`SECURITY VIOLATION: Wallet public key does not match expected public key for special address ${wallet.address}`);
    }

    // Special addresses MUST use their exact fixed signatures - NO EXCEPTIONS
    tx.SIGNATURE = specialAddresses[wallet.address];

    // SECURITY: Add cryptographic proof for special addresses
    // This ensures only the real holder of the private key can create transactions
    const challenge = `${tx.SENDER}_${tx.RECIPIENT}_${tx.AMOUNT}_${tx.TIMESTAMP}_${Date.now()}_${Math.random()}`;
    const proofMessage = `special_tx_${challenge}`;
    const combinedData = proofMessage + wallet.privateKey;
    const cryptoSignature = crypto.createHash('sha256').update(combinedData).digest('hex');

    tx.CRYPTO_PROOF = {
      challenge: challenge,
      signature: cryptoSignature
    };

    return tx;
  }

  // Create signature message for non-special addresses
  const message = `${tx.SENDER}${tx.RECIPIENT}${tx.AMOUNT}${tx.TIMESTAMP}${tx.TYPE}`;

  // Sign the message with private key for better security
  const combinedData = message + wallet.privateKey;
  const hash = crypto.createHash('sha256').update(combinedData).digest('hex');

  // Ensure exactly 49 characters
  tx.SIGNATURE = hash.substring(0, 49);
  return tx;
}

// Get transaction amount as float64
export function GetTransactionAmount(amount) {
  if (typeof amount === 'number') {
    return amount;
  }
  if (typeof amount === 'string') {
    if (amount === "GENESIS_ACCOUNT") {
      return Infinity; // For genesis account
    }
    const parsed = parseFloat(amount);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  if (typeof amount === 'object' && amount !== null) {
    // Try to extract a numeric value from the object
    if (typeof amount.value === 'number') {
      return amount.value;
    }
  }
  return 0;
}

// GetTransactionHistoryFromNetwork gets transaction history for an address from the network via HYPERSWARM
export async function GetTransactionHistoryFromNetwork(walletAddress, limit) {
  if (!state.connectedToNetwork) {
    throw new Error('not connected to network');
  }

  try {
    // Import the sendHyperswarmRequest function
    const { sendHyperswarmRequest } = await import('./client.js');
    
    const response = await sendHyperswarmRequest('api_wallet_transactions', { 
      address: walletAddress, 
      limit: limit 
    });
        
    if (response.status !== 'ok') {
      const errorMsg = response.error || response.message || 'No error details provided';
      throw new Error(`NODE PROCESSING FAILED: ${errorMsg}`);
    }
    
    return response.transactions || [];
  } catch (err) {
    throw new Error(`failed to get transaction history via Hyperswarm: ${err.message}`);
  }
}

// DisplayTransactionHistory shows transaction history from the network
export async function DisplayTransactionHistory(wallet) {
  // Get the existing client and node
  let client = state.hyperswarmClient;
  let activeNode = state.activeNode;

  // Check if we need to reconnect
  if (!client || !activeNode) {
    console.log("\n❌ Error: Could not connect to any TheeCoin nodes");
    return;
  }

  try {
    const transactions = await GetTransactionHistoryFromNetwork(wallet.address, 1000000000);

    // Sort transactions by timestamp with proper error handling
    transactions.sort((a, b) => {
      // Safely get timestamp a
      let timeA = new Date(0);
      if (a.TIMESTAMP) {
        try {
          timeA = new Date(a.TIMESTAMP);
        } catch (err) {
          // Use epoch if parsing fails
        }
      }

      // Safely get timestamp b
      let timeB = new Date(0);
      if (b.TIMESTAMP) {
        try {
          timeB = new Date(b.TIMESTAMP);
        } catch (err) {
          // Use epoch if parsing fails
        }
      }

      return timeB.getTime() - timeA.getTime(); // Most recent first
    });

    console.log("\n=== Transaction History ===");

    // Calculate and show mining rewards summary (ALWAYS show like web interface)
    const miningTransactions = transactions.filter(tx =>
      tx.TYPE === "MINED" && tx.RECIPIENT === wallet.address
    );

    const totalMined = miningTransactions.reduce((sum, tx) => {
      return sum + GetTransactionAmount(tx.AMOUNT);
    }, 0);

    // ALWAYS show mining summary at the top (even if 0) - FIXED TRANSACTION
    console.log(`\nType: MINED`);
    console.log(`From: MINING_ADDRESS`);
    console.log(`To: ${wallet.address}`);
    console.log(`Amount: ${formatNumberWithCommas(totalMined)} TheeCoin`);
    console.log(`Time: All Mining Sessions Combined`);
    console.log("------------------------");

    // Calculate and show hosting rewards summary (only NODE_REWARD transactions)
    const hostingRewardTransactions = transactions.filter(tx =>
      tx.TYPE === "REWARD" && tx.RECIPIENT === wallet.address &&
      tx.SENDER === REWARDS_ADDRESS && tx.NODE_REWARD === true
    );

    if (hostingRewardTransactions.length > 0) {
      const totalHostingRewards = hostingRewardTransactions.reduce((sum, tx) => {
        return sum + GetTransactionAmount(tx.AMOUNT);
      }, 0);

      console.log(`\nType: REWARD (Node Hosting)`);
      console.log(`From: ${REWARDS_ADDRESS}`);
      console.log(`To: ${wallet.address}`);
      console.log(`Amount: ${formatNumberWithCommas(totalHostingRewards)} TheeCoin`);
      console.log(`Time: ${hostingRewardTransactions[0].TIMESTAMP || "UNKNOWN"}`);
      console.log("------------------------");
    }

    // Show other transactions (excluding individual mining and hosting reward transactions)
    for (const tx of transactions) {
      // Skip individual mining transactions since we show the summary above
      if (tx.TYPE === "MINED" && tx.RECIPIENT === wallet.address) {
        continue;
      }

      // Skip individual hosting reward transactions since we show the summary above
      if (tx.TYPE === "REWARD" && tx.RECIPIENT === wallet.address &&
          tx.SENDER === REWARDS_ADDRESS && tx.NODE_REWARD === true) {
        continue;
      }
      
      // Safely get transaction type
      const txType = tx.TYPE || "UNKNOWN";
      console.log(`\nType: ${txType}`);

      // Safely get sender
      const sender = tx.SENDER || "UNKNOWN";
      console.log(`From: ${sender}`);

      // Safely get recipient
      const recipient = tx.RECIPIENT || "UNKNOWN";
      console.log(`To: ${recipient}`);

      // Safely get amount
      const amount = GetTransactionAmount(tx.AMOUNT);
      console.log(`Amount: ${formatNumberWithCommas(amount)} TheeCoin`);

      // Safely get timestamp
      const timestamp = tx.TIMESTAMP || "UNKNOWN";
      console.log(`Time: ${timestamp}`);

      console.log("------------------------");
    }

    // Wait for user to acknowledge
    await promptUser("\nPress Enter to continue...");
  } catch (err) {
    console.log(`\nError getting transactions: ${err.message}`);
  }
}

// HandleReceivePayment displays wallet address for receiving payments
export async function HandleReceivePayment(wallet) {
  // Get the existing client and node
  let client = state.hyperswarmClient;
  let activeNode = state.activeNode;

  // Check if we need to reconnect
  if (!client || !activeNode) {
    console.log("\n❌ Error: Could not connect to any TheeCoin nodes");
    return;
  }

  while (true) {
    console.log(`\nYour Wallet Address: ${wallet.address}\n`);

    // Get current price from network
    try {
      const { CalculateCurrentPriceFromNetwork } = await import('./client.js');
      const currentPrice = await CalculateCurrentPriceFromNetwork();
      console.log(`Current TheeCoin Value: $${formatNumber(currentPrice, true)}\n`);
    } catch (err) {
      // Ignore price errors
    }

    console.log("1. Display QR Code");
    console.log("2. Go Back");

    const choice = await promptUser("\nChoose an option: ");

    if (choice === "2") {
      return;
    } else if (choice === "1") {
      // Generate QR Code for wallet address
      try {
        const qrcode = await import('qrcode-terminal');
        
        console.log("\n📱 QR Code for your wallet address:");
        console.log("═══════════════════════════════════════");
        
        // Generate QR code optimized for terminal scanning
        qrcode.default.generate(wallet.address, { small: true });
        
        console.log("═══════════════════════════════════════");
        console.log(`Wallet Address: ${wallet.address}`);
        console.log("\n💡 Scan this QR code with any QR scanner to get the wallet address");
        
        await promptUser("\nPress Enter to continue...");
        
      } catch (err) {
        console.log("\n❌ QR Code generation failed. Showing address manually:");
        console.log(`Wallet Address: ${wallet.address}`);
        console.log(`Error: ${err.message}`);
        await promptUser("\nPress Enter to continue...");
      }
    }
  }
}

// SignTransaction signs a transaction with the wallet's private key
export function SignTransaction(wallet, tx) {
  // Create transaction data string
  const txData = `${tx.SENDER}:${tx.RECIPIENT}:${tx.AMOUNT}:${tx.TYPE}:${tx.TIMESTAMP}`;

  // Hash the transaction data
  const hash = crypto.createHash('sha256').update(txData).digest();

  // Create HMAC using private key
  const hmac = crypto.createHmac('sha256', wallet.privateKey);
  hmac.update(hash);

  // Return hex-encoded signature
  return hmac.digest('hex');
}

// HandleSendTransaction sends a transaction through the network
export async function HandleSendTransaction(wallet) {
  
  // Get the existing client and node
  let client = state.hyperswarmClient;
  let activeNode = state.activeNode;

  // Check if we need to reconnect
  if (!client || !activeNode || !state.connectedToNetwork) {
    console.log("\n❌ TRANSACTION BLOCKED: Not properly connected to TheeCoin network");
    console.log("   Please ensure a node is running and the wallet has connected to it.");
    return;
  }

  // Get wallet details to check balance
  let details;
  try {
    const { GetWalletDetails } = await import('./client.js');
    details = await GetWalletDetails(wallet.address);
  } catch (err) {
    console.log(`Error getting wallet details: ${err.message}`);
    // Create default details with zero balance
    details = {
      address: wallet.address,
      balance: 0,
      frozenBalance: 0,
      spendableBalance: 0,
      valueUSD: 0,
      currentPrice: 0, // Should be fetched from network
      priceChanging: false,
      totalSent: 0,
      totalReceived: 0,
      transactionCount: 0
    };
  }

  // Check if this is the GENESIS address (only address that can create coins)
  const isGenesisAddress = wallet.address === GENESIS_ADDRESS;
  
  if (!isGenesisAddress && details.spendableBalance <= 0) {
    console.log("\nYou don't have any spendable balance to send");
    return;
  }

  if (isGenesisAddress) {
    console.log(`\n🏦 GENESIS ADDRESS - UNLIMITED COIN CREATION`);
    console.log(`💰 You can create any amount of TheeCoin out of thin air\n`);
    console.log(`GENESIS Balance: ${formatNumber(details.spendableBalance, true)} TheeCoin (always 0)`);
  } else {
    console.log(`\nAvailable Balance: ${formatNumber(details.spendableBalance, true)} TheeCoin\n`);
  }

  const recipient = await promptUser("\nEnter recipient address: ");

  // Validate recipient address
  if (!ValidateAddress(recipient)) {
    console.log("\nInvalid recipient address");
    return;
  }

  const amountStr = await promptUser("Enter amount to send: ");

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    console.log("\nInvalid amount");
    return;
  }

  if (!isGenesisAddress && amount > details.spendableBalance) {
    console.log("\nInsufficient balance");
    return;
  }

  console.log(`\nSending ${formatNumber(amount, true)} TheeCoin to ${recipient}`);
  const confirm = await promptUser("Confirm transaction? (yes/no): ");

  if (confirm.toLowerCase() !== "yes") {
    console.log("\nTransaction cancelled");
    return;
  }

  // Create and send transaction
  try {
    const tx = CreateTransaction(wallet, recipient, amount, "TRANSFER");

    // Send transaction to network - NO FAKE SUCCESS MESSAGES
    await SendTransactionToNetwork(tx);

    // Only show success if we actually get here without errors
    console.log("\n✅ Transaction successful!");
    console.log(`Amount: ${formatNumber(amount, true)} TheeCoin`);
    console.log(`Recipient: ${recipient}`);
    
    // Show countdown while updating wallet information
    process.stdout.write("\nUpdating your wallet information...");
    for (let i = 10; i >= 1; i--) {
      process.stdout.write(` ${i}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("\n"); // New line after countdown
  } catch (err) {
    // SHOW REAL ERROR DETAILS - NO HIDING FAILURES
    console.log(`\n❌ TRANSACTION FAILED: ${err.message}`);
    console.log(`\n🔍 ERROR DETAILS:`);
    console.log(`   - Connected to network: ${state.connectedToNetwork}`);
    console.log(`   - Active node: ${activeNode || 'NONE'}`);
    console.log(`   - Client exists: ${!!client}`);
    console.log(`   - Transaction amount: ${amount}`);
    console.log(`   - Recipient: ${recipient}`);
    console.log(`   - Sender balance: ${formatNumber(details.spendableBalance, true)}`);
    
    // If there's a stack trace, show it for debugging
    if (err.stack) {
      console.log(`\n🔧 TECHNICAL DETAILS: ${err.stack}`);
    }
  }
}

// SendTransactionToNetwork sends a transaction to a node via HYPERSWARM ONLY
export async function SendTransactionToNetwork(tx, silent = false) {
  if (!state.connectedToNetwork) {
    throw new Error(`CRITICAL: Wallet is not connected to any node.`);
  }
  
  if (!tx) {
    throw new Error(`CRITICAL: No transaction data provided.`);
  }

  if (!silent) {
    console.log(`\n🔄 Sending transaction to the network`);
    console.log(`   Transaction type: ${tx.TYPE}`);
    console.log(`   Amount: ${tx.AMOUNT}`);
    console.log(`   From: ${tx.SENDER}`);
    console.log(`   To: ${tx.RECIPIENT}`);
  }

  try {
    
    // Import the sendHyperswarmRequest function
    const { sendHyperswarmRequest } = await import('./client.js');
    
    const response = await sendHyperswarmRequest('api_transactions', {}, tx);
    
    if (response.status !== 'ok') {
      const errorMsg = response.error || response.message || 'No error details provided';
      throw new Error(`NODE PROCESSING FAILED: ${errorMsg}`);
    }
        
    // Wait a moment for the transaction to be processed
    if (!silent) {
      console.log(`\n⏳ Processing transaction...`);
    }
    await new Promise(resolve => setTimeout(resolve, 4000));
    
  } catch (err) {
    if (err.message.includes('CRITICAL:') || err.message.includes('NODE') || err.message.includes('HYPERSWARM')) {
      throw err;
    }
    throw new Error(`HYPERSWARM COMMUNICATION FAILED: ${err.message}`);
  }
}

// CreateMintingTransaction creates a transaction that mints new coins to an address
export async function CreateMintingTransaction(recipientAddress, amount, reason = 'crypto_purchase') {
  try {
    // Create a special minting transaction
    const tx = new Transaction();
    tx.SENDER = GENESIS_ADDRESS; // Special address for minting
    tx.RECIPIENT = recipientAddress;
    tx.AMOUNT = amount;
    tx.TYPE = "PURCHASED";
    tx.TIMESTAMP = Date.now();
    tx.SIGNATURE = `MINT_${reason}_${tx.TIMESTAMP}_${Math.random()}`;

    // Send to network for processing
    await SendTransactionToNetwork(tx);
    
    console.log(`Minted ${amount} TheeCoin to ${recipientAddress} (${reason})`);
    return tx;
  } catch (err) {
    console.log(`Error creating minting transaction: ${err.message}`);
    throw err;
  }
}

// HandlePurchaseTheeCoin handles purchasing TheeCoin with cryptocurrency
export async function HandlePurchaseTheeCoin(wallet) {
  try {
    await cryptoPayments.initialize();
  } catch (err) {
    console.log(`\nError initializing payment system: ${err.message}`);
    return;
  }

  console.log("\n💰 Purchase TheeCoin with Cryptocurrency");
  console.log("========================================");

  // Show supported cryptocurrencies
  const supportedCryptos = await cryptoPayments.getSupportedCryptos();
  
  if (supportedCryptos.length === 0) {
    console.log("\n❌ Crypto payments are currently unavailable due to security restrictions.");
    console.log("   This may be due to wallet tampering detection or network connectivity issues.");
    console.log("   Please ensure you are using the official TheeCoin wallet and are connected to the network.");
    return;
  }
  
  while (true) {
    console.log("\nSupported Cryptocurrencies:");

    supportedCryptos.forEach((crypto, index) => {
      console.log(`${index + 1}. ${crypto.name} (${crypto.symbol})`);
      console.log(`   Minimum: ${crypto.minAmount} ${crypto.symbol}`);
    });

    console.log(`${supportedCryptos.length + 1}. Go Back`);

    const choice = await promptUser("\nSelect cryptocurrency: ");
    const cryptoIndex = parseInt(choice) - 1;

    if (choice === (supportedCryptos.length + 1).toString()) {
      return;
    }

    if (cryptoIndex < 0 || cryptoIndex >= supportedCryptos.length) {
      console.log("Invalid choice. Please try again.");
      continue;
    }

    const selectedCrypto = supportedCryptos[cryptoIndex];

    console.log(`\nSelected: ${selectedCrypto.name} (${selectedCrypto.symbol})`);
    console.log("Fetching current exchange rate...");

    try {
      const rate = await cryptoPayments.exchangeRates.fetchRateForCrypto(selectedCrypto.symbol);
      selectedCrypto.exchangeRate = rate;
      console.log(`Current Rate: $${rate.toFixed(6)} per ${selectedCrypto.symbol}`);
    } catch (err) {
      console.log(`Error fetching exchange rate: ${err.message}`);
      continue;
    }

    // Get purchase amount
    const usdAmountStr = await promptUser("\nEnter USD amount to spend: $");
    const usdAmount = parseFloat(usdAmountStr);

    if (isNaN(usdAmount) || usdAmount <= 0) {
      console.log("Amount must be greater than 0");
      continue;
    }

    if (usdAmount < 1) {
      console.log("Minimum purchase is $1 USD");
      continue;
    }

    // Calculate amounts
    const cryptoAmount = usdAmount / selectedCrypto.exchangeRate;
    
    // Calculate TheeCoin amount with proper pricing: current price + 1 cent fee per coin after first
    // Get current price from network
    let currentPrice = 0.01; // Default fallback
    try {
      const { sendHyperswarmRequest } = await import('./client.js');
      const priceResponse = await sendHyperswarmRequest('api_wallet_price');
      if (priceResponse.status === "ok" && priceResponse.price) {
        currentPrice = priceResponse.price;
      }
    } catch (err) {
      // Use default price if network request fails
    }

    // Calculate how many coins the user wants to buy based on USD amount
    // We need to solve: usdAmount = (1 * currentPrice) + (additionalCoins * (currentPrice + 0.01))
    // Simplified: usdAmount = currentPrice + additionalCoins * (currentPrice + 0.01)
    // Where totalCoins = 1 + additionalCoins

    let theeCoinsToReceive;
    if (usdAmount <= currentPrice) {
      // Can only afford partial or exactly 1 coin
      theeCoinsToReceive = usdAmount / currentPrice;
    } else {
      // Can afford more than 1 coin, apply fee structure
      const remainingUSD = usdAmount - currentPrice; // USD left after first coin
      const pricePerAdditionalCoin = currentPrice + 0.01; // Price for each additional coin
      const additionalCoins = remainingUSD / pricePerAdditionalCoin; // Additional coins they can afford
      theeCoinsToReceive = 1 + additionalCoins; // Total coins = 1 + additional
    }

    if (cryptoAmount < selectedCrypto.minAmount) {
      console.log(`Amount too small. Minimum ${selectedCrypto.minAmount} ${selectedCrypto.symbol} required.`);
      continue;
    }

    console.log(`\n📊 Purchase Summary:`);
    console.log(`USD Amount: $${usdAmount.toFixed(2)}`);
    console.log(`${selectedCrypto.symbol} Required: ${cryptoAmount.toFixed(8)} ${selectedCrypto.symbol}`);
    console.log(`TheeCoin to Receive: ${formatNumberWithCommas(theeCoinsToReceive)} TheeCoin`);

    // Display fee breakdown
    console.log(`\n💰 Fee Structure:`);
    console.log(`Base price per coin: $${currentPrice.toFixed(4)}`);
    if (theeCoinsToReceive > 1) {
      const additionalCoins = theeCoinsToReceive - 1;
      const totalFee = additionalCoins * 0.01;
      console.log(`Additional fee per coin after first: $0.01`);
      console.log(`Total additional fees: $${totalFee.toFixed(2)}`);
    } else {
      console.log(`No additional fees (purchasing 1 coin or less)`);
    }

    const confirm = await promptUser("\nConfirm purchase? (yes/no): ");
    
    if (confirm.toLowerCase() !== "yes") {
      continue;
    }

    try {
      // Create payment
      console.log("\n🔄 Creating payment address...");
      const payment = await cryptoPayments.createPayment(
        selectedCrypto.symbol,
        usdAmount,
        wallet.address
      );

      console.log("\n✅ Payment Created Successfully!");
      console.log("================================");
      console.log(`Payment ID: ${payment.paymentId}`);
      console.log(`Send exactly: ${payment.amount.toFixed(8)} ${selectedCrypto.symbol}`);
      console.log(`To address: ${payment.paymentAddress}`);
      console.log(`TheeCoin to receive: ${formatNumberWithCommas(payment.theeCoinsToCredit)}`);
      console.log(`Payment expires: ${new Date(payment.expires).toLocaleString()}`);
      console.log("\n⚠️  Important:");
      console.log("- Send the EXACT amount to the address above");
      console.log("- TheeCoin will be credited automatically after confirmation");
      console.log("- Payment expires in 24 hours");
      console.log("- You can check payment status in the purchase menu");

      // Option to check status
      while (true) {
        console.log("\n1. Check Payment Status");
        console.log("2. Create New Payment");
        console.log("3. Go Back");

        const statusChoice = await promptUser("\nChoose option: ");

        if (statusChoice === "1") {
          const status = await cryptoPayments.getPaymentStatus(payment.paymentId, wallet.address);
          if (status) {
            console.log(`\n📊 Payment Status: ${status.status.toUpperCase()}`);
            console.log(`Created: ${new Date(status.created).toLocaleString()}`);
            console.log(`Expires: ${new Date(status.expires).toLocaleString()}`);

            if (status.status === 'completed') {
              console.log(`✅ Payment completed!`);
              console.log(`Verified by: ${status.completionData?.verifiedBy || 'node'}`);
              console.log(`TheeCoin credited: ${formatNumberWithCommas(status.completionData?.theeCoinsToCredit || status.theeCoinsToCredit)}`);
            } else {
              console.log(`⏳ Waiting for ${selectedCrypto.symbol} payment...`);
              console.log(`Send ${payment.amount.toFixed(8)} ${selectedCrypto.symbol} to: ${payment.paymentAddress}`);
            }
          } else {
            console.log("Payment not found");
          }
        } else if (statusChoice === "2") {
          break; // Go back to crypto selection
        } else if (statusChoice === "3") {
          return; // Exit purchase menu
        }
      }
    } catch (err) {
      console.log(`\nError creating payment: ${err.message}`);
    }
  }
}

export {
  TRANSACTION_TYPES
};

export default {
  TRANSACTION_TYPES,
  CreateTransaction,
  CreateMintingTransaction,
  GetTransactionAmount,
  GetTransactionHistoryFromNetwork,
  DisplayTransactionHistory,
  HandleReceivePayment,
  SignTransaction,
  HandleSendTransaction,
  SendTransactionToNetwork,
  HandlePurchaseTheeCoin
};
