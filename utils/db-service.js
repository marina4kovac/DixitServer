const dbUsername = 'dixit-owner';
const dbPassword = 'KfGcdIuUt6eGxJHg';
const dbURI = `mongodb+srv://${dbUsername}:${dbPassword}@dixitcluster-hepyh.mongodb.net/test?retryWrites=true&w=majority`;
const dbNAME = 'dixit-resources';
var mongoClient = require('mongodb').MongoClient;


async function openDB() {
    return await mongoClient.connect(dbURI, {
        useUnifiedTopology: true
    });
}

async function getOne(collection, filter) {
    let database = await openDB();
    try {
        let db = database.db(dbNAME);
        let result = await db.collection(collection).findOne(filter);
        return result;
    } finally {
        await database.close();
    }
}

async function saveOne(collection, item) {
    let database = await openDB();
    try {
        let db = database.db(dbNAME);
        let result = (await db.collection(collection).insertOne(item)).insertedId;
        return result;
    } finally {
        await database.close();
    }
}

async function updateOne(collection, item) {
    let database = await openDB();
    try {
        let db = database.db(dbNAME);
        await db.collection(collection).findOneAndReplace({
            '_id': typeof (item._id) === "string" ? ObjectId(item._id) : item._id
        }, item);
        return true;
    } finally {
        await database.close();
    }
}

module.exports = {
    getOne,
    saveOne,
    updateOne
}