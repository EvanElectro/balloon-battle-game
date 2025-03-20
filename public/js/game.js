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
let nuts = {}; // renamed from balloons to nuts
let remainingTime = 30;
let keyStates = {}; // Track key states to prevent holding
let isEndAnimation = false;
let endAnimationStartTime = 0;
let endAnimationDuration = 5000; // 5 seconds for the final animation
let nutTextures = {}; // Store loaded textures
let burstParticles = []; // Store particle systems for bursting nuts
let targetPresses = 100; // Default, will be updated from server

// Preload textures
function preloadTextures() {
  const textureLoader = new THREE.TextureLoader();
  const nutTypes = ['almond', 'peanut', 'walnut', 'pistachio', 'cashew', 'hazelnut'];
  
  nutTypes.forEach(type => {
    // Load simple colored textures for nuts
    // In a production version, you'd have actual texture images
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 512;
    
    // Generate different colors for different nut types
    let color;
    switch(type) {
      case 'almond': color = '#D2B48C'; break;
      case 'peanut': color = '#CD853F'; break;
      case 'walnut': color = '#8B4513'; break;
      case 'pistachio': color = '#B1907F'; break;
      case 'cashew': color = '#E0C9A6'; break;
      case 'hazelnut': color = '#A0522D'; break;
      default: color = '#D2B48C';
    }
    
    // Fill background
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add texture pattern
    context.fillStyle = adjustColorBrightness(color, -20);
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = 5 + Math.random() * 40;
      context.beginPath();
      context.ellipse(x, y, size, size/2, Math.random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    nutTextures[type] = texture;
  });
}

// Helper to adjust color brightness
function adjustColorBrightness(col, amt) {
  let usePound = false;
  if (col[0] == "#") {
    col = col.slice(1);
    usePound = true;
  }
  
  let R = parseInt(col.substring(0, 2), 16);
  let G = parseInt(col.substring(2, 4), 16);
  let B = parseInt(col.substring(4, 6), 16);
  
  R = Math.max(0, Math.min(255, R + amt));
  G = Math.max(0, Math.min(255, G + amt));
  B = Math.max(0, Math.min(255, B + amt));
  
  return (usePound ? "#" : "") + (
    (R.toString(16).length === 1 ? "0" + R.toString(16) : R.toString(16)) +
    (G.toString(16).length === 1 ? "0" + G.toString(16) : G.toString(16)) +
    (B.toString(16).length === 1 ? "0" + B.toString(16) : B.toString(16))
  );
}

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

  // Preload textures
  preloadTextures();
}

// Create a nut for a player
function createNut(playerId, playerData) {
  // Create nut geometry - use slightly deformed sphere for nut shape
  const nutGeometry = new THREE.SphereGeometry(1, 32, 16);
  
  // Deform geometry slightly to make it more nut-like
  const vertices = nutGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const y = vertices.getY(i);
    const z = vertices.getZ(i);
    
    // Apply a slight deformation to make it less perfectly spherical
    vertices.setX(i, x * (1 + Math.sin(y * 4) * 0.1));
    vertices.setZ(i, z * (1 + Math.cos(y * 3) * 0.1));
  }
  
  // Get the assigned nut type or default to almond
  const nutType = playerData.nutType || 'almond';
  
  // Create nut material using the preloaded texture
  const nutMaterial = new THREE.MeshPhongMaterial({
    map: nutTextures[nutType],
    specular: 0x333333,
    shininess: 30,
    bumpScale: 0.2
  });
  
  // Create nut mesh
  const nut = new THREE.Mesh(nutGeometry, nutMaterial);
  
  // Position the nut
  const position = getPositionForPlayer(playerId);
  nut.position.set(position.x, position.y, position.z);
  
  // Add text label
  addPlayerLabel(nut, playerData.name);
  
  // Add to scene and store in nuts object
  scene.add(nut);
  nuts[playerId] = {
    nut: nut,
    initialScale: 1,
    targetScale: 1,
    nutType: nutType,
    hasBurst: false
  };
  
  return nut;
}

// Add a label to display player name
function addPlayerLabel(nut, playerName) {
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
  
  // Add sprite to nut
  nut.add(sprite);
  
  return sprite;
}

// Get a position for a player's nut
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

