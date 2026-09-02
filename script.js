// ==========================================
// 1. CONSTANTS & INITIALIZATION
// ==========================================
const SUPABASE_URL = "https://gcwcaqxrhlqkpfyybhjk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjd2NhcXhyaGxxa3BmeXliaGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5Mjc4MDgsImV4cCI6MjEwMDUwMzgwOH0.IyjAoye6StGXpaZ1G3En-7X1ku-Ndwu72dOC4Ne_Vno";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Google Apps Script Web App Endpoint URL
const GOOGLE_DOC_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbxVmjKi6rh2kF4ACvyFOr8VttZyOhUX7NhrdF20Kvi66wVlNEhs7lavuTAyPJZJcRDPpQ/exec";

// ==========================================
// 2. STATE VARIABLES & DOM ELEMENTS
// ==========================================
let currentEmployee = null;
let currentEmployeeName = "";
let isManager = false;
let activeShiftId = null;

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

const navClockin = document.getElementById("nav-clockin");
const navTimetable = document.getElementById("nav-timetable");
const tabClockin = document.getElementById("tab-clockin");
const tabTimetable = document.getElementById("tab-timetable");

// ==========================================
// 3. UTILITY & HELPER FUNCTIONS
// ==========================================

// Helper: Formats local YYYY-MM-DDTHH:mm string for datetime-local inputs
function toLocalISOString(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  const pad = (num) => String(num).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Helper: Calculates rounded shift duration to nearest 15 mins (e.g. 12:30 - 15:00 = 2.50)
function calculateRoundedHours(clockInDate, clockOutDate) {
  const diffInMinutes = (clockOutDate - clockInDate) / (1000 * 60);
  return (Math.round(diffInMinutes / 15) * 0.25).toFixed(2);
}

// Helper: Generates Monday to Sunday date range strings automatically
function getWeekDates(offsetWeeks = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon...
  const distanceToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  
  const monday = new Date(now);
  monday.setDate(now.getDate() + distanceToMon + (offsetWeeks * 7));
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatOptions = { month: 'short', day: 'numeric' };
  const weekTitle = `Week of ${monday.toLocaleDateString(undefined, formatOptions)} - ${sunday.toLocaleDateString(undefined, formatOptions)}`;

  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const formattedDays = days.map((day, index) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + index);
    return `${day} (${d.toLocaleDateString(undefined, formatOptions)})`;
  });

  return { weekTitle, formattedDays };
}

// Live Clock Update
setInterval(() => {
  const now = new Date();
  if (liveClock) liveClock.textContent = now.toLocaleTimeString();
}, 1000);

// ==========================================
// 4. NAVIGATION & TAB SWITCHER
// ==========================================
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

// ==========================================
// 5. AUTHENTICATION & LOGIN MANAGEMENT
// ==========================================
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

  // Strict Manager Check: Manager role AND case-insensitive check for Emma
  const isEmma = employee.name && employee.name.trim().toLowerCase() === "emma";
  isManager = (employee.role === "manager" && isEmma);

  localStorage.setItem("shouse_employee_id", currentEmployee);

  if (welcomeMsg) welcomeMsg.textContent = `Welcome, ${currentEmployeeName}`;
  loginCard?.classList.add("hidden");
  dashboardCard?.classList.remove("hidden");

  // Get admin elements
  const adminBox = document.getElementById("admin-schedule-box");
  const managerSection = document.getElementById("manager-edit-section");

  if (isManager) {
    // Show and initialize manager features
    await setupManagerEditTool();
    await setupRosterBuilderUI();
  } else {
    // Completely clear and hide manager features for regular employees
    if (adminBox) {
      adminBox.classList.add("hidden");
      adminBox.innerHTML = "";
    }
    if (managerSection) {
      managerSection.classList.add("hidden");
      managerSection.innerHTML = "";
    }
  }

  await checkActiveShift();
  await loadLogs();
  await loadWeeklyRoster();
}

autoLogin();

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const enteredId = employeeIdInput.value.trim();

    if (!enteredId) return;

    try {
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
    } catch (err) {
      console.error("Login error:", err);
      alert("Error logging in.");
    }
  });
}

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

// ==========================================
// 6. SHIFT MANAGEMENT & CLOCK SYSTEM
// ==========================================
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

