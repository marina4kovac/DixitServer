const dbUsername = 'dixit-owner';
const dbPassword = 'Xwm2banKfrTP9ixu';
const dbNAME = 'dixit-resources';
const dbURI = `mongodb+srv://${dbUsername}:${dbPassword}@cluster0.diody.mongodb.net/${dbNAME}?retryWrites=true&w=majority`;
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
    } catch (error) {
        console.log(error);
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

async function updateOne(collection, filter, updateOpts, arrayFilters = undefined) {
    let database = await openDB();
    try {
        let db = database.db(dbNAME);
        let result;
        if (arrayFilters) {
            result = await db.collection(collection).findOneAndUpdate(filter, updateOpts, {
                returnOriginal: false,
                arrayFilters
            });
        } else {
            result = await db.collection(collection).findOneAndUpdate(filter, updateOpts, {
                returnOriginal: false
            });
        }
        return result.value;
    } finally {
        await database.close();
    }
}

async function getAll(collection, filter) {
    let database = await openDB();
    try {
        let db = database.db(dbNAME);
        let result = await db.collection(collection).find(filter);
        if (!result) {
            return [];
        } else {
            return await result.toArray();
        }
    } finally {
        await database.close();
    }
}

async function deleteOne(collection, filter) {
    let database = await openDB();
    try {
        let db = database.db(dbNAME);
        let result = await db.collection(collection).deleteOne(filter);
        return result;
    } finally {
        await database.close();
    }
}

async function deleteAll(collection) {
    let database = await openDB();
    try {
        let db = database.db(dbNAME);
        let result = await db.collection(collection).deleteMany({});
        return result;
    } finally {
        await database.close();
    }
}

async function updateOrInsert(collection, filter, updateOpts) {
    let database = await openDB();
    try {
        let db = database.db(dbNAME);
        const result = await db.collection(collection).findOneAndUpdate(filter, updateOpts, {
            returnOriginal: true,
            upsert: true
        });
        return result.value;
    } finally {
        await database.close();
    }
}

module.exports = {
    getOne,
    saveOne,
    updateOne,
    updateOrInsert,
    getAll,
    deleteOne,
    deleteAll
}