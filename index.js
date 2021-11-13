const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const ObjectId = require("mongodb").ObjectId;
require("dotenv").config();
var admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 5000;

//firebase admin init

var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.l19vq.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const idToken = req.headers.authorization.split(" ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(idToken);
      req.decodedUserEmail = decodedUser.email;
    } catch {}
  }

  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("timezone");
    const productsCollection = database.collection("products");
    const ordersCollection = database.collection("orders");
    const reviewsCollection = database.collection("reviews");
    const usersCollection = database.collection("users");

    //Product API
    app.get("/products", async (req, res) => {
      const items = req.headers.items;
      const cursor = productsCollection.find({});
      const products = await cursor.limit(parseInt(items)).toArray();
      res.send(products);
    });

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const product = await productsCollection.findOne(query);
      res.send(product);
    });

    app.post("/product", async (req, res) => {
      const newProduct = req.body;
      const result = await productsCollection.insertOne(newProduct);
      res.json(result);
    });

    app.delete("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.json(result);
    });

    //Orders API
    app.get("/userorders", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (req.decodedUserEmail === email) {
        const query = { userEmail: email };
        const cursor = ordersCollection.find(query);
        const orders = await cursor.toArray();
        res.send(orders);
      } else {
        res.status(401).json({ message: "User not authorized" });
      }
    });

    app.get("/manageorders", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (req.decodedUserEmail === email) {
        const cursor = ordersCollection.find({});
        const orders = await cursor.toArray();
        res.send(orders);
      } else {
        res.status(401).json({ message: "User not authorized" });
      }
    });

    app.post("/order", async (req, res) => {
      const newService = req.body;
      const result = await ordersCollection.insertOne(newService);
      res.json(result);
    });

    app.put("/manageorders/:id", async (req, res) => {
      const id = req.params.id;
      const updatedOrder = req.body;
      const query = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          status: updatedOrder.status,
        },
      };
      const result = await ordersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/order/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await ordersCollection.deleteOne(query);
      res.json(result);
    });

    //Reviews API
    app.get("/reviews", async (req, res) => {
      const cursor = reviewsCollection.find({});
      const reviews = await cursor.toArray();
      const count = await cursor.count();
      res.send({
        count,
        reviews,
      });
    });

    app.put("/placereview", async (req, res) => {
      const review = req.body;
      const filter = { email: review.email };
      const options = { upsert: true };
      const updateDoc = { $set: review };
      const result = await reviewsCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    //users API
    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find({});
      const users = await cursor.toArray();
      res.send(users);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.send({ admin: isAdmin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.role = "user";
      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    app.put("/users", async (req, res) => {
      let user = req.body;
      const query = { email: user.email };
      const oldUser = await usersCollection.findOne(query);
      if (oldUser) {
        user = oldUser;
      } else {
        user.role = "user";
      }
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      const requesterEmail = req.decodedUserEmail;
      if (requesterEmail) {
        const requesterAccount = await usersCollection.findOne({
          email: requesterEmail,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.send(result);
        }
      } else {
        res
          .status(401)
          .json({ message: "you are not authorized to make this user admin" });
      }
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Time Zone server is Running");
});

app.listen(port, () => {
  console.log("Running server on port", port);
});
