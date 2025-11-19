const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateRoomCode() {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

io.on('connection', (socket) => {

    socket.on('createRoom', () => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [socket.id],
            gameStarted: false,
            rematchVotes: {}
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerId: 1 });
    });

    socket.on('joinRoom', (roomCode) => {
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('error', 'Room not found');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', 'Room is full');
            return;
        }

        room.players.push(socket.id);
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, playerId: 2 });
        io.to(roomCode).emit('playerJoined');
        
        setTimeout(() => {
            io.to(roomCode).emit('gameStart');
            room.gameStarted = true;
            room.rematchVotes = {};
        }, 1000);
    });

    socket.on('playerState', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode) {
            socket.to(roomCode).emit('opponentState', data);
        }
    });

    socket.on('shoot', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode) {
            socket.to(roomCode).emit('opponentShoot', data);
        }
    });

    socket.on('hit', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode) {
            io.to(roomCode).emit('hitRegistered', data);
        }
    });

    socket.on('gameOver', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode) {
            io.to(roomCode).emit('gameEnded', data);
            if (rooms[roomCode]) {
                rooms[roomCode].rematchVotes = {};
            }
        }
    });

    // Rematch request: when a player requests a rematch, restart the game for the room
    socket.on('requestRematch', () => {
        const roomCode = Object.keys(rooms).find(key => rooms[key].players.includes(socket.id));
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('rematchVoteUpdate', { type: 'error', message: 'Room not found for rematch.' });
            return;
        }
        if (room.players.length < 2) {
            socket.emit('rematchVoteUpdate', { type: 'error', message: 'No opponent available for rematch.' });
            return;
        }
        if (!room.rematchVotes) {
            room.rematchVotes = {};
        }

        room.rematchVotes[socket.id] = true;

        socket.emit('rematchVoteUpdate', {
            type: 'waiting',
            message: 'Vote recorded. Waiting for opponent...'
        });
        socket.to(roomCode).emit('rematchVoteUpdate', {
            type: 'opponent-voted',
            message: 'Opponent wants a rematch!'
        });

        const everyoneAccepted = room.players.every(id => room.rematchVotes[id]);
        if (everyoneAccepted) {
            io.to(roomCode).emit('rematchVoteUpdate', {
                type: 'accepted',
                message: 'Both players agreed. Restarting match!'
            });
            room.rematchVotes = {};
            setTimeout(() => {
                io.to(roomCode).emit('gameStart');
                room.gameStarted = true;
            }, 1000);
        }
    });

    socket.on('disconnect', () => {
        const roomCode = Object.keys(rooms).find(key => rooms[key].players.includes(socket.id));
        if (roomCode) {
            socket.to(roomCode).emit('opponentDisconnected');
            delete rooms[roomCode];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});