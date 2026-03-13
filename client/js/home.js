// DOM Elements
const userNameInput = document.getElementById("userName");
const roomInput = document.getElementById("roomInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

// Check for local storage to pre-fill name
const savedName = localStorage.getItem("meetlite_username");
if (savedName) {
  userNameInput.value = savedName;
}

function generateRoomId() {
  // Generate a cleaner, Zoom-like 9 digit code formatted as XXX-XXX-XXX
  const num = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${num.slice(0,3)}-${num.slice(3,6)}-${num.slice(6,9)}`;
}

function joinRoom(roomId, userName) {
  if (!userName) {
    alert("Please enter your name");
    userNameInput.focus();
    return;
  }
  
  // Save name for next time
  localStorage.setItem("meetlite_username", userName);

  // Keep numbers, letters, and dashes but remove weird whitespace
  const cleanRoomId = roomId.replace(/[^a-zA-Z0-9-]/g, '').trim();

  // Use clean URLs to prevent server redirection from stripping query params
  window.location.href = `room?room=${cleanRoomId}&name=${encodeURIComponent(userName)}`;
}

// Event Listeners
createRoomBtn.addEventListener("click", () => {
  const userName = userNameInput.value.trim();
  const roomId = generateRoomId();
  joinRoom(roomId, userName);
});

joinRoomBtn.addEventListener("click", () => {
  const userName = userNameInput.value.trim();
  const roomId = roomInput.value.trim();

  if (!roomId) {
    alert("Please enter a room code");
    roomInput.focus();
    return;
  }

  joinRoom(roomId, userName);
});

// Allow Enter key to submit
roomInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinRoomBtn.click();
});
userNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && roomInput.value.trim()) {
    joinRoomBtn.click();
  } else if (e.key === "Enter") {
    createRoomBtn.click();
  }
});