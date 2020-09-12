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
    result
} = require('underscore');
const {
    handleLoggedOutPlayers
} = require('./utils/game-utils');

var app = express();

var io = app.io = require('socket.io')();

var connections = new Map();
var mapGameResult = require('./utils/game-utils').mapResult;
var deleteById = require('./utils/game-utils').deleteById;


io.on('connection', (socket) => {
    let {
        gameId,
        player
    } = socket.request._query;
    console.log('connected :' + player);
    connections.set(player, socket);
    handleConnect(gameId, player);

    socket.on('updated', (gameId) => {
        dbService.getOne('games', {
            '_id': new ObjectID(gameId)
        }).then(result => {
            if (result) {
                result.players.forEach((user, playerId) => {
                    if (user != player && connections.get(user)) {
                        connections.get(user).emit('updateRequest', mapGameResult(result, playerId));
                    }
                });
            }
            if (result && result.state === 5) {
                deleteById(result._id);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('disconnected :' + player);
        connections.delete(player);
        handleDisconnect(gameId, player);
    })
});

async function handleDisconnect(gameId, player) {
    let result = await dbService.getOne('games', {
        '_id': new ObjectID(gameId)
    });
    if (result) {
        if (result.state === 0) {
            result = await dbService.updateOne('games', {
                '_id': result._id
            }, {
                $pull: {
                    'players': player
                }
            });
        } else {
            result = await dbService.updateOne('games', {
                '_id': result._id
            }, {
                $push: {
                    'loggedOutPlayers': player
                }
            });
            if (result) {
                result = await handleLoggedOutPlayers(result);
            }
        }
        if (result) {
            if (result.numberOfPlayers - result.loggedOutPlayers.length === 0) {
                await deleteById(result._id);
            } else {
                result.players.forEach((player, playerId) => {
                    if (connections.get(player)) {
                        connections.get(player).emit('updateRequest', mapGameResult(result, playerId));
                    }
                });
            }
        }
        // } else {
        //     if (result.players.length === 1) {
        //         await deleteById(result._id);
    }
    // result.players.forEach(player => {
    //     if (connections.get(player)) {
    //         connections.get(player).emit('updateRequest', undefined);
    //     }
    // });
    // await dbService.deleteOne('games', {
    //     '_id': result._id
    // });
    // }
    // }
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
                if (user != player && connections.get(user)) {
                    connections.get(user).emit('updateRequest', mapGameResult(result, playerId));
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

global.dburi = 'mongodb+srv://dixit-owner:64697869742d6f776e6572@dixitcluster-t7ctm.mongodb.net/test?retryWrites=true&w=majority';
global.dbname = 'dixit-resources';


module.exports = app;