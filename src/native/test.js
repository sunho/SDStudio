const { createDB, search, loadDB, releaseDB } = require("./");
const fs = require("fs");

const prompt = require("prompt-sync")();
const db = createDB("test");
const content = fs.readFileSync("db.csv", "utf8");
loadDB(db, content);
while (true) {
    const input = prompt("Enter a search term: ");
    const before = Date.now();
    const result = search(db, input);
    const after = Date.now();
    console.log(`Search took ${after - before} ms`);
    console.log(result.slice(0, 20));
}

