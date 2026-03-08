const socket = io();

const welcomeScreen = document.getElementById("welcomeScreen");
const meetingScreen = document.getElementById("meetingScreen");

const nameInput = document.getElementById("nameInput");
const roomInput = document.getElementById("roomInput");
const roomDisplay = document.getElementById("roomDisplay");
const roomLabel = document.getElementById("roomLabel");

const createRoomBtn = document.getElementById("createRoomBtn");
const showJoinBtn = document.getElementById("showJoinBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const joinRoomBox = document.getElementById("joinRoomBox");

const localVideo = document.getElementById("localVideo");
const videoGrid = document.getElementById("videoGrid");

const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const leaveBtn = document.getElementById("leaveBtn");
const copyRoomBtn = document.getElementById("copyRoomBtn");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");

const emojiBtn = document.getElementById("emojiBtn");
const emojiPanel = document.getElementById("emojiPanel");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");

let localStream = null;
let roomId = "";
let userName = "";
let isMuted = false;
let isCameraOff = false;

const peerConnections = {};
const remoteNames = {};

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

window.addEventListener("load", () => {
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");

  if (roomFromUrl) {
    joinRoomBox.classList.remove("hidden");
    roomInput.value = roomFromUrl;
  }
});

showJoinBtn.addEventListener("click", () => {
  joinRoomBox.classList.toggle("hidden");
});

createRoomBtn.addEventListener("click", async () => {
  userName = nameInput.value.trim() || "Anonymous";
  roomId = generateRoomId();
  await startMeeting();
});

joinRoomBtn.addEventListener("click", async () => {
  userName = nameInput.value.trim() || "Anonymous";
  const inputValue = roomInput.value.trim();

  if (!inputValue) {
    alert("Please enter a Room ID");
    return;
  }

  roomId = extractRoomId(inputValue);

  if (!roomId) {
    alert("Invalid Room ID");
    return;
  }

  await startMeeting();
});

muteBtn.addEventListener("click", toggleMute);
cameraBtn.addEventListener("click", toggleCamera);
leaveBtn.addEventListener("click", leaveRoom);
sendBtn.addEventListener("click", sendMessage);
copyRoomBtn.addEventListener("click", copyRoomId);

chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

emojiBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  emojiPanel.classList.toggle("hidden");
});

document.querySelectorAll(".emoji").forEach((emoji) => {
  emoji.addEventListener("click", () => {
    chatInput.value += emoji.textContent;
    emojiPanel.classList.add("hidden");
    chatInput.focus();
  });
});

document.addEventListener("click", (e) => {
  if (!emojiPanel.contains(e.target) && e.target !== emojiBtn) {
    emojiPanel.classList.add("hidden");
  }
});

fileBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", handleFileUpload);

async function startMeeting() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;

    welcomeScreen.classList.remove("active");
    meetingScreen.classList.add("active");

    roomLabel.textContent = `Room: ${roomId}`;
    roomDisplay.value = roomId;

    socket.emit("join-room", { roomId, userName });
    appendSystemMessage(`${userName} joined room ${roomId}`);
  } catch (error) {
    console.error(error);
    alert("Could not access camera or microphone.");
  }
}

function generateRoomId() {
  return "room-" + Math.random().toString(36).substring(2, 8);
}

function extractRoomId(value) {
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return value;
  }

  try {
    const url = new URL(value);
    const roomFromQuery = url.searchParams.get("room");
    if (roomFromQuery) return roomFromQuery;

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];

    return null;
  } catch {
    return null;
  }
}

