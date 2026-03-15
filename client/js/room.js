// Use production signaling server if not on localhost
const SIGNALING_SERVER = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:3000"
  : "https://webrtc-video-chat-app-x300.onrender.com";

const socket = io(SIGNALING_SERVER, {
  transports: ["websocket", "polling"]
});

// DOM Elements
const roomCodeText = document.getElementById("roomCodeText");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const videoGrid = document.getElementById("videoGrid");
const toggleMicBtn = document.getElementById("toggleMicBtn");
const toggleCamBtn = document.getElementById("toggleCamBtn");
const shareScreenBtn = document.getElementById("shareScreenBtn");
const leaveBtn = document.getElementById("leaveBtn");
const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const rightSidebar = document.getElementById("rightSidebar");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const emojiToggleBtn = document.getElementById("emojiToggleBtn");
const emojiPicker = document.getElementById("emojiPicker");
const fileInput = document.getElementById("fileInput");
const sendFileBtn = document.getElementById("sendFileBtn");
const fileNameDisplay = document.getElementById("fileNameDisplay");
const timeDisplay = document.getElementById("timeDisplay");

// State
let peers = {}; // Stores pc, buffer, and dataChannel info
let localStream;
let localScreenStream = null;
let micEnabled = true;
let camEnabled = true;

// Initialize
console.log("[DEBUG] Raw search query:", window.location.search);
const params = new URLSearchParams(window.location.search);
const urlRoomId = params.get("room");
const userName = params.get("name") || "Guest";
let roomId;

// Use URL room ID if it exists and isn't "null", otherwise generate new one
if (urlRoomId && urlRoomId !== "null" && urlRoomId.trim() !== "") {
  roomId = urlRoomId.trim();
  console.log("[DEBUG] Using room ID from URL:", roomId);
} else {
  roomId = Math.floor(100000000 + Math.random() * 900000000).toString().replace(/(\d{3})(\d{3})(\d{3})/, "$1-$2-$3");
  console.log("[DEBUG] Generating new room ID:", roomId);
}

roomCodeText.textContent = roomId;
updateTime();
setInterval(updateTime, 1000);

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.services.mozilla.com" },
    // IMPORTANT: For connections work across different networks (e.g., 4G to Wi-Fi),
    // you MUST add a TURN server here. Examples: Coturn, Twilio, or Xirsys.
    /*
    {
      urls: "turn:your-turn-server.com:3478",
      username: "your-username",
      credential: "your-password"
    }
    */
  ]
};

// Mobile Check
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
if (isMobile) {
  shareScreenBtn.classList.add("hidden");
  console.log("[INIT] Mobile detected, hiding screen share.");
}

async function init() {
  console.log(`[INIT] Initializing for room: ${roomId}`);

  // Join room after media is initialized to avoid race conditions
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    addVideoStream("local", localStream, `${userName} (You)`, true);
    updateGridClasses();

    console.log(`[INIT] Media ready, joining room: ${roomId}`);
    socket.emit("join-room", { roomId, userName });
  } catch (error) {
    console.error("[INIT] Media error:", error);
    alert("Could not access camera/microphone. Please ensure you have given permissions and are using HTTPS.");
    // Even if media fails, join the room so chat/file sharing might still work
    socket.emit("join-room", { roomId, userName });
  }
}

// Layout Management
function updateGridClasses() {
  const videoCards = videoGrid.querySelectorAll('.video-card');
  const userCount = videoCards.length;
  videoGrid.className = 'video-grid';
  
  if (userCount > 0) {
    const classCount = userCount >= 5 ? 'more' : userCount;
    videoGrid.setAttribute('data-users', classCount);
  }

  const hasScreenShare = videoGrid.querySelector('.is-screen-share');
  if (hasScreenShare) {
    videoGrid.classList.add('has-screen-share');
  }
}