// Update nut size based on key presses
function updateNutSize(playerId, size) {
  if (nuts[playerId]) {
    nuts[playerId].targetScale = size;
  }
}

// Create burst animation for a nut
function burstNut(playerId) {
  if (!nuts[playerId] || nuts[playerId].hasBurst) return;
  
  const nutObject = nuts[playerId];
  nutObject.hasBurst = true;
  
  // Get current position of the nut
  const position = nutObject.nut.position.clone();
  
  // Hide the original nut
  nutObject.nut.visible = false;
  
  // Create particle system for bursting effect
  const particleCount = 150;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const particleSizes = new Float32Array(particleCount);
  const particleColors = new Float32Array(particleCount * 3);
  
  // Assign random positions, sizes, and colors to particles
  for (let i = 0; i < particleCount; i++) {
    // Random position within a sphere
    const angle1 = Math.random() * Math.PI * 2;
    const angle2 = Math.random() * Math.PI;
    const radius = 0.1 + Math.random() * 0.3;
    
    particlePositions[i * 3] = position.x + Math.sin(angle1) * Math.sin(angle2) * radius;
    particlePositions[i * 3 + 1] = position.y + Math.cos(angle2) * radius;
    particlePositions[i * 3 + 2] = position.z + Math.cos(angle1) * Math.sin(angle2) * radius;
    
    // Random size
    particleSizes[i] = 0.05 + Math.random() * 0.15;
    
    // Use the nut's color for particles
    const nutType = nutObject.nutType || 'almond';
    let col;
    switch(nutType) {
      case 'almond': col = [0.82, 0.71, 0.55]; break;
      case 'peanut': col = [0.80, 0.52, 0.25]; break;
      case 'walnut': col = [0.55, 0.27, 0.07]; break;
      case 'pistachio': col = [0.69, 0.56, 0.50]; break;
      case 'cashew': col = [0.88, 0.79, 0.65]; break;
      case 'hazelnut': col = [0.63, 0.32, 0.18]; break;
      default: col = [0.82, 0.71, 0.55];
    }
    particleColors[i * 3] = col[0] * (0.8 + Math.random() * 0.4);
    particleColors[i * 3 + 1] = col[1] * (0.8 + Math.random() * 0.4);
    particleColors[i * 3 + 2] = col[2] * (0.8 + Math.random() * 0.4);
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  
  // Create particle material
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.1,
    vertexColors: true,
    transparent: true,
    opacity: 1.0
  });
  
  // Create particle system
  const particleSystem = {
    points: new THREE.Points(particleGeometry, particleMaterial),
    velocities: [],
    startTime: Date.now(),
    playerId: playerId
  };
  
  // Initialize velocities
  for (let i = 0; i < particleCount; i++) {
    const dirX = (particlePositions[i * 3] - position.x) * (2 + Math.random() * 3);
    const dirY = (particlePositions[i * 3 + 1] - position.y) * (2 + Math.random() * 3);
    const dirZ = (particlePositions[i * 3 + 2] - position.z) * (2 + Math.random() * 3);
    
    particleSystem.velocities.push({
      x: dirX,
      y: dirY, 
      z: dirZ
    });
  }
  
  scene.add(particleSystem.points);
  burstParticles.push(particleSystem);
  
  // Play sound effect
  playBurstSound();
  
  // If this is the winner, show extra effects
  if (players[playerId] && players[playerId].isWinner) {
    playWinnerConfetti();
  } else {
    playSmallConfetti();
  }
}

// Play a burst sound effect
function playBurstSound() {
  // In a production version, you'd load and play an actual sound
  console.log("Nut burst sound effect would play here");
}

