var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var cors = require('cors');

var users = require('./routes/users');
var games = require('./routes/games');

var app = express();

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