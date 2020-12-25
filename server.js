const express = require('express');
const app = express();

const socketio = require('socket.io');

require('dotenv').config();
const PORT = process.env.PORT

const server = app.listen(PORT, () => {
    console.log('server listening on port ' + PORT)
})

const io = socketio(server, {
    cors: {
        origin: true
    }
})

// array of all currently existing rooms 
const rooms = []

io.on('connection', socket => {
    console.log('user connected, socket: ' + socket.id)

    socket.on('createNewRoom', () => {
        // function to check if new room name is unique
        function roomNameCheck(name) {
            // for each existing room, check if name is equal to our new name
            for (let i = 0; i < rooms.length; i++) {
                const room = rooms[i]
                // if room name is equal to our new name, return false
                if (room.name === name) {
                    return false
                }
            }
            // if nothing is returned yet, return true
            return true
        }

        let roomName;
        // keep creating a new room name until a name not already being used is made
        do {
            roomName = generateRoomName()
        } while (!roomNameCheck(roomName))

        // create new object for the room
        const roomObj = {
            name: roomName,
            whitePlayer: '',
            blackPlayer: '',
            teamUp: 'none',
            watchers: []
        }
        console.log(roomObj)

        rooms.push(roomObj)
        console.log(rooms)

        // send new roomName back to client
        socket.emit('newRoomCreated', roomName)
    })

    // when user wants to join an existing room
    socket.on('joinExistingRoom', (roomId) => {
        // check for a room with the same id
        for (let i = 0; i < rooms.length; i++) {
            let room = rooms[i]
            if (room.name === roomId) {
                // if id's match, emit back the room id and break
                socket.emit('allowRoomJoin', roomId)
                break;
            }
        }
    })

    socket.on('disconnect', socket => {
        console.log('user disconnected, socket: ' + socket)
    })
})

// name space for a game
io.of('/game').on('connection', socket => {
    console.log('user connected to game socket name space')

    let roomName;

    // when user joins a game, add them to a room
    socket.on('joinRoom', roomId => {
        // find the room in the array of rooms
        for (let i = 0; i < rooms.length; i++) {
            let room = rooms[i]
            if (room.name === roomId) {
                // if id's match, join socket to room and break loop
                roomName = room.name
                socket.join(roomName)
                console.log('user joined room ' + room.name)
                break
            }
        }
    })

    socket.on('createUsername', username => {
        console.log(roomName)
        // using the already created room id, add the players username to that room in the rooms array
        let roomIndex;
        for (let i = 0; i < rooms.length; i++) {
            const room = rooms[i]
            if (room.name === roomName) {
                roomIndex = i
                break;
            }
        }

        // if no room exists, exit function and tell user something has happened
        if (!roomIndex && roomIndex !== 0) {
            console.log('no room exists')
            return
        }
        console.log('room exists')

        if (!rooms[roomIndex].whitePlayer) {
            // if no user at whitePlayer spot, make the new user player one
            rooms[roomIndex].whitePlayer = username
            socket.emit('usernameCreated', 'white')
            // tell rest of room that a new player has joined
            io.of(roomName).emit('newPlayerJoined', 'watcher')
        } else if (!rooms[roomIndex].blackPlayer) {
            // if there is a white user but no black user, make new user black player
            rooms[roomIndex].blackPlayer = username
            socket.emit('usernameCreated', 'black')
            // tell rest of room that a new player has joined
            io.of(roomName).emit('newPlayerJoined', 'black')
        } else {
            // if a player is currently in a black and white player position, add new user to watchers array
            rooms[roomIndex].watchers.push(username)
            socket.emit('usernameCreated', 'watcher')
            // tell rest of room that a new player has joined
            io.of(roomName).emit('newPlayerJoined', 'watcher')
        }
    })

    socket.on('beginGame', data => {
        const roomIndex = getRoomIndex(roomName)
        // if the room has a player on both teams, begin the game
        if (rooms[roomIndex].whitePlayer && rooms[roomIndex].blackPlayer) {
            io.of('/game').to(roomName).emit('startGame', 'white')
        } else {
            // if both teams don't have a player, don't let game start yet
            io.of('/game').to(roomName).emit('notEnoughPlayersToStart')
        }
    })

    socket.on('userMovedPiece', move => {
        console.log('user move received')
        // emit move to all connected users except the sender
        socket.broadcast.to(roomName).emit('opponentMove', move)
    })

    socket.on('disconnect', () => {
        console.log('user disconnected from game name space')
    })
})

// function to generate a random 6 letter string to be used as the room name
function generateRoomName() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz'

    let str = ''

    for (let i = 0; i < 6; i++) {
        // get random number between 0 and 25 to index letters
        const randomInt = Math.floor(Math.random() * 25)

        // push the indexed letter to the string
        str += alphabet[randomInt]
    }

    return str
}

function getRoomIndex(room) {
    let roomIndex;
    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i].name === room) {
            return i
        }
    }
}