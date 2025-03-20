# Balloon Battle

A 3D multiplayer browser game where players compete to inflate balloons. Button mashing at its finest!

## Game Rules

- Press any key as fast as you can to inflate your balloon
- The game lasts for 30 seconds
- Most keypresses = biggest balloon = winner
- Compete against friends in real-time

## Features

- Real-time multiplayer using Socket.io
- 3D graphics with Three.js
- Colorful balloons that grow based on key presses
- Interactive game lobby
- Results screen showing all players' performance

## How to Play

1. Clone this repository
2. Install dependencies with `npm install`
3. Start the server with `npm start`
4. Open your browser and navigate to `http://localhost:3000`
5. Share the URL with friends on your local network to play together
6. Enter your name and click "Start Game"
7. Mash your keyboard when the game begins!

## Technologies Used

- Node.js
- Express
- Socket.io
- Three.js

## Development

To run the game in development mode with auto-restart:

```
npm install -g nodemon
npm run dev
```

## Multiplayer Setup

For playing with friends over the internet, you'll need to:

1. Deploy the game to a hosting service like Heroku, Vercel, or Glitch
2. Or use a service like ngrok to expose your local server

## License

ISC 