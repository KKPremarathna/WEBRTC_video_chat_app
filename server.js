const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static(path.join(__dirname, "public")));

const roomUsers = {}; 
// {
//   roomId: Set(socketId)
// }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName || "Anonymous";

    if (!roomUsers[roomId]) {
      roomUsers[roomId] = new Set();
    }

    const existingUsers = Array.from(roomUsers[roomId]);
    roomUsers[roomId].add(socket.id);

    // Send existing users to the new user
    socket.emit("existing-users", existingUsers);

    // Notify other users in room that a new user joined
    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      userName: socket.data.userName
    });

    console.log(`${socket.id} joined room ${roomId}`);
  });

  socket.on("offer", ({ target, sdp, sender }) => {
    io.to(target).emit("offer", {
      sdp,
      sender
    });
  });

  socket.on("answer", ({ target, sdp, sender }) => {
    io.to(target).emit("answer", {
      sdp,
      sender
    });
  });

  socket.on("ice-candidate", ({ target, candidate, sender }) => {
    io.to(target).emit("ice-candidate", {
      candidate,
      sender
    });
  });

  socket.on("chat-message", ({ roomId, message, senderName }) => {
    io.to(roomId).emit("chat-message", {
      senderName,
      message,
      time: new Date().toLocaleTimeString()
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (roomId && roomUsers[roomId]) {
      roomUsers[roomId].delete(socket.id);

      socket.to(roomId).emit("user-left", {
        socketId: socket.id
      });

      if (roomUsers[roomId].size === 0) {
        delete roomUsers[roomId];
      }
    }

    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});