const fs = require("node:fs");
const path = require("node:path");

const readJson = (filename) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", filename), "utf8"));

module.exports = readJson;