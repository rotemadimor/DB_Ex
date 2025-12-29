const mongoose = require("mongoose");

mongoose.connect("mongodb://mongo:27017/calculator"); // שם השרת docker-compose, לא localhost

const OperationSchema = new mongoose.Schema({
  rawid: Number,
  flavor: String,
  operation: String,
  result: Number,
  arguments: String
}, { collection: "calculator" });

const MongoOperation = mongoose.model("MongoOperation", OperationSchema);
module.exports = { MongoOperation };