function addVideoStream(id, stream, label, isLocal = false) {
  console.log(`[UI] Adding video stream for: ${id}`);
  let existing = document.getElementById(`card-${id}`);
  if (existing) {
    existing.querySelector('video').srcObject = stream;
    return;
  }

  const card = document.createElement("div");
  card.className = "video-card";
  card.id = `card-${id}`;

  const video = document.createElement("video");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.srcObject = stream;
  
  if (isLocal) {
    video.muted = true;
    video.setAttribute("muted", "");
    video.style.transform = "scaleX(-1)"; 
  }

  const nameTag = document.createElement("div");
  nameTag.className = "video-label glass-panel";
  nameTag.textContent = label;

  card.appendChild(video);
  card.appendChild(nameTag);
  videoGrid.appendChild(card);
  
  updateGridClasses();
}

function removeVideoStream(id) {
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.remove();
    updateGridClasses();
  }
}

// WebRTC Connections
function createPeerConnection(targetId, targetName, isInitiator) {
  console.log(`[RTC] Creating connection to ${targetId} (${targetName}), Initiator: ${isInitiator}`);
  
  if (peers[targetId] && peers[targetId].pc) {
    console.warn(`[RTC] Peer ${targetId} already exists, closing old one...`);
    try {
      peers[targetId].pc.close();
    } catch (e) {
      console.warn(`[RTC] Error closing peer connection for ${targetId}:`, e);
    }
  }

  const pc = new RTCPeerConnection(rtcConfig);
  
  // Preserve existing candidatesBuffer if it exists (for candidates received before PC creation)
  const existingBuffer = (peers[targetId] && peers[targetId].candidatesBuffer) || [];
  
  peers[targetId] = {
    pc,
    name: targetName,
    candidatesBuffer: existingBuffer,
    dataChannel: null
  };

  if (localStream) {
    const activeStream = localScreenStream || localStream;
    localStream.getAudioTracks().forEach(track => {
      console.log(`[RTC] Adding audio track to ${targetId}`);
      pc.addTrack(track, localStream);
    });
    activeStream.getVideoTracks().forEach(track => {
      console.log(`[RTC] Adding video track (${localScreenStream ? 'screen' : 'camera'}) to ${targetId}`);
      pc.addTrack(track, activeStream);
    });
  } else {
    console.warn(`[RTC] No localStream available to add tracks to ${targetId}`);
  }

  pc.ontrack = (event) => {
    console.log(`[RTC] Track received from ${targetId}`);
    addVideoStream(targetId, event.streams[0], targetName);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        target: targetId,
        candidate: event.candidate
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[RTC] ICE State with ${targetId}: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
      removeVideoStream(targetId);
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

// Signaling Handlers
async function makeOffer(targetId, targetName) {
  const pc = createPeerConnection(targetId, targetName, true);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  console.log(`[SIG] Sending offer to ${targetId}`);
  socket.emit("offer", {
    target: targetId,
    offer,
    callerName: userName
  });
}

socket.on("existing-users", async (users) => {
  console.log(`[SIG] Existing users: ${users.length}`);
  for (const user of users) {
    await makeOffer(user.socketId, user.userName);
  }
});

socket.on("user-joined", async ({ socketId, userName: joinedName }) => {
  console.log(`[SIG] User joined: ${joinedName} (${socketId})`);
  appendSystemMessage(`${joinedName} joined the room.`);
});

socket.on("offer", async ({ offer, caller, callerName }) => {
  console.log(`[SIG] Received offer from ${caller} (${callerName})`);
  const pc = createPeerConnection(caller, callerName, false);
  
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  
  // Process buffered candidates
  if (peers[caller].candidatesBuffer.length > 0) {
    console.log(`[RTC] Processing ${peers[caller].candidatesBuffer.length} buffered candidates for ${caller}`);
    for (const cand of peers[caller].candidatesBuffer) {
      await pc.addIceCandidate(new RTCIceCandidate(cand));
    }
    peers[caller].candidatesBuffer = [];
  }

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit("answer", { target: caller, answer });
});

socket.on("answer", async ({ answer, responder }) => {
  console.log(`[SIG] Received answer from ${responder}`);
  const peer = peers[responder];
  if (!peer) {
    console.error(`[SIG] No peer connection found for responder: ${responder}`);
    return;
  }
  
  try {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log(`[RTC] Remote description set for ${responder}`);
    
    // Process buffered candidates after setting remote description
    if (peer.candidatesBuffer.length > 0) {
      console.log(`[RTC] Processing ${peer.candidatesBuffer.length} buffered candidates for ${responder}`);
      for (const cand of peer.candidatesBuffer) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.error(`[RTC] Error adding buffered ICE candidate for ${responder}:`, e);
        }
      }
      peer.candidatesBuffer = [];
    }
  } catch (err) {
    console.error(`[RTC] Error setting remote description for ${responder}:`, err);
  }
});

