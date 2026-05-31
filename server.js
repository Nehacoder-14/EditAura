require("dotenv").config();

const http = require("http");
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = 3001;

// Database setup
const DB_PATH = path.join(__dirname, "data", "workspaces.json");

if (!fs.existsSync(path.join(__dirname, "data"))) {
    fs.mkdirSync(path.join(__dirname, "data"));
}

function readWorkspaces() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, "utf8");
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("Error reading database:", err);
    }
    return [];
}

function writeWorkspaces(workspaces) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(workspaces, null, 2));
    } catch (err) {
        console.error("Error writing database:", err);
    }
}

function initWorkspaces() {
    let workspaces = readWorkspaces();
    if (workspaces.length === 0) {
        workspaces = [
            { 
                id: "1", 
                name: "JavaScript Playground", 
                language: "JavaScript", 
                description: "Test and run JavaScript code in real-time", 
                createdBy: "System", 
                createdAt: new Date().toISOString(), 
                activeUsers: 0,
                code: `// Welcome to JavaScript Workspace
console.log("🚀 Hello from JavaScript!");

// Try some code examples:
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("📊 Fibonacci(10):", fibonacci(10));

// Array methods example
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log("✨ Doubled numbers:", doubled);

// Object example
const user = {
    name: "EditAura User",
    role: "Developer",
    greet() {
        return \`Hello, I'm \${this.name}\`;
    }
};
console.log("👤 User greeting:", user.greet());

// Feel free to experiment!`
            },
            { 
                id: "2", 
                name: "CSS Playground", 
                language: "CSS", 
                description: "Design and preview CSS styles", 
                createdBy: "System", 
                createdAt: new Date().toISOString(), 
                activeUsers: 0,
                code: `/* CSS Playground - Design your styles here */
body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
    padding: 20px;
}

.container {
    text-align: center;
}

.card {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 20px;
    padding: 40px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    animation: slideIn 0.5s ease;
    max-width: 500px;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(-30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

h1 {
    color: #667eea;
    margin-bottom: 10px;
    font-size: 2em;
}

p {
    color: #666;
    margin-bottom: 20px;
    line-height: 1.6;
}

button {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    border: none;
    padding: 12px 30px;
    border-radius: 25px;
    font-size: 16px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
}

button:hover {
    transform: scale(1.05);
    box-shadow: 0 10px 20px rgba(0,0,0,0.2);
}

input {
    padding: 10px;
    margin: 10px;
    border: 1px solid #ddd;
    border-radius: 10px;
    width: 200px;
}`
            },
            { 
                id: "3", 
                name: "Python Playground", 
                language: "Python", 
                description: "Run Python code instantly", 
                createdBy: "System", 
                createdAt: new Date().toISOString(), 
                activeUsers: 0,
                code: `# Python Playground
print("🐍 Hello from Python!")

# Try some Python code examples:

def fibonacci(n):
    """Calculate Fibonacci numbers"""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print(f"📊 Fibonacci(10): {fibonacci(10)}")

# List comprehension
numbers = [1, 2, 3, 4, 5]
squared = [x**2 for x in numbers]
print(f"✨ Squared numbers: {squared}")

# Dictionary example
user = {
    "name": "EditAura User",
    "role": "Developer",
    "languages": ["Python", "JavaScript", "CSS"]
}
print(f"👤 User: {user['name']}")
print(f"💻 Languages: {', '.join(user['languages'])}")

# Feel free to experiment with your own code!`
            }
        ];
        writeWorkspaces(workspaces);
    }
    return workspaces;
}

let workspaces = initWorkspaces();
let connectedUsers = new Map(); // socketId -> user data
let roomMembers = new Map(); // roomId -> Set of socketIds

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Serve pages
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/room/:id", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "room.html"));
});

// API Routes
app.get("/api/workspaces", (req, res) => {
    const wsList = workspaces.map(ws => ({
        ...ws,
        activeUsers: roomMembers.get(ws.id)?.size || 0
    }));
    res.json({ workspaces: wsList });
});

app.get("/api/workspaces/:id", (req, res) => {
    const workspace = workspaces.find(w => w.id === req.params.id);
    if (!workspace) return res.status(404).json({ error: "Workspace not found" });
    res.json({ workspace: { 
        ...workspace, 
        activeUsers: roomMembers.get(workspace.id)?.size || 0 
    } });
});

app.post("/api/workspaces", (req, res) => {
    const { name, language, description, createdBy } = req.body;
    const newWorkspace = {
        id: Date.now().toString(),
        name: name || "New Workspace",
        language: language || "JavaScript",
        description: description || "",
        createdBy: createdBy || "Anonymous",
        createdAt: new Date().toISOString(),
        activeUsers: 0,
        code: getDefaultCode(language || "JavaScript")
    };
    workspaces.push(newWorkspace);
    writeWorkspaces(workspaces);
    res.status(201).json({ workspace: newWorkspace });
});

app.post("/api/execute", (req, res) => {
    const { language, code } = req.body;
    
    if (language === "JavaScript") {
        try {
            let output = "";
            const originalLog = console.log;
            console.log = (...args) => {
                output += args.join(" ") + "\n";
            };
            const result = eval(code);
            console.log = originalLog;
            if (result !== undefined && output === "") output = String(result);
            res.json({ output: output || "✅ Code executed successfully (no output)" });
        } catch (err) {
            res.json({ output: `❌ Error: ${err.message}` });
        }
    } 
    else if (language === "Python") {
        const tempFile = path.join(__dirname, "data", `temp_${Date.now()}.py`);
        fs.writeFileSync(tempFile, code);
        exec(`python "${tempFile}"`, (error, stdout, stderr) => {
            fs.unlinkSync(tempFile);
            if (error) {
                res.json({ output: `❌ Error:\n${stderr || error.message}` });
            } else {
                res.json({ output: stdout || "✅ Code executed successfully (no output)" });
            }
        });
    }
    else if (language === "CSS") {
        res.json({ output: "🎨 CSS code cannot be executed, but you can preview it in the editor!\n\nTip: Create an HTML file with your styles to see them in action." });
    }
    else {
        res.json({ output: "❌ Execution not supported for this language yet" });
    }
});

