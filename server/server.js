const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();

const allowedOrigins = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://your-vercel-app.vercel.app" // replace later
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  })
);

app.get("/", (req, res) => {
  res.send("Signaling server is running");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;

    if (!rooms[roomId]) rooms[roomId] = {};
    rooms[roomId][socket.id] = { userName };

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

    socket.on("offer", ({ target, offer, callerName }) => {
      io.to(target).emit("offer", {
        offer,
        caller: socket.id,
        callerName
      });
    });

    socket.on("answer", ({ target, answer }) => {
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
        delete rooms[room][socket.id];

        socket.to(room).emit("user-left", {
          socketId: socket.id
        });

        if (Object.keys(rooms[room]).length === 0) {
          delete rooms[room];
        }
      }

      console.log("Disconnected:", socket.id);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});