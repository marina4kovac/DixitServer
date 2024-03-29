var dbService = require('./db-service');
const ObjectID = require('mongodb').ObjectID;
var _ = require('underscore');

const maxCards = 108;
const cardsPerPlayer = 6;
const numberOfRounds = 1;

var games = new Map();

const GameState = {
    Waiting: 0,
    ChoosingWord: 1,
    PlayingCards: 2,
    Guessing: 3,
    Results: 4,
    End: 5,
    Rematch: 6
};

async function generateGame(gameName, numberOfPlayers, player, password, creator) {
    const decks = createGameDecks(numberOfPlayers);
    const gameInfo = {
        _id: undefined,
        gameName,
        numberOfPlayers,
        state: GameState.Waiting,
        decks,
        players: [player],
        creator,
        loggedOutPlayers: [],
    };
    if (password) {
        gameInfo.password = password;
    }
    const result = await dbService.saveOne('games', gameInfo);
    if (result) {
        gameInfo._id = result.toHexString();
        games.set(gameInfo._id, gameInfo);
        return {
            success: true,
            gameInfoWaiting: {
                _id: result,
                numberOfPlayers,
                state: GameState.Waiting,
                players: [player],
                loggedOutPlayers: []
            }
        };
    } else {
        return {
            errorMsg: 'Database error'
        };
    }
}

function createGameDecks(numberOfPlayers) {
    let totalNumberOfCards = cardsPerPlayer * numberOfPlayers + numberOfPlayers * (numberOfPlayers * numberOfRounds - 1);
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

async function joinGame(player, gameId, numberOfPlayers, noObj) {
    let result = await dbService.updateOne('games', {
        '_id': noObj ? gameId : new ObjectID(gameId),
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
        result = await updateState(gameId, newState);
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
        result = await handleLoggedOutPlayers(result);
        return result;
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
        result.decks.tableDeck = _.shuffle(result.decks.tableDeck);
        result = await dbService.updateOne('games', {
            '_id': result._id
        }, {
            $set: {
                'decks.tableDeck': result.decks.tableDeck,
                'state': GameState.Guessing
            }
        });
        result = await handleLoggedOutPlayers(result);
    }
    return result;
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
            if (result) {
                result = await handleLoggedOutPlayers(result);
            }
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
            if (rightAnswer.length === result.numberOfPlayers - 1 || rightAnswer.length === 0) {
                inc[`points.${index}`] += 2;
            } else {
                inc[`points.${index}`] += 3 * (!!rightAnswer.find(elem => elem === player));
            }
        }
    });
    result = await dbService.updateOne('games', {
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
    if (result && result.decks.freeDeck.length === 0) {
        result = await dbService.updateOne('games', {
            '_id': new ObjectID(gameId)
        }, {
            $push: {
                loggedOutPlayers: player
            }
        });
    }
    if (result &&
        ((result.decks.freeDeck.length > 0 && result.returned >= result.numberOfPlayers - result.loggedOutPlayers.length) ||
            (result.numberOfPlayers === result.loggedOutPlayers.length))
    ) {
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
            if (result) {
                result = await handleLoggedOutPlayers(result);
            }
        }
    }
    return result;
}

async function rematch(gameId, player) {
    let result = await dbService.updateOne('games', {
        '_id': new ObjectID(gameId)
    }, {
        $addToSet: {
            'loggedOutPlayers': player
        }
    });
    if (result && result.numberOfPlayers === result.loggedOutPlayers.length) {
        // await deleteById(result._id);
    }
    if (result && result._id) {
        result.state = GameState.Rematch;
    }
    return result;
}