function createPeerConnection(remoteSocketId, remoteUserName = "Participant") {
  const pc = new RTCPeerConnection(configuration);

  remoteNames[remoteSocketId] = remoteUserName;

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
    let remoteCard = document.getElementById(`card-${remoteSocketId}`);
    let remoteVideo = document.getElementById(`video-${remoteSocketId}`);
    let remoteLabel = document.getElementById(`label-${remoteSocketId}`);

    if (!remoteCard) {
      remoteCard = document.createElement("div");
      remoteCard.className = "video-card";
      remoteCard.id = `card-${remoteSocketId}`;

      remoteVideo = document.createElement("video");
      remoteVideo.id = `video-${remoteSocketId}`;
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;

      remoteLabel = document.createElement("div");
      remoteLabel.className = "video-label";
      remoteLabel.id = `label-${remoteSocketId}`;
      remoteLabel.textContent = remoteUserName;

      remoteCard.appendChild(remoteVideo);
      remoteCard.appendChild(remoteLabel);
      videoGrid.appendChild(remoteCard);
    } else if (remoteLabel) {
      remoteLabel.textContent = remoteNames[remoteSocketId] || remoteUserName;
    }

    remoteVideo.srcObject = event.streams[0];
  };

  peerConnections[remoteSocketId] = pc;
  return pc;
}

async function callUser(remoteSocketId, remoteUserName) {
  const pc = createPeerConnection(remoteSocketId, remoteUserName);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("offer", {
    target: remoteSocketId,
    sdp: offer,
    sender: socket.id,
    senderName: userName
  });
}

socket.on("existing-users", async (users) => {
  for (const user of users) {
    remoteNames[user.socketId] = user.userName;
    await callUser(user.socketId, user.userName);
  }
});

socket.on("user-joined", ({ socketId, userName: joinedName }) => {
  remoteNames[socketId] = joinedName;
  appendSystemMessage(`${joinedName} joined the room`);
});

socket.on("offer", async ({ sdp, sender, senderName }) => {
  remoteNames[sender] = senderName;

  const pc = createPeerConnection(sender, senderName);
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", {
    target: sender,
    sdp: answer,
    sender: socket.id
  });
});

socket.on("answer", async ({ sdp, sender }) => {
  const pc = peerConnections[sender];
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
});

socket.on("ice-candidate", async ({ candidate, sender }) => {
  const pc = peerConnections[sender];
  if (!pc) return;
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on("chat-message", ({ senderName, message, time }) => {
  appendChatMessage(senderName, message, time);
});

socket.on("file-message", ({ senderName, fileName, fileType, fileData, time }) => {
  appendFileMessage(senderName, fileName, fileType, fileData, time);
});

socket.on("user-left", ({ socketId }) => {
  removeRemoteVideo(socketId);

  if (peerConnections[socketId]) {
    peerConnections[socketId].close();
    delete peerConnections[socketId];
  }

  delete remoteNames[socketId];
  appendSystemMessage("A participant left the room");
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
  emojiPanel.classList.add("hidden");
}

function copyRoomId() {
  navigator.clipboard.writeText(roomId)
    .then(() => {
      copyRoomBtn.textContent = "Copied";
      setTimeout(() => {
        copyRoomBtn.textContent = "Copy";
      }, 1500);
    })
    .catch(() => {
      alert("Could not copy room ID");
    });
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file || !roomId) return;

  const maxFileSize = 5 * 1024 * 1024;
  if (file.size > maxFileSize) {
    alert("Please select a file smaller than 5MB");
    fileInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    socket.emit("file-message", {
      roomId,
      senderName: userName,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileData: reader.result
    });
  };

  reader.onerror = () => {
    alert("Could not read the selected file.");
  };

  reader.readAsDataURL(file);
  fileInput.value = "";
}

function appendChatMessage(sender, message, time) {
  const div = document.createElement("div");
  div.className = "chat-message";
  div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(message)}<span>${escapeHtml(time)}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendFileMessage(sender, fileName, fileType, fileData, time) {
  const div = document.createElement("div");
  div.className = "chat-message";

  let content = `<strong>${escapeHtml(sender)}:</strong> sent a file<br>`;

  if (fileType && fileType.startsWith("image/")) {
    content += `<img src="${fileData}" alt="${escapeHtml(fileName)}" class="image-preview">`;
  }

  content += `<a class="file-link" href="${fileData}" download="${escapeHtml(fileName)}">${escapeHtml(fileName)}</a>`;
  content += `<span>${escapeHtml(time)}</span>`;

  div.innerHTML = content;
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
  }

  window.location.reload();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}