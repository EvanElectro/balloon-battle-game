const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add a route to test API functionality
app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Game state
const players = {};
const gameState = {
  isActive: false,
  startTime: null,
  duration: 30000, // 30 seconds in milliseconds
};

// Track last key press time for each player to prevent key holding
const lastKeyPressTime = {};
const KEY_PRESS_COOLDOWN = 200; // 200ms cooldown between key presses

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New player connected:', socket.id);

  // Initialize new player
  players[socket.id] = {
    id: socket.id,
    name: `Player ${Object.keys(players).length + 1}`,
    keyPresses: 0,
    balloonSize: 1,
    finalHeight: 0, // Add a property for final height
  };

  // Send current players to the new player
  socket.emit('currentPlayers', players);
  
  // Broadcast new player to all other players
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Handle key press events
  socket.on('keyPress', () => {
    if (gameState.isActive) {
      const now = Date.now();
      // Check if enough time has passed since last key press (prevents holding keys)
      if (!lastKeyPressTime[socket.id] || now - lastKeyPressTime[socket.id] >= KEY_PRESS_COOLDOWN) {
        players[socket.id].keyPresses++;
        players[socket.id].balloonSize = calculateBalloonSize(players[socket.id].keyPresses);
        lastKeyPressTime[socket.id] = now;
        io.emit('updatePlayer', players[socket.id]);
      }
    }
  });

  // Handle player name updates
  socket.on('updateName', (name) => {
    players[socket.id].name = name;
    io.emit('updatePlayer', players[socket.id]);
  });

  // Handle game start request
  socket.on('startGame', () => {
    if (!gameState.isActive && Object.keys(players).length > 0) {
      // Reset all players' scores
      Object.keys(players).forEach(id => {
        players[id].keyPresses = 0;
        players[id].balloonSize = 1;
        players[id].finalHeight = 0; // Add a property for final height
      });
      
      gameState.isActive = true;
      gameState.startTime = Date.now();
      
      io.emit('gameStarted', gameState);
      
      // End game after duration
      setTimeout(() => {
        gameState.isActive = false;
        const winner = findWinner();
        
        // Calculate final heights based on key presses (relative to winner)
        const maxPresses = winner ? winner.keyPresses : 0;
        
        // Identify inactive players to remove
        const inactivePlayers = [];
        
        Object.keys(players).forEach(id => {
          // Calculate height based on relative performance
          const relativePresses = maxPresses > 0 ? players[id].keyPresses / maxPresses : 0;
          players[id].finalHeight = relativePresses * 20; // Max height is 20 units
          
          // Mark players with zero key presses as inactive
          if (players[id].keyPresses === 0) {
            inactivePlayers.push(id);
          }
        });
        
        // Send game ended event first
        io.emit('gameEnded', { winner, players });
        
        // Remove inactive players after a short delay
        setTimeout(() => {
          inactivePlayers.forEach(id => {
            if (players[id]) {
              console.log(`Removing inactive player: ${players[id].name} (${id})`);
              
              // Notify the player they're being removed
              io.to(id).emit('kickedForInactivity');
              
              // Remove the player
              delete players[id];
              
              // Notify all remaining players
              io.emit('playerDisconnected', id);
            }
          });
          
          // Log the number of players removed
          if (inactivePlayers.length > 0) {
            console.log(`Removed ${inactivePlayers.length} inactive player(s)`);
          }
        }, endAnimationDelay);
      }, gameState.duration);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Calculate balloon size based on key presses
function calculateBalloonSize(keyPresses) {
  // Base size + slower incremental growth based on key presses
  return 1 + (keyPresses * 0.05); // Reduced from 0.1 to 0.05 for slower inflation
}

// Find the winner of the game
function findWinner() {
  let winnerId = null;
  let maxPresses = -1;
  
  Object.keys(players).forEach(id => {
    if (players[id].keyPresses > maxPresses) {
      maxPresses = players[id].keyPresses;
      winnerId = id;
    }
  });
  
  return winnerId ? players[winnerId] : null;
}

// Start the server
const PORT = process.env.PORT || 8080;
const endAnimationDelay = 5500; // Slightly longer than endAnimationDuration in client (5000ms)

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 