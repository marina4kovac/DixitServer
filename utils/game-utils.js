var dbService = require('./db-service');
const ObjectID = require('mongodb').ObjectID;
var _ = require('underscore');

const maxCards = 108;
const totalNumberOfCards = 30;
const cardsPerPlayer = 6;

const GameState = {
    Waiting: 0,
    ChoosingWord: 1,
    PlayingCards: 2,
    Guessing: 3,
    Results: 4,
    End: 5
};

async function generateGame(gameName, numberOfPlayers, player) {
    const decks = createGameDecks(numberOfPlayers);
    const gameInfo = {
        _id: undefined,
        gameName,
        numberOfPlayers,
        state: GameState.Waiting,
        decks,
        players: [player]
    };
    const result = await dbService.saveOne('games', gameInfo);
    if (result) {
        return {
            success: true,
            gameInfoWaiting: {
                _id: result,
                numberOfPlayers,
                state: GameState.Waiting,
                players: [player]
            }
        };
    } else {
        return {
            error: 'Database error'
        };
    }
}

function createGameDecks(numberOfPlayers) {
    let freeCards = _.sample([...Array(maxCards + 1).keys()].slice(1), totalNumberOfCards);

    let players_decks = [];

    for (let i = 0; i < numberOfPlayers; i++) {
        let deck = [];
        for (let card = 0; card < cardsPerPlayer; card++) {
            let seed = Math.random();
            let random_cardId = Math.floor(seed * freeCards.length);
            deck.push(freeCards[random_cardId]);
            freeCards.splice(random_cardId, 1);
        }
        players_decks.push(deck);
    }

    return {
        freeDeck: freeCards,
        playersDecks: players_decks,
        tableDeck: []
    };
}

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
        result = await dbService.updateOne('games', {
            '_id': result._id
        }, {
            $set: {
                state: GameState.ChoosingWord,
                points: Array(numberOfPlayers).fill(0),
                playerChoosing: Math.floor(Math.random() * numberOfPlayers)
            }
        });
        if (result) {
            return {
                success: true,
                gameInfo: mapResult(result, result.players.findIndex(val => val === player))
            };
        } else {
            return {
                success: false
            }
        }
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

async function chooseWord(gameId, word) {
    let result = await dbService.updateOne('games', {
        '_id': new ObjectID(gameId)
    }, {
        $set: {
            word: word,
            state: GameState.PlayingCards,
            guesses: 0
        }
    });
    if (result) {
        return mapResult(result, result.playerChoosing);
    } else {
        return undefined;
    }
}

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
        result.freeDeck = _.shuffle(result.freeDeck);
        result = await dbService.updateOne('games', {
            '_id': result._id
        }, {
            $set: {
                'decks.freeDeck': result.freeDeck,
                'state': GameState.Guessing
            }
        });
        return mapResult(result, player);
    } else {
        return result ? mapResult(result, player) : undefined;
    }
}

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
    return result ? mapResult(result, result.players.findIndex(val => val === player)) : undefined;
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
            if (rightAnswer.length === result.numberOfPlayers - 1 || rightAnswer.length === 0) {
                inc[`points.${index}`] += 2;
            } else {
                inc[`points.${index}`] += 3 * (!!rightAnswer.find(elem => elem === player));
            }
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

async function returnFromResults(gameId, player) {
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
            result = await updateState(result._id, newState);
        }
    }
    return result ? mapResult(result, result.players.findIndex(val => val === player)) : undefined;
}

async function generateNewRound(gameInfo) {
    let dealCards = [];
    let freeDeck = gameInfo.decks.freeDeck;
    let pushReq = {};
    for (let i = 0; i < gameInfo.numberOfPlayers; i++) {
        const random_card = Math.floor(Math.random() * freeDeck.length);
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

async function deleteById(gameId) {
    return await dbService.deleteOne('games', {
        '_id': new ObjectID(gameId)
    });
}

function mapResult(result, playerId) {
    let fields = [
        '_id',
        'numberOfPlayers',
        'state',
        'playerChoosing',
        'points',
        'prevPoints',
        'players',
        'word'
    ];

    let mappedResult = {};

    Object.entries(result).forEach(
        ([key, value]) => {
            if (fields.indexOf(key) > -1) {
                mappedResult[key] = value;
            }
        }
    );

    if (result.decks) {
        if (result.decks.playersDecks) {
            mappedResult.playerDeck = result.decks.playersDecks[playerId];
        }
        if (result.decks.freeDeck) {
            mappedResult.freeDeckSize = result.decks.freeDeck.length;
        }
        if (result.decks.tableDeck) {
            mappedResult.tableDeck = result.decks.tableDeck;
        }
    }
    return mappedResult;
}


module.exports = {
    generateGame,
    joinGame,
    updateState,
    chooseWord,
    playCard,
    guessCard,
    calcPoints,
    returnFromResults,
    generateNewRound,
    deleteById,
    mapResult,
    GameState
};