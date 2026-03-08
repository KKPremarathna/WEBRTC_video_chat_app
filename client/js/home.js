const userNameInput = document.getElementById("userName");
const roomInput = document.getElementById("roomInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");

function generateRoomId() {
  return Math.random().toString(36).substring(2, 10);
}

createRoomBtn.addEventListener("click", () => {
  const userName = userNameInput.value.trim();
  if (!userName) {
    alert("Please enter your name");
    return;
  }

  const roomId = generateRoomId();
  window.location.href = `room.html?room=${roomId}&name=${encodeURIComponent(userName)}`;
});

joinRoomBtn.addEventListener("click", () => {
  const userName = userNameInput.value.trim();
  const roomId = roomInput.value.trim();

  if (!userName || !roomId) {
    alert("Please enter your name and room code");
    return;
  }

  window.location.href = `room.html?room=${roomId}&name=${encodeURIComponent(userName)}`;
});