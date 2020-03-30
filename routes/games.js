var express = require('express');
var router = express.Router();
var cors = require('cors');
var dbService = require('../utils/db-service');
const ObjectID = require('mongodb').ObjectID;

const GameState = {
    Waiting: 0,
    ChoosingWord: 1,
    PlayingCards: 2,
    Guessing: 3
};

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

router.post('/joinGame', cors(), (req, res, next) => {
    let {
        player,
        gameInfo
    } = req.body;

    joinGame(player, gameInfo._id, gameInfo.numberOfPlayers).then((result) => {
        res.json(result);
    });
});

async function joinGame(player, gameId, numberOfPlayers) {
    let result = await dbService.updateOne('games', {
        '_id': new ObjectID(gameId),
        'state': GameState.Waiting,
        'players': {
            $not: {
                $size: numberOfPlayers
            }
        }
    }, {
        $push: {
            players: player
        }
    });
    if (result && result.players.length === numberOfPlayers) {
        result = await updateState(result._id, GameState.ChoosingWord);
        return {
            success: true,
            gameInfo: result
        };
    } else {
        return {
            success: !!result,
            gameInfo: result
        };
    }

}

async function updateState(gameId, newState) {
    let result = await dbService.updateOne('games', {
        '_id': gameId
    }, {
        $set: {
            state: newState
        }
    });
    if (!result) {
        return await updateState(gameId, newState);
    }
    return result;
}

// router.post('/getGame', cors(), (req, res, next) => {
//     let gameId = req.body;
//     dbService.getOne('games', {
//         '_id': typeof gameId === "string" ? ObjectID(gameId) : gameId
//     }).then(result => {
//         res.json(result);
//     });
// });

router.get('/getActiveGames', cors(), (req, res, next) => {
    dbService.getAll('games', {
        'state': GameState.Waiting
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

router.get('/chooseWord', cors(), (req, res, next) => {
    let {
        gameId,
        word
    } = req.body;

    dbService.updateOne('games', {
        '_id': new ObjectID(gameId)
    }, {
        $set: {
            word: word,
            state: GameState.PlayingCards
        }
    }).then(result => {
        res.json(result);
    }).catch(() => {
        res.json(undefined);
    });
});
module.exports = router;