async function joinRematchGame(gameName, creator, player, numberOfPlayers, password) {
    const rematchGame = await dbService.updateOrInsert('games', {
        'gameName': gameName,
        'creator': creator,
        'state': GameState.Waiting
    }, {
        $set: {
            'creator': creator
        }
    });
    if (rematchGame && rematchGame.decks) {
        return await joinGame(player, rematchGame._id, numberOfPlayers, true);
    } else if (rematchGame && !rematchGame.decks) {
        return await joinRematchGame(gameName, creator, player, numberOfPlayers, password);
    } else {
        const decks = createGameDecks(numberOfPlayers);
        const gameInfo = {
            gameName,
            numberOfPlayers,
            state: GameState.Waiting,
            decks,
            players: [player],
            creator,
            loggedOutPlayers: [],
        };
        if (password) {
            gameInfo.password = password;
        }
        const result = await dbService.updateOrInsert('games', {
            'gameName': gameName,
            'creator': creator,
            'state': GameState.Waiting
        }, {
            $set: {
                ...gameInfo
            }
        });
        if (result) {
            gameInfo._id = result._id;
            games.set(gameInfo._id, gameInfo);
            return {
                success: true,
                gameInfoWaiting: {
                    _id: gameInfo._id,
                    numberOfPlayers,
                    state: GameState.Waiting,
                    players: [player],
                    loggedOutPlayers: []
                }
            };
        } else {
            return {
                errorMsg: 'Database error'
            };
        }

        // return await generateGame(gameName, numberOfPlayers, player, password, creator);
    }
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
        '_id': gameId
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
        'word',
        'loggedOutPlayers',
        'gameName',
        'creator',
        'password',
        'guesses'
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
            if (result.state === GameState.Results || result.state === GameState.End) {
                mappedResult.tableDeck = result.decks.tableDeck;
            } else {
                mappedResult.tableDeck = result.decks.tableDeck.map(value => {
                    if (value.player === playerId) {
                        return {
                            card: value.card,
                            player: value.player
                        };
                    } else {
                        return {
                            card: value.card
                        }
                    }
                });
            }
        }
    }
    return mappedResult;
}

async function handleLoggedOutPlayers(game) {
    let result = game;
    console.log(game);
    if (game) {
        if (game.state === GameState.ChoosingWord && game.loggedOutPlayers.findIndex(pl => pl === game.players[game.playerChoosing]) > -1) {
            const hand = game.decks.playersDecks[game.playerChoosing];
            const random_card = Math.floor(Math.random() * hand.length);
            const playerDeck = `decks.playersDecks.${game.playerChoosing}`;
            let cardID = hand.splice(random_card, 1)[0];
            console.log('updating in db');
            result = await dbService.updateOne('games', {
                '_id': game._id
            }, {
                $set: {
                    'word': 'autogeneratedWord',
                    'state': GameState.PlayingCards
                },
                $push: {
                    'decks.tableDeck': {
                        'card': cardID,
                        'player': game.playerChoosing,
                        'guesses': []
                    }
                },
                $pull: {
                    [playerDeck]: cardID
                }
            });
            console.log('updated db -> ' + result.word);
        } else if (game.state === GameState.PlayingCards) {
            const tableDeck = game.decks.tableDeck;
            for (let pl of game.loggedOutPlayers) {
                const plIndex = game.players.findIndex(player => player === pl);
                if (tableDeck.findIndex(play => play.player === plIndex) === -1) {
                    const hand = game.decks.playersDecks[plIndex];
                    const random_card = Math.floor(Math.random() * hand.length);
                    const playerDeck = `decks.playersDecks.${plIndex}`;
                    let cardID = hand.splice(random_card, 1)[0];

                    result = await playCard(game._id, plIndex, cardID);
                }
            };
        } else if (game.state === GameState.Guessing) {
            for (let player of game.loggedOutPlayers) {
                if (game.players[game.playerChoosing] !== player) {
                    const playerIndex = game.players.findIndex(pl => pl === player);
                    const guessed = game.decks.tableDeck.find(td => td.guesses.find(g => g === player));
                    if (!guessed) {
                        const possible = game.decks.tableDeck.filter(td => td.player != playerIndex);
                        const random_card = Math.floor(Math.random() * possible.length);
                        let cardID = possible.splice(random_card, 1)[0].card;

                        result = await guessCard(game._id, player, cardID);
                    }
                }
            }
        } else if (game.decks.freeDeck.length === 0 && (game.state === GameState.End)) {
            await dbService.saveOne('finishedGames', {
                _id: undefined,
                gameName: game.gameName,
                players: game.players,
                points: game.points,
                date: new Date()
            });
        } else if (game.state === GameState.Results && game.decks.freeDeck.length !== 0) {
            if (game.returned >= game.numberOfPlayers - game.loggedOutPlayers.length) {
                {
                    console.log('generateNewRoundDisconnect');
                    result = await generateNewRound(game);

                    newState = GameState.ChoosingWord;
                    if (result && result._id) {
                        // result = await updateState(result._id, newState, player);
                        result = await dbService.updateOne('games', {
                            '_id': result_id
                        }, {
                            $set: {
                                'state': newState
                            }
                        });
                        console.log('updated');
                    }
                }
            }
        }
    }
    console.log('returning result ' + result.word);
    return result;
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
    GameState,
    handleLoggedOutPlayers,
    rematch,
    joinRematchGame
};