console.log("Hello, rabbit!");

function updateTime() {
  const timeOverlay = document.getElementById("time-overlay");
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");

  // Convert hours to 12-hour format
  hours = hours % 12 || 12; // Handle midnight (0) as 12 AM

  const timeString = `${hours}:${minutes}`;
  timeOverlay.textContent = timeString;

  // Get the current color of the text
  const currentColor = getComputedStyle(timeOverlay).color;
  // Parse the current color
  const [r, g, b] = currentColor.match(/\d+/g).map(Number);
  // Increase the red component slightly
  const newColor = `rgb(${r + 1},${g},${b})`;
  // Apply the new color to the text
  timeOverlay.style.color = newColor;
}


function updateDate() {
  const dateOverlay = document.getElementById("date-overlay");
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const year = now.getFullYear().toString();
  const dateString = `${month}/${day}/${year}`;
  dateOverlay.textContent = dateString;
}

setInterval(updateTime, 1000); // Update time every second
setInterval(updateDate, 60000); // Update date every minute
