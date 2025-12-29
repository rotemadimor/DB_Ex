const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize('operations', 'postgres', 'docker', {
  host: 'postgres',   // שימי לב: בתוך Docker Compose זה לא localhost
  port: 5432,
  dialect: 'postgres'
});

const Operation = sequelize.define("Operation", {
  rawid: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  flavor: DataTypes.STRING,
  operation: DataTypes.STRING,
  result: DataTypes.INTEGER,
  arguments: DataTypes.STRING
}, {
  tableName: "operations",
  timestamps: false
});

module.exports = { sequelize, Operation };
