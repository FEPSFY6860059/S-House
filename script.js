// Initialize Supabase Client
const SUPABASE_URL = "https://gcwcaqxrhlqkpfyybhjk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjd2NhcXhyaGxxa3BmeXliaGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5Mjc4MDgsImV4cCI6MjEwMDUwMzgwOH0.IyjAoye6StGXpaZ1G3En-7X1ku-Ndwu72dOC4Ne_Vno";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentEmployee = null;
let currentEmployeeName = "";
let isManager = false;
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

// Navigation Tabs
const navClockin = document.getElementById("nav-clockin");
const navTimetable = document.getElementById("nav-timetable");
const tabClockin = document.getElementById("tab-clockin");
const tabTimetable = document.getElementById("tab-timetable");

// Live Clock
setInterval(() => {
  const now = new Date();
  if (liveClock) liveClock.textContent = now.toLocaleTimeString();
}, 1000);

// Tab Navigation Handlers
navClockin.addEventListener("click", () => switchTab("clockin"));
navTimetable.addEventListener("click", () => switchTab("timetable"));

function switchTab(tabName) {
  if (tabName === "clockin") {
    tabClockin.classList.remove("hidden");
    tabTimetable.classList.add("hidden");
    navClockin.classList.add("active");
    navTimetable.classList.remove("active");
  } else {
    tabClockin.classList.add("hidden");
    tabTimetable.classList.remove("hidden");
    navClockin.classList.remove("active");
    navTimetable.classList.add("active");
  }
}

// Auto Login
async function autoLogin() {
  const savedEmployeeId = localStorage.getItem("clockin_employee_id");

  if (savedEmployeeId) {
    const { data: employee } = await supabaseClient
      .from("employees")
      .select("*")
      .eq("id", savedEmployeeId)
      .maybeSingle();

    if (employee) {
      setupLoggedInUser(employee);
    } else {
      localStorage.removeItem("clockin_employee_id");
    }
  }
}

async function setupLoggedInUser(employee) {
  currentEmployee = employee.id;
  currentEmployeeName = employee.name;
  isManager = (employee.role === "manager");

  localStorage.setItem("clockin_employee_id", currentEmployee);

  welcomeMsg.textContent = `Welcome, ${currentEmployeeName}`;
  loginCard.classList.add("hidden");
  dashboardCard.classList.remove("hidden");

  await checkActiveShift();
  await loadLogs();
  await loadWeeklyRoster();
}

autoLogin();

// Login Submission
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const enteredId = employeeIdInput.value.trim();

  if (!enteredId) return;

  const { data: employee } = await supabaseClient
    .from("employees")
    .select("*")
    .eq("id", enteredId)
    .maybeSingle();

  if (!employee) {
    alert("Unauthorized: Invalid Employee ID.");
    employeeIdInput.value = "";
    return;
  }

  await setupLoggedInUser(employee);
});

// Logout
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("clockin_employee_id");
  currentEmployee = null;
  currentEmployeeName = "";
  isManager = false;
  activeShiftId = null;

  dashboardCard.classList.add("hidden");
  loginCard.classList.remove("hidden");
  employeeIdInput.value = "";
});

// Active Shift Check
async function checkActiveShift() {
  const { data } = await supabaseClient
    .from("shift_logs")
    .select("*")
    .eq("employee_id", currentEmployee)
    .is("clock_out", null)
    .maybeSingle();

  if (data) {
    activeShiftId = data.id;
    updateClockUI(true);
  } else {
    activeShiftId = null;
    updateClockUI(false);
  }
}

