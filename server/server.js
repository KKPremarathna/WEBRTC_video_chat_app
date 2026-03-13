const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

// Be more permissive with localhost for development
const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://webrtc-video-chat-app-lyart.vercel.app" 
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) !== -1 || origin.includes("localhost") || origin.includes("127.0.0.1")) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST"]
}));

app.get("/", (req, res) => {
  res.send("MeetLite Signaling Server is running");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.concat(["http://localhost:5500", "http://127.0.0.1:5500"]),
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on("connection", (socket) => {
  console.log(`[CONN] Socket ${socket.id} connected`);

  socket.on("join-room", ({ roomId, userName }) => {
    if (!roomId) return;
    
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;

    if (!rooms[roomId]) rooms[roomId] = {};
    rooms[roomId][socket.id] = { userName };

    console.log(`[JOIN] User ${userName} (${socket.id}) joined room ${roomId}`);

    const existingUsers = Object.keys(rooms[roomId])
      .filter((id) => id !== socket.id)
      .map((id) => ({
        socketId: id,
        userName: rooms[roomId][id].userName
      }));

    socket.emit("existing-users", existingUsers);

    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      userName
    });
  });

  socket.on("offer", ({ target, offer, callerName }) => {
    console.log(`[OFFER] from ${socket.id} to ${target}`);
    io.to(target).emit("offer", {
      offer,
      caller: socket.id,
      callerName
    });
  });

  socket.on("answer", ({ target, answer }) => {
    console.log(`[ANSWER] from ${socket.id} to ${target}`);
    io.to(target).emit("answer", {
      answer,
      responder: socket.id
    });
  });

  socket.on("ice-candidate", ({ target, candidate }) => {
    io.to(target).emit("ice-candidate", {
      candidate,
      from: socket.id
    });
  });

  socket.on("chat-message", ({ roomId, message, userName }) => {
    io.to(roomId).emit("chat-message", {
      senderId: socket.id,
      userName,
      message
    });
  });

  socket.on("disconnect", () => {
    const room = socket.roomId;
    if (room && rooms[room] && rooms[room][socket.id]) {
      const uName = rooms[room][socket.id].userName;
      delete rooms[room][socket.id];
      socket.to(room).emit("user-left", { socketId: socket.id });
      
      console.log(`[LEAVE] User ${uName} left room ${room}`);

      if (Object.keys(rooms[room]).length === 0) {
        delete rooms[room];
      }
    }
    console.log(`[DISCO] Socket ${socket.id} disconnected`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on http://localhost:${PORT}`);
});