import { ClearScreen } from './setup.js';

function ShowEncryptionInfo() {
    ClearScreen();
    console.log("\n=== Wallet Security Information ===");
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║                    SECURITY OVERVIEW                           ║");
    console.log("╠════════════════════════════════════════════════════════════════╣");
    console.log("║ 1. Initial Entropy Generation                                  ║");
    console.log("║    ├─► Generate 256 bits of secure random entropy              ║");
    console.log("║    ├─► Convert to 24 BIP-39 words (Secret Recovery Phrase)     ║");
    console.log("║    └─► Add checksum verification                               ║");
    console.log("║         ↓                                                      ║");
    console.log("║ 2. Primary Argon2id Memory-Hard Function                       ║");
    console.log("║    ├─► 512MB Memory Usage                                        ║");
    console.log("║    ├─► 16 Parallel Threads                                     ║");
    console.log("║    ├─► 8 Iterations                                            ║");
    console.log("║    ├─► Fixed Primary Salt                                      ║");
    console.log("║    └─► 64-byte output                                          ║");
    console.log("║         ↓                                                      ║");
    console.log("║ 3. Multi-Algorithm Cascade (10,000 iterations)                 ║");
    console.log("║    ├─► Fixed Initialization Vector                             ║");
    console.log("║    ├─► SHA-512 Hash                                            ║");
    console.log("║    ├─► SHA3-512 Hash                                           ║");
    console.log("║    ├─► BLAKE2b-512 Hash                                        ║");
    console.log("║    ├─► Nested SHA3-512                                         ║");
    console.log("║    └─► Triple SHA-512                                          ║");
    console.log("║         ↓                                                      ║");
    console.log("║ 4. Secondary Memory-Hard Function                              ║");
    console.log("║    ├─► 512MB Additional Memory                                   ║");
    console.log("║    ├─► 8 Parallel Threads                                      ║");
    console.log("║    ├─► 4 Iterations                                            ║");
    console.log("║    └─► Fixed Secondary Salt                                    ║");
    console.log("║         ↓                                                      ║");
    console.log("║ 5. Final Processing                                            ║");
    console.log("║    └─► Truncate to exactly 64 hexadecimal characters           ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");

    console.log("\n=== Computational Requirements ===");
    console.log("• Total Memory: 1GB per attempt (512MB + 512MB)");
    console.log("• Total Threads: 24 (16 primary + 8 secondary)");
    console.log("• Total Iterations: 50,000 (10,000 × 5 algorithms)");
    console.log("• Processing Time: ~3-4 seconds per key attempt");

    console.log("\n=== Security Metrics ===");
    console.log("• Base Entropy: 256-bit with 512-bit mixing");
    console.log("• Total Combinations: 2^256 × cascading complexity");
    console.log("• Memory Requirement: 1GB per attempt");
    console.log("• Algorithm Diversity: 5 different hash functions");

    console.log("\n=== Security Features ===");
    console.log("• Secure memory handling for sensitive operations");
    console.log("• Protected private key generation and storage");
    console.log("• Encrypted network communication with other nodes");
    console.log("• Session-based authentication with automatic timeout");

    console.log("\n=== Protection Against ===");
    console.log("• Network attacks and eavesdropping");
    console.log("• Private key exposure during transmission");
    console.log("• Session hijacking and replay attacks");
    console.log("• Data tampering during network communication");

    console.log("\n=== Network Security ===");
    console.log("• Hyperswarm P2P network with DHT routing");
    console.log("• Multi-node redundancy for network resilience");
    console.log("• Encrypted channels between wallet and nodes");
    console.log("• Authentication tokens for session management");
    console.log("• Automatic failover if nodes become unavailable");

    console.log("\n=== Performance Optimization ===");
    console.log("• Efficient memory usage for wallet operations");
    console.log("• Optimized cryptographic operations");
    console.log("• Fast startup and response times");
    console.log("• Parallel processing where possible");

    console.log("\n=== Important Notes ===");
    console.log("• User private keys are generated and stored locally");
    console.log("• Network communication uses encryption");
    console.log("• Users maintain full control of their cryptocurrency");
    console.log("• No centralized key storage or management");

    console.log("\n=== Performance Metrics ===");
    console.log("• Wallet startup time: <3 seconds");
    console.log("• Low memory usage and efficient operations");
    console.log("• Fast network communication");
    console.log("• Minimal system resource requirements");

    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("🛡️ Your wallet uses industry-standard security practices!");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("");
}

function ShowDecryptionInfo() {
    ClearScreen();
    console.log("\n=== Wallet Decryption Information ===");
    console.log("• TheeCoin wallet uses standard cryptographic practices");
    console.log("• All private keys are generated locally on your device");
    console.log("• No external decryption services are required");
    console.log("• Full control over your cryptocurrency remains with you");
    console.log("");
}

export { ShowEncryptionInfo, ShowDecryptionInfo };