if (toggleClockBtn) {
  toggleClockBtn.addEventListener("click", async () => {
    const now = new Date();
    toggleClockBtn.disabled = true;

    if (!activeShiftId) {
      toggleClockBtn.textContent = "Clocking In...";

      // Check for active shifts before inserting to prevent conflict
      const { data: existingShift } = await supabaseClient
        .from("shift_logs")
        .select("id")
        .eq("employee_id", currentEmployee)
        .is("clock_out", null)
        .maybeSingle();

      if (existingShift) {
        activeShiftId = existingShift.id;
        updateClockUI(true);
        toggleClockBtn.disabled = false;
        alert("You are already clocked in!");
        return;
      }

      const { data, error } = await supabaseClient
        .from("shift_logs")
        .insert([{ employee_id: currentEmployee, clock_in: now.toISOString() }])
        .select();

      if (error) {
        console.error("Supabase Error:", error);
        alert(`Clock-in failed: ${error.message}`);
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
        const roundedHours = calculateRoundedHours(clockInTime, now);

        // Update Supabase Database
        await supabaseClient
          .from("shift_logs")
          .update({ clock_out: now.toISOString(), total_hours: roundedHours })
          .eq("id", activeShiftId);

        // Send payload to Google Sheets
        if (GOOGLE_DOC_WEBAPP_URL && GOOGLE_DOC_WEBAPP_URL.trim() !== "") {
          try {
            fetch(GOOGLE_DOC_WEBAPP_URL, {
              method: "POST",
              mode: "no-cors",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                employee_id: currentEmployee,
                clock_in: clockInTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
                clock_out: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
                total_hours: roundedHours
              })
            }).catch(err => console.error("Google Sheets sync failed:", err));
          } catch (e) {
            console.error("Google Sheets request skipped:", e);
          }
        }
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

// ==========================================
// 7. DISPLAY LOGS HISTORY
// ==========================================
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
    const timeInStr = clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const timeOutStr = clockOutDate ? clockOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : "Active";
    const hours = log.total_hours ? `${Number(log.total_hours).toFixed(2)} hrs` : "--";

    const row = document.createElement("tr");
    row.innerHTML = `<td>${dateStr}</td><td>${timeInStr}</td><td>${timeOutStr}</td><td>${hours}</td>`;
    logsBody.appendChild(row);
  });
}

