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
      });
      
      gameState.isActive = true;
      gameState.startTime = Date.now();
      
      io.emit('gameStarted', gameState);
      
      // End game after duration
      setTimeout(() => {
        gameState.isActive = false;
        const winner = findWinner();
        io.emit('gameEnded', { winner, players });
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 