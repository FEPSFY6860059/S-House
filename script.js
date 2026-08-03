// 1. Initialize Supabase Client
const SUPABASE_URL = "https://gcwcaqxrhlqkpfyybhjk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjd2NhcXhyaGxxa3BmeXliaGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5Mjc4MDgsImV4cCI6MjEwMDUwMzgwOH0.IyjAoye6StGXpaZ1G3En-7X1ku-Ndwu72dOC4Ne_Vno";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State Variables
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

// Navigation Elements
const navClockin = document.getElementById("nav-clockin");
const navTimetable = document.getElementById("nav-timetable");
const tabClockin = document.getElementById("tab-clockin");
const tabTimetable = document.getElementById("tab-timetable");

// Helper: Fix timezone offset for datetime-local inputs
function toLocalISOString(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  // Adjust for local time offset without double-subtracting or shifting time by an hour
  const offset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - offset);
  return localDate.toISOString().slice(0, 16);
}

// 2. Live Clock Update
setInterval(() => {
  const now = new Date();
  if (liveClock) liveClock.textContent = now.toLocaleTimeString();
}, 1000);

// 3. Tab Switcher
if (navClockin && navTimetable) {
  navClockin.addEventListener("click", () => switchTab("clockin"));
  navTimetable.addEventListener("click", () => switchTab("timetable"));
}

function switchTab(tabName) {
  if (tabName === "clockin") {
    tabClockin?.classList.remove("hidden");
    tabTimetable?.classList.add("hidden");
    navClockin?.classList.add("active");
    navTimetable?.classList.remove("active");
  } else {
    tabClockin?.classList.add("hidden");
    tabTimetable?.classList.remove("hidden");
    navClockin?.classList.remove("active");
    navTimetable?.classList.add("active");
  }
}

// 4. Auto-Login Memory
async function autoLogin() {
  const savedEmployeeId = localStorage.getItem("shouse_employee_id");

  if (savedEmployeeId) {
    const { data: employee } = await supabaseClient
      .from("employees")
      .select("*")
      .eq("id", savedEmployeeId)
      .maybeSingle();

    if (employee) {
      await setupLoggedInUser(employee);
    } else {
      localStorage.removeItem("shouse_employee_id");
    }
  }
}

async function setupLoggedInUser(employee) {
  currentEmployee = employee.id;
  currentEmployeeName = employee.name;
  
  // Strict Manager Check: Manager role AND name must be Emma
  const isEmma = employee.name && employee.name.trim().toLowerCase() === "emma";
  isManager = (employee.role === "manager" && isEmma);

  localStorage.setItem("shouse_employee_id", currentEmployee);

  if (welcomeMsg) welcomeMsg.textContent = `Welcome, ${currentEmployeeName}`;
  loginCard?.classList.add("hidden");
  dashboardCard?.classList.remove("hidden");

  // Reset manager tool visibility
  const existingManagerSection = document.getElementById("manager-edit-section");
  if (existingManagerSection) {
    existingManagerSection.classList.add("hidden");
  }

  await checkActiveShift();
  await loadLogs();
  await loadWeeklyRoster();

  if (isManager) {
    await setupManagerEditTool();
  }
}

autoLogin();

// 5. Login Form Handler
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const enteredId = employeeIdInput.value.trim();

    if (!enteredId) return;

    const { data: employee, error } = await supabaseClient
      .from("employees")
      .select("*")
      .eq("id", enteredId)
      .maybeSingle();

    if (error || !employee) {
      alert("Unauthorized: Invalid Employee ID.");
      employeeIdInput.value = "";
      return;
    }

    await setupLoggedInUser(employee);
  });
}

// 6. Logout Handler
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("shouse_employee_id");
    currentEmployee = null;
    currentEmployeeName = "";
    isManager = false;
    activeShiftId = null;

    const managerSection = document.getElementById("manager-edit-section");
    if (managerSection) managerSection.remove();

    dashboardCard?.classList.add("hidden");
    loginCard?.classList.remove("hidden");
    if (employeeIdInput) employeeIdInput.value = "";
  });
}

// 7. Active Shift Verification
async function checkActiveShift() {
  const { data } = await supabaseClient
    .from("shift_logs")
    .select("*")
    .eq("employee_id", currentEmployee)
    .is("clock_out", null)
    .maybeSingle();

  if (data) {
    active
