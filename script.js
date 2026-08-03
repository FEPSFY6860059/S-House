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

// Helper: Fix 1-hour timezone offset for input values
function toLocalISOString(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
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
  
  // Strict Manager Check (Role is manager AND Name is Emma)
  const isEmma = employee.name && employee.name.trim().toLowerCase() === "emma";
  isManager = (employee.role === "manager" && isEmma);

  localStorage.setItem("shouse_employee_id", currentEmployee);

  if (welcomeMsg) welcomeMsg.textContent = `Welcome, ${currentEmployeeName}`;
  loginCard?.classList.add("hidden");
  dashboardCard?.classList.remove("hidden");

  // Remove existing manager edit box if logging in as regular staff
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
    activeShiftId = data.id;
    updateClockUI(true);
  } else {
    activeShiftId = null;
    updateClockUI(false);
  }
}

// 8. Clock In / Out Action Handler
if (toggleClockBtn) {
  toggleClockBtn.addEventListener("click", async () => {
    const now = new Date();
    toggleClockBtn.disabled = true;

    if (!activeShiftId) {
      toggleClockBtn.textContent = "Clocking In...";

      const { data, error } = await supabaseClient
        .from("shift_logs")
        .insert([{ employee_id: currentEmployee, clock_in: now.toISOString() }])
        .select();

      if (error) {
        alert("Clock-in failed.");
        toggleClockBtn.disabled = false;
        updateClockUI(false);
        return;
      }

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
}

function updateClockUI(isClockedIn) {
  if (!statusText || !toggleClockBtn) return;
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

// 9. Load Employee Logs
async function loadLogs() {
  const { data: logs } = await supabaseClient
    .from("shift_logs")
    .select("*")
    .eq("employee_id", currentEmployee)
    .order("clock_in", { ascending: false });

  renderLogs(logs || []);
}

function renderLogs(logs) {
  if (!logsBody) return;
  logsBody.innerHTML = "";

  if (logs.length === 0) {
    logsBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No shifts logged yet.</td></tr>`;
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

// 10. MANAGER TOOLS: Edit Shifts & Export (Emma Only)
async function setupManagerEditTool() {
  const clockCard = document.getElementById("tab-clockin");
  let managerSection = document.getElementById("manager-edit-section");

  if (!managerSection && clockCard) {
    managerSection = document.createElement("div");
    managerSection.id = "manager-edit-section";
    managerSection.className = "admin-box";
    managerSection.style.marginTop = "20px";
    managerSection.innerHTML = `
      <h4>Manager Tool: Shift Adjustments</h4>
      
      <label for="mgr-select-staff">Edit Staff Member</label>
      <select id="mgr-select-staff">
        <option value="">-- Choose Employee --</option>
      </select>

      <div id="mgr-shift-list-box" style="margin-top: 12px;"></div>

      <hr style="margin: 20px 0; border: none; border-top: 1px dashed var(--border);" />

      <label>Export Shift Records</label>
      <button id="export-csv-btn" class="btn btn-dark" style="margin-top: 6px; width: 100%;">
        📥 Export All Shifts to Excel (.csv)
      </button>
    `;
    clockCard.appendChild(managerSection);

    document.getElementById("export-csv-btn")?.addEventListener("click", exportShiftsToCSV);
  }

  if (managerSection) managerSection.classList.remove("hidden");

  const { data: employees } = await supabaseClient.from("employees").select("*");
  const staffSelect = document.getElementById("mgr-select-staff");
  if (staffSelect && employees) {
    staffSelect.innerHTML = `<option value="">-- Choose Employee --</option>`;
    employees.forEach(emp => {
      staffSelect.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.id})</option>`;
    });

    staffSelect.onchange = (e) => loadStaffShiftsForEditing(e.target.value);
  }
}

async function loadStaffShiftsForEditing(empId) {
  const box = document.getElementById("mgr-shift-list-box");
  if (!empId || !box) {
    box.innerHTML = "";
    return;
  }

  const { data: shifts } = await supabaseClient
    .from("shift_logs")
    .select("*")
    .eq("employee_id", empId)
    .order("clock_in", { ascending: false })
    .limit(5);

  if (!shifts || shifts.length === 0) {
    box.innerHTML = `<p class="subtext" style="margin-top:10px;">No shift history found for this employee.</p>`;
    return;
  }

  let html = `<div style="display:flex; flex-direction:column; gap:10px;">`;
  shifts.forEach(shift => {
    // FIX: Preserves local timezone correctly
    const inISO = toLocalISOString(shift.clock_in);
    const outISO = toLocalISOString(shift.clock_out);

    html += `
      <div class="edit-shift-box" style="background:#fff; padding:10px; border-radius:8px; border:1px solid #ddd;">
        <h5 style="margin:0 0 8px 0;">Shift ID: ${shift.id}</h5>
        <label>Clock In</label>
        <input type="datetime-local" id="in-${shift.id}" value="${inISO}" style="width:100%; margin-bottom:8px;" />
        
        <label>Clock Out</label>
        <input type="datetime-local" id="out-${shift.id}" value="${outISO}" style="width:100%; margin-bottom:8px;" />

        <button class="btn btn-small" onclick="saveShiftEdit(${shift.id})">Save Adjustment</button>
      </div>
    `;
  });
  html += `</div>`;
  box.innerHTML = html;
}

window.saveShiftEdit = async function(shiftId) {
  const inVal = document.getElementById(`in-${shiftId}`).value;
  const outVal = document.getElementById(`out-${shiftId}`).value;

  if (!inVal) {
    alert("Clock-in time cannot be empty.");
    return;
  }

  const clockIn = new Date(inVal);
  let clockOut = outVal ? new Date(outVal) : null;
  let totalHours = null;

  if (clockOut) {
    if (clockOut <= clockIn) {
      alert("Clock-out time must be after clock-in time.");
      return;
    }
    totalHours = ((clockOut - clockIn) / (1000 * 60 * 60)).toFixed(2);
  }

  const { error } = await supabaseClient
    .from("shift_logs")
    .update({
      clock_in: clockIn.toISOString(),
      clock_out: clockOut ? clockOut.toISOString() : null,
      total_hours: totalHours
    })
    .eq("id", shiftId);

  if (error) {
    alert("Error updating shift: " + error.message);
  } else {
    alert("Shift updated successfully!");
    await loadLogs();
  }
};

// CSV EXPORT FUNCTION
async function exportShiftsToCSV() {
  const btn = document.getElementById("export-csv-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generating File...";
  }

  const { data: logs, error } = await supabaseClient
    .from("shift_logs")
    .select("*")
    .order("clock_in", { ascending: false });

  if (error || !logs || logs.length === 0) {
    alert("No shift logs found to export.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "📥 Export All Shifts to Excel (.csv)";
    }
    return;
  }

  const headers = ["Shift ID", "Employee ID", "Clock In", "Clock Out", "Total Hours"];
  const csvRows = [headers.join(",")];

  logs.forEach(row => {
    const clockInStr = row.clock_in ? new Date(row.clock_in).toLocaleString() : "";
    const clockOutStr = row.clock_out ? new Date(row.clock_out).toLocaleString() : "Active";

    const line = [
      row.id,
      `"${row.employee_id || ''}"`,
      `"${clockInStr}"`,
      `"${clockOutStr}"`,
      row.total_hours || 0
    ];
    csvRows.push(line.join(","));
  });

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `S-House_Shifts_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (btn) {
    btn.disabled = false;
    btn.textContent = "📥 Export All Shifts to Excel (.csv)";
  }
}

// 11. Load Schedule as a Simple List
async function loadWeeklyRoster() {
  const adminBox = document.getElementById("admin-schedule-box");
  const rosterTitle = document.getElementById("roster-title");
  const rosterUpdated = document.getElementById("roster-updated");
  const tableContainer = document.querySelector(".table-container");

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

  if (!roster || !tableContainer) return;

  if (rosterTitle) rosterTitle.textContent = roster.week_title;
  if (rosterUpdated) rosterUpdated.textContent = `Updated: ${new Date(roster.updated_at).toLocaleDateString()}`;

  const rawText = roster.image_url || "";
  if (!rawText.trim()) {
    tableContainer.innerHTML = `<p style="text-align:center; padding: 20px;">No schedule posted yet.</p>`;
    return;
  }

  const lines = rawText.split("\n");
  let listHTML = `<div style="display: flex; flex-direction: column; gap: 12px; padding: 10px 0;">`;

  lines.forEach(line => {
    if (!line.trim()) return;

    if (line.includes(":")) {
      const parts = line.split(":");
      const day = parts[0].trim();
      const shifts = parts.slice(1).join(":").trim();

      listHTML += `
        <div style="background: #faf8f5; border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px;">
          <strong style="color: #3a403d; font-size: 15px; display: block; margin-bottom: 6px;">${day}</strong>
          <span style="color: #64748b; font-size: 14px; line-height: 1.4;">${shifts || "No shifts"}</span>
        </div>
      `;
    } else {
      listHTML += `<p style="font-weight: 600; margin: 4px 0; color: #3a403d;">${line}</p>`;
    }
  });

  listHTML += `</div>`;
  tableContainer.innerHTML = listHTML;
}

// 12. Manager Schedule Publishing Handler
const publishBtn = document.getElementById("publish-roster-btn");
if (publishBtn) {
  publishBtn.addEventListener("click", async () => {
    const title = document.getElementById("admin-title-input")?.value.trim();
    const content = document.getElementById("admin-content-input")?.value.trim();

    if (!title || !content) {
      alert("Please fill in both the week title and schedule details.");
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "Publishing...";

    const { error } = await supabaseClient
      .from("weekly_roster")
      .insert([{ week_title: title, image_url: content }]);

    if (error) {
      alert("Failed to publish schedule: " + error.message);
    } else {
      alert("Weekly schedule published successfully!");
      document.getElementById("admin-title-input").value = "";
      document.getElementById("admin-content-input").value = "";
      await loadWeeklyRoster();
    }

    publishBtn.disabled = false;
    publishBtn.textContent = "Publish Schedule";
  });
}
