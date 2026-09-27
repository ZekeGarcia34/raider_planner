let calendar = null;
let activeSchedule = []; // Holds enrolled courses & custom events

const DAY_MAP = {
  "M": "2026-08-24", // Mon
  "T": "2026-08-25", // Tue
  "W": "2026-08-26", // Wed
  "R": "2026-08-27", // Thu
  "F": "2026-08-28"  // Fri
};

document.addEventListener("DOMContentLoaded", () => {
  initCalendar();
  loadSavedSchedule();

  // Trigger CRN add on 'Enter' key press
  const crnInput = document.getElementById("quickCrnInput");
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
    initialDate: "2026-08-24", // Fall semester start week reference
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
  localStorage.setItem("raider_schedule", JSON.stringify(activeSchedule));
  refreshScheduleUI();
}

// Re-render calendar events and update sidebar list + hours counter
function refreshScheduleUI() {
  if (!calendar) return;

  calendar.removeAllEvents();
  let totalCredits = 0;
  const listEl = document.getElementById("activeCrnList");
  if (listEl) listEl.innerHTML = "";

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
        listEl.appendChild(createSidebarCard(item.id, item.title, "Custom Event", item.color));
      }
    } else {
      // Enrolled Course mapping
      totalCredits += Number(item.credits || 3);

      // Map recurring days (e.g., MWF) to calendar event blocks
      const daysStr = item.days || "";
      const times = parseTimeString(item.time);

      if (daysStr !== "TBA" && times) {
        for (let char of daysStr) {
          const dateBase = DAY_MAP[char];
          if (dateBase) {
            calendar.addEvent({
              id: item.crn,
              title: `${item.code} - ${item.title}`,
              start: `${dateBase}T${times.start}`,
              end: `${dateBase}T${times.end}`,
              backgroundColor: "#1e40af",
              borderColor: "#3b82f6"
            });
          }
        }
      }

      if (listEl) {
        listEl.appendChild(
          createSidebarCard(item.crn, item.code, `${item.days} ${item.time} | CRN: ${item.crn}`, "#1e40af")
        );
      }
    }
  });

  const hoursEl = document.getElementById("totalHours");
  if (hoursEl) hoursEl.textContent = totalCredits;
}

// Construct Sidebar item card
function createSidebarCard(id, title, subtitle, badgeColor) {
  const li = document.createElement("li");
  li.className = "crn-card";
  li.innerHTML = `
    <div style="border-left: 4px solid ${badgeColor}; padding-left: 8px;">
      <div style="font-weight: 600; font-size: 0.9rem;">${title}</div>
      <div style="font-size: 0.75rem; color: #94a3b8;">${subtitle}</div>
    </div>
    <button onclick="removeScheduleItem('${id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:1.1rem;">&times;</button>
  `;
  return li;
}

// Remove course/event from schedule
function removeScheduleItem(id) {
  activeSchedule = activeSchedule.filter((item) => item.crn !== id && item.id !== id);
  saveSchedule();
}

// Quick Add CRN via backend API
async function addCrnFromSidebar() {
  const input = document.getElementById("quickCrnInput");
  const crn = input.value.trim();

  if (!crn || crn.length !== 5) {
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
      activeSchedule.push(course);
      saveSchedule();
      input.value = "";
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
  document.getElementById("customEventModal").classList.remove("hidden");
}

function closeCustomEventModal() {
  document.getElementById("customEventModal").classList.add("hidden");
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