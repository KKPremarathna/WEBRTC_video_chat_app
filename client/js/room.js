const socket = io("https://webrtc-video-chat-app-x300.onrender.com", {
  transports: ["websocket", "polling"]
});

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const userName = params.get("name") || "Guest";

const roomCodeText = document.getElementById("roomCodeText");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const videoGrid = document.getElementById("videoGrid");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const leaveBtn = document.getElementById("leaveBtn");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const emojiToggleBtn = document.getElementById("emojiToggleBtn");
const emojiPicker = document.getElementById("emojiPicker");
const fileInput = document.getElementById("fileInput");
const sendFileBtn = document.getElementById("sendFileBtn");

roomCodeText.textContent = roomId;

copyRoomBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(roomId);
  alert("Room code copied");
});

const peers = {};
const dataChannels = {};
let localStream;
let micEnabled = true;
let camEnabled = true;

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

async function init() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    addVideoStream("local", localStream, `${userName} (You)`);

    socket.emit("join-room", { roomId, userName });
  } catch (error) {
    console.error("Media error:", error);
    alert("Could not access camera/microphone");
  }
}

function addVideoStream(id, stream, label) {
  let existing = document.getElementById(`card-${id}`);
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.className = "video-card";
  card.id = `card-${id}`;

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  if (id === "local") video.muted = true;

  const nameTag = document.createElement("div");
  nameTag.className = "video-label";
  nameTag.textContent = label;

  card.appendChild(video);
  card.appendChild(nameTag);
  videoGrid.appendChild(card);
}

function removeVideoStream(id) {
  const card = document.getElementById(`card-${id}`);
  if (card) card.remove();
}

function createPeerConnection(targetId, targetName, isInitiator) {
  const pc = new RTCPeerConnection(rtcConfig);
  peers[targetId] = pc;

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = (event) => {
    const remoteStream = event.streams[0];
    addVideoStream(targetId, remoteStream, targetName);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        target: targetId,
        candidate: event.candidate
      });
    }
  };

  if (isInitiator) {
    const channel = pc.createDataChannel("chat-file");
    setupDataChannel(targetId, channel);
  } else {
    pc.ondatachannel = (event) => {
      setupDataChannel(targetId, event.channel);
    };
  }

  return pc;
}

function setupDataChannel(targetId, channel) {
  dataChannels[targetId] = {
    channel,
    fileBuffer: [],
    incomingFileName: "",
    incomingFileType: ""
  };

  channel.binaryType = "arraybuffer";

  channel.onopen = () => {
    console.log("Data channel open with", targetId);
  };

  channel.onmessage = (event) => {
    if (typeof event.data === "string") {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "text") {
          appendMessage(data.userName, data.message);
        }

        if (data.type === "file-meta") {
          dataChannels[targetId].incomingFileName = data.fileName;
          dataChannels[targetId].incomingFileType = data.fileType;
          dataChannels[targetId].fileBuffer = [];
        }

        if (data.type === "file-end") {
          const received = dataChannels[targetId].fileBuffer;
          const blob = new Blob(received, { type: dataChannels[targetId].incomingFileType });
          const url = URL.createObjectURL(blob);

          const div = document.createElement("div");
          div.className = "chat-message";
          div.innerHTML = `<strong>${data.userName}:</strong> Sent a file<br>`;
          const link = document.createElement("a");
          link.href = url;
          link.download = dataChannels[targetId].incomingFileName;
          link.textContent = `Download ${dataChannels[targetId].incomingFileName}`;
          link.className = "download-link";
          div.appendChild(link);
          chatMessages.appendChild(div);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      } catch {
        console.log("Text channel message:", event.data);
      }
    } else {
      dataChannels[targetId].fileBuffer.push(event.data);
    }
  };
}

async function makeOffer(targetId, targetName) {
  const pc = createPeerConnection(targetId, targetName, true);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("offer", {
    target: targetId,
    offer,
    callerName: userName
  });
}

socket.on("existing-users", async (users) => {
  for (const user of users) {
    await makeOffer(user.socketId, user.userName);
  }
});

socket.on("user-joined", async ({ socketId, userName: joinedName }) => {
  console.log("User joined:", joinedName);
});

socket.on("offer", async ({ offer, caller, callerName }) => {
  const pc = createPeerConnection(caller, callerName, false);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("answer", {
    target: caller,
    answer
  });
});

socket.on("answer", async ({ answer, responder }) => {
  const pc = peers[responder];
  if (!pc) return;
  await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("ice-candidate", async ({ candidate, from }) => {
  const pc = peers[from];
  if (!pc) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error("ICE candidate error:", error);
  }
});

socket.on("user-left", ({ socketId }) => {
  if (peers[socketId]) {
    peers[socketId].close();
    delete peers[socketId];
  }

  if (dataChannels[socketId]) {
    delete dataChannels[socketId];
  }

  removeVideoStream(socketId);
});

function appendMessage(sender, message) {
  const div = document.createElement("div");
  div.className = "chat-message";
  div.innerHTML = `<strong>${sender}:</strong> ${message}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

sendBtn.addEventListener("click", () => {
  const message = chatInput.value.trim();
  if (!message) return;

  appendMessage(userName, message);

  socket.emit("chat-message", {
    roomId,
    message,
    userName
  });

  Object.values(dataChannels).forEach(({ channel }) => {
    if (channel.readyState === "open") {
      channel.send(JSON.stringify({
        type: "text",
        userName,
        message
      }));
    }
  });

  chatInput.value = "";
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

socket.on("chat-message", ({ userName: senderName, senderId, message }) => {
  if (senderId === socket.id) return;
  appendMessage(senderName, message);
});

emojiToggleBtn.addEventListener("click", () => {
  emojiPicker.classList.toggle("hidden");
});

document.querySelectorAll(".emoji").forEach((emoji) => {
  emoji.addEventListener("click", () => {
    chatInput.value += emoji.textContent;
    emojiPicker.classList.add("hidden");
    chatInput.focus();
  });
});

sendFileBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) {
    alert("Choose a file first");
    return;
  }

  const arrayBuffer = await file.arrayBuffer();

  for (const { channel } of Object.values(dataChannels)) {
    if (channel.readyState === "open") {
      channel.send(JSON.stringify({
        type: "file-meta",
        fileName: file.name,
        fileType: file.type,
        userName
      }));

      const chunkSize = 16000;
      for (let i = 0; i < arrayBuffer.byteLength; i += chunkSize) {
        channel.send(arrayBuffer.slice(i, i + chunkSize));
      }

      channel.send(JSON.stringify({
        type: "file-end",
        userName
      }));
    }
  }

  const div = document.createElement("div");
  div.className = "chat-message";
  div.innerHTML = `<strong>${userName}:</strong> Sent file: ${file.name}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  fileInput.value = "";
});

toggleMicBtn.addEventListener("click", () => {
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = micEnabled;
  });
  toggleMicBtn.textContent = micEnabled ? "Mute" : "Unmute";
});

toggleCamBtn.addEventListener("click", () => {
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = camEnabled;
  });
  toggleCamBtn.textContent = camEnabled ? "Stop Camera" : "Start Camera";
});

leaveBtn.addEventListener("click", () => {
  window.location.href = "index.html";
});

init();