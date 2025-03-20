// Connect to the socket.io server
const socket = io({
  reconnectionAttempts: 5,
  timeout: 10000,
  transports: ['websocket', 'polling']
});

// Add connection error handling
socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  alert('Failed to connect to the game server. Please try refreshing the page.');
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected from server:', reason);
  if (reason === 'io server disconnect') {
    // the disconnection was initiated by the server, reconnect manually
    socket.connect();
  }
});

// DOM Elements
const menuScreen = document.getElementById('menu');
const gameScreen = document.getElementById('game');
const resultsScreen = document.getElementById('results');
const playerNameInput = document.getElementById('player-name');
const startButton = document.getElementById('start-button');
const playersListElement = document.getElementById('players');
const timerElement = document.getElementById('timer');
const gameContainer = document.getElementById('game-container');
const winnerNameElement = document.getElementById('winner-name');
const winnerPressesElement = document.getElementById('winner-presses');
const allPlayersResultsElement = document.getElementById('all-players-results');
const playAgainButton = document.getElementById('play-again-button');

// Game variables
let players = {};
let localPlayer = null;
let gameActive = false;
let scene, camera, renderer;
let balloons = {};
let remainingTime = 30;
let keyStates = {}; // Track key states to prevent holding
let isEndAnimation = false;
let endAnimationStartTime = 0;
let endAnimationDuration = 5000; // 5 seconds for the final animation

// Three.js scene setup
function setupScene() {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB); // Sky blue background
  
  // Create camera
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 15;
  camera.position.y = 5;
  camera.lookAt(0, 0, 0);
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  gameContainer.appendChild(renderer.domElement);
  
  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 20, 10);
  scene.add(directionalLight);
  
  // Add ground
  const groundGeometry = new THREE.PlaneGeometry(50, 50);
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x228B22, 
    side: THREE.DoubleSide 
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = Math.PI / 2;
  ground.position.y = -3;
  scene.add(ground);

  // Responsive design
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

// Create a balloon for a player
function createBalloon(playerId, playerData) {
  // Create balloon geometry
  const balloonGeometry = new THREE.SphereGeometry(1, 32, 32);
  
  // Generate a unique color for the player based on their id
  const hue = Math.abs(hashCode(playerId) % 360) / 360;
  const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
  
  // Create balloon material
  const balloonMaterial = new THREE.MeshPhongMaterial({ 
    color: color,
    specular: 0x111111,
    shininess: 30,
    emissive: color.clone().multiplyScalar(0.2)
  });
  
  // Create balloon mesh
  const balloon = new THREE.Mesh(balloonGeometry, balloonMaterial);
  
  // Position the balloon
  const position = getPositionForPlayer(playerId);
  balloon.position.set(position.x, position.y, position.z);
  
  // Add string to the balloon
  const stringGeometry = new THREE.CylinderGeometry(0.05, 0.05, 3, 8);
  const stringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const string = new THREE.Mesh(stringGeometry, stringMaterial);
  string.position.y = -1.5;
  balloon.add(string);
  
  // Add text label
  addPlayerLabel(balloon, playerData.name);
  
  // Add to scene and store in balloons object
  scene.add(balloon);
  balloons[playerId] = {
    balloon: balloon,
    initialScale: 1,
    targetScale: 1
  };
  
  return balloon;
}

// Add a label to display player name
function addPlayerLabel(balloon, playerName) {
  // Create canvas for text
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 128;
  
  // Set background to transparent
  context.fillStyle = 'rgba(0, 0, 0, 0)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw text
  context.font = 'bold 36px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = 'white';
  context.fillText(playerName, canvas.width / 2, canvas.height / 2);
  
  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  
  // Create sprite material with the texture
  const material = new THREE.SpriteMaterial({ map: texture });
  
  // Create sprite with the material
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3, 1.5, 1);
  sprite.position.y = -4;
  
  // Add sprite to balloon
  balloon.add(sprite);
  
  return sprite;
}

// Get a position for a player's balloon
function getPositionForPlayer(playerId) {
  // Generate a position based on player ID
  const hash = hashCode(playerId);
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
  const radius = 8; // Distance from center
  
  return {
    x: Math.cos(angle) * radius,
    y: 0,
    z: Math.sin(angle) * radius
  };
}

// Simple hash function for strings
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

// Update balloon size based on key presses
function updateBalloonSize(playerId, size) {
  if (balloons[playerId]) {
    balloons[playerId].targetScale = size;
  }
}

