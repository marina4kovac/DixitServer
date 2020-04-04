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
    Results: 4,
    End: 5
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
        result = await calcPoints(result);
        if (result) {
            result = await updateState(result._id, GameState.Results);
        }
    }
    return result;
}

async function calcPoints(result) {
    let inc = {};
    result.players.forEach((player, index) => {
        let guessedMyCard = result.decks.tableDeck.find(elem => elem.player === index).guesses;
        inc[`points.${index}`] = 0;
        if (index === result.playerChoosing) {
            if (guessedMyCard.length !== 0 && guessedMyCard.length !== result.numberOfPlayers - 1) {
                inc[`points.${index}`] += 3;
            }
        } else {
            inc[`points.${index}`] += guessedMyCard.length;
            let rightAnswer = result.decks.tableDeck.find(elem => elem.player === result.playerChoosing).guesses;
            inc[`points.${index}`] += 3 * (!!rightAnswer.find(elem => elem === player));
        }
    });
    result = dbService.updateOne('games', {
        '_id': result._id
    }, {
        $inc: inc,
        $unset: {
            guesses: ""
        },
        $set: {
            returned: 0
        }
    });
    return result;
}

router.post('/returnFromResults', cors(), (req, res, next) => {
    let gameId = req.body.gameId;
    returnFromResults(gameId).then(result => res.json(result));
});

async function returnFromResults(gameId) {
    let result = await dbService.updateOne('games', {
        '_id': new ObjectID(gameId)
    }, {
        $inc: {
            returned: 1
        }
    });
    if (result && result.returned === result.numberOfPlayers) {
        // go to end or deal for next round
        let newState;
        if (result.decks.freeDeck.length >= result.numberOfPlayers) {
            // deal next round
            result = await generateNewRound(result);
            newState = GameState.ChoosingWord;
        } else {
            // end of game
            newState = GameState.End;
        }
        if (result && result._id) {
            result = updateState(result._id, newState);
        }
    }
    return result;
}

async function generateNewRound(gameInfo) {
    let dealCards = [];
    let freeDeck = gameInfo.decks.freeDeck;
    let pushReq = {};
    for (let i = 0; i < gameInfo.numberOfPlayers; i++) {
        const random_card = Math.floor(Math.random() * (freeDeck.length + 1));
        let cardID = freeDeck.splice(random_card, 1)[0];
        dealCards.push(cardID);
        pushReq[`decks.playersDecks.${i}`] = cardID;
    }
    return await dbService.updateOne('games', {
        '_id': gameInfo._id
    }, {
        $pullAll: {
            'decks.freeDeck': dealCards
        },
        $set: {
            'decks.tableDeck': [],
            'prevPoints': gameInfo.points,
            'playerChoosing': (gameInfo.playerChoosing + 1) % gameInfo.numberOfPlayers
        },
        $unset: {
            'returned': "",
            'word': ""
        },
        $push: pushReq
    });
}

module.exports = router;