var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var cors = require('cors');
const socketIo = require('socket.io');
var dbService = require('./utils/db-service');
var ObjectID = require('mongodb').ObjectID;

var users = require('./routes/users');
var games = require('./routes/games');
const {
    handleLoggedOutPlayers,
    GameState
} = require('./utils/game-utils');

var app = express();

var io = app.io = require('socket.io')();

io.opts = {
    cors: {
      origin: "https://dixit-online-game.herokuapp.com",
      credentials:true,
    //   allowedHeaders: ['Content-Type', 'Authorization']
    }
  }

global.connections = new Map();
var mapGameResult = require('./utils/game-utils').mapResult;
var deleteById = require('./utils/game-utils').deleteById;


io.on('connection', async (socket) => {
    let {
        gameId,
        player
    } = socket.request._query;
    if (!global.connections.get(player)) {
        console.log('connected :' + player + ":" + gameId);
        global.connections.set(player, socket);
        await handleConnect(gameId, player);

        socket.on('updated', async (gameId) => {
            const result = await dbService.getOne('games', {
                '_id': new ObjectID(gameId)
            });
            if (result) {
                result.players.forEach((user, playerId) => {
                    console.log('updated -> update ' + player);
                    if (user != player && global.connections.get(user)) {
                        global.connections.get(user).emit('updateRequest', mapGameResult(result, playerId));
                    }
                });
            }
            if (result && result.state === 5) {
                deleteById(result._id);
            }
        });

        socket.on('disconnect', async () => {
            if (global.connections.get(player)) {
                console.log('disconnected :' + player + ' : ' + gameId);
                global.connections.delete(player);
                await handleDisconnect(gameId, player);
            }
        });
    }
});

async function handleDisconnect(gameId, player) {
    let result = await dbService.getOne('games', {
        '_id': new ObjectID(gameId)
    });
    if (result) {
        if (result.state === 0) {
            console.log('updateGame');
            result = await dbService.updateOne('games', {
                '_id': result._id
            }, {
                $pull: {
                    'players': player
                }
            });
            console.log('updateGame');
        } else {
            if (result.loggedOutPlayers.findIndex(val => val === player) === -1 && result.players.findIndex(val => val === player) > 0) {
                console.log('updateGame');
                result = await dbService.updateOne('games', {
                    '_id': result._id
                }, {
                    $push: {
                        'loggedOutPlayers': player
                    }
                });
                console.log('updateGame');
            }
            if (result) {
                console.log('handling disconnected now');
                result = await handleLoggedOutPlayers(result);
                console.log('returned -> ' + result.word);
            }
        }
        if (result && !(result.state === GameState.Results && result.loggedOutPlayers && result.loggedOutPlayers.length !== result.numberOfPlayers && result.decks.freeDeck.length === 0) && result.state !== GameState.End && result.state !== GameState.Rematch) {
            if (result.numberOfPlayers - result.loggedOutPlayers.length === 0) {
                await deleteById(result._id);
            } else {
                result.players.forEach((player, playerId) => {
                    if (global.connections.get(player) && (!result.loggedOutPlayers || result.loggedOutPlayers.findIndex(pl => pl === player) === -1)) {
                        console.log(`updated discon. -> ${player} ${result.word}`);
                        global.connections.get(player).emit('updateRequest', mapGameResult(result, playerId));
                    }
                });
            }
        }
    }

}

async function handleConnect(gameId, player) {
    let result = await dbService.getOne('games', {
        '_id': new ObjectID(gameId)
    });
    if (result) {
        if (result.loggedOutPlayers.findIndex(pl => pl === player) > -1) {
            result = await dbService.updateOne('games', {
                '_id': result._id
            }, {
                $pull: {
                    'loggedOutPlayers': player
                }
            });
        }
        if (result) {
            result.players.forEach((user, playerId) => {
                console.log(`updated -> conn. ${player}`);
                if (user != player && global.connections.get(user)) {
                    global.connections.get(user).emit('updateRequest', mapGameResult(result, playerId));
                }
            });
        }
    }
    return result;
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser())

app.use(cors());

app.use('/api/v1/users', users);
app.use('/api/v1/games', games);


dbService.deleteAll('games');
module.exports = app;