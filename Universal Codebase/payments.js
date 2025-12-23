#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { getScriptDir, writeFileWithRetry } from './types.js';

// Persistent payment tracking for individual wallets
export class WalletPaymentTracker {
    constructor(walletAddress) {
        this.walletAddress = walletAddress;
        this.paymentsFile = null;
        this.activePayments = new Map();
        this.completedPayments = new Map();
    }

    async initialize() {
        const scriptDir = await getScriptDir();
        const walletsDir = path.join(scriptDir, 'wallets');
        
        // Create wallets directory if it doesn't exist
        if (!fs.existsSync(walletsDir)) {
            fs.mkdirSync(walletsDir, { recursive: true });
        }
        
        // Create payments file path based on wallet address
        this.paymentsFile = path.join(walletsDir, `${this.walletAddress}_payments.json`);
        
        await this.loadPayments();
    }

    async loadPayments() {
        try {
            if (fs.existsSync(this.paymentsFile)) {
                const data = JSON.parse(fs.readFileSync(this.paymentsFile, 'utf8'));
                
                this.activePayments = new Map(data.activePayments || []);
                this.completedPayments = new Map(data.completedPayments || []);
                
                console.log(`✅ Loaded ${this.activePayments.size} active and ${this.completedPayments.size} completed payments for wallet ${this.walletAddress}`);
                
                // Resume monitoring active payments
                await this.resumePaymentMonitoring();
            }
        } catch (err) {
            console.log(`Warning: Could not load payments for wallet ${this.walletAddress}: ${err.message}`);
        }
    }

    async savePayments() {
        try {
            const data = {
                walletAddress: this.walletAddress,
                activePayments: Array.from(this.activePayments.entries()),
                completedPayments: Array.from(this.completedPayments.entries()),
                lastUpdated: Date.now()
            };

            await writeFileWithRetry(this.paymentsFile, JSON.stringify(data, null, 2));
        } catch (err) {
            console.log(`Error saving payments for wallet ${this.walletAddress}: ${err.message}`);
        }
    }

    async addPayment(payment) {
        this.activePayments.set(payment.id, payment);
        await this.savePayments();
        
        // Start monitoring this payment
        this.monitorPayment(payment);
    }

    async completePayment(paymentId, completionData) {
        const payment = this.activePayments.get(paymentId);
        if (payment) {
            payment.status = 'completed';
            payment.completedAt = Date.now();
            payment.completionData = completionData;
            
            this.completedPayments.set(paymentId, payment);
            this.activePayments.delete(paymentId);
            
            await this.savePayments();
            console.log(`✅ Payment ${paymentId} completed for wallet ${this.walletAddress}`);
        }
    }

    async resumePaymentMonitoring() {
        for (const [paymentId, payment] of this.activePayments) {
            // Check if payment has expired
            if (Date.now() > payment.expires) {
                console.log(`⏰ Payment ${paymentId} has expired, removing from active payments`);
                this.activePayments.delete(paymentId);
                continue;
            }
            
            // Resume monitoring
            this.monitorPayment(payment);
        }
        
        if (this.activePayments.size > 0) {
            await this.savePayments();
        }
    }

    monitorPayment(payment) {
        // Check payment status every 30 seconds
        const checkInterval = setInterval(async () => {
            try {
                // Check if payment has expired
                if (Date.now() > payment.expires) {
                    console.log(`⏰ Payment ${payment.id} expired`);
                    this.activePayments.delete(payment.id);
                    await this.savePayments();
                    clearInterval(checkInterval);
                    return;
                }
                
                // Check payment status with node
                const { sendHyperswarmRequest } = await import('./client.js');
                
                const response = await sendHyperswarmRequest('api_verify_payment', {
                    paymentId: payment.id,
                    crypto: payment.crypto,
                    paymentAddress: payment.paymentAddress,
                    expectedAmount: payment.amount,
                    userAddress: payment.userAddress
                });
                
                if (response.status === 'ok' && response.verified) {
                    console.log(`✅ Payment ${payment.id} verified by node!`);
                    await this.completePayment(payment.id, {
                        theeCoinsToCredit: response.theeCoinsToCredit,
                        verifiedBy: 'node'
                    });
                    clearInterval(checkInterval);
                }
                
            } catch (err) {
                console.log(`Error monitoring payment ${payment.id}: ${err.message}`);
                // Continue monitoring despite errors
            }
        }, 30000); // Check every 30 seconds
        
        // Store interval reference to clear it later if needed
        payment.monitorInterval = checkInterval;
    }

    getActivePayments() {
        return Array.from(this.activePayments.values());
    }

    getCompletedPayments() {
        return Array.from(this.completedPayments.values());
    }

    getPayment(paymentId) {
        return this.activePayments.get(paymentId) || this.completedPayments.get(paymentId);
    }

    async cleanup() {
        // Clear all monitoring intervals
        for (const [paymentId, payment] of this.activePayments) {
            if (payment.monitorInterval) {
                clearInterval(payment.monitorInterval);
            }
        }
        
        // Save final state
        await this.savePayments();
    }
}

// Global payment tracker instances
const paymentTrackers = new Map();

export async function getPaymentTracker(walletAddress) {
    if (!paymentTrackers.has(walletAddress)) {
        const tracker = new WalletPaymentTracker(walletAddress);
        await tracker.initialize();
        paymentTrackers.set(walletAddress, tracker);
    }
    return paymentTrackers.get(walletAddress);
}

export async function cleanupPaymentTrackers() {
    for (const [walletAddress, tracker] of paymentTrackers) {
        await tracker.cleanup();
    }
    paymentTrackers.clear();
}

export default {
    WalletPaymentTracker,
    getPaymentTracker,
    cleanupPaymentTrackers
};
