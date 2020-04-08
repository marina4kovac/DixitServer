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
    dbService.getOne('games', {
        '_id': new ObjectID(gameId)
    }).then(result => {
        connections.forEach((value, key) => {
            if (key !== player) {
                let playerId = result.players.findIndex(val => val === key);
                value.emit('updateRequest', mapGameResult(result, playerId));
            }
        });
    });

    socket.on('updated', (gameId) => {
        dbService.getOne('games', {
            '_id': new ObjectID(gameId)
        }).then(result => {
            connections.forEach((value, key) => {
                if (key !== player) {
                    let playerId = result.players.findIndex(val => val === key);
                    value.emit('updateRequest', mapGameResult(result, playerId));
                }
            });
            if (result && result.state === 5) {
                deleteById(result._id);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('disconnected :' + player);
        connections.delete(player);
    })
});

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