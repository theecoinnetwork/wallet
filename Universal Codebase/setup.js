import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

import { getScriptDir, writeFileWithRetry, globalState } from './types.js';

// OSInfo stores information about the operating system
class OSInfo {
  constructor() {
    this.type = 'unknown'; // "windows", "macos", "linux", "android", "ios", "raspberrypi", "unknown"
    this.isTermux = false; // Whether running in Termux
    this.isLimited = false; // Whether running in a limited environment (iOS, Termux)
  }
}

// Global OS info variable
let CurrentOS = new OSInfo();

// Initialize CurrentOS
function DetectOS() {
  const info = new OSInfo();
  
  // First check if running on Termux by checking TERMUX_VERSION
  const termuxVersion = process.env.TERMUX_VERSION;
  if (termuxVersion) {
    info.type = 'android';
    info.isTermux = true;
    info.isLimited = true;
    return info;
  }
  
  // If not Termux, proceed with normal OS detection
  switch (os.platform()) {
    case 'win32':
      info.type = 'windows';
      break;
    case 'darwin':
      info.type = 'macos';
      // Check for iOS (not perfect but helps)
      if (!fs.existsSync('/Applications')) {
        info.type = 'ios';
        info.isLimited = true;
      }
      break;
    case 'linux':
      info.type = 'linux';
      // Check for Raspberry Pi
      try {
        if (fs.existsSync('/proc/device-tree/model')) {
          const data = fs.readFileSync('/proc/device-tree/model', 'utf8');
          if (data.toLowerCase().includes('raspberry pi')) {
            info.type = 'raspberrypi';
          }
        }
      } catch (err) {
        // Ignore error
      }
      break;
    default:
      info.type = 'unknown';
  }
  
  return info;
}

CurrentOS = DetectOS();

function ClearScreen() {
  // Use process.stdout.write for immediate, synchronous screen clearing
  if (os.platform() === 'win32') {
    process.stdout.write('\x1b[2J\x1b[0f');
  } else {
    process.stdout.write('\x1b[2J\x1b[0f');
  }
}

// SetupWalletDirectories creates necessary directories for the wallet application
export async function SetupWalletDirectories() {
  try {
    const scriptDir = await getScriptDir();
    
    const walletsDir = path.join(scriptDir, "wallets");
    
    const dirs = [walletsDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      
      // Extra verification for Termux
      if (CurrentOS.isTermux) {
        if (!fs.existsSync(dir)) {
          throw new Error(`Critical error: directory ${dir} still doesn't exist after creation attempt`);
        }
      }
    }
    
    // Create nodes.txt if it doesn't exist
    const nodesFile = path.join(scriptDir, "nodes.txt");
    if (!fs.existsSync(nodesFile)) {
      const defaultNodes = [
        "# TheeCoin Network Nodes",
        "# Add one node per line, format: nodeId",
        "# Your wallet will connect to these nodes for transactions",
        "",
        "# Default bootstrap nodes",
        ""
      ];
      const content = defaultNodes.join('\n') + '\n';
      await writeFileWithRetry(nodesFile, content);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return scriptDir;
  } catch (err) {
    console.log("\n\x1b[91m📁 Directory structure failed ❌\x1b[0m\n");
    throw err;
  }
}

// Gets the script directory
async function GetScriptDir() {
  let dir;
  
  // Use the CurrentOS struct directly
  if (CurrentOS.isTermux) {
    // AGGRESSIVE FIX FOR TERMUX: Always use the current working directory
    // Get current directory using multiple methods to ensure accuracy
    
    try {
      // Method 1: Use os.cwd()
      dir = process.cwd();
    } catch (err) {
      // Method 2: Check if we can access a known file in current dir
      try {
        fs.accessSync('./wallet');
        // If we can access wallet executable, use the directory of the executable
        dir = path.dirname(process.execPath);
      } catch (err2) {
        // Last resort: hardcode the typical Termux path
        dir = "/data/data/com.termux/files/home/TheeCoin";
      }
    }
    
    // CRITICAL: Verify the directory exists and contains expected files
    const walletsPath = path.join(dir, "wallets");
    if (!fs.existsSync(walletsPath)) {
      fs.mkdirSync(walletsPath, { recursive: true, mode: 0o755 });
    }
  } else if (CurrentOS.type === 'ios') {
    // On iOS, use the Documents directory
    const homeDir = os.homedir();
    dir = path.join(homeDir, "Documents");
  } else {
    // Default behavior for other platforms - use current directory
    dir = path.resolve(path.dirname(process.argv[1]));
  }
  
  // Create only the directories needed for wallet
  const walletsDir = path.join(dir, "wallets");
  
  // Create directories needed for wallet
  const dirs = [walletsDir];
  for (const dirPath of dirs) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    }
  }
  
  // FINAL VERIFICATION
  if (!fs.existsSync(walletsDir)) {
    throw new Error("Critical error: wallets directory still doesn't exist after creation attempt");
  }
  
  return dir;
}

// FindFreePort returns an available port number
export async function FindFreePort() {
  // Try multiple times to find a free port
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const server = http.createServer();
      
      return new Promise((resolve, reject) => {
        server.listen(0, () => {
          const port = server.address().port;
          server.close(() => {
            // Verify the port is actually free by trying to listen on it again
            const verifyServer = http.createServer();
            verifyServer.listen(port, () => {
              verifyServer.close(() => resolve(port));
            });
            verifyServer.on('error', () => {
              // Port is not actually free, try again
              reject(new Error('Port verification failed'));
            });
          });
        });
        server.on('error', reject);
      });
    } catch (err) {
      if (attempt === 4) {
        throw new Error('Failed to find a free port after multiple attempts');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}



export { CurrentOS, DetectOS, ClearScreen, GetScriptDir };

export default {
  CurrentOS,
  DetectOS,
  ClearScreen,
  SetupWalletDirectories,
  GetScriptDir,
  FindFreePort
};