// ==========================================
// 8. MANAGER TOOLS: SHIFT ADJUSTMENTS
// ==========================================
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
    `;
    clockCard.appendChild(managerSection);
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
    totalHours = calculateRoundedHours(clockIn, clockOut);
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

// ==========================================
// 9. AUTOMATED SCHEDULE & ROSTER BUILDER (ENHANCED UI & MULTI-STAFF)
// ==========================================
async function loadWeeklyRoster() {
  const rosterTitle = document.getElementById("roster-title");
  const rosterUpdated = document.getElementById("roster-updated");
  const tableContainer = document.querySelector(".table-container");

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
    tableContainer.innerHTML = `<p style="text-align:center; padding: 20px; color: #64748b;">No schedule posted yet.</p>`;
    return;
  }

  const lines = rawText.split("\n");
  let listHTML = `<div style="display: flex; flex-direction: column; gap: 10px; padding: 10px 0;">`;

  lines.forEach(line => {
    if (!line.trim()) return;

    if (line.includes(":")) {
      const parts = line.split(":");
      const day = parts[0].trim();
      const shifts = parts.slice(1).join(":").trim();

      listHTML += `
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
          <strong style="color: #0f172a; font-size: 15px; display: block; margin-bottom: 4px;">${day}</strong>
          <span style="color: #475569; font-size: 14px; line-height: 1.5; white-space: pre-line;">${shifts || "Off / Unassigned"}</span>
        </div>
      `;
    } else {
      listHTML += `<p style="font-weight: 600; margin: 4px 0; color: #0f172a;">${line}</p>`;
    }
  });

  listHTML += `</div>`;
  tableContainer.innerHTML = listHTML;
}

async function setupRosterBuilderUI() {
  const adminBox = document.getElementById("admin-schedule-box");
  if (!adminBox || !isManager) return;

  adminBox.classList.remove("hidden");

  // Fetch staff list from Supabase
  const { data: employees } = await supabaseClient.from("employees").select("name");
  window.currentStaffList = employees ? employees.map(e => e.name) : [];

  const { weekTitle, formattedDays } = getWeekDates(0);

  adminBox.innerHTML = `
    <h4 style="margin-bottom: 12px; color: #0f172a; font-size: 18px;">Manager Schedule Builder</h4>
    
    <div style="margin-bottom: 16px;">
      <label for="week-select" style="display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 4px;">Select Week Range:</label>
      <select id="week-select" style="width: 100%;">
        <option value="0">Current Week</option>
        <option value="1">Next Week</option>
        <option value="2">2 Weeks Ahead</option>
      </select>
    </div>

    <div style="margin-bottom: 16px; background: #e0f2fe; border: 1px solid #bae6fd; padding: 10px 14px; border-radius: 8px;">
      <strong id="auto-week-title" style="font-size: 15px; color: #0369a1;">${weekTitle}</strong>
    </div>

    <div id="days-builder-container" style="display: flex; flex-direction: column; gap: 12px;"></div>

    <button id="publish-roster-btn" class="btn" style="margin-top: 20px; width: 100%;">Publish Schedule</button>
  `;

  renderDayInputs(formattedDays, window.currentStaffList);

  // Auto-update dates when switching weeks
  document.getElementById("week-select").addEventListener("change", (e) => {
    const selectedOffset = parseInt(e.target.value);
    const updated = getWeekDates(selectedOffset);
    document.getElementById("auto-week-title").textContent = updated.weekTitle;
    renderDayInputs(updated.formattedDays, window.currentStaffList);
  });

  // Handle Publish action
  document.getElementById("publish-roster-btn").addEventListener("click", () => publishGeneratedRoster());
}

function renderDayInputs(days, staffList) {
  const container = document.getElementById("days-builder-container");
  if (!container) return;

  let html = "";
  days.forEach((dayLabel, dayIndex) => {
    html += `
      <div class="day-schedule-card" data-day="${dayLabel}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="font-size: 14px; color: #0f172a;">${dayLabel}</strong>
          <button type="button" class="btn-add-staff" onclick="addStaffToDay(${dayIndex})">+ Add Staff</button>
        </div>
        
        <div id="staff-rows-day-${dayIndex}" style="display: flex; flex-direction: column; gap: 6px;">
          ${createStaffRowHTML(dayIndex, 0, staffList)}
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function createStaffRowHTML(dayIndex, rowIdx, staffList) {
  return `
    <div class="staff-shift-row">
      <select class="shift-staff-select" style="min-width: 130px;">
        <option value="">-- Employee --</option>
        ${staffList.map(name => `<option value="${name}">${name}</option>`).join('')}
      </select>
      <input type="text" class="shift-time-input" placeholder="e.g. 8:00 AM - 4:00 PM" style="flex: 1;" />
      ${rowIdx > 0 ? `<button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">✕</button>` : ''}
    </div>
  `;
}

window.addStaffToDay = function(dayIndex) {
  const dayRowsContainer = document.getElementById(`staff-rows-day-${dayIndex}`);
  if (!dayRowsContainer) return;
  const newRowIndex = dayRowsContainer.children.length;
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = createStaffRowHTML(dayIndex, newRowIndex, window.currentStaffList || []);
  dayRowsContainer.appendChild(tempDiv.firstElementChild);
};

async function publishGeneratedRoster() {
  const weekTitle = document.getElementById("auto-week-title").textContent;
  const dayCards = document.querySelectorAll(".day-schedule-card");

  let contentLines = [];

  dayCards.forEach(card => {
    const dayLabel = card.getAttribute("data-day");
    const rows = card.querySelectorAll(".staff-shift-row");
    let dayEntries = [];

    rows.forEach(row => {
      const staffVal = row.querySelector(".shift-staff-select").value;
      const timeVal = row.querySelector(".shift-time-input").value.trim();

      if (staffVal && timeVal) {
        dayEntries.push(`${staffVal} (${timeVal})`);
      } else if (staffVal) {
        dayEntries.push(`${staffVal}`);
      }
    });

    if (dayEntries.length > 0) {
      contentLines.push(`${dayLabel}: ${dayEntries.join(", ")}`);
    } else {
      contentLines.push(`${dayLabel}: Off / Unassigned`);
    }
  });

  const fullContent = contentLines.join("\n");

  const publishBtn = document.getElementById("publish-roster-btn");
  publishBtn.disabled = true;
  publishBtn.textContent = "Publishing...";

  const { error } = await supabaseClient
    .from("weekly_roster")
    .insert([{ week_title: weekTitle, image_url: fullContent }]);

  if (error) {
    alert("Error publishing schedule: " + error.message);
  } else {
    alert("Schedule published successfully!");
    await loadWeeklyRoster();
  }

  publishBtn.disabled = false;
  publishBtn.textContent = "Publish Schedule";
}
