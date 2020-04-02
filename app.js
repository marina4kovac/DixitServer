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

io.on('connection', (socket) => {
    console.log('connected :' + socket.request._query.player);
    let gameId = socket.request._query.gameId;
    if (gameId) {
        dbService.getOne('games', {
            '_id': new ObjectID(gameId)
        }).then(result => {
            socket.broadcast.emit('updateRequest', result);
        });
    }

    socket.on('updated', (message) => {
        dbService.getOne('games', {
            '_id': new ObjectID(message)
        }).then(result =>
            socket.broadcast.emit('updateRequest', result));
    });

    socket.on('disconnect', () => {
        console.log('disconnected :' + socket.request._query.player);
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