socket.on("ice-candidate", async ({ candidate, from }) => {
  const peer = peers[from];
  if (!peer) {
    // If PC not ready yet, buffer it
    if (!peers[from]) peers[from] = { pc: null, name: "Pending", candidatesBuffer: [] };
    peers[from].candidatesBuffer.push(candidate);
    return;
  }
  
  if (peer.pc && peer.pc.remoteDescription) {
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error("[RTC] Error adding ICE candidate:", e);
    }
  } else {
    peer.candidatesBuffer.push(candidate);
  }
});

socket.on("user-left", ({ socketId }) => {
  console.log(`[SIG] User left: ${socketId}`);
  if (peers[socketId]) {
    if (peers[socketId].pc) peers[socketId].pc.close();
    delete peers[socketId];
  }
  removeVideoStream(socketId);
  appendSystemMessage(`A user left the room.`);
});

// UI Event Listeners - Media Controls
toggleMicBtn.addEventListener("click", () => {
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(track => track.enabled = micEnabled);
  toggleMicBtn.classList.toggle("muted", !micEnabled);
  toggleMicBtn.querySelector("span").textContent = micEnabled ? "Mute" : "Unmute";
  const svg = toggleMicBtn.querySelector("svg");
  if(micEnabled) {
    svg.innerHTML = `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>`;
  } else {
    svg.innerHTML = `<line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line>`;
  }
});

toggleCamBtn.addEventListener("click", () => {
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(track => track.enabled = camEnabled);
  toggleCamBtn.classList.toggle("muted", !camEnabled);
  toggleCamBtn.querySelector("span").textContent = camEnabled ? "Stop Video" : "Start Video";
  const svg = toggleCamBtn.querySelector("svg");
  if(camEnabled) {
    svg.innerHTML = `<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>`;
  } else {
    svg.innerHTML = `<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"></path><line x1="1" y1="1" x2="23" y2="23"></line>`;
  }
});

// Screen Sharing
shareScreenBtn.addEventListener("click", async () => {
  if (localScreenStream) { stopScreenSharing(); return; }
  try {
    localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });
    shareScreenBtn.classList.add("active");
    shareScreenBtn.querySelector("span").textContent = "Stop Share";
    const screenTrack = localScreenStream.getVideoTracks()[0];
    screenTrack.onended = () => stopScreenSharing();
    const localVideo = document.getElementById("card-local").querySelector("video");
    localVideo.srcObject = localScreenStream;
    localVideo.style.transform = "none";
    document.getElementById("card-local").classList.add("is-screen-share");
    for (let id in peers) {
      const videoSender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender) videoSender.replaceTrack(screenTrack);
    }
    socket.emit("chat-message", { roomId, message: "STARTED_SCREEN_SHARE", userName: "system_event" });
    updateGridClasses();
  } catch (err) { console.error("Error sharing screen:", err); }
});

