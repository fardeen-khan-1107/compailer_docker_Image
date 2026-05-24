const { io } = require("socket.io-client");
const socket = io("http://localhost:5000");
socket.on("connect", () => {
    socket.emit("run-code", {
        language: "sql",
        code: "SELECT * FROM nonexistent;"
    });
});
let outputStr = "";
socket.on("output", (data) => {
    outputStr += data;
});
setTimeout(() => {
    console.log("FINAL OUTPUT:\n" + outputStr);
    process.exit(0);
}, 2000);
