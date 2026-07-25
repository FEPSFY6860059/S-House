// 1. Initialize Supabase Client
const SUPABASE_URL = "https://gcwcaqxrhlqkpfyybhjk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjd2NhcXhyaGxxa3BmeXliaGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5Mjc4MDgsImV4cCI6MjEwMDUwMzgwOH0.IyjAoye6StGXpaZ1G3En-7X1ku-Ndwu72dOC4Ne_Vno";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentEmployee = null;
let currentEmployeeName = "";
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

// Update Live Clock Every Second
setInterval(() => {
  const now = new Date();
  if (liveClock) liveClock.textContent = now.toLocaleTimeString();
}, 1000);

// Login Handler: Check if Employee ID exists in the database
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const enteredId = employeeIdInput.value.trim();

  if (!enteredId) return;

  // 1. Verify if employee exists in the 'employees' table
  const { data: employee, error } = await supabaseClient
    .from("employees")
    .select("*")
    .eq("id", enteredId)
    .maybeSingle();

  if (error) {
    console.error("Authorization check error:", error.message);
    alert("Error checking Employee ID. Please try again.");
    return;
  }

  // 2. Reject login if ID is invalid
  if (!employee) {
    alert("Unauthorized: Invalid Employee ID. Please contact your manager.");
    employeeIdInput.value = "";
    return;
  }

  // 3. Login successful
  currentEmployee = employee.id;
  currentEmployeeName = employee.name;

  welcomeMsg.textContent = `Welcome, ${currentEmployeeName}`;
  loginCard.classList.add("hidden");
  dashboardCard.classList.remove("hidden");

  await checkActiveShift();
  await loadLogs();
  await loadTotalHoursSummary();
});

// Logout Handler
logoutBtn.addEventListener("click", () => {
  currentEmployee = null;
  currentEmployeeName = "";
  activeShiftId = null;
  dashboardCard.classList.add("hidden");
  loginCard.classList.remove("hidden");
  employeeIdInput.value = "";
});

// Check if Employee has an ongoing shift (clock_out IS NULL)
async function checkActiveShift() {
  const { data, error } = await supabaseClient
    .from("shift_logs")
    .select("*")
    .eq("employee_id", currentEmployee)
    .is("clock_out", null)
    .maybeSingle();

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

// Clock In / Clock Out Action Handler
toggleClockBtn.addEventListener("click", async () => {
  const now = new Date();

  // Prevent spamming button during API query
  toggleClockBtn.disabled = true;

  if (!activeShiftId) {
    // Action: CLOCK IN
    toggleClockBtn.textContent = "Clocking In...";

    const { data, error } = await supabaseClient
      .from("shift_logs")
      .insert([{ employee_id: currentEmployee, clock_in: now.toISOString() }])
      .select();

    if (error) {
      console.error("Clock in failed:", error.message);
      alert("Clock-in failed. Please check browser console.");
      toggleClockBtn.disabled = false;
      updateClockUI(false);
      return;
    }

    if (data && data.length > 0) {
      activeShiftId = data[0].id;
      updateClockUI(true);
    }
  } else {
    // Action: CLOCK OUT
    toggleClockBtn.textContent = "Clocking Out...";

    // Fetch shift start time to calculate hours
    const { data: shift, error: fetchError } = await supabaseClient
      .from("shift_logs")
      .select("clock_in")
      .eq("id", activeShiftId)
      .maybeSingle();

    if (fetchError || !shift) {
      console.error("Error fetching shift info:", fetchError?.message);
      toggleClockBtn.disabled = false;
      return;
    }

    const clockInTime = new Date(shift.clock_in);
    const hoursWorked = ((now - clockInTime) / (1000 * 60 * 60)).toFixed(2);

    // Save clock_out time & total_hours
    const { error: updateError } = await supabaseClient
      .from("shift_logs")
      .update({
        clock_out: now.toISOString(),
        total_hours: hoursWorked
      })
      .eq("id", activeShiftId);

    if (updateError) {
      console.error("Clock out failed:", updateError.message);
      alert("Clock-out failed. Please try again.");
      toggleClockBtn.disabled = false;
      updateClockUI(true);
      return;
    }

    activeShiftId = null;
    updateClockUI(false);
    await loadLogs();
    await loadTotalHoursSummary();
  }

  toggleClockBtn.disabled = false;
});

// Update UI depending on shift status
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

// Load completed shifts for current employee
async function loadLogs() {
  const { data: logs, error } = await supabaseClient
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

// Fetch cumulative total hours worked from the view
async function loadTotalHoursSummary() {
  const { data, error } = await supabaseClient
    .from("employee_hours_summary")
    .select("grand_total_hours, total_shifts")
    .eq("employee_id", currentEmployee)
    .maybeSingle();

  if (error) {
    console.error("Error loading total hours:", error.message);
    return;
  }

  if (data) {
    console.log(`Cumulative total hours for ${currentEmployeeName}: ${data.grand_total_hours} hrs (${data.total_shifts} shifts)`);
  }
}

// Render formatted shift logs to HTML table
function renderLogs(logs) {
  logsBody.innerHTML = "";

  if (logs.length === 0) {
    logsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No completed shifts logged yet.</td></tr>`;
    return;
  }

  logs.forEach((log) => {
    const clockInDate = new Date(log.clock_in);
    const clockOutDate = log.clock_out ? new Date(log.clock_out) : null;

    const dateStr = clockInDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    const timeInStr = clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeOutStr = clockOutDate 
      ? clockOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      : "Active";

    const hours = log.total_hours ? `${Number(log.total_hours).toFixed(2)} hrs` : "--";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${dateStr}</td>
      <td>${timeInStr}</td>
      <td>${timeOutStr}</td>
      <td>${hours}</td>
    `;
    logsBody.appendChild(row);
  });
}
