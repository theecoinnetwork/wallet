#!/usr/bin/env node

import Hyperswarm from 'hyperswarm'
import crypto from 'crypto'
import process from 'process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'

// Validate and sanitize username
function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return null
  }
  
  // Replace spaces with underscores and remove illegal characters
  let sanitized = username
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .substring(0, 33)
  
  // Ensure minimum length
  if (sanitized.length < 3) {
    return null
  }
  
  return sanitized
}

// Prompt user for input
function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

class TheeCoinChat {
  constructor (opts = {}) {
    this.swarm = new Hyperswarm(opts)
    this.peers = new Map() // Track connected peers
    this.topic = hash('theecoin-node') // Fixed topic (same as nodes)
    this.nodeId = null // Will be set during initialization
    this.isNode = false // Mark this as a chat client (not a node)
    this.maxNodes = 50 // Maximum nodes allowed in network
    this.seenMessages = new Set() // Track seen messages to prevent duplicates
    this.messageCallback = null // Optional callback for web interface
    this.silentMode = false // When true, suppress console output
  }

  // Initialize the chat client
  async initialize (providedUsername = null) {
    if (providedUsername) {
      this.nodeId = providedUsername;
    } else {
      this.nodeId = await this.getOrCreateNodeId();
    }
    
    if (!this.silentMode) {
      console.log('💬 TheeCoin Network Chat Interface')
      console.log(`🆔 Connected as: ${this.nodeId}`)
      console.log('📝 Type messages and press Enter to send')
    }

    // Handle new connections
    this.swarm.on('connection', (socket, info) => {
      // Send our chat client info immediately
      this.sendClientInfo(socket)

      let connectionAccepted = false

      const handlePeerData = (data) => {
        try {
          const message = JSON.parse(data.toString().trim())

          if (message.type === 'node_info') {
            // Always accept connections to nodes for chat
            const peerId = info.publicKey.toString('hex').substring(0, 16)
            this.peers.set(peerId, socket)
            connectionAccepted = true
          } else if (message.type === 'rejection') {
            if (!this.silentMode) {
              console.log(`🚫 Connection rejected: ${message.message}`)
              if (message.walletNote) {
                console.log(`💡 ${message.walletNote}`)
              }
            }
            socket.end()
          } else if (message.type === 'user_message' && connectionAccepted) {
            // Regular user message - deduplicate and filter own messages
            const messageId = message.messageId || `${message.content}_${message.timestamp}`
            const content = message.content
            const senderName = content.split(':')[0]
            
            // Only show if we haven't seen this message and it's not from us
            if (!this.seenMessages.has(messageId) && senderName !== this.nodeId) {
              this.seenMessages.add(messageId)
              
              if (!this.silentMode) {
                console.log(`📨 ${content}`)
              }
              
              // Call message callback if set (for web interface)
              if (this.messageCallback) {
                this.messageCallback(senderName, content.split(':').slice(1).join(':').trim())
              }
            }
          }
        } catch (err) {
          // Not JSON, treat as regular message if connection is accepted
          if (connectionAccepted) {
            const messageText = data.toString().trim()
            if (messageText && messageText.includes(':')) {
              const senderName = messageText.split(':')[0]
              const message = messageText.split(':').slice(1).join(':').trim()
              
              // Only process if not from us
              if (senderName !== this.nodeId) {
                if (!this.silentMode) {
                  console.log(`📨 ${messageText}`)
                }
                
                // Call message callback if set (for web interface)
                if (this.messageCallback) {
                  this.messageCallback(senderName, message)
                }
              }
            }
          }
        }
      }

      socket.on('data', handlePeerData)

      // Handle peer disconnection
      socket.on('close', () => {
        if (connectionAccepted) {
          const peerId = info.publicKey.toString('hex').substring(0, 16)
          this.peers.delete(peerId)
        }
      })

      socket.on('error', (err) => {
        if (connectionAccepted) {
          const peerId = info.publicKey.toString('hex').substring(0, 16)
          this.peers.delete(peerId)
        }
      })
    })

    // Handle stdin for sending messages
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (input) => {
      const message = input.toString().trim()
      if (message) {
        // Clear the input line to prevent echo
        process.stdout.write('\r\x1b[K')
        this.broadcast(message)
      }
    })

    // Ensure stdin is ready for message input
    process.stdin.resume()

    // Graceful shutdown with better cross-platform support
    process.on('SIGINT', () => {
      if (!this.silentMode) {
        console.log('\n🛑 Closing the chat...')
      }
      this.destroy()
    })

    process.on('SIGTERM', () => {
      if (!this.silentMode) {
        console.log('\n🛑 Closing the chat...')
      }
      this.destroy()
    })

    // Handle window close events for better cross-platform support
    process.on('SIGHUP', () => {
      this.destroy()
    })

    process.on('exit', () => {
      this.destroy()
    })