// Animate the scene
function animate() {
  requestAnimationFrame(animate);
  
  if (isEndAnimation) {
    // End game animation with floating balloons
    const progress = Math.min((Date.now() - endAnimationStartTime) / endAnimationDuration, 1);
    
    Object.keys(balloons).forEach(playerId => {
      const balloonData = balloons[playerId];
      const player = players[playerId];
      
      if (player && player.finalHeight) {
        // Balloon movement based on key presses and time
        const targetHeight = player.finalHeight * progress;
        
        // Apply slight random movement for natural floating effect
        const time = Date.now() * 0.001;
        const playerId_num = parseInt(playerId.replace(/\D/g,''), 10) || 0;
        const offset = playerId_num * 0.1;
        
        // Position balloon based on animation progress
        balloonData.balloon.position.y = targetHeight + Math.sin(time + offset) * 0.2;
        
        // Add slight swaying
        balloonData.balloon.rotation.z = Math.sin(time * 0.5 + offset) * 0.1;
        
        // Make balloons with fewer presses "pop" and disappear
        if (progress > 0.4 && player.finalHeight < player.finalHeight * 0.4) {
          if (balloonData.balloon.visible) {
            balloonData.balloon.visible = false;
            // Add a popping sound or effect here if desired
          }
        }
      }
    });
    
    // Slowly rotate camera around to show all balloons
    const cameraAngle = progress * Math.PI * 2;
    const cameraRadius = 15 + progress * 5; // Camera moves slightly out as animation progresses
    camera.position.x = Math.cos(cameraAngle) * cameraRadius;
    camera.position.z = Math.sin(cameraAngle) * cameraRadius;
    camera.position.y = 5 + progress * 5; // Camera moves up slightly
    camera.lookAt(0, progress * 10, 0); // Look at center, but higher as animation progresses
  } else {
    // Normal game animation
    Object.keys(balloons).forEach(playerId => {
      const balloonData = balloons[playerId];
      
      // Smoothly interpolate to target scale
      balloonData.initialScale += (balloonData.targetScale - balloonData.initialScale) * 0.1;
      
      // Update balloon scale
      balloonData.balloon.scale.set(
        balloonData.initialScale,
        balloonData.initialScale,
        balloonData.initialScale
      );
      
      // Gently bob up and down
      const time = Date.now() * 0.001;
      const playerId_num = parseInt(playerId.replace(/\D/g,''), 10) || 0;
      const offset = playerId_num * 0.1;
      balloonData.balloon.position.y = Math.sin(time + offset) * 0.2;
    });
  }
  
  // Render the scene
  renderer.render(scene, camera);
}

// Update the players list in the UI
function updatePlayersList() {
  playersListElement.innerHTML = '';
  
  Object.values(players).forEach(player => {
    const li = document.createElement('li');
    li.textContent = player.name;
    playersListElement.appendChild(li);
  });
}

// Show results screen with final scores and trigger end animation
function showResults(data) {
  gameActive = false;
  
  // Start end animation
  isEndAnimation = true;
  endAnimationStartTime = Date.now();
  
  // Set all balloons to be visible, will hide some during animation
  Object.keys(balloons).forEach(id => {
    if (balloons[id] && balloons[id].balloon) {
      balloons[id].balloon.visible = true;
    }
  });
  
  // Play confetti for the winner
  if (data.winner && data.winner.id === socket.id) {
    playWinnerConfetti();
  } else if (data.winner) {
    playSmallConfetti();
  }
  
  // Show the results screen after the animation
  setTimeout(() => {
    gameScreen.classList.add('hidden');
    resultsScreen.classList.remove('hidden');
    
    // Display winner
    if (data.winner) {
      winnerNameElement.textContent = data.winner.name;
      winnerPressesElement.textContent = `${data.winner.keyPresses} key presses`;
    } else {
      winnerNameElement.textContent = 'No winner';
      winnerPressesElement.textContent = '';
    }
    
    // Display all players results
    allPlayersResultsElement.innerHTML = '';
    
    // Sort players by key presses (highest first)
    const sortedPlayers = Object.values(data.players).sort((a, b) => b.keyPresses - a.keyPresses);
    
    sortedPlayers.forEach(player => {
      const playerResult = document.createElement('div');
      playerResult.className = 'player-result';
      
      const playerName = document.createElement('div');
      playerName.className = 'player-name';
      playerName.textContent = player.name;
      
      const playerPresses = document.createElement('div');
      playerPresses.className = 'player-presses';
      playerPresses.textContent = `${player.keyPresses} presses`;
      
      playerResult.appendChild(playerName);
      playerResult.appendChild(playerPresses);
      allPlayersResultsElement.appendChild(playerResult);
    });
  }, endAnimationDuration);
}

