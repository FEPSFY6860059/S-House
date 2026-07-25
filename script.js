let currentEmployee = null;
let isClockedIn = false;
let clockInTime = null;

// DOM Elements
const loginForm = document.getElementById("login-form");
const employeeIdInput = document.getElementById("employee-id");
const loginCard = document.getElementById("login-card");
const dashboardCard = document.getElementById("dashboard-card");
const welcomeMsg = document.getElementById("welcome-msg");
const logoutBtn = document.getElementById("logout-btn");
const liveClock = document.getElementById("live-clock");
const toggleClockBtn = document.getElementById("toggle-clock-btn");
const statusText = document.getElementById("status-text");
const logsBody = document.getElementById("logs-body");

// Update Live Clock
setInterval(() => {
  const now = new Date();
  liveClock.textContent = now.toLocaleTimeString();
}, 1000);

// Login Handler
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  currentEmployee = employeeIdInput.value.trim();
  if (currentEmployee) {
    welcomeMsg.textContent = `Employee: ${currentEmployee}`;
    loginCard.classList.add("hidden");
    dashboardCard.classList.remove("hidden");
    loadLogs();
  }
});

// Logout Handler
logoutBtn.addEventListener("click", () => {
  currentEmployee = null;
  dashboardCard.classList.add("hidden");
  loginCard.classList.remove("hidden");
  employeeIdInput.value = "";
});

// Clock In / Clock Out Action
toggleClockBtn.addEventListener("click", () => {
  const now = new Date();

  if (!isClockedIn) {
    // Clocking In
    isClockedIn = true;
    clockInTime = now;
    statusText.innerHTML = "Status: <strong>Clocked In</strong>";
    toggleClockBtn.textContent = "Clock Out";
    toggleClockBtn.classList.add("clocked-in");
  } else {
    // Clocking Out
    isClockedIn = false;
    const clockOutTime = now;
    const hoursWorked = ((clockOutTime - clockInTime) / (1000 * 60 * 60)).toFixed(2);

    saveLog({
      date: clockInTime.toLocaleDateString(),
      in: clockInTime.toLocaleTimeString(),
      out: clockOutTime.toLocaleTimeString(),
      hours: hoursWorked
    });

    statusText.innerHTML = "Status: <strong>Clocked Out</strong>";
    toggleClockBtn.textContent = "Clock In";
    toggleClockBtn.classList.remove("clocked-in");
  }
});

// Local Storage Helpers
function getStorageKey() {
  return `time_logs_${currentEmployee}`;
}

function saveLog(logEntry) {
  const logs = JSON.parse(localStorage.getItem(getStorageKey())) || [];
  logs.push(logEntry);
  localStorage.setItem(getStorageKey(), JSON.stringify(logs));
  renderLogs(logs);
}

function loadLogs() {
  const logs = JSON.parse(localStorage.getItem(getStorageKey())) || [];
  renderLogs(logs);
}

function renderLogs(logs) {
  logsBody.innerHTML = "";
  logs.forEach((log) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${log.date}</td>
      <td>${log.in}</td>
      <td>${log.out}</td>
      <td>${log.hours} hrs</td>
    `;
    logsBody.appendChild(row);
  });
}