    process.on('beforeExit', () => {
      this.destroy()
    })
  }

  // Send our chat client information to a peer
  sendClientInfo (socket) {
    const clientInfo = {
      type: 'client_info',
      nodeId: this.nodeId,
      isNode: this.isNode,
      clientType: 'chat'
    }
    socket.write(JSON.stringify(clientInfo) + '\n')
  }

  // Get or create persistent node ID (reuse the same as main node)
  async getOrCreateNodeId () {
    const nodeIdFile = path.join(process.cwd(), '.theecoin-node-id')

    try {
      if (fs.existsSync(nodeIdFile)) {
        const currentUsername = fs.readFileSync(nodeIdFile, 'utf8').trim()
        if (!this.silentMode) {
          console.log(`👋 Your current username is: ${currentUsername}`)
        }
        
        const changeUsername = this.silentMode ? 'n' : await promptUser('Would you like to change your username? (y/n): ')
        if (changeUsername.toLowerCase() === 'y' || changeUsername.toLowerCase() === 'yes') {
          return await this.promptForUsername(nodeIdFile)
        }
        
        return currentUsername
      }
    } catch (err) {
      // File doesn't exist or can't be read
    }

    // No existing username, prompt for new one
    return await this.promptForUsername(nodeIdFile)
  }

  // Prompt user for username with validation
  async promptForUsername (nodeIdFile) {
    if (!this.silentMode) {
      console.log('\n🆔 Set your TheeCoin Chat Username')
      console.log('Rules: 3-33 characters, letters/numbers/underscore/hyphen only')
      console.log('Spaces will be replaced with underscores')
    }
    
    let username = null
    while (!username) {
      const input = await promptUser('Enter your username: ')
      username = validateUsername(input)
      
      if (!username) {
        if (!this.silentMode) {
          if (input.length < 3) {
            console.log('❌ Username must be at least 3 characters long')
          } else if (input.length > 33) {
            console.log('❌ Username must be 33 characters or less')
          } else {
            console.log('❌ Invalid characters. Use only letters, numbers, underscore, or hyphen')
          }
        }
      }
    }
    
    try {
      fs.writeFileSync(nodeIdFile, username)
      if (!this.silentMode) {
        console.log(`✅ Username set to: ${username}\n`)
      }
    } catch (err) {
      if (!this.silentMode) {
        console.log('⚠️ Could not save username, using temporary ID')
      }
      return 'ChatUser_' + crypto.randomBytes(4).toString('hex')
    }

    return username
  }

  // Join TheeCoin Network for chat
  join () {

    // Join as client only for chat
    this.swarm.join(this.topic, { server: false, client: true })

    // Clean up old message IDs every 5 minutes to prevent memory issues
    setInterval(() => {
      if (this.seenMessages.size > 1000) {
        this.seenMessages.clear()
      }
    }, 300000)
  }

  // Broadcast message to all connected peers
  broadcast (message) {
    if (this.peers.size === 0) {
      if (!this.silentMode) {
        console.log(`📭 No nodes connected. Message not sent: "${message}"`)
      }
      return
    }

    const timestamp = Date.now()
    const messageData = {
      type: 'user_message',
      content: `${this.nodeId}: ${message}`,
      timestamp: timestamp,
      messageId: `${this.nodeId}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`
    }

    let sentCount = 0

    this.peers.forEach((socket) => {
      try {
        socket.write(JSON.stringify(messageData) + '\n')
        sentCount++
      } catch (err) {
        if (!this.silentMode) {
          console.log(`❌ Failed to send to peer: ${err.message}`)
        }
        // Note: We'd need the peerId here to delete from peers, but it's not available
        // in this forEach. This is a limitation of the current design.
      }
    })

    if (!this.silentMode) {
      console.log(`📤 You: ${message}`)
    }
  }

  // Clean shutdown
  destroy () {
    // Close all peer connections
    this.peers.forEach((socket) => {
      try {
        socket.end()
      } catch (err) {
        // Ignore errors during shutdown
      }
    })

    this.peers.clear()
    
    try {
      this.swarm.destroy()
    } catch (err) {
      // Ignore errors during shutdown
    }

    // Force close stdin to release terminal
    try {
      process.stdin.pause()
      process.stdin.destroy()
    } catch (err) {
      // Ignore errors
    }

    // Immediate exit for better cross-platform terminal closing
    process.exit(0)
  }
}

// Utility function to hash topic names
function hash (val) {
  return crypto.createHash('sha256').update(val).digest()
}

// Main execution
async function main () {
  const chat = new TheeCoinChat()
  await chat.initialize()

  // Small delay to let the swarm initialize
  setTimeout(() => {
    chat.join()
  }, 1000)
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Add global error handlers for wallet chat
  process.on('uncaughtException', (err) => {
    console.log(`Wallet Chat Uncaught Exception: ${err.message}`);
    console.log('Wallet chat continuing to run...');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.log(`Wallet Chat Unhandled Rejection at: ${promise}, reason: ${reason}`);
    console.log('Wallet chat continuing to run...');
  });

  main().catch(err => {
    console.log(`Wallet chat startup error: ${err.message}`);
    console.log('Wallet chat will attempt to continue...');
  });
}

export default TheeCoinChat
