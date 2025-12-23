#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getScriptDir, writeFileWithRetry } from './types.js';

// Master public keys for generating addresses (BIP44 compatible)
const MASTER_PUBLIC_KEYS = {
    // Bitcoin (BTC)
    BTC: 'xpub6CayRfTKyiQmSLSw6KyppiVhAqMiMSb8KZMXvJptftf4Hv5i8LoqQveBq6tqpmLfqdsc2tuboggNEidV1zMrbDHkzqyvpqZH4iv97pcR2RD',

    // Litecoin (LTC) - Now using xpub
    LTC: 'xpub6CK8CP9zAsi1iCk35KRan8MJdYZzQymKaWLZT4HPHUpZyTeWwjk5nadDM4SYsWvh3woeDojvzPCQUBawcohkxeCDXCyAUGX1g5xgFrgVeMW',

    // Dogecoin (DOGE)
    DOGE: 'xpub6C2kPnykLc7mX1Sc9brU9ebc9rb1B5MdxJSz8szDJD7yGuH587XmWtzJbnd2V3kAQY1ytfb599YHfaXfGN46sSusdpd2D4aabqPqxZRZ3BF',


};

// Supported cryptocurrencies with their details
const SUPPORTED_CRYPTOS = {
    BTC: {
        name: 'Bitcoin',
        symbol: 'BTC',
        apiUrl: 'https://api.blockcypher.com/v1/btc/main',
        addressType: 'P2PKH',
        confirmations: 1,
        minAmount: 0.00001,
        exchangeRate: null // Will be fetched dynamically
    },
    LTC: {
        name: 'Litecoin',
        symbol: 'LTC',
        apiUrl: 'https://api.blockcypher.com/v1/ltc/main',
        addressType: 'P2PKH',
        confirmations: 1,
        minAmount: 0.001,
        exchangeRate: null
    },
    DOGE: {
        name: 'Dogecoin',
        symbol: 'DOGE',
        apiUrl: 'https://api.blockcypher.com/v1/doge/main',
        addressType: 'P2PKH',
        confirmations: 1,
        minAmount: 1,
        exchangeRate: null
    }
};

// Database for tracking payment addresses and transactions
class PaymentDatabase {
    constructor() {
        this.dbPath = null;
        this.pendingPayments = new Map();
        this.completedPayments = new Map();
        // Note: usedAddresses tracking moved to node for global uniqueness
    }

    async initialize() {
        const scriptDir = await getScriptDir();
        this.dbPath = path.join(scriptDir, 'crypto-payments.json');
        await this.loadDatabase();
    }