function stopScreenSharing() {
  if (!localScreenStream) return;
  localScreenStream.getTracks().forEach(track => track.stop());
  localScreenStream = null;
  shareScreenBtn.classList.remove("active");
  shareScreenBtn.querySelector("span").textContent = "Share";
  const localVideo = document.getElementById("card-local").querySelector("video");
  localVideo.srcObject = localStream;
  localVideo.style.transform = "scaleX(-1)";
  document.getElementById("card-local").classList.remove("is-screen-share");
  const videoTrack = localStream.getVideoTracks()[0];
  for (let id in peers) {
    const videoSender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (videoSender) videoSender.replaceTrack(videoTrack);
  }
  socket.emit("chat-message", { roomId, message: "STOPPED_SCREEN_SHARE", userName: "system_event" });
  updateGridClasses();
}

// Sidebar & Info
toggleSidebarBtn.addEventListener("click", () => {
  rightSidebar.classList.toggle("collapsed");
  toggleSidebarBtn.classList.toggle("sidebar-active");
});
closeSidebarBtn.addEventListener("click", () => {
  rightSidebar.classList.add("collapsed");
  toggleSidebarBtn.classList.remove("sidebar-active");
});
copyRoomBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(roomId);
  const originalText = copyRoomBtn.innerHTML;
  copyRoomBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
  setTimeout(() => { copyRoomBtn.innerHTML = originalText; }, 2000);
});
leaveBtn.addEventListener("click", () => {
  window.location.href = "/";
});

function updateTime() {
  const now = new Date();
  let hl = now.getHours();
  let ml = now.getMinutes().toString().padStart(2, '0');
  const ampm = hl >= 12 ? 'PM' : 'AM';
  hl = hl % 12; hl = hl ? hl : 12;
  const displayRoomId = roomId && roomId !== "null" ? roomId : "No Room ID";
  timeDisplay.textContent = `${hl}:${ml} ${ampm} | ${displayRoomId}`;
}

// Chat
function appendSystemMessage(msg) {
  const div = document.createElement("div");
  div.className = "system-message";
  div.textContent = msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function appendMessage(sender, msg, isSelf = false) {
  const div = document.createElement("div");
  div.className = `chat-message ${isSelf ? 'self' : ''}`;
  div.innerHTML = `<span class="msg-sender">${sender}</span><span class="msg-text">${msg}</span>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

socket.on("chat-message", ({ userName: senderName, senderId, message }) => {
  if (senderId === socket.id) return;
  if (senderName === "system_event") {
    if (message === "STARTED_SCREEN_SHARE") {
      const card = document.getElementById(`card-${senderId}`);
      if(card) { card.classList.add("is-screen-share"); updateGridClasses(); }
    } else if (message === "STOPPED_SCREEN_SHARE") {
      const card = document.getElementById(`card-${senderId}`);
      if(card) { card.classList.remove("is-screen-share"); updateGridClasses(); }
    }
    return;
  }
  appendMessage(senderName, message);
});

sendBtn.addEventListener("click", () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  appendMessage("You", msg, true);
  socket.emit("chat-message", { roomId, message: msg, userName });
  Object.values(peers).forEach(p => {
    if (p.dataChannel && p.dataChannel.readyState === "open") p.dataChannel.send(JSON.stringify({ type: "text", userName, message: msg }));
  });
  chatInput.value = "";
});

chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendBtn.click(); });

emojiToggleBtn.addEventListener("click", (e) => { e.stopPropagation(); emojiPicker.classList.toggle("hidden"); });
document.addEventListener("click", (e) => { if (!emojiPicker.contains(e.target) && e.target !== emojiToggleBtn) emojiPicker.classList.add("hidden"); });
document.querySelectorAll(".emoji").forEach(emoji => {
  emoji.addEventListener("click", () => { chatInput.value += emoji.textContent; emojiPicker.classList.add("hidden"); chatInput.focus(); });
});

function setupDataChannel(targetId, channel) {
  if (!peers[targetId]) return;
  peers[targetId].dataChannel = channel;
  channel.binaryType = "arraybuffer";
  channel.onopen = () => console.log("Data channel open with", targetId);
  channel.onmessage = (event) => {
    // ... file and text parsing ... 
  };
}

init();