function getDefaultCode(language) {
    const defaults = {
        JavaScript: `// Welcome to JavaScript Workspace
console.log("🚀 Hello from JavaScript!");

function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("📊 Fibonacci(10):", fibonacci(10));

const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log("✨ Doubled numbers:", doubled);`,
        CSS: `/* CSS Playground */
body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
}

.card {
    background: white;
    border-radius: 20px;
    padding: 40px;
    text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
}

button {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    border: none;
    padding: 12px 30px;
    border-radius: 25px;
    cursor: pointer;
}

button:hover {
    transform: scale(1.05);
}`,
        Python: `# Python Workspace
print("🐍 Hello from Python!")

def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(f"📊 Factorial of 5 is: {factorial(5)}")

numbers = [1, 2, 3, 4, 5]
squares = [x**2 for x in numbers]
print(f"✨ Squares: {squares}")`
    };
    return defaults[language] || defaults.JavaScript;
}

// Socket.IO Setup
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

io.on("connection", (socket) => {
    console.log("🔌 User connected:", socket.id);

    // Register user
    socket.on("register-user", (userData) => {
        connectedUsers.set(socket.id, {
            id: userData.id,
            username: userData.username,
            avatar: userData.avatar || "👤",
            joinedAt: new Date().toISOString()
        });
        console.log(`✅ User registered: ${userData.username} (${socket.id})`);
    });

    // Join workspace room
    socket.on("join_room", ({ roomId }) => {
        const user = connectedUsers.get(socket.id);
        if (!user) {
            console.log(`⚠️ User not registered, cannot join room`);
            return;
        }
        
        socket.join(roomId);
        
        if (!roomMembers.has(roomId)) {
            roomMembers.set(roomId, new Set());
        }
        roomMembers.get(roomId).add(socket.id);
        
        const username = user.username;
        
        console.log(`📥 ${username} joined workspace: ${roomId}`);
        
        // Broadcast user joined to others in the room
        socket.to(roomId).emit("user_joined", { 
            username: username,
            timestamp: new Date().toISOString()
        });
        
        // Update room users list for everyone
        const usersInRoom = Array.from(roomMembers.get(roomId)).map(id => ({
            id: id,
            username: connectedUsers.get(id)?.username || "Anonymous"
        }));
        
        io.to(roomId).emit("room_users", { users: usersInRoom });
        
        // Send current code to the new user
        const workspace = workspaces.find(w => w.id === roomId);
        if (workspace && workspace.code) {
            socket.emit("code_update", { code: workspace.code });
        }
        
        // Send welcome message
        socket.emit("chat_message", {
            username: "System",
            message: `✨ Welcome to ${workspace?.name || 'workspace'}! Start collaborating!`,
            timestamp: new Date().toISOString()
        });
    });

    // Handle code changes
    socket.on("code_change", ({ roomId, code }) => {
        const workspace = workspaces.find(w => w.id === roomId);
        if (workspace) {
            workspace.code = code;
            writeWorkspaces(workspaces);
        }
        socket.to(roomId).emit("code_update", { code });
    });

    // Handle chat messages
    socket.on("chat_message", ({ roomId, message, username }) => {
        const user = connectedUsers.get(socket.id);
        const senderName = username || user?.username || "Anonymous";
        
        console.log(`💬 Chat in ${roomId}: ${senderName}: ${message}`);
        
        io.to(roomId).emit("chat_message", {
            username: senderName,
            message: message,
            timestamp: new Date().toISOString()
        });
    });

    // Handle typing indicator (optional)
    socket.on("typing", ({ roomId, username, isTyping }) => {
        socket.to(roomId).emit("user_typing", {
            username: username,
            isTyping: isTyping
        });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
        const user = connectedUsers.get(socket.id);
        const username = user?.username || "Unknown";
        
        console.log(`🔌 User disconnected: ${username} (${socket.id})`);
        
        // Remove user from all rooms
        for (let [roomId, members] of roomMembers) {
            if (members.has(socket.id)) {
                members.delete(socket.id);
                
                // Broadcast user left to remaining users
                socket.to(roomId).emit("user_left", { 
                    username: username,
                    timestamp: new Date().toISOString()
                });
                
                // Update room users list
                const usersInRoom = Array.from(members).map(id => ({
                    id: id,
                    username: connectedUsers.get(id)?.username || "Anonymous"
                }));
                
                io.to(roomId).emit("room_users", { users: usersInRoom });
                
                console.log(`📤 ${username} left workspace: ${roomId}`);
            }
        }
        
        // Clean up
        connectedUsers.delete(socket.id);
    });
});

// Start server
server.listen(PORT, () => {
    const workspaceCount = workspaces.length;
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 EditAura Server is running!`);
    console.log(`${'='.repeat(50)}`);
    console.log(`📡 Server URL: http://localhost:${PORT}`);
    console.log(`📁 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`💬 Chat & Code Collaboration: Enabled`);
    console.log(`👥 Real-time sync: Active`);
    console.log(`📊 ${workspaceCount} workspaces available`);
    console.log(`${'='.repeat(50)}\n`);
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use. Please close other applications using this port.`);
    } else {
        console.error("❌ Server error:", err);
    }
    process.exit(1);
});