    async loadDatabase() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));

                // Convert arrays back to Maps
                this.pendingPayments = new Map(data.pendingPayments || []);
                this.completedPayments = new Map(data.completedPayments || []);
                // Note: usedAddresses no longer tracked locally
            }
        } catch (err) {
            console.log(`Warning: Could not load payment database: ${err.message}`);
        }
    }

    async saveDatabase() {
        try {
            const data = {
                pendingPayments: Array.from(this.pendingPayments.entries()),
                completedPayments: Array.from(this.completedPayments.entries())
                // Note: usedAddresses no longer tracked locally
            };

            // Use JSON replacer to avoid circular references
            const jsonString = JSON.stringify(data, (key, value) => {
                // Skip circular references and functions
                if (typeof value === 'function' ||
                    (typeof value === 'object' && value !== null &&
                     (value.constructor === Object.constructor || Array.isArray(value)))) {
                    return value;
                }
                if (typeof value === 'object' && value !== null) {
                    // Skip objects that might have circular references
                    return undefined;
                }
                return value;
            }, 2);

            await writeFileWithRetry(this.dbPath, jsonString);
        } catch (err) {
            console.log(`Error saving payment database: ${err.message}`);
        }
    }

    async createPayment(crypto, amount, userAddress, theeCoinsToCredit) {
        const cryptoModule = await import('crypto');
        const paymentId = cryptoModule.randomBytes(16).toString('hex');

        // Store user address for address generation
        this.currentUserAddress = userAddress;

        const paymentAddress = await this.generateNewAddress(crypto);

        const payment = {
            id: paymentId,
            crypto: crypto,
            amount: amount,
            userAddress: userAddress,
            theeCoinsToCredit: theeCoinsToCredit,
            paymentAddress: paymentAddress,
            status: 'pending',
            created: Date.now(),
            expires: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
            confirmations: 0
        };

        this.pendingPayments.set(paymentId, payment);
        // Remove the broken prefix logic - addresses are tracked by the node
        await this.saveDatabase();

        return payment;
    }



    async deriveAddress(crypto, index) {
        const masterPubKey = MASTER_PUBLIC_KEYS[crypto];
        if (!masterPubKey) {
            throw new Error(`No master public key configured for ${crypto}`);
        }

        try {
            // Use proper BIP44 HD wallet derivation (same as Exodus/Trust Wallet)
            switch (crypto) {
                case 'BTC':
                case 'LTC':
                case 'DOGE':
                case 'ZEC':
                    return await this.deriveBitcoinStyleAddress(crypto, masterPubKey, index);
                default:
                    throw new Error(`Unsupported crypto: ${crypto}`);
            }
        } catch (err) {
            throw new Error(`Address derivation failed for ${crypto}: ${err.message}`);
        }
    }

    async deriveBitcoinStyleAddress(crypto, masterPubKey, index) {
        // Import HD wallet library dynamically
        const HDKey = await import('hdkey').then(module => module.default).catch(() => null);
        const bitcoin = await import('bitcoinjs-lib').catch(() => null);

        if (!HDKey || !bitcoin) {
            throw new Error('HD wallet libraries not available. Run: npm install hdkey bitcoinjs-lib');
        }

        try {
            // Create HD key from master public key
            const hdkey = HDKey.fromExtendedKey(masterPubKey);

            // Derive child key using standard BIP44 path: m/0/index (external chain)
            const child = hdkey.derive(`m/0/${index}`);

            // Get the public key
            const publicKey = child.publicKey;

            // Create address based on crypto type
            let network;
            switch (crypto) {
                case 'BTC':
                    network = bitcoin.networks.bitcoin;
                    break;
                case 'LTC':
                    network = bitcoin.networks.litecoin;
                    break;
                case 'DOGE':
                    // Dogecoin network config
                    network = {
                        messagePrefix: '\x19Dogecoin Signed Message:\n',
                        bech32: 'doge',
                        bip32: { public: 0x02facafd, private: 0x02fac398 },
                        pubKeyHash: 0x1e,
                        scriptHash: 0x16,
                        wif: 0x9e
                    };
                    break;

            }

            // Create P2PKH address
            const { address } = bitcoin.payments.p2pkh({ pubkey: publicKey, network });
            return address;

        } catch (err) {
            throw new Error(`HD derivation failed: ${err.message}`);
        }
    }

    async deriveEthereumAddress(crypto, masterPubKey, index) {
        // Import HD wallet library dynamically
        const HDKey = await import('hdkey').then(module => module.default).catch(() => null);
        const bitcoin = await import('bitcoinjs-lib').catch(() => null);

        if (!HDKey || !bitcoin) {
            throw new Error('HD wallet libraries not available. Run: npm install hdkey bitcoinjs-lib');
        }

        try {
            // Create HD key from master public key
            const hdkey = HDKey.fromExtendedKey(masterPubKey);

            // Derive child key using standard BIP44 path: m/0/index (external chain)
            const child = hdkey.derive(`m/0/${index}`);

            // Get the public key
            const publicKey = child.publicKey;

            // Create address based on crypto type
            const network = bitcoin.networks.bitcoin; // Ethereum uses Bitcoin's network config
            const { address } = bitcoin.payments.p2pkh({ pubkey: publicKey, network });
            return address;

        } catch (err) {
            throw new Error(`Ethereum derivation failed: ${err.message}`);
        }
    }

    getPayment(paymentId) {
        return this.pendingPayments.get(paymentId) || this.completedPayments.get(paymentId);
    }

    async markPaymentComplete(paymentId, txHash) {
        const payment = this.pendingPayments.get(paymentId);
        if (payment) {
            payment.status = 'completed';
            payment.txHash = txHash;
            payment.completed = Date.now();

            this.completedPayments.set(paymentId, payment);
            this.pendingPayments.delete(paymentId);

            await this.saveDatabase();
            return payment;
        }
        return null;
    }

    getPendingPayments() {
        return Array.from(this.pendingPayments.values());
    }

    async cleanupExpiredPayments() {
        const now = Date.now();
        let cleaned = 0;

        for (const [id, payment] of this.pendingPayments) {
            if (now > payment.expires) {
                this.pendingPayments.delete(id);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            await this.saveDatabase();
            console.log(`Cleaned up ${cleaned} expired payments`);
        }
    }
}

// Exchange rate fetcher
class ExchangeRateFetcher {
    constructor() {
        this.rates = new Map();
        this.lastUpdate = 0;
        this.updateInterval = 5 * 60 * 1000; // 5 minutes
    }

    async fetchRateForCrypto(symbol) {
        // Only fetch rate for the specific crypto when requested
        if (!SUPPORTED_CRYPTOS[symbol]) {
            throw new Error(`Unsupported cryptocurrency: ${symbol}`);
        }

        // Check if we have a recent rate cached
        const now = Date.now();
        const lastFetch = this.lastCryptoFetch?.get(symbol) || 0;
        if (now - lastFetch < this.updateInterval && SUPPORTED_CRYPTOS[symbol].exchangeRate) {
            return SUPPORTED_CRYPTOS[symbol].exchangeRate;
        }

        // Initialize lastCryptoFetch if needed
        if (!this.lastCryptoFetch) {
            this.lastCryptoFetch = new Map();
        }

        // Try multiple APIs in order for the specific crypto
        const apis = [
            {
                name: 'CoinGecko',
                fetch: () => this.fetchFromCoinGecko(symbol)
            },
            {
                name: 'DIA Data',
                fetch: () => this.fetchFromDIAData(symbol)
            }
        ];

        let success = false;
        for (const api of apis) {
            try {
                await api.fetch();
                success = true;
                this.lastCryptoFetch.set(symbol, now);
                break;
            } catch (err) {
                console.log(`Error fetching ${symbol} from ${api.name}: ${err.message}`);
                continue;
            }
        }

        if (!success) {
            console.log(`All exchange rate APIs failed for ${symbol}`);
            throw new Error('Cannot retrieve current rate at this time. Try again later');
        }

        return SUPPORTED_CRYPTOS[symbol].exchangeRate;
    }

    async fetchFromCoinGecko(symbol) {
        const cryptoIds = {
            BTC: 'bitcoin',
            LTC: 'litecoin',
            DOGE: 'dogecoin'
        };

        const id = cryptoIds[symbol];
        if (!id) {
            throw new Error(`Unknown crypto symbol: ${symbol}`);
        }

        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
            timeout: 10000
        });

        if (response.data[id] && response.data[id].usd) {
            const price = response.data[id].usd;
            this.rates.set(symbol, price);
            SUPPORTED_CRYPTOS[symbol].exchangeRate = price;
        } else {
            throw new Error(`No price data received for ${symbol}`);
        }
    }

    async fetchFromDIAData(symbol) {
        const diaUrls = {
            BTC: 'https://api.diadata.org/v1/assetQuotation/Bitcoin/0x0000000000000000000000000000000000000000',
            LTC: 'https://api.diadata.org/v1/assetQuotation/Litecoin/0x0000000000000000000000000000000000000000',
            DOGE: 'https://api.diadata.org/v1/assetQuotation/Dogechain/0x0000000000000000000000000000000000000000'
        };

        const url = diaUrls[symbol];
        if (!url) {
            throw new Error(`Unknown crypto symbol for DIA Data: ${symbol}`);
        }

        const response = await axios.get(url, {
            timeout: 10000
        });

        if (response.data && response.data.Price) {
            const price = parseFloat(response.data.Price);
            this.rates.set(symbol, price);
            SUPPORTED_CRYPTOS[symbol].exchangeRate = price;
        } else {
            throw new Error(`No price data received for ${symbol} from DIA Data`);
        }
    }

    getRate(crypto) {
        return this.rates.get(crypto) || SUPPORTED_CRYPTOS[crypto]?.exchangeRate || 0;
    }

    calculateCryptoAmount(crypto, usdAmount) {
        const rate = this.getRate(crypto);
        if (rate <= 0) return 0;
        return usdAmount / rate;
    }

    calculateUSDAmount(crypto, cryptoAmount) {
        const rate = this.getRate(crypto);
        return cryptoAmount * rate;
    }

    async fetchRates() {
        // Fetch rates for all supported cryptocurrencies
        const supportedSymbols = Object.keys(SUPPORTED_CRYPTOS);
        const promises = supportedSymbols.map(symbol =>
            this.fetchRateForCrypto(symbol).catch(err => {
                console.log(`Failed to fetch rate for ${symbol}: ${err.message}`);
                return null;
            })
        );

        await Promise.allSettled(promises);
        this.lastUpdate = Date.now();
    }
}

// Payment monitor for checking incoming transactions
class PaymentMonitor {
    constructor(database) {
        this.database = database;
        this.monitoring = false;
        this.monitorInterval = null;
    }

    startMonitoring() {
        if (this.monitoring) return;

        this.monitoring = true;
        this.monitorInterval = setInterval(() => {
            this.checkPendingPayments();
        }, 30000); // Check every 30 seconds

    }

    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        this.monitoring = false;
        console.log('Payment monitoring stopped');
    }

    async checkPendingPayments() {
        const pendingPayments = this.database.getPendingPayments();

        for (const payment of pendingPayments) {
            try {
                await this.checkPaymentStatus(payment);
            } catch (err) {
                console.log(`Error checking payment ${payment.id}: ${err.message}`);
            }
        }

        // Clean up expired payments
        await this.database.cleanupExpiredPayments();
    }

    async checkPaymentStatus(payment) {
        try {
            // Use node-based payment verification
            const { sendHyperswarmRequest } = await import('./client.js');

            const response = await sendHyperswarmRequest('api_verify_payment', {
                paymentId: payment.id,
                crypto: payment.crypto,
                paymentAddress: payment.paymentAddress,
                expectedAmount: payment.amount,
                userAddress: payment.userAddress
            });

            if (response.status === 'ok' && response.verified) {
                // Payment confirmed by node!
                await this.processConfirmedPayment(payment, response.theeCoinsToCredit);
            }
        } catch (err) {
            console.log(`Error checking payment status with node: ${err.message}`);
            // Fallback to local verification if node is unavailable
            await this.checkPaymentStatusLocal(payment);
        }
    }

    async checkPaymentStatusLocal(payment) {
        const crypto = SUPPORTED_CRYPTOS[payment.crypto];
        if (!crypto) return;

        // Check balance/transactions for the payment address
        const transactions = await this.getAddressTransactions(payment.crypto, payment.paymentAddress);

        for (const tx of transactions) {
            if (tx.amount >= payment.amount && tx.confirmations >= crypto.confirmations) {
                // Payment confirmed locally - still need node verification
                console.log(`Payment ${payment.id} detected locally, waiting for node verification...`);
                break;
            }
        }
    }

    async getAddressTransactions(crypto, address) {
        const cryptoInfo = SUPPORTED_CRYPTOS[crypto];

        try {
            switch (crypto) {
                case 'BTC':
                case 'LTC':
                case 'DOGE':
                case 'ZEC':
                    return await this.getBlockCypherTransactions(cryptoInfo.apiUrl, address);
                default:
                    return [];
            }
        } catch (err) {
            return [];
        }
    }

    async getBlockCypherTransactions(apiUrl, address) {
        const response = await axios.get(`${apiUrl}/addrs/${address}/balance`);
        const txResponse = await axios.get(`${apiUrl}/addrs/${address}/full?limit=10`);

        const transactions = [];

        if (txResponse.data.txs) {
            for (const tx of txResponse.data.txs) {
                // Find outputs to our address
                for (const output of tx.outputs) {
                    if (output.addresses && output.addresses.includes(address)) {
                        transactions.push({
                            hash: tx.hash,
                            amount: output.value / 100000000, // Convert satoshis to full units
                            confirmations: tx.confirmations || 0,
                            timestamp: new Date(tx.confirmed || tx.received).getTime()
                        });
                    }
                }
            }
        }

        return transactions;
    }

    async getEthereumTransactions(crypto, address) {
        const cryptoInfo = SUPPORTED_CRYPTOS[crypto];
        const apiKey = process.env.ETHERSCAN_API_KEY; // Assuming you have an API key
        if (!apiKey) {
            throw new Error('ETHERSCAN_API_KEY not set in environment variables.');
        }

        let apiUrl = `${cryptoInfo.apiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
        const response = await axios.get(apiUrl);

        const transactions = [];

        if (response.data.status === '1' && response.data.result) {
            for (const tx of response.data.result.slice(0, 10)) {
                if (tx.to && tx.to.toLowerCase() === address.toLowerCase()) {
                    transactions.push({
                        hash: tx.hash,
                        amount: parseFloat(tx.value) / Math.pow(10, 18), // Convert wei to ETH
                        confirmations: tx.confirmations || 1,
                        timestamp: parseInt(tx.timeStamp) * 1000
                    });
                }
            }
        }
        return transactions;
    }

    async processConfirmedPayment(payment, theeCoinsToCredit) {
        console.log(`Payment confirmed: ${payment.id} (${payment.crypto} ${payment.amount})`);

        // Mark payment as complete
        await this.database.markPaymentComplete(payment.id, 'node_verified');

        console.log(`✅ Payment ${payment.id} verified by node. ${theeCoinsToCredit} TheeCoin credited to ${payment.userAddress}`);
    }

    // Note: TheeCoin crediting is now handled by the node after payment verification
}

// Main payment system class
export class CryptoPaymentSystem {
    constructor() {
        this.database = new PaymentDatabase();
        this.exchangeRates = new ExchangeRateFetcher();
        this.monitor = new PaymentMonitor(this.database);
        this.initialized = false;
        this.currentUserAddress = null;
    }

    async generateNewAddress(crypto) {
        // Request new address from node to ensure global uniqueness
        try {
            const { sendHyperswarmRequest } = await import('./client.js');

            const response = await sendHyperswarmRequest('api_request_payment_address', {
                crypto: crypto,
                userAddress: this.currentUserAddress
            });

            if (response.status === 'ok') {
                return response.paymentAddress;
            } else {
                throw new Error(response.error || 'Failed to get payment address from node');
            }
        } catch (err) {
            console.log(`Error requesting payment address from node: ${err.message}`);
            throw new Error('Could not generate payment address. Please ensure you are connected to the network.');
        }
    }

    async initialize() {
        if (this.initialized) return;

        await this.database.initialize();
        await this.exchangeRates.fetchRates();
        // Don't start monitoring - let node handle all payment tracking

        // Update exchange rates periodically
        setInterval(() => {
            this.exchangeRates.fetchRates();
        }, 5 * 60 * 1000); // Every 5 minutes

        this.initialized = true;
    }

    async getSupportedCryptos() {
        // CRITICAL SECURITY: Validate master public keys before showing crypto options
        try {
            await this.validateMasterPublicKeysWithNode();
        } catch (err) {
            // If validation fails, return empty array to disable crypto payments
            console.log(`Crypto payments disabled due to security validation failure: ${err.message}`);
            return [];
        }
        
        return Object.entries(SUPPORTED_CRYPTOS).map(([symbol, info]) => ({
            symbol,
            name: info.name,
            minAmount: info.minAmount,
            exchangeRate: null // Don't show rates until user selects a crypto
        }));
    }

    async createPayment(crypto, usdAmount, userAddress) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!SUPPORTED_CRYPTOS[crypto]) {
            throw new Error(`Unsupported cryptocurrency: ${crypto}`);
        }

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

        // Calculate how many coins the user gets based on USD amount
        // We need to solve: usdAmount = (1 * currentPrice) + (additionalCoins * (currentPrice + 0.01))
        let theeCoinsToCredit;
        if (usdAmount <= currentPrice) {
            // Can only afford partial or exactly 1 coin
            theeCoinsToCredit = usdAmount / currentPrice;
        } else {
            // Can afford more than 1 coin, apply fee structure
            const remainingUSD = usdAmount - currentPrice; // USD left after first coin
            const pricePerAdditionalCoin = currentPrice + 0.01; // Price for each additional coin
            const additionalCoins = remainingUSD / pricePerAdditionalCoin; // Additional coins they can afford
            theeCoinsToCredit = 1 + additionalCoins; // Total coins = 1 + additional
        }

        // Calculate crypto amount needed
        const cryptoAmount = this.exchangeRates.calculateCryptoAmount(crypto, usdAmount);

        if (cryptoAmount < SUPPORTED_CRYPTOS[crypto].minAmount) {
            throw new Error(`Amount too small. Minimum: ${SUPPORTED_CRYPTOS[crypto].minAmount} ${crypto}`);
        }

        // Send payment creation request to node
        const { sendHyperswarmRequest } = await import('./client.js');

        const response = await sendHyperswarmRequest('api_create_payment', {
            crypto: crypto,
            cryptoAmount: cryptoAmount,
            usdAmount: usdAmount,
            userWalletAddress: userAddress,
            theeCoinsToCredit: theeCoinsToCredit
        });

        if (response.status === 'error') {
            throw new Error(response.error || 'Payment creation failed');
        }

        return {
            paymentId: response.paymentId,
            crypto: crypto,
            amount: cryptoAmount,
            paymentAddress: response.cryptoAddress,
            theeCoinsToCredit: theeCoinsToCredit,
            expires: Date.now() + (24 * 60 * 60 * 1000)
        };
    }

    async getPaymentStatus(paymentId, userAddress) {
        // Check payment status with node using correct API endpoint
        try {
            const { sendHyperswarmRequest } = await import('./client.js');

            const response = await sendHyperswarmRequest('api_get_payment_status', {
                paymentId: paymentId
            });

            if (response.status === 'ok') {
                return {
                    status: response.paymentStatus,
                    created: response.payment.timestamp || Date.now(),
                    expires: Date.now() + (24 * 60 * 60 * 1000), // 24 hours from now
                    theeCoinsToCredit: response.payment.theeCoinsToCredit,
                    crypto: response.payment.crypto,
                    cryptoAddress: response.payment.cryptoAddress,
                    cryptoAmount: response.payment.cryptoAmount,
                    usdAmount: response.payment.usdAmount,
                    completionData: response.paymentStatus === 'completed' ? {
                        verifiedBy: 'node',
                        theeCoinsToCredit: response.payment.theeCoinsToCredit
                    } : null
                };
            } else {
                return null;
            }
        } catch (err) {
            console.log(`Error getting payment status: ${err.message}`);
            return null;
        }
    }

    async shutdown() {
        // No local monitoring or storage to clean up
    }

    // CRITICAL SECURITY: Validate master public keys with node to prevent wallet tampering
    async validateMasterPublicKeysWithNode() {
        try {
            // Import sendHyperswarmRequest dynamically to avoid circular imports
            const { sendHyperswarmRequest } = await import('./client.js');
            
            // Send master public keys to node for validation
            const response = await sendHyperswarmRequest('api_validate_crypto_payment', {
                masterPublicKeys: MASTER_PUBLIC_KEYS
            });
            
            if (response.status !== 'ok') {
                console.log(`🚨 SECURITY ALERT: Master public key validation failed!`);
                console.log(`   Error: ${response.error}`);
                console.log(`   Message: ${response.message}`);
                
                if (response.mismatches) {
                    console.log(`   Mismatches detected:`);
                    response.mismatches.forEach(mismatch => {
                        console.log(`     - ${mismatch}`);
                    });
                }
                
                throw new Error(
                    'SECURITY VIOLATION: This wallet appears to be modified with invalid master public keys. ' +
                    'Crypto payments are disabled to prevent theft. Please use the official wallet from the ' +
                    'TheeCoin project to ensure your payments go to the correct addresses.'
                );
            }
            
            return true;
            
        } catch (err) {
            if (err.message.includes('SECURITY VIOLATION')) {
                throw err; // Re-throw security violations as-is
            }
            
            console.log(`⚠️ Warning: Could not validate master public keys with node: ${err.message}`);
            console.log(`   Crypto payments may be temporarily unavailable`);
            
            throw new Error(
                'Cannot validate wallet authenticity with network. ' +
                'Crypto payments are temporarily disabled for security. ' +
                'Please ensure you are connected to the TheeCoin network and try again.'
            );
        }
    }
}

// Export singleton instance
export const cryptoPayments = new CryptoPaymentSystem();

export default {
    CryptoPaymentSystem,
    cryptoPayments,
    SUPPORTED_CRYPTOS
};
