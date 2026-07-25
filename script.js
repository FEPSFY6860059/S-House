// 1. Initialize Supabase Client
const SUPABASE_URL = "https://gcwcaqxrhlqkpfyybhjk.supabase.co";
const SUPABASE_KEY = "sb_publishable_0lPIUz7-OwJOcvTzrMa09g_-S99H_Su";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentEmployee = null;
let activeShiftId = null;

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
  if (liveClock) liveClock.textContent = now.toLocaleTimeString();
}, 1000);

// Login Handler
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  currentEmployee = employeeIdInput.value.trim();
  if (currentEmployee) {
    welcomeMsg.textContent = `Employee: ${currentEmployee}`;
    loginCard.classList.add("hidden");
    dashboardCard.classList.remove("hidden");
    
    await checkActiveShift();
    await loadLogs();
  }
});

// Logout Handler
logoutBtn.addEventListener("click", () => {
  currentEmployee = null;
  activeShiftId = null;
  dashboardCard.classList.add("hidden");
  loginCard.classList.remove("hidden");
  employeeIdInput.value = "";
});

// Check if Employee is currently clocked in
async function checkActiveShift() {
  const { data, error } = await supabase
    .from("shift_logs")
    .select("*")
    .eq("employee_id", currentEmployee)
    .is("clock_out", null)
    .maybeSingle(); // Changed from .single() to avoid crashing on 0 rows

  if (error) {
    console.error("Error checking active shift:", error.message);
  }

  if (data) {
    activeShiftId = data.id;
    updateClockUI(true);
  } else {
    activeShiftId = null;
    updateClockUI(false);
  }
}

// Clock In / Clock Out Action
toggleClockBtn.addEventListener("click", async () => {
  const now = new Date();

  if (!activeShiftId) {
    // Clocking In
    const { data, error } = await supabase
      .from("shift_logs")
      .insert([{ employee_id: currentEmployee, clock_in: now.toISOString() }])
      .select();

    if (error) {
      console.error("Clock in failed:", error.message);
      alert("Clock-in failed. Check browser console for details.");
      return;
    }

    if (data && data.length > 0) {
      activeShiftId = data[0].id;
      updateClockUI(true);
    }
  } else {
    // Clocking Out
    const { data: shift, error: fetchError } = await supabase
      .from("shift_logs")
      .select("clock_in")
      .eq("id", activeShiftId)
      .maybeSingle();

    if (fetchError || !shift) {
      console.error("Error fetching shift start time:", fetchError?.message);
      return;
    }

    const clockInTime = new Date(shift.clock_in);
    const hoursWorked = ((now - clockInTime) / (1000 * 60 * 60)).toFixed(2);

    const { error: updateError } = await supabase
      .from("shift_logs")
      .update({
        clock_out: now.toISOString(),
        total_hours: hoursWorked
      })
      .eq("id", activeShiftId);

    if (updateError) {
      console.error("Clock out failed:", updateError.message);
      alert("Clock-out failed. Check browser console for details.");
      return;
    }

    activeShiftId = null;
    updateClockUI(false);
    await loadLogs();
  }
});

// Update UI state based on clock status
function updateClockUI(isClockedIn) {
  if (isClockedIn) {
    statusText.innerHTML = "Status: <strong>Clocked In</strong>";
    toggleClockBtn.textContent = "Clock Out";
    toggleClockBtn.classList.add("clocked-in");
  } else {
    statusText.innerHTML = "Status: <strong>Clocked Out</strong>";
    toggleClockBtn.textContent = "Clock In";
    toggleClockBtn.classList.remove("clocked-in");
  }
}

// Load logs from Database
async function loadLogs() {
  const { data: logs, error } = await supabase
    .from("shift_logs")
    .select("*")
    .eq("employee_id", currentEmployee)
    .not("clock_out", "is", null)
    .order("clock_in", { ascending: false });

  if (error) {
    console.error("Error loading logs:", error.message);
    return;
  }

  if (logs) {
    renderLogs(logs);
  }
}

function renderLogs(logs) {
  logsBody.innerHTML = "";
  logs.forEach((log) => {
    const clockInDate = new Date(log.clock_in);
    const clockOutDate = new Date(log.clock_out);
    
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${clockInDate.toLocaleDateString()}</td>
      <td>${clockInDate.toLocaleTimeString()}</td>
      <td>${clockOutDate.toLocaleTimeString()}</td>
      <td>${log.total_hours} hrs</td>
    `;
    logsBody.appendChild(row);
  });
}