// Clock In / Clock Out
toggleClockBtn.addEventListener("click", async () => {
  const now = new Date();
  toggleClockBtn.disabled = true;

  if (!activeShiftId) {
    toggleClockBtn.textContent = "Clocking In...";

    const { data } = await supabaseClient
      .from("shift_logs")
      .insert([{ employee_id: currentEmployee, clock_in: now.toISOString() }])
      .select();

    if (data && data.length > 0) {
      activeShiftId = data[0].id;
      updateClockUI(true);
    }
  } else {
    toggleClockBtn.textContent = "Clocking Out...";

    const { data: shift } = await supabaseClient
      .from("shift_logs")
      .select("clock_in")
      .eq("id", activeShiftId)
      .maybeSingle();

    if (shift) {
      const clockInTime = new Date(shift.clock_in);
      const hoursWorked = ((now - clockInTime) / (1000 * 60 * 60)).toFixed(2);

      await supabaseClient
        .from("shift_logs")
        .update({ clock_out: now.toISOString(), total_hours: hoursWorked })
        .eq("id", activeShiftId);
    }

    activeShiftId = null;
    updateClockUI(false);
    await loadLogs();
  }

  toggleClockBtn.disabled = false;
});

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

// Load Logs
async function loadLogs() {
  const { data: logs } = await supabaseClient
    .from("shift_logs")
    .select("*")
    .eq("employee_id", currentEmployee)
    .not("clock_out", "is", null)
    .order("clock_in", { ascending: false });

  renderLogs(logs || []);
}

function renderLogs(logs) {
  logsBody.innerHTML = "";

  if (logs.length === 0) {
    logsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No completed shifts logged yet.</td></tr>`;
    return;
  }

  logs.forEach((log) => {
    const clockInDate = new Date(log.clock_in);
    const clockOutDate = log.clock_out ? new Date(log.clock_out) : null;

    const dateStr = clockInDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const timeInStr = clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeOutStr = clockOutDate ? clockOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Active";
    const hours = log.total_hours ? `${Number(log.total_hours).toFixed(2)} hrs` : "--";

    const row = document.createElement("tr");
    row.innerHTML = `<td>${dateStr}</td><td>${timeInStr}</td><td>${timeOutStr}</td><td>${hours}</td>`;
    logsBody.appendChild(row);
  });
}

// Load Weekly Roster
async function loadWeeklyRoster() {
  const adminBox = document.getElementById("admin-schedule-box");
  const rosterTitle = document.getElementById("roster-title");
  const rosterUpdated = document.getElementById("roster-updated");
  const rosterContent = document.getElementById("roster-content");

  if (adminBox) {
    if (isManager) {
      adminBox.classList.remove("hidden");
    } else {
      adminBox.classList.add("hidden");
    }
  }

  const { data: roster } = await supabaseClient
    .from("weekly_roster")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!roster) return;

  if (rosterTitle) rosterTitle.textContent = roster.week_title;
  if (rosterUpdated) rosterUpdated.textContent = `Updated: ${new Date(roster.updated_at).toLocaleDateString()}`;

  if (rosterContent) {
    if (roster.image_url && roster.image_url.startsWith("http")) {
      rosterContent.innerHTML = `<img src="${roster.image_url}" style="width:100%; border-radius:8px;" />`;
    } else {
      rosterContent.innerHTML = `<p style="white-space: pre-wrap; font-weight: 500; background: #f8fafc; padding: 12px; border-radius: 8px; margin: 0; color: #1e293b;">${roster.image_url || "No schedule details posted."}</p>`;
    }
  }
}

// Publish Schedule
const publishBtn = document.getElementById("publish-roster-btn");
if (publishBtn) {
  publishBtn.addEventListener("click", async () => {
    const title = document.getElementById("admin-title-input").value.trim();
    const content = document.getElementById("admin-content-input").value.trim();

    if (!title || !content) {
      alert("Please fill in both title and details.");
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing...";

    const { error } = await supabaseClient
      .from("weekly_roster")
      .insert([{ week_title: title, image_url: content }]);

    if (!error) {
      alert("Weekly schedule published!");
      document.getElementById("admin-title-input").value = "";
      document.getElementById("admin-content-input").value = "";
      await loadWeeklyRoster();
    }

    publishBtn.disabled = false;
    publishBtn.textContent = "Publish Schedule";
  });
}
