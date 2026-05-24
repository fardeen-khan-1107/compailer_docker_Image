const { io } = require("socket.io-client");

const socket = io("http://localhost:5000");

socket.on("connect", () => {
    console.log("Connected. Sending SQL query...");
    socket.emit("run-code", {
        language: "sql",
        code: `
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
INSERT INTO users (name) VALUES ('Alice'), ('Bob');
SELECT * FROM users;
`
    });
});

let outputStr = "";
socket.on("output", (data) => {
    outputStr += data;
});

socket.on("disconnect", () => {
    console.log("Disconnected.");
    console.log("FINAL OUTPUT:\n" + outputStr);
});

setTimeout(() => {
    console.log("FINAL OUTPUT:\n" + outputStr);
    process.exit(0);
}, 5000);
