const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7
});

app.use(express.static(path.join(__dirname, "public")));

const roomUsers = {};
// roomUsers[roomId] = [{ socketId, userName }]

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName || "Anonymous";

    if (!roomUsers[roomId]) {
      roomUsers[roomId] = [];
    }

    const existingUsers = roomUsers[roomId].map((user) => ({
      socketId: user.socketId,
      userName: user.userName
    }));

    roomUsers[roomId].push({
      socketId: socket.id,
      userName: socket.data.userName
    });

    socket.emit("existing-users", existingUsers);

    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      userName: socket.data.userName
    });
  });

  socket.on("offer", ({ target, sdp, sender, senderName }) => {
    io.to(target).emit("offer", { sdp, sender, senderName });
  });

  socket.on("answer", ({ target, sdp, sender }) => {
    io.to(target).emit("answer", { sdp, sender });
  });

  socket.on("ice-candidate", ({ target, candidate, sender }) => {
    io.to(target).emit("ice-candidate", { candidate, sender });
  });

  socket.on("chat-message", ({ roomId, message, senderName }) => {
    io.to(roomId).emit("chat-message", {
      senderName,
      message,
      time: new Date().toLocaleTimeString()
    });
  });

  socket.on("file-message", ({ roomId, senderName, fileName, fileType, fileData }) => {
    io.to(roomId).emit("file-message", {
      senderName,
      fileName,
      fileType,
      fileData,
      time: new Date().toLocaleTimeString()
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (roomId && roomUsers[roomId]) {
      roomUsers[roomId] = roomUsers[roomId].filter(
        (user) => user.socketId !== socket.id
      );

      socket.to(roomId).emit("user-left", {
        socketId: socket.id
      });

      if (roomUsers[roomId].length === 0) {
        delete roomUsers[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});