// Play winner confetti
function playWinnerConfetti() {
  const duration = 5 * 1000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function() {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);
    
    // Create bursts of confetti
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
    });
    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
    });
  }, 250);
}

// Play smaller confetti for non-winners
function playSmallConfetti() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 }
  });
}

// Update the countdown timer
function updateTimer(timeLeft) {
  timerElement.textContent = timeLeft;
  
  // Pulse animation for last 5 seconds
  if (timeLeft <= 5) {
    timerElement.style.color = '#FF5722';
    timerElement.style.transform = 'translateX(-50%) scale(1.2)';
    setTimeout(() => {
      timerElement.style.transform = 'translateX(-50%) scale(1)';
    }, 500);
  } else {
    timerElement.style.color = 'white';
  }
}

// Handle key presses
function handleKeyPress(event) {
  if (gameActive && localPlayer) {
    // Store key state to prevent multiple events while holding
    const keyCode = event.key || 'touch';
    
    // Only register if this key wasn't already pressed
    if (!keyStates[keyCode]) {
      keyStates[keyCode] = true;
      socket.emit('keyPress');
    }
  }
}

// Handle key releases
function handleKeyRelease(event) {
  const keyCode = event.key || 'touch';
  keyStates[keyCode] = false;
}

// Handle touch end events
function handleTouchEnd(event) {
  keyStates['touch'] = false;
}

// Socket event listeners
socket.on('connect', () => {
  console.log('Connected to server');
  
  // Set default player name
  playerNameInput.value = `Player ${Math.floor(Math.random() * 1000)}`;
  
  // Set up local player
  localPlayer = {
    id: socket.id,
    name: playerNameInput.value
  };
  
  // Set up event listeners
  playerNameInput.addEventListener('change', () => {
    localPlayer.name = playerNameInput.value;
    socket.emit('updateName', playerNameInput.value);
  });
  
  startButton.addEventListener('click', () => {
    socket.emit('startGame');
  });
  
  playAgainButton.addEventListener('click', () => {
    resultsScreen.classList.add('hidden');
    menuScreen.classList.remove('hidden');
  });
  
  // Handle key events for balloon inflation
  window.addEventListener('keydown', handleKeyPress);
  window.addEventListener('keyup', handleKeyRelease);
  
  // Support touch events for mobile
  window.addEventListener('touchstart', handleKeyPress);
  window.addEventListener('touchend', handleTouchEnd);
});

socket.on('currentPlayers', (serverPlayers) => {
  players = serverPlayers;
  updatePlayersList();
});

socket.on('newPlayer', (playerData) => {
  players[playerData.id] = playerData;
  updatePlayersList();
});

socket.on('updatePlayer', (playerData) => {
  players[playerData.id] = playerData;
  updateBalloonSize(playerData.id, playerData.balloonSize);
});

socket.on('playerDisconnected', (playerId) => {
  delete players[playerId];
  
  // Remove balloon if it exists
  if (balloons[playerId]) {
    scene.remove(balloons[playerId].balloon);
    delete balloons[playerId];
  }
  
  updatePlayersList();
});

socket.on('gameStarted', (gameState) => {
  // Hide menu and show game
  menuScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  resultsScreen.classList.add('hidden');
  
  // Set game as active
  gameActive = true;
  
  // Set up the 3D scene if not already done
  if (!scene) {
    setupScene();
    animate();
  }
  
  // Clear existing balloons
  Object.keys(balloons).forEach(id => {
    scene.remove(balloons[id].balloon);
  });
  balloons = {};
  
  // Create balloons for each player
  Object.keys(players).forEach(id => {
    createBalloon(id, players[id]);
  });
  
  // Set up timer
  remainingTime = gameState.duration / 1000;
  updateTimer(remainingTime);
  
  // Start countdown
  const timerInterval = setInterval(() => {
    remainingTime--;
    updateTimer(remainingTime);
    
    if (remainingTime <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
});

socket.on('gameEnded', (data) => {
  showResults(data);
}); 