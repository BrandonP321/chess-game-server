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
            whitePiecesTaken: [],
            blackPiecesTaken: [],
            watchers: [],
            gameStatus: false,
            pieces: []
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
                // send room info back to client
                socket.emit('roomJoined', room)
                break
            }
        }
    })

    socket.on('createUsername', username => {
        // using the already created room id, add the players username to that room in the rooms array
        let roomIndex = getRoomIndex(roomName)

        // if no room exists, exit function and tell user something has happened
        if (!roomIndex && roomIndex !== 0) {
            console.log('no room exists')
            return
        }

        let color;

        if (!rooms[roomIndex].whitePlayer) {
            // if no user at whitePlayer spot, make the new user player one
            rooms[roomIndex].whitePlayer = username
            color = 'white'
        } else if (!rooms[roomIndex].blackPlayer) {
            // if there is a white user but no black user, make new user black player
            rooms[roomIndex].blackPlayer = username
            color = 'black'
        } else {
            // if a player is currently in a black and white player position, add new user to watchers array
            rooms[roomIndex].watchers.push(username)
            color = 'watcher'
        }

        socket.emit('usernameCreated', { color: color, username: username })
        socket.broadcast.to(roomName).emit('newPlayerJoined', {color: color, username: username})
    })

    socket.on('beginGame', data => {
        const roomIndex = getRoomIndex(roomName)
        // if the room has a player on both teams, set white as team up and begin the game
        if (rooms[roomIndex].whitePlayer && rooms[roomIndex].blackPlayer) {
            io.of('/game').to(roomName).emit('startGame', 'white')
        } else {
            // if both teams don't have a player, don't let game start yet
            io.of('/game').to(roomName).emit('notEnoughPlayersToStart')
        }
    })

    socket.on('gameStatusChange', status => {
        let roomIndex = getRoomIndex(roomName)
        console.log(status)
        // update status boolean
        rooms[roomIndex].gameStatus = status
    })

    socket.on('updateTeamUp', team => {
        let roomIndex = getRoomIndex(roomName)
        rooms[i].teamUp = team
    })

    socket.on('userMovedPiece', move => {
        console.log('user move received')
        // emit move to all connected users except the sender
        socket.broadcast.to(roomName).emit('opponentMove', move)
    })

    socket.on('pieceTaken', piece => {
        const roomIndex = getRoomIndex(roomName)
        // based on piece's color, push it to the appropriate array
        if (piece.color === 'white') {
            rooms[roomIndex].whitePiecesTaken.push(piece.pieceType)
        } else if (piece.color === 'black') {
            rooms[roomIndex].blackPiecesTaken.push(piece.pieceType)
        }
    })

    socket.on('kingTaken', team => {
        // send to all in room the winning team
        io.of('/game').to(roomName).emit('gameOver', team)
    })

    socket.on('startNewGame', () => {
        // reset values in rooms Obj
        const roomIndex = getRoomIndex(roomName)
        const room = rooms[roomIndex]
        room.teamUp = 'white';
        room.whitePiecesTaken = []
        room.blackPiecesTaken = []
        room.pieces = []
        // send message to all connected users to reset their boards
        io.of('/game').to(roomName).emit('resetGame')
    })

    // update pieces stored on server when the array changes on the front end
    socket.on('piecesUpdate', data => {
        const { pieces, teamUp } = data
        const roomIndex = getRoomIndex(roomName)
        rooms[roomIndex].pieces = pieces
        rooms[roomIndex].teamUp = teamUp
    })

    // sent when user leave's site, to remove them from the room's info obj
    socket.on('userLeaving', user => {
        let roomIndex = getRoomIndex(roomName)
        const { team, username } = user
        // get spectator next in line to take over for the user
        const nextInLine = rooms[roomIndex].watchers.length > 0 ? rooms[roomIndex].watchers[0] : ''
        // remove user from room obj
        switch (team) {
            case 'white':
                rooms[roomIndex].whitePlayer = nextInLine
                break
            case 'black':
                rooms[roomIndex].blackPlayer = nextInLine
                break
            case 'watcher':
                rooms[roomIndex].watchers = rooms[roomIndex].watchers.filter(watcher => watcher !== user.username)
                break
        }
        // emit to all other connected users that a user has left
        io.of('/game').to(roomName).emit('userLeft', user)
        // if there is a spectator to take over, send that updated room info to users
        if (nextInLine) {
            io.of('/game').to(roomName).emit('userTakingOver', { team: team, username: nextInLine })
        } else {
            // else tell client that a second user is needed to start the game
            io.of('/game').to(roomName).emit('waitingForUser')
        }
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