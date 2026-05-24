const { io } = require("socket.io-client");
const socket = io("http://localhost:5000");
socket.on("connect", () => {
    socket.emit("run-code", {
        language: "sql",
        code: "CREATE TABLE test (id INT);\r\nINSERT INTO test VALUES (1);\r\nSELECT * FROM test;"
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
