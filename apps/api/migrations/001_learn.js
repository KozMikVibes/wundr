// apps/api/migrations/001_learn.js
const fs = require("fs");
const path = require("path");

/**
 * @param {import("node-pg-migrate").MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  const sqlPath = path.join(__dirname, "sql", "001_learn.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Optional: implement rollback later. For beta, you can leave empty.
};
