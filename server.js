const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
dotenv.config();

const app = express();

// 🔹 Middleware
app.use(express.json());
app.use(cors());

// 🔹 Test Route
app.get("/", (req, res) => {
  res.send("🚀 Compiler Engine API is running...");
});

// 🔥 HTTP SERVER
const server = http.createServer(app);

// 🔥 SOCKET.IO
const io = new Server(server, {
  cors: { origin: "*" },
});

// 📁 Temp directory
const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// 🔹 START SERVER
(async () => {
  const { v4: uuidv4 } = await import("uuid");

  // 🔥 SOCKET LOGIC
  io.on("connection", (socket) => {
    console.log("⚡ User connected:", socket.id);

    let childProcess = null;
    let execDir = null; // unique execution directory per run

    // ▶ RUN CODE
    socket.on("run-code", ({ code, language }) => {
      try {
        // Kill any existing process from a previous run
        if (childProcess) {
          try {
            childProcess.kill("SIGKILL");
          } catch (e) {}
          childProcess = null;
        }

        // Create a unique subdirectory for this execution (fixes Java concurrency + isolation)
        const execId = uuidv4();
        execDir = path.join(tempDir, execId);
        fs.mkdirSync(execDir, { recursive: true });

        // Create a persistent directory for this user's socket session (for SQL database state)
        const userDir = path.join(tempDir, socket.id);
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }

        let fileName = "";
        let dockerCommand = [];

        switch (language) {
          case "python":
            fileName = `code.py`;
            break;
          case "c":
            fileName = `code.c`;
            break;
          case "cpp":
            fileName = `code.cpp`;
            break;
          case "java":
            fileName = `Main.java`; // Java requires class name = file name
            break;
          case "sql":
            fileName = `queries.sql`;
            break;
          default:
            socket.emit("output", "❌ Unsupported language\n");
            return;
        }

        const filePath = path.join(execDir, fileName);
        fs.writeFileSync(filePath, code);

        // Build docker command — NO -t flag (Node.js is NOT a real TTY)
        // Use -i ONLY for stdin interaction
        if (language === "python") {
          dockerCommand = [
            "run", "-i", "--rm",
            "--name", `compiler-${execId.slice(0, 8)}`,
            "-v", `${execDir}:/app`,
            "--network", "none",
            "--memory", "256m",
            "--cpus", "0.5",
            "--pids-limit", "50",
            "code-runner",
            "python3", "-u", `/app/${fileName}`,
          ];
        }

        if (language === "c") {
          dockerCommand = [
            "run", "-i", "--rm",
            "--name", `compiler-${execId.slice(0, 8)}`,
            "-v", `${execDir}:/app`,
            "--network", "none",
            "--memory", "256m",
            "--cpus", "0.5",
            "--pids-limit", "50",
            "code-runner",
            "bash", "-c",
            `gcc /app/${fileName} -o /app/code && /app/code`,
          ];
        }

        if (language === "cpp") {
          dockerCommand = [
            "run", "-i", "--rm",
            "--name", `compiler-${execId.slice(0, 8)}`,
            "-v", `${execDir}:/app`,
            "--network", "none",
            "--memory", "256m",
            "--cpus", "0.5",
            "--pids-limit", "50",
            "code-runner",
            "bash", "-c",
            `g++ /app/${fileName} -o /app/code && /app/code`,
          ];
        }

        if (language === "java") {
          dockerCommand = [
            "run", "-i", "--rm",
            "--name", `compiler-${execId.slice(0, 8)}`,
            "-v", `${execDir}:/app`,
            "--network", "none",
            "--memory", "256m",
            "--cpus", "0.5",
            "--pids-limit", "50",
            "code-runner",
            "bash", "-c",
            `javac /app/${fileName} && java -cp /app Main`,
          ];
        }

        if (language === "sql") {
          dockerCommand = [
            "run", "-i", "--rm",
            "--name", `compiler-${execId.slice(0, 8)}`,
            "-v", `${execDir}:/app`,
            "-v", `${userDir}:/db`,
            "--network", "none",
            "--memory", "256m",
            "--cpus", "0.5",
            "--pids-limit", "50",
            "code-runner",
            "bash", "-c",
            // -header prints column names, -column prints aligned table format
            `sqlite3 -header -column /db/database.db < /app/${fileName}`,
          ];
        }

        console.log("🚀 Running:", dockerCommand.join(" "));

        childProcess = spawn("docker", dockerCommand, {
          stdio: ["pipe", "pipe", "pipe"],
        });

        // ⏱ 30-second timeout to kill infinite loops
        const timeout = setTimeout(() => {
          if (childProcess) {
            childProcess.kill("SIGKILL");
            socket.emit("output", "\n⏱ Execution timed out (10s limit)\n");
            console.log("⏱ Process killed: timeout");
          }
        }, 10000);

        // 📤 STDOUT
        childProcess.stdout.on("data", (data) => {
          const output = data.toString();
          console.log("OUTPUT:", output);
          socket.emit("output", output);
        });

        // 📤 STDERR
        childProcess.stderr.on("data", (data) => {
          const error = data.toString();
          console.log("ERROR:", error);
          socket.emit("output", error);
        });

        // ✅ PROCESS FINISHED
        childProcess.on("close", (exitCode) => {
          clearTimeout(timeout);
          console.log(`⚡ Process finished (exit code: ${exitCode})`);
          childProcess = null;

          // 🧹 Cleanup the unique execution directory
          try {
            if (execDir && fs.existsSync(execDir)) {
              fs.rmSync(execDir, { recursive: true, force: true });
            }
          } catch (cleanupErr) {
            console.log("🧹 Cleanup error:", cleanupErr.message);
          }
        });

        // Handle spawn errors
        childProcess.on("error", (err) => {
          clearTimeout(timeout);
          console.log("❌ Spawn error:", err.message);
          socket.emit("output", "❌ Failed to start container: " + err.message + "\n");
          childProcess = null;
        });

      } catch (err) {
        console.log("❌ Error:", err.message);
        socket.emit("output", "❌ Error: " + err.message + "\n");
      }
    });

    // ⌨️ INPUT (REAL-TIME)
    socket.on("input", (input) => {
      console.log("INPUT:", input);
      if (childProcess && childProcess.stdin && !childProcess.stdin.destroyed) {
        childProcess.stdin.write(input + "\n");
      }
    });

    // ❌ DISCONNECT
    socket.on("disconnect", () => {
      console.log("❌ User disconnected:", socket.id);
      if (childProcess) {
        try {
          childProcess.kill("SIGKILL");
        } catch (e) {}
      }
      // Cleanup exec dir on disconnect
      if (execDir && fs.existsSync(execDir)) {
        try {
          fs.rmSync(execDir, { recursive: true, force: true });
        } catch (e) {}
      }
      // Cleanup user persistent dir
      const userDir = path.join(tempDir, socket.id);
      if (fs.existsSync(userDir)) {
        try {
          fs.rmSync(userDir, { recursive: true, force: true });
        } catch (e) {}
      }
    });
  });

  const PORT = process.env.PORT || 5000;

  server.listen(PORT, () => {
    console.log(`🚀 Compiler Engine running on port ${PORT}`);
  });
})();
