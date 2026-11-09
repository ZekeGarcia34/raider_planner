let calendar = null;
let activeSchedule = []; // Holds enrolled courses & custom events

// Preset color palette for added courses
const colorPalette = ['#CC0000', '#003366', '#006633', '#660066', '#D97706', '#4B5563'];
let colorIndex = 0;


function parseDaysToNumbers(dayStr) {
    const dayMapping = { 'U': 0, 'M': 1, 'T': 2, 'W': 3, 'R': 4, 'F': 5, 'S': 6 };
    let days = [];
    if (!dayStr) return days;
    for (let char of dayStr) {
        if (dayMapping[char] !== undefined) {
            days.push(dayMapping[char]);
        }
    }
    return days;
}

document.addEventListener("DOMContentLoaded", () => {
  initCalendar();
  loadSavedSchedule();

  // Trigger CRN add on 'Enter' key press (supports both quickCrnInput or crnInput)
  const crnInput = document.getElementById("quickCrnInput") || document.getElementById("crnInput");
  if (crnInput) {
    crnInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        addCrnFromSidebar();
      }
    });
  }
});

// Initialize FullCalendar
function initCalendar() {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "timeGridWeek",
    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "timeGridWeek,timeGridDay,dayGridMonth"
    },
    slotMinTime: "07:00:00",
    slotMaxTime: "22:00:00",
    allDaySlot: false,
    height: "100%",
    events: []
  });

  calendar.render();
}

// Load schedule from localStorage and render on calendar
function loadSavedSchedule() {
  const saved = localStorage.getItem("raider_schedule");
  if (saved) {
    try {
      activeSchedule = JSON.parse(saved);
    } catch (e) {
      activeSchedule = [];
    }
  }
  refreshScheduleUI();
}

function saveSchedule() {
    let plansData = localStorage.getItem("raider_plans_manager");
    
    if (plansData) {
        let data = JSON.parse(plansData);
        let activePlan = data.plans.find(p => p.id === data.activePlanId);
        
        if (activePlan) {
            // Update active plan's schedule with the current activeSchedule array
            activePlan.schedule = activeSchedule;
            localStorage.setItem("raider_plans_manager", JSON.stringify(data));
        }
    }
    
    // Always keep the raw fallback key updated for the calendar view
    localStorage.setItem("raider_schedule", JSON.stringify(activeSchedule));
    
    if (typeof refreshScheduleUI === "function") {
        refreshScheduleUI();
    }
}

// Re-render calendar events and update sidebar list + hours counter
function refreshScheduleUI() {
  if (!calendar) return;

  calendar.removeAllEvents();
  let totalCredits = 0;
  const listEl = document.getElementById("activeCrnList") || document.getElementById("classList");
  if (listEl) listEl.innerHTML = "";

  // Reset color index mapping loop per refresh to keep palette distribution stable
  colorIndex = 0;

  activeSchedule.forEach((item) => {
    if (item.type === "custom") {
      // Custom Event mapping
      calendar.addEvent({
        id: item.id,
        title: item.title,
        start: item.start,
        end: item.end,
        backgroundColor: item.color || "#2563eb",
        borderColor: item.color || "#2563eb"
      });

      if (listEl) {
        listEl.appendChild(createSidebarCard(item.id, item.title, "Custom Event", item.color || "#2563eb"));
      }
    } else {
      // Enrolled Course mapping
      totalCredits += Number(item.credits || 3);

      // Assign a rotating color from the palette if the item doesn't have one saved yet
      if (!item.color) {
        item.color = colorPalette[colorIndex % colorPalette.length];
      }
      colorIndex++;

      // Map recurring days (e.g., MWF) to calendar event blocks
      const daysStr = item.days || "";
      const times = parseTimeString(item.time);

      if (daysStr !== "TBA" && times) {
        calendar.addEvent({
      id: item.crn,
      title: `${item.code} - ${item.title}`,
      daysOfWeek: parseDaysToNumbers(daysStr), // e.g. [1, 3, 5] for MWF
      startTime: times.start,                  // e.g. "09:00:00"
      endTime: times.end,                      // e.g. "09:50:00"
      startRecur: '2026-08-24',                // Fall semester start
      endRecur: '2026-12-15',                  // Fall semester end
      backgroundColor: item.color,
      borderColor: item.color
    });
      }

      if (listEl) {
        listEl.appendChild(
          createSidebarCard(item.crn, item.code, `${item.days} ${item.time} | CRN: ${item.crn}`, item.color)
        );
      }
    }
  });

  // Restore empty message if no classes left
  if (listEl && listEl.children.length === 0) {
    listEl.innerHTML = '<li class="empty-msg">No classes added yet.</li>';
  }

  const hoursEl = document.getElementById("totalHours");
  if (hoursEl) hoursEl.textContent = totalCredits;
}

