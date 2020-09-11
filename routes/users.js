var express = require('express');
var router = express.Router();
var cors = require('cors');
var dbService = require('../utils/db-service');

var mongoClient = require('mongodb').MongoClient;

router.get('/', cors(), function (req, res, next) {
  res.json({
    users: [{
      username: "username",
      password: "password"
    }]
  });
});

router.post('/login', cors(), (req, res, next) => {
  let {
    username,
    password
  } = req.body;
  if (!username || !password) {
    res.json({
      errorId: 'WRONG_REQUEST',
      message: 'Wrong request'
    });
  } else {
    dbService.getOne('users', {
      '_id': username
    }).then(user => {
      res.json(handleLoginRequestResult(user, password));
    }).catch(() => {
      res.json({
        errorId: 'DB_ERROR',
        message: 'Something went wrong.'
      });
    });
  }
});


function handleLoginRequestResult(user, password) {
  if (!user) {
    return {
      errorId: "WRONG_USERNAME",
      message: "Wrong username."
    };
  } else if (user.password != password) {
    return {
      errorId: 'WRONG_PASSWORD',
      message: 'Wrong password'
    };
  } else {
    return {
      success: true
    };
  }
}

async function handleRegisterRequest(username, password) {
  let ret;
  try {
    const loginResult = await dbService.getOne('users', {
      '_id': username
    });
    if (loginResult) {
      ret = {
        errorId: 'INVALID_USERNAME',
        message: 'Username already exists'
      };
    } else {
      const saveResult = await dbService.saveOne('users', {
        '_id': username,
        username,
        password
      })
      if (saveResult) {
        ret = {
          success: true
        };
      } else {
        ret = {
          errorId: 'DB_ERROR',
          message: 'Something went wrong.'
        };
      }
    }
  } catch (error) {
    ret = {
      errorId: 'DB_ERROR',
      message: 'Something went wrong.'
    };
  }
  return ret;
}

router.post('/register', cors(), (req, res, next) => {
  let {
    username,
    password
  } = req.body;
  if (!username || !password) {
    res.json({
      errorId: 'WRONG_REQUEST',
      message: 'Wrong request'
    });
  } else {
    handleRegisterRequest(username, password).then(result => res.json(result));
  }
});



module.exports = router;