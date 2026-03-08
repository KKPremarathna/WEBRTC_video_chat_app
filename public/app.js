const socket = io();

const joinBtn = document.getElementById("joinBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const leaveBtn = document.getElementById("leaveBtn");
const sendBtn = document.getElementById("sendBtn");

const roomInput = document.getElementById("roomInput");
const nameInput = document.getElementById("nameInput");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const localVideo = document.getElementById("localVideo");
const videoGrid = document.getElementById("videoGrid");
const statusDiv = document.getElementById("status");

let localStream = null;
let roomId = "";
let userName = "";
let isMuted = false;
let isCameraOff = false;

const peerConnections = {}; // socketId -> RTCPeerConnection

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

joinBtn.addEventListener("click", joinRoom);
muteBtn.addEventListener("click", toggleMute);
cameraBtn.addEventListener("click", toggleCamera);
leaveBtn.addEventListener("click", leaveRoom);
sendBtn.addEventListener("click", sendMessage);

chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

async function joinRoom() {
  roomId = roomInput.value.trim();
  userName = nameInput.value.trim() || "Anonymous";

  if (!roomId) {
    alert("Please enter a Room ID");
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;
    statusDiv.textContent = `Connected to room: ${roomId}`;

    socket.emit("join-room", { roomId, userName });

    joinBtn.disabled = true;
    roomInput.disabled = true;
    nameInput.disabled = true;
  } catch (error) {
    console.error("Error accessing media devices:", error);
    alert("Could not access camera/microphone.");
  }
}

function createPeerConnection(remoteSocketId) {
  const pc = new RTCPeerConnection(configuration);

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        target: remoteSocketId,
        candidate: event.candidate,
        sender: socket.id
      });
    }
  };

  pc.ontrack = (event) => {
    let remoteVideo = document.getElementById(`video-${remoteSocketId}`);

    if (!remoteVideo) {
      const card = document.createElement("div");
      card.className = "video-card";
      card.id = `card-${remoteSocketId}`;

      remoteVideo = document.createElement("video");
      remoteVideo.id = `video-${remoteSocketId}`;
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;

      const label = document.createElement("p");
      label.id = `label-${remoteSocketId}`;
      label.textContent = `User ${remoteSocketId.substring(0, 5)}`;

      card.appendChild(remoteVideo);
      card.appendChild(label);
      videoGrid.appendChild(card);
    }

    remoteVideo.srcObject = event.streams[0];
  };

  pc.onconnectionstatechange = () => {
    console.log(`Connection with ${remoteSocketId}:`, pc.connectionState);
  };

  peerConnections[remoteSocketId] = pc;
  return pc;
}

async function callUser(remoteSocketId) {
  const pc = createPeerConnection(remoteSocketId);

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("offer", {
      target: remoteSocketId,
      sdp: offer,
      sender: socket.id
    });
  } catch (error) {
    console.error("Error creating offer:", error);
  }
}

socket.on("existing-users", async (users) => {
  for (const remoteSocketId of users) {
    await callUser(remoteSocketId);
  }
});

socket.on("user-joined", async ({ socketId, userName: remoteName }) => {
  appendSystemMessage(`${remoteName} joined the room`);
});

socket.on("offer", async ({ sdp, sender }) => {
  const pc = createPeerConnection(sender);

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", {
      target: sender,
      sdp: answer,
      sender: socket.id
    });
  } catch (error) {
    console.error("Error handling offer:", error);
  }
});

socket.on("answer", async ({ sdp, sender }) => {
  const pc = peerConnections[sender];
  if (!pc) return;

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  } catch (error) {
    console.error("Error handling answer:", error);
  }
});

socket.on("ice-candidate", async ({ candidate, sender }) => {
  const pc = peerConnections[sender];
  if (!pc) return;

  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error("Error adding ICE candidate:", error);
  }
});

socket.on("chat-message", ({ senderName, message, time }) => {
  appendChatMessage(senderName, message, time);
});

socket.on("user-left", ({ socketId }) => {
  removeRemoteVideo(socketId);

  if (peerConnections[socketId]) {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  }

  appendSystemMessage(`A user left the room`);
});

function toggleMute() {
  if (!localStream) return;

  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });

  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
}

function toggleCamera() {
  if (!localStream) return;

  localStream.getVideoTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });

  isCameraOff = !isCameraOff;
  cameraBtn.textContent = isCameraOff ? "Camera On" : "Camera Off";
}

function sendMessage() {
  const message = chatInput.value.trim();
  if (!message || !roomId) return;

  socket.emit("chat-message", {
    roomId,
    message,
    senderName: userName
  });

  chatInput.value = "";
}

function appendChatMessage(sender, message, time) {
  const div = document.createElement("div");
  div.className = "chat-message";
  div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(message)}<span>${escapeHtml(time)}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMessage(message) {
  const div = document.createElement("div");
  div.className = "chat-message";
  div.innerHTML = `<strong>System:</strong> ${escapeHtml(message)}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeRemoteVideo(socketId) {
  const card = document.getElementById(`card-${socketId}`);
  if (card) card.remove();
}

function leaveRoom() {
  Object.keys(peerConnections).forEach((socketId) => {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  });

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localVideo.srcObject = null;
  }

  videoGrid.querySelectorAll(".video-card").forEach((card, index) => {
    if (index !== 0) card.remove();
  });

  socket.disconnect();
  window.location.reload();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}