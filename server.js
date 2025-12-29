const express = require('express');
const app = express();
app.use(express.json());

/* =======================
    POSTGRES - Sequelize
======================= */
const { Sequelize, DataTypes } = require("sequelize");
const sequelize = new Sequelize(
  process.env.POSTGRES_DB || "operations",
  process.env.POSTGRES_USER || "postgres",
  process.env.POSTGRES_PASSWORD || "docker",
  {
    host: process.env.POSTGRES_HOST || "postgres",
    port: process.env.POSTGRES_PORT || 5432,
    dialect: "postgres",
    logging: false,
  }
);

const PgOperation = sequelize.define("Operation", {
  rawid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  flavor: DataTypes.STRING,
  operation: DataTypes.STRING,
  result: DataTypes.INTEGER,
  arguments: DataTypes.STRING
}, {
  tableName: "operations",
  timestamps: false
});

/* =======================
        MONGO - Mongoose
======================= */
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URL || "mongodb://mongo:27017/calculator");

const MongoOperation = mongoose.model(
  "MongoOperation",
  new mongoose.Schema({
    rawid: Number,
    flavor: String,
    operation: String,
    result: Number,
    arguments: String
  }, { collection: "calculator" })
);

/* =======================
      Calculator Logic
======================= */
const stack = [];

const operations = {
  Plus:  { fn:(x,y)=>x+y, argsCount:2 },
  Minus: { fn:(x,y)=>x-y, argsCount:2 },
  Times: { fn:(x,y)=>x*y, argsCount:2 },
  Divide:{ fn:(x,y)=>{ if(y===0) throw new Error('Error while performing operation Divide: division by 0'); return Math.trunc(x/y); }, argsCount:2 },
  Pow:   { fn:(x,y)=>Math.pow(x,y), argsCount:2 },
  Abs:   { fn:x=>Math.abs(x), argsCount:1 },
  Fact:  { fn:x=>{ if(x<0||!Number.isInteger(x)) throw new Error('Error while performing operation Factorial: not supported for the negative number'); let r=1; for(let i=2;i<=x;i++)r*=i; return r; }, argsCount:1 }
};

function getOperation(name) {
  if (!name) return null;
  const normalized = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  return operations[normalized] || null;
}

/* =======================
   Save operation to both DB
======================= */
async function saveToDB(data) {
  // 1️⃣ Save to Postgres (gets rawid auto-increment)
  const row = await PgOperation.create({
    flavor: data.flavor,
    operation: data.operation,
    result: data.result,
    arguments: JSON.stringify(data.arguments)
  });

  // 2️⃣ Save to Mongo using the same rawid
  await MongoOperation.create({
    rawid: row.rawid,
    flavor: data.flavor,
    operation: data.operation,
    result: data.result,
    arguments: JSON.stringify(data.arguments)
  });

  return row.rawid;
}

/* =======================
       ROUTES
======================= */

// health
app.get('/calculator/health', (req, res) => res.send("OK"));

// stack size
app.get('/calculator/stack/size', (req,res)=>res.send({result:stack.length}));

// push to stack
app.put('/calculator/stack/arguments', (req,res)=>{
  const args=req.body.arguments;
  if(!Array.isArray(args))return res.status(400).send({errorMessage:'Error: body must contain "arguments" array'});
  stack.push(...args);
  res.send({result:stack.length});
});

// delete from stack
app.delete('/calculator/stack/arguments', (req,res)=>{
  const count=Number(req.query.count||1);
  if(count>stack.length)return res.status(409).send({errorMessage:`Error: cannot remove ${count} from the stack. It has only ${stack.length} arguments`});
  for(let i=0;i<count;i++) stack.pop();
  res.send({result:stack.length});
});

// stack operation
app.get('/calculator/stack/operate', async (req,res)=>{
  const opRaw=req.query.operation;
  const op=getOperation(opRaw);
  if(!op)return res.status(409).send({errorMessage:`Error: unknown operation: ${opRaw}`});
  if(stack.length<op.argsCount)return res.status(409).send({errorMessage:`Error: cannot implement operation ${opRaw}. It requires ${op.argsCount} arguments and the stack has only ${stack.length} arguments`});

  const args=stack.splice(-op.argsCount).reverse();
  try{
    const result=op.fn(...args);
    const rawid=await saveToDB({flavor:"STACK",operation:opRaw,arguments:args,result});
    return res.send({result,id:rawid});
  }catch(e){
    stack.push(...args.reverse());
    return res.status(409).send({errorMessage:e.message});
  }
});

// independent
app.post('/calculator/independent/calculate', async(req,res)=>{
  const {arguments:args,operation}=req.body;
  const op=getOperation(operation);
  if(!op)return res.status(409).send({errorMessage:`Error: unknown operation: ${operation}`});
  if(!Array.isArray(args))return res.status(400).send({errorMessage:'Error: body must contain "arguments" array'});
  if(args.length!==op.argsCount)return res.status(409).send({errorMessage:`Error: ${operation} requires ${op.argsCount} arguments`});

  try{
    const result=op.fn(...args);
    const rawid=await saveToDB({flavor:"INDEPENDENT",operation,arguments:args,result});
    return res.send({result,id:rawid});
  }catch(e){ return res.status(409).send({errorMessage:e.message}); }
});

// history from DB
app.get('/calculator/history', async(req,res)=>{
  const method=req.query.persistenceMethod;
  const filter=req.query.flavor; // optional

  if(method==="POSTGRES"){
    const rows=await PgOperation.findAll();
    const data=rows.map(r=>({
      id:r.rawid,flavor:r.flavor,operation:r.operation,
      result:r.result,arguments:JSON.parse(r.arguments)
    }));
    return res.send(filter?data.filter(d=>d.flavor===filter):data);
  }

  if(method==="MONGO"){
    const rows=await MongoOperation.find();
    const data=rows.map(r=>({
      id:r.rawid,flavor:r.flavor,operation:r.operation,
      result:r.result,arguments:JSON.parse(r.arguments)
    }));
    return res.send(filter?data.filter(d=>d.flavor===filter):data);
  }

  return res.status(400).send({error:"Missing or invalid persistenceMethod"});
});

/* =======================
   Start server
======================= */
const port = 8496;
app.listen(port, () => console.log(`Server running on ${port}`));