// Construct Sidebar item card
function createSidebarCard(id, title, subtitle, badgeColor) {
  const li = document.createElement("li");
  li.className = "crn-card class-item";
  li.id = `class-item-${id}`;
  li.innerHTML = `
    <div style="border-left: 4px solid ${badgeColor}; padding-left: 8px;">
      <div style="font-weight: 600; font-size: 0.9rem;">${title}</div>
      <div style="font-size: 0.75rem; color: #94a3b8;">${subtitle}</div>
    </div>
    <button onclick="removeScheduleItem('${id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:1.1rem;">&times;</button>
  `;
  return li;
}

// Remove course/event from schedule (globally exposed so inline HTML buttons can access it)
window.removeScheduleItem = function(id) {
  activeSchedule = activeSchedule.filter((item) => item.crn !== id && item.id !== id);
  saveSchedule();
};

// Quick Add CRN via backend API
async function addCrnFromSidebar() {
  const input = document.getElementById("quickCrnInput") || document.getElementById("crnInput");
  const crn = input ? input.value.trim() : "";

  if (!crn || crn.length !== 5 || isNaN(crn)) {
    alert("Please enter a valid 5-digit CRN.");
    return;
  }

  if (activeSchedule.some((item) => item.crn === crn)) {
    alert("This course is already added to your schedule!");
    return;
  }

  try {
    const res = await fetch(`/api/search?q=${crn}`);
    const data = await res.json();

    if (data.courses && data.courses.length > 0) {
      const course = data.courses.find((c) => c.crn === crn) || data.courses[0];
      
      // Assign initial palette color before pushing to active schedule state
      course.color = colorPalette[colorIndex % colorPalette.length];
      colorIndex++;

      activeSchedule.push(course);
      saveSchedule();
      if (input) input.value = "";
    } else {
      alert(`CRN ${crn} not found in Banner catalog.`);
    }
  } catch (err) {
    console.error(err);
    alert("Failed to fetch CRN details. Check backend connection.");
  }
}

// Custom Event Modal Controls
function openCustomEventModal() {
  const modal = document.getElementById("customEventModal");
  if (modal) modal.classList.remove("hidden");
}

function closeCustomEventModal() {
  const modal = document.getElementById("customEventModal");
  if (modal) modal.classList.add("hidden");
}

function saveCustomEvent() {
  const title = document.getElementById("customTitle").value.trim();
  const color = document.getElementById("customColor").value;
  const start = document.getElementById("customStart").value;
  const end = document.getElementById("customEnd").value;

  if (!title || !start || !end) {
    alert("Please complete all event fields.");
    return;
  }

  const customItem = {
    type: "custom",
    id: "custom_" + Date.now(),
    title: title,
    color: color,
    start: start,
    end: end
  };

  activeSchedule.push(customItem);
  saveSchedule();
  closeCustomEventModal();

  // Reset modal inputs
  document.getElementById("customTitle").value = "";
  document.getElementById("customStart").value = "";
  document.getElementById("customEnd").value = "";
}

// Converts "09:00 AM - 09:50 AM" -> { start: "09:00:00", end: "09:50:00" }
function parseTimeString(timeStr) {
  if (!timeStr || timeStr === "TBA" || !timeStr.includes("-")) return null;

  const [startRaw, endRaw] = timeStr.split("-").map((s) => s.trim());
  return {
    start: convertTo24Hour(startRaw),
    end: convertTo24Hour(endRaw)
  };
}

function convertTo24Hour(time12h) {
  const match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return "08:00:00";

  let [_, hours, minutes, modifier] = match;
  let h = parseInt(hours, 10);

  if (modifier.toUpperCase() === "PM" && h < 12) h += 12;
  if (modifier.toUpperCase() === "AM" && h === 12) h = 0;

  return `${String(h).padStart(2, "0")}:${minutes}:00`;
}
