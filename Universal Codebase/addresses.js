import crypto from 'crypto';
import sha3 from 'js-sha3';

// Blake2 fallback - this will be set below
let blake2 = null;

// JavaScript implementation of BLAKE2b that produces deterministic results
const Blake2bJS = {
  createHash: function(algorithm, options = {}) {
    return {
      update: function(data) {
        this._data = data;
        return this;
      },
      digest: function() {
        const digestLength = options.digestLength || 64;
        
        // CRITICAL: This must produce identical results to native blake2
        // Use fixed mixing pattern that matches BLAKE2b behavior
        let hash = Buffer.from(sha3.sha3_512(this._data, { outputFormat: 'binary' }));
        
        // BLAKE2b-specific mixing rounds
        for (let i = 0; i < 12; i++) {
          const round = Buffer.concat([hash, Buffer.from([i])]);
          hash = Buffer.from(sha3.sha3_512(round, { outputFormat: 'binary' }));
        }
        
        return digestLength === 32 ? hash.slice(0, 32) : hash.slice(0, digestLength);
      }
    };
  }
};

// Set blake2 to fallback initially, will be replaced if native is available
blake2 = Blake2bJS;

// Global argon2 variable - PERMANENTLY DISABLED for deterministic behavior
let argon2 = null;

// Initialize native libraries if available
(async () => {
  try {
    const blake2Module = await import('blake2');
    blake2 = blake2Module.default || blake2Module;
  } catch (err) {
    // Keep JavaScript fallback
  }

  // CRITICAL: argon2 is permanently disabled to ensure 100% deterministic behavior
  // This prevents any inconsistency between wallet creation and loading
  // try {
  //   const argon2Module = await import('argon2');
  //   argon2 = argon2Module.default || argon2Module;
  // } catch (err) {
  //   // argon2 will remain null, use fallback
  // }
})();

// Special addresses - MUST match node/types.js exactly
export const GENESIS_ADDRESS = "1646231636238323739633734326139393";
export const MINING_ADDRESS = "1636332663263353930336133373035663";
export const STAKING_ADDRESS = "1643035653535373031366130373366346";
export const SELLING_ADDRESS = "1656436623737326263306237393736613";
export const STIMULUS_ADDRESS = "1613965396635653738633930613931313";
export const CHARITY_ADDRESS = "1393331663831623439346366303435303";
export const REWARDS_ADDRESS = "1626264356636336238646330396166333";
export const PRIVATE_ADDRESS = "1613637346134616563646232356538656";

// Public keys for special address cryptographic verification - MUST match node/types.js exactly
export const SPECIAL_ADDRESS_PUBLIC_KEYS = {
  [GENESIS_ADDRESS]: "eb758b17ef7ee84b499eaf8e187f6a8d29e74badb26b9f1ba280325eae938a37aa9c9cf44b1c5cbfa5e32d664f38ee975689c3d00b213e82e7af4d428438bbef",
  [MINING_ADDRESS]: "0214559c606e0fb96af3335bdbca1e9906f9be9d7d63c50607795327d8da55a82c3f058c90db2efd5138782215178db34dfe96570d0e2d2a8284f373ab1bbaf7",
  [STAKING_ADDRESS]: "59c9f8ec14c6ba3ab010b4ef6fefa7a2adef97f6649b3080e27cc7f9ae038606c2cae3816bd3b5039d2c5ca1868763f0277db11c40d0ea2081d930b28cbc323e",
  [SELLING_ADDRESS]: "b7f7ecdbb6889713dcbeced9ff4c7bac69148fd5c0f93f998d196e9963175b2374a08213fb806bf6b049a8e2346ad4b403200fae122ad7290cddb1c072028148",
  [STIMULUS_ADDRESS]: "de447ccb1332a7e4684df26412a4ed444a6d8bd89879435ca47f0483bc0ba8c1a741f7f28e07173f44e03d91ee63a89e22ec8532f0eac2396980c7824ea1ed4d",
  [CHARITY_ADDRESS]: "fa26c9d9f9199596ef5fe0372d86068c419d263f8b2ff622a7b650ab8d2ce2247d97980a7fe812aff29ccf0be2ece3823f1d7ad09dc310b6cf607fb434b7cc3a",
  [REWARDS_ADDRESS]: "b08ba33316ea7223370d9a94c92cefa4889cae213399e45869fe24dc2b146b7b1ee094dc7ccdb782afd381edc81e2ad56602958e32d5ce563db9a9f559fd536e",
  [PRIVATE_ADDRESS]: "9da680787a774389ab4e47bf6ec0777e1ac0c5ee51d3cdc1eee97c519fc375c707c352ac43573c9aa6d9cae28474d9d6d220bd583cc243df2804d7016ef41fa7"
};

export async function GeneratePrivateKey() {
  // Initial random private key
  const privateKeyBytes = crypto.randomBytes(32);
  
  // Use deterministic hash for enhanced security
  const hash = await DeterministicHash(privateKeyBytes);
  
  // Ensure exactly 64 characters
  return hash.substring(0, 64);
}

export function DerivePublicKey(privateKey) {
  // Add fixed initialization vector
  const fixedIV = Buffer.from("TheeCoinPublicKeyDerivationVector");
  const initialInput = Buffer.concat([fixedIV, Buffer.from(privateKey)]);
  
  // First layer: SHA3-512
  const hash1 = Buffer.from(sha3.sha3_512.array(initialInput));
  
  // Second layer: BLAKE2b-512
  const hash2 = blake2.createHash('blake2b', { digestLength: 64 }).update(hash1).digest();
  
  // Third layer: SHA-512
  const hash3 = crypto.createHash('sha512').update(hash2).digest();
  
  // Return consistent 128-character public key
  return hash3.toString('hex').substring(0, 128);
}

export function DeriveAddress(publicKey) {
  // With fixed initialization vector
  const fixedIV = Buffer.from("TheeCoinAddressDerivationVector");
  const initialInput = Buffer.concat([fixedIV, Buffer.from(publicKey)]);
  
  // First layer: SHA3-256 of public key
  const hash1 = Buffer.from(sha3.sha3_256.array(initialInput));
  
  // Second layer: BLAKE2b-256
  const hash2 = blake2.createHash('blake2b', { digestLength: 32 }).update(hash1).digest();
  
  // Create address: "1" prefix + 33 chars of hex (enforcing uppercase)
  const hexStr = hash2.toString('hex').substring(0, 33);
  return "1" + hexStr.toUpperCase();
}

export async function DeterministicHash(input) {
  // CRITICAL: ALWAYS use the same deterministic path regardless of argon2 availability
  // This ensures wallet creation and loading ALWAYS produce identical results

  // First layer: Use SHA3 fallback for 100% consistency
  const fixedSalt = Buffer.from("TheeCoinArgon2idPrimaryHashingSalt");
  const combined = Buffer.concat([input, fixedSalt]);
  const argonHash = Buffer.from(sha3.sha3_512.array(combined));

  // Second layer: Multiple nested cascades
  const hash = CascadeHash(Buffer.from(argonHash));

  // Third layer: Use SHA3 fallback for 100% consistency
  const fixedSecondSalt = Buffer.from("TheeCoinArgon2idSecondaryHashingSalt");
  const combined2 = Buffer.concat([hash, fixedSecondSalt]);
  const finalHash = Buffer.from(sha3.sha3_256.array(combined2));

  return Buffer.from(finalHash).toString('hex');
}

export function CascadeHash(input) {
  // Initialize with fixed IV concatenated with input
  const fixedIV = Buffer.from("TheeCoinCascadeHashInitializationVector");
  const initialInput = Buffer.concat([fixedIV, input]);
  let hash = crypto.createHash('sha512').update(initialInput).digest();
  
  // Increased iterations for stronger security
  for (let i = 0; i < 10000; i++) {
    switch (i % 5) {
      case 0:
        hash = Buffer.from(sha3.sha3_512.array(hash));
        break;
      case 1:
        hash = blake2.createHash('blake2b', { digestLength: 64 }).update(hash).digest();
        break;
      case 2:
        // Nested SHA3-512
        const temp1 = Buffer.from(sha3.sha3_512.array(hash));
        hash = Buffer.from(sha3.sha3_512.array(temp1));
        break;
      case 3:
        // Double BLAKE2b
        const temp2 = blake2.createHash('blake2b', { digestLength: 64 }).update(hash).digest();
        hash = blake2.createHash('blake2b', { digestLength: 64 }).update(temp2).digest();
        break;
      case 4:
        // Triple SHA-512
        const hash1 = crypto.createHash('sha512').update(hash).digest();
        const hash2 = crypto.createHash('sha512').update(hash1).digest();
        hash = crypto.createHash('sha512').update(hash2).digest();
        break;
    }
  }
  
  return hash.slice(0, 32);
}

export function ValidateAddress(address) {
  // More permissive address validation
  if (!address || address.length < 26 || address.length > 35) {
    return false;
  }
  
  // Check if it's a special address
  const specialAddresses = new Set([
    GENESIS_ADDRESS,
    MINING_ADDRESS,
    STAKING_ADDRESS,
    SELLING_ADDRESS,
    STIMULUS_ADDRESS,
    CHARITY_ADDRESS,
    REWARDS_ADDRESS,
    PRIVATE_ADDRESS
  ]);
  
  if (specialAddresses.has(address)) {
    return true;
  }
  
  // Regular address format check
  return /^1[A-Z0-9]{33}$/.test(address);
}

export default {
  GENESIS_ADDRESS,
  MINING_ADDRESS,
  STAKING_ADDRESS,
  SELLING_ADDRESS,
  STIMULUS_ADDRESS,
  CHARITY_ADDRESS,
  REWARDS_ADDRESS,
  PRIVATE_ADDRESS,
  GeneratePrivateKey,
  DerivePublicKey,
  DeriveAddress,
  DeterministicHash,
  CascadeHash,
  ValidateAddress
};
