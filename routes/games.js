var express = require('express');
var router = express.Router();
var cors = require('cors');
var dbService = require('../utils/db-service');

router.post('/createGame', cors(), (req, res, next) => {
    let gameInfo = req.body;
    dbService.saveOne('games', gameInfo).then(gameId => {
        res.json({
            'success': true,
            'gameId': gameId
        });
    }, () => {
        res.json({
            error: 'Database error'
        });
    });
});

router.post('/updateGame', cors(), (req, res, next) => {
    let gameInfo = req.body;
    dbService.updateOne('games', gameInfo).then((result) => {
        // if (result) {
        //     Stream.emit('push', 'message', gameInfo);
        // }
    });
});

router.post('/getGame', cors(), (req, res, next) => {
    let gameId = req.body;
    dbService.getOne('games', {
        '_id': typeof gameId === "string" ? IdObjectId(gameId) : gameId
    }).then(result => {
        res.json(result);
    });
});

module.exports = router;