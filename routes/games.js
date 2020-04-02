var express = require('express');
var router = express.Router();
var cors = require('cors');
var dbService = require('../utils/db-service');
const ObjectID = require('mongodb').ObjectID;

const GameState = {
    Waiting: 0,
    ChoosingWord: 1,
    PlayingCards: 2,
    Guessing: 3,
    Results: 4
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

router.post('/chooseWord', cors(), (req, res, next) => {
    let {
        gameId,
        word
    } = req.body;

    dbService.updateOne('games', {
        '_id': new ObjectID(gameId)
    }, {
        $set: {
            word: word,
            state: GameState.PlayingCards,
            guesses: 0
        }
    }).then(result => {
        res.json(result);
    }).catch(() => {
        res.json(undefined);
    });
});

router.post('/playCard', cors(), (req, res, next) => {
    let {
        gameId,
        player,
        card
    } = req.body;

    playCard(gameId, player, card).then(result => res.json(result));
});

async function playCard(gameId, player, card) {
    let playerDeck = `decks.playersDecks.${player}`;
    let result = await dbService.updateOne('games', {
        '_id': new ObjectID(gameId)
    }, {
        $push: {
            'decks.tableDeck': {
                card,
                player,
                'guesses': []
            }
        },
        $pull: {
            [playerDeck]: card
        }
    });
    if (result && result.decks && result.decks.tableDeck.length === result.numberOfPlayers) {
        result = await updateState(result._id, GameState.Guessing);
        return result;
    } else {
        return result;
    }
}

router.post('/guessCard', cors(), (req, res, next) => {
    let {
        gameId,
        player,
        card
    } = req.body;

    guessCard(gameId, player, card).then(result => res.json(result));
});

async function guessCard(gameId, player, card) {
    let result = await dbService.updateOne('games', {
        '_id': new ObjectID(gameId)
    }, {
        $push: {
            'decks.tableDeck.$[elem].guesses': player
        },
        $inc: {
            'guesses': 1
        },

    }, [{
        'elem.card': card
    }]);
    if (result && result.guesses === result.numberOfPlayers - 1) {
        // result = await calcPoints(result);
        result = await updateState(result._id, GameState.Results);
    }
    return result;
}

async function calcPoints(result) {
    let index = [];
    result.players.forEach((player, index) => {
        let guessedMyCard = result.decks.tableDeck.find(elem => elem.player === index);
        index.push(0);
        if (index === result.playerChoosing) {
            if (guessedMyCard.length !== 0 || guessedMyCard.length !== result.numberOfPlayers - 1) {
                inc[index] += 3;
            }
        } else {
            inc[index] += guessedMyCard.length;
            let rightAnswer = result.decks.tableDeck.find(elem => elem.player === result.playerChoosing);
            inc[index] += 3 * (rightAnswer.indexOf(player) > -1);
        }
    });
    // dbService.updateOne('games', {
    //     '_id': result._id
    // }, {
    //     $inc: {}
    // })
}

module.exports = router;