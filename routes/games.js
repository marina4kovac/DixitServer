var express = require('express');
var router = express.Router();
var cors = require('cors');
var dbService = require('../utils/db-service');
const ObjectID = require('mongodb').ObjectID;

var {
    generateGame,
    joinGame,
    chooseWord,
    playCard,
    guessCard,
    returnFromResults,
} = require('../utils/game-utils');


router.post('/createGame', cors(), (req, res, next) => {
    let {
        gameName,
        numberOfPlayers,
        player
    } = req.body;

    generateGame(gameName, numberOfPlayers, player).then(
        (result) => res.json(result)
    );
});

router.post('/joinGame', cors(), (req, res, next) => {
    let {
        player,
        gameInfo
    } = req.body;

    joinGame(player, gameInfo._id, gameInfo.numberOfPlayers).then((result) => {
        res.json(result);
    });
});

router.get('/getActiveGames', cors(), (req, res, next) => {
    dbService.getAll('games', {
        'state': 0
    }).then(result => {
        res.json({
            activeGames: result
        });
    }).catch(() => {
        res.json({
            activeGames: []
        });
    });
});

router.post('/chooseWord', cors(), (req, res, next) => {
    let {
        gameId,
        word
    } = req.body;

    chooseWord(gameId, word).then(result => res.json(result));
});

router.post('/playCard', cors(), (req, res, next) => {
    let {
        gameId,
        player,
        card
    } = req.body;

    playCard(gameId, player, card).then(result => res.json(result));
});

router.post('/guessCard', cors(), (req, res, next) => {
    let {
        gameId,
        player,
        card
    } = req.body;

    guessCard(gameId, player, card).then(result => res.json(result));
});


router.post('/returnFromResults', cors(), (req, res, next) => {
    let {
        gameId,
        player
    } = req.body;
    returnFromResults(gameId, player).then(result => res.json(result));
});



module.exports = router;