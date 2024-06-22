const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;

// middlewares


app.use(cors({
    origin: ['http://localhost:5173', 'https://a-12-client.web.app', 'https://a-12-client.firebaseapp.com'],
    credentials: true
}))
app.use(express.json())


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
        const sessionCollection = client.db('Synaps').collection('sessions');
        const feedbackCollection = client.db('Synaps').collection('feedbacks');
        const materialCollection = client.db('Synaps').collection('materials');
        const bookedSessionCollection = client.db('Synaps').collection('bookedSessions');
        const reviewCollection = client.db('Synaps').collection('reviews');
        const noteCollection = client.db('Synaps').collection('notes');
        const announcementCollection = client.db('Synaps').collection('announcements');

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
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req?.headers?.authorization?.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' });
                }
                req.decoded = decoded;
                next();
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req?.decoded?.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ status: 'forbidden access' })
            }
            next();
        }
        const verifyTutor = async (req, res, next) => {
            const email = req?.decoded?.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isTutor = user?.role === 'tutor';
            if (!isTutor) {
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
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get('/searchUsers', verifyToken, verifyAdmin, async (req, res) => {
            const search = req.query.search;
            if (search === '') {
                const result = await userCollection.find().toArray();
                return res.send(result);
            }
            const result = await userCollection.find({ $or: [{ name: search }, { email: search }] }).toArray();
            res.send(result);
        })

        app.get('/tutors', async (req, res) => {
            const filter = { role: 'tutor' };
            const result = await userCollection.find(filter).toArray();
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

        // add sessions
        app.post('/sessions', verifyToken, verifyTutor, async (req, res) => {
            const session = req.body;
            // console.log(session)
            const result = await sessionCollection.insertOne(session);
            res.send(result);
        })

        app.get('/sessions', verifyToken, verifyAdmin, async (req, res) => {
            const result = await sessionCollection.find({ $or: [{ status: 'pending' }, { status: 'approved' }] }).toArray();
            res.send(result);
        })
        app.get('/homeSessions', async (req, res) => {
            const result = await sessionCollection.find({ status: 'approved' }).toArray();
            res.send(result);
        })

        app.get('/singleSession/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await sessionCollection.findOne(filter);
            res.send(result);
        })

        app.get('/singleBookedSession/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await bookedSessionCollection.findOne(query);
            res.send(result);
        })

        // approve or reject sessions
        app.patch('/approve/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const fee = parseFloat(req.body.fee);
            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    status: 'approved',
                    fee: fee
                }
            }
            const result = await sessionCollection.updateOne(query, update);
            res.send(result)
        })
        app.get('/approved', verifyToken, verifyTutor, async (req, res) => {
            const email = req.query.email;
            const query = { status: 'approved', tutorEmail: email };
            const result = await sessionCollection.find(query).toArray();
            res.send(result);
        })

        app.patch('/reject/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const feedback = req.body;
            console.log(feedback);
            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    status: 'rejected'
                }
            }
            const result = await sessionCollection.updateOne(query, update);
            const addFeedback = await feedbackCollection.insertOne(feedback);
            res.send(result)
        })

        // get feedback
        app.get('/feedback/:id', verifyToken, verifyTutor, async (req, res) => {
            const id = req.params.id;
            console.log('wanting feedback for id', id)
            const filter = { sessionId: id };
            const feedback = await feedbackCollection.find(filter, { sort: { _id: -1 } }).toArray();
            res.send(feedback[0]);
        })

        // resend approve request
        app.patch('/resend/:id', verifyToken, verifyTutor, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    status: 'pending',
                }
            }
            const result = await sessionCollection.updateOne(query, update);
            res.send(result);
        })

        // tutors-sessions
        app.get('/mySessions', verifyToken, verifyTutor, async (req, res) => {
            const email = req.query.email;
            const query = { tutorEmail: email };
            const result = await sessionCollection.find(query).toArray();
            res.send(result);
        })

        // make admin or tutor or student
        app.patch('/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(query, update);
            res.send(result);
        })
        app.patch('/tutor/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    role: 'tutor'
                }
            }
            const result = await userCollection.updateOne(query, update);
            res.send(result);
        })
        app.patch('/student/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    role: 'student'
                }
            }
            const result = await userCollection.updateOne(query, update);
            res.send(result);
        })

        // materials related apis
        app.post('/materials', verifyToken, verifyTutor, async (req, res) => {
            const material = req.body;
            const result = await materialCollection.insertOne(material);
            res.send(result);
        })

        app.get('/materials', verifyToken, verifyTutor, async (req, res) => {
            const email = req.query.email;
            const filter = { tutorEmail: email };
            const result = await materialCollection.find(filter).toArray();
            res.send(result);
        })

        app.get('/allMaterials', verifyToken, verifyAdmin, async (req, res) => {
            const result = await materialCollection.find().toArray();
            res.send(result);
        })

        app.patch('/materials/:id', verifyToken, verifyTutor, async (req, res) => {
            const update = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedMaterial = {
                $set: {
                    title: update.title,
                    image: update.image,
                    driveLink: update.driveLink
                }
            }
            const result = await materialCollection.updateOne(query, updatedMaterial);
            res.send(result);
        })

        app.delete('/materials/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await materialCollection.deleteOne(filter);
            res.send(result);
        })

        // payment related apis
        app.post("/create-payment-intent", verifyToken, async (req, res) => {
            const { payment } = req.body;
            const amount = parseInt(payment * 100);
            console.log('amount to pay in intent', amount);
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/bookedSessions', verifyToken, async (req, res) => {
            const session = req.body;
            const result = await bookedSessionCollection.insertOne(session);
            res.send(result);
        })

        app.get('/bookedSessions', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { studentEmail: email };
            const result = await bookedSessionCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        })
        app.get('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = { sessionId: id };
            const result = await reviewCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/notes', verifyToken, async (req, res) => {
            const note = req.body;
            const result = await noteCollection.insertOne(note);
            res.send(result);
        })

        app.get('/notes', verifyToken, async (req, res) => {
            const email = req.query.email;
            const filter = { userEmail: email };
            const result = await noteCollection.find(filter).toArray();
            res.send(result);
        })

        app.patch('/notes/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const update = req.body;
            const updatedNote = {
                $set: {
                    title: update.title,
                    note: update.note
                }
            }
            const result = await noteCollection.updateOne(filter, updatedNote);
            res.send(result);
        })

        app.delete('/notes/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await noteCollection.deleteOne(filter);
            res.send(result);
        })

        app.post('/myCourseMaterials', verifyToken, async (req, res) => {
            const sessionArray = req.body;
            // console.log(sessionArray);
            const search = {
                sessionId: {
                    $in: sessionArray.sessions
                }
            }
            const result = await materialCollection.find(search).toArray();
            res.send(result);
        })

        app.post('/announcements', verifyToken, verifyAdmin, async (req, res) => {
            const announcement = req.body;
            const result = await announcementCollection.insertOne(announcement);
            res.send(result);
        })

        app.get('/announcements', async (req, res) => {
            const result = await announcementCollection.find().toArray();
            res.send(result);
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
