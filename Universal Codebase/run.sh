#!/bin/bash

# Set error handling
set -e  # Exit on error
trap 'echo "Error on line $LINENO"' ERR

# Function to detect OS
detect_os() {
    # Check for Termux environment variables and paths
    if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux" ] || [ "$PREFIX" = "/data/data/com.termux/files/usr" ]; then
        echo 'Termux'
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo 'MacOS'
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo 'Linux'
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        echo 'Windows'
    else
        echo 'Unknown'
    fi
}

# Function to check for Node.js installation
check_node() {
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is not installed. Please install Node.js first."
        echo "  - On Ubuntu/Debian: sudo apt install nodejs npm"
        echo "  - On macOS: brew install node"
        echo "  - On Windows: Download from https://nodejs.org/"
        exit 1
    fi
    
    # Check Node.js version (need 18+ for ES modules)
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "❌ Node.js version 18 or higher is required. Current version: $(node -v)"
        exit 1
    fi
}

# Function to setup package.json with all dependencies
setup_package_json() {
    
    # Create package.json if it doesn't exist
    if [ ! -f package.json ]; then
        cat > package.json << EOL
{
  "name": "theecoin-wallet",
  "version": "1.0.0",
  "description": "TheeCoin Wallet - High-Performance JavaScript/Node.js Implementation",
  "main": "wallet.js",
  "type": "module",
  "scripts": {
    "start": "node --max-old-space-size=4096 wallet.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["theecoin", "wallet", "cryptocurrency", "blockchain"],
  "author": "TheeCoin Network",
  "license": "MIT",
  "dependencies": {
    "js-sha3": "^0.8.0",
    "hyperswarm": "^4.7.15",
    "qrcode-terminal": "^0.12.0",
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "hdkey": "^2.1.0",
    "bitcoinjs-lib": "^6.1.5"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
EOL
    fi
}

# Function to install Node.js dependencies
install_dependencies() {
    echo "Installing Node.js dependencies..."
    
    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is not installed. Please install npm."
        exit 1
    fi
    
    # Install dependencies (same for all platforms)
    npm install --silent --ignore-scripts
    
    echo "✅ Dependencies installed successfully!"
}

# Function removed - no longer creating startup scripts

# Function to check for Hyperswarm connectivity
check_hyperswarm() {

    # Create a simple test script to verify Hyperswarm works
    cat > test-hyperswarm.js << EOL
import Hyperswarm from 'hyperswarm';

const swarm = new Hyperswarm();

swarm.on('connection', (conn) => {
    process.exit(0);
});

// Test with a temporary topic
const topic = Buffer.alloc(32).fill('test');
swarm.join(topic, { server: false, client: true });

// Timeout after 5 seconds
setTimeout(() => {
    swarm.destroy();
    process.exit(0);
}, 5000);
EOL

    # Run the test
    if command -v timeout >/dev/null 2>&1; then
        timeout 10s node test-hyperswarm.js 2>/dev/null
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout 10s node test-hyperswarm.js 2>/dev/null
    else
        # On macOS without timeout, use a background process with kill
        node test-hyperswarm.js 2>/dev/null &
        sleep 10
        kill $! 2>/dev/null || true
    fi
    
    # Clean up test file
    rm -f test-hyperswarm.js
}

# Function to verify all wallet files exist
check_wallet_files() {
    
    required_files=(
        "wallet.js"
        "run.js"
        "setup.js"
        "client.js"
        "menus.js"
        "addresses.js"
        "transactions.js"
        "mining.js"
        "info.js"
        "mnemonics.js"
        "chat.js"
        "types.js"
        "crypto-payments.js"
        "web-interface.js"
    )
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            echo "❌ Required file not found: $file"
            exit 1
        fi
    done
}

# Function to run the wallet
run_wallet() {    
    # Run the wallet with performance optimizations for high-volume processing
    export NODE_OPTIONS="--max-old-space-size=4096"
    export UV_THREADPOOL_SIZE=8
    node run.js
}

# Function to show completion message
show_completion() {
    echo ""
    echo "========================================"
    echo "    TheeCoin Wallet Setup Complete!     "
    echo "========================================"
    echo ""
}

# Main execution
main() {
    # Print startup messages
    echo ""
    echo "Starting TheeCoin Wallet App..."
    echo -e "\x1b[38;5;94mUse CTRL+C at any time to quit\x1b[0m"
    echo ""
    
    # Print banner
    echo "========================================"
    echo "  TheeCoin Wallet Setup & Runner  "
    echo "========================================"
    
    # Detect OS
    OS=$(detect_os)
    echo "Detected OS: $OS"
    
    # Check for Node.js
    check_node
    
    # Check for wallet files
    check_wallet_files
    
    # Setup package.json
    setup_package_json
    
    # Install dependencies
    install_dependencies
    
    # Check Hyperswarm
    check_hyperswarm
    
    # Show completion message
    show_completion
    
    # Run the wallet automatically
    run_wallet
}

# Run main function
main