// Animate the scene
function animate() {
  requestAnimationFrame(animate);
  
  // Update burst particle systems
  const now = Date.now();
  
  for (let i = burstParticles.length - 1; i >= 0; i--) {
    const system = burstParticles[i];
    const positions = system.points.geometry.attributes.position.array;
    const sizes = system.points.geometry.attributes.size.array;
    const elapsed = (now - system.startTime) / 1000; // seconds
    
    // Remove old systems
    if (elapsed > 3) {
      scene.remove(system.points);
      burstParticles.splice(i, 1);
      continue;
    }
    
    // Update particle positions based on velocity and gravity
    for (let j = 0; j < positions.length / 3; j++) {
      positions[j * 3] += system.velocities[j].x * 0.01;
      positions[j * 3 + 1] += system.velocities[j].y * 0.01 - 0.015; // Add gravity
      positions[j * 3 + 2] += system.velocities[j].z * 0.01;
      
      // Fade out particles over time
      sizes[j] = Math.max(0, sizes[j] - 0.001);
    }
    
    system.points.geometry.attributes.position.needsUpdate = true;
    system.points.geometry.attributes.size.needsUpdate = true;
    
    // Fade out the material
    system.points.material.opacity = Math.max(0, 1 - elapsed / 3);
  }
  
  if (isEndAnimation) {
    // End game animation with floating nuts
    const progress = Math.min((Date.now() - endAnimationStartTime) / endAnimationDuration, 1);
    
    Object.keys(nuts).forEach(playerId => {
      const nutData = nuts[playerId];
      const player = players[playerId];
      
      if (player && player.finalHeight && !nutData.hasBurst) {
        // Nut movement based on key presses and time
        const targetHeight = player.finalHeight * progress;
        
        // Apply slight random movement for natural floating effect
        const time = Date.now() * 0.001;
        const playerId_num = parseInt(playerId.replace(/\D/g,''), 10) || 0;
        const offset = playerId_num * 0.1;
        
        // Position nut based on animation progress
        nutData.nut.position.y = targetHeight + Math.sin(time + offset) * 0.2;
        
        // Add slight swaying
        nutData.nut.rotation.z = Math.sin(time * 0.5 + offset) * 0.1;
        
        // Burst nuts when they reach a certain height
        if (progress > 0.7 && player.isWinner && !nutData.hasBurst) {
          burstNut(playerId);
        }
      }
    });
    
    // Slowly rotate camera around to show all nuts
    const cameraAngle = progress * Math.PI * 2;
    const cameraRadius = 15 + progress * 5;
    camera.position.x = Math.cos(cameraAngle) * cameraRadius;
    camera.position.z = Math.sin(cameraAngle) * cameraRadius;
    camera.position.y = 5 + progress * 5;
    camera.lookAt(0, progress * 10, 0);
  } else {
    // Normal game animation
    Object.keys(nuts).forEach(playerId => {
      const nutData = nuts[playerId];
      
      // Skip if the nut has burst
      if (nutData.hasBurst) return;
      
      // Smoothly interpolate to target scale
      nutData.initialScale += (nutData.targetScale - nutData.initialScale) * 0.1;
      
      // Update nut scale
      nutData.nut.scale.set(
        nutData.initialScale,
        nutData.initialScale,
        nutData.initialScale
      );
      
      // Gently bob up and down
      const time = Date.now() * 0.001;
      const playerId_num = parseInt(playerId.replace(/\D/g,''), 10) || 0;
      const offset = playerId_num * 0.1;
      nutData.nut.position.y = Math.sin(time + offset) * 0.2;
      
      // Rotate the nut slowly for visual interest
      nutData.nut.rotation.x = Math.sin(time * 0.3) * 0.1;
      nutData.nut.rotation.z = Math.cos(time * 0.2) * 0.1;
      
      // Check if this nut should burst during gameplay
      if (gameActive && players[playerId] && players[playerId].keyPresses >= targetPresses && !nutData.hasBurst) {
        burstNut(playerId);
      }
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
  
  // Mark the winner for special effects
  if (data.winner) {
    Object.keys(players).forEach(id => {
      players[id].isWinner = (id === data.winner.id);
    });
  }
  
  // Start end animation
  isEndAnimation = true;
  endAnimationStartTime = Date.now();
  
  // Handle target reached scenario
  if (data.targetReached) {
    // If a player reached the target, their nut should burst immediately
    const winnerId = data.winner ? data.winner.id : null;
    if (winnerId && nuts[winnerId] && !nuts[winnerId].hasBurst) {
      burstNut(winnerId);
    }
  }
  
  // Set all nuts to be visible
  Object.keys(nuts).forEach(id => {
    if (nuts[id] && nuts[id].nut && !nuts[id].hasBurst) {
      nuts[id].nut.visible = true;
    }
  });
  
  // Show the results screen after the animation
  setTimeout(() => {
    gameScreen.classList.add('hidden');
    resultsScreen.classList.remove('hidden');
    
    // Display winner
    if (data.winner) {
      winnerNameElement.textContent = data.winner.name;
      winnerPressesElement.textContent = `${data.winner.keyPresses} key presses`;
      
      // Add a note about winning condition
      const winCondition = document.createElement('div');
      winCondition.className = 'win-condition';
      if (data.targetReached) {
        winCondition.textContent = 'Successfully burst their nut first!';
      } else {
        winCondition.textContent = 'Had the most key presses when time ran out!';
      }
      winnerPressesElement.appendChild(document.createElement('br'));
      winnerPressesElement.appendChild(winCondition);
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
      
      // Add nut type information
      const nutTypeDisplay = document.createElement('div');
      nutTypeDisplay.className = 'nut-type';
      nutTypeDisplay.textContent = player.nutType ? 
        player.nutType.charAt(0).toUpperCase() + player.nutType.slice(1) : 'Nut';
      
      const playerName = document.createElement('div');
      playerName.className = 'player-name';
      playerName.textContent = player.name;
      
      const playerPresses = document.createElement('div');
      playerPresses.className = 'player-presses';
      playerPresses.textContent = `${player.keyPresses} presses`;
      
      // Add burst status if applicable
      if (player.hasBurst || player.keyPresses >= targetPresses) {
        const burstBadge = document.createElement('span');
        burstBadge.className = 'burst-badge';
        burstBadge.textContent = '💥 BURST!';
        playerPresses.appendChild(document.createElement('br'));
        playerPresses.appendChild(burstBadge);
      }
      
      playerResult.appendChild(nutTypeDisplay);
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
  
  // Handle key events for nut bursting
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
  updateNutSize(playerData.id, playerData.balloonSize);
});

socket.on('playerDisconnected', (playerId) => {
  delete players[playerId];
  
  // Remove nut if it exists
  if (nuts[playerId]) {
    scene.remove(nuts[playerId].nut);
    delete nuts[playerId];
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
  
  // Update target presses from server
  if (gameState.targetPresses) {
    targetPresses = gameState.targetPresses;
  }
  
  // Set up the 3D scene if not already done
  if (!scene) {
    setupScene();
    animate();
  }
  
  // Clear existing nuts
  Object.keys(nuts).forEach(id => {
    scene.remove(nuts[id].nut);
  });
  nuts = {};
  
  // Create nuts for each player
  Object.keys(players).forEach(id => {
    createNut(id, players[id]);
  });
  
  // Clear any existing burst particles
  for (let i = burstParticles.length - 1; i >= 0; i--) {
    scene.remove(burstParticles[i].points);
  }
  burstParticles = [];
  
  // Set up timer
  remainingTime = gameState.duration / 1000;
  updateTimer(remainingTime);
  
  // Update game instructions
  document.querySelector('#instructions h3').textContent = 'TAP ANY KEY TO BURST YOUR NUT!';
  document.querySelector('#instructions p').textContent = 
    `First to ${targetPresses} key presses bursts their nut and wins! Most presses after 30 seconds also wins.`;
  
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

// Handle being kicked for inactivity
socket.on('kickedForInactivity', () => {
  // Close the game screens if they're open
  gameScreen.classList.add('hidden');
  resultsScreen.classList.add('hidden');
  
  // Show the menu with an inactivity message
  menuScreen.classList.remove('hidden');
  
  // Create or update an inactivity message
  let inactivityMsg = document.getElementById('inactivity-message');
  
  if (!inactivityMsg) {
    inactivityMsg = document.createElement('div');
    inactivityMsg.id = 'inactivity-message';
    inactivityMsg.className = 'alert';
    menuScreen.insertBefore(inactivityMsg, menuScreen.firstChild);
  }
  
  inactivityMsg.textContent = 'You were removed due to inactivity (0 key presses). Join again to play!';
  
  // Clear the message after 10 seconds
  setTimeout(() => {
    if (inactivityMsg && inactivityMsg.parentNode) {
      inactivityMsg.parentNode.removeChild(inactivityMsg);
    }
  }, 10000);
}); 