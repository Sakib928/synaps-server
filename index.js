const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;

// middlewares


app.use(cors())
app.use(express.json())



const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1towayy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
        const userCollection = client.db('Synaps').collection('users');

        // jwt related apis
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            console.log('from jwt signing', user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
                expiresIn: '6h'
            })
            res.send({ token });
        })

        //custom middlewares
        const verifyToken = async (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ status: 'forbidden access' })
            }
            next();
        }


        // user related apis
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const userExists = await userCollection.findOne(query);
            if (userExists) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        })
        // find user role
        app.get('/role', async (req, res) => {
            const email = req.query.email;
            console.log('to find the role:', email)
            const query = { email: email };
            const user = await userCollection.findOne(query);
            res.send(user?.role);
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

app.get('/', async (req, res) => {
    res.send('server is running with mongodb connected')
})

app.listen(port, () => {
    console.log(`server is running on port ${port}`)
})
run().catch(console.dir);
