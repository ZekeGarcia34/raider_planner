document.addEventListener("DOMContentLoaded", () => {
  initializeDefaultPlans();
  renderPlansGrid();
});

// Structural schema for storage: { activePlanId: 'plan_1', plans: [ { id: 'plan_1', name: 'Plan A', schedule: [...] } ] }
function getPlansData() {
  const raw = localStorage.getItem("raider_plans_manager");
  if (!raw) {
    // Migrate legacy raider_schedule if exists
    const legacySchedule = JSON.parse(localStorage.getItem("raider_schedule") || "[]");
    const initialData = {
      activePlanId: "plan_default",
      plans: [
        {
          id: "plan_default",
          name: "Plan A (Primary)",
          schedule: legacySchedule
        }
      ]
    };
    localStorage.setItem("raider_plans_manager", JSON.stringify(initialData));
    return initialData;
  }
  return JSON.parse(raw);
}

function savePlansData(data) {
  localStorage.setItem("raider_plans_manager", JSON.stringify(data));
  // Keep raider_schedule in sync with active plan for calendar.js
  const activePlan = data.plans.find(p => p.id === data.activePlanId);
  if (activePlan) {
    localStorage.setItem("raider_schedule", JSON.stringify(activePlan.schedule));
  }
  renderPlansGrid();
}

function initializeDefaultPlans() {
  getPlansData();
}

// Render Plan Cards
function renderPlansGrid() {
  const grid = document.getElementById("plansGrid");
  if (!grid) return;

  const data = getPlansData();
  grid.innerHTML = "";

  data.plans.forEach(plan => {
    const isActive = plan.id === data.activePlanId;
    const courses = plan.schedule.filter(s => s.type !== "custom");
    const customEvents = plan.schedule.filter(s => s.type === "custom");
    const crns = courses.map(c => c.crn).filter(Boolean);
    const totalCredits = courses.reduce((acc, c) => acc + Number(c.credits || 3), 0);

    const card = document.createElement("div");
    card.className = `plan-card ${isActive ? 'active-plan' : ''}`;
    card.innerHTML = `
      <div class="plan-header">
        <h3>${plan.name}</h3>
        <span class="${isActive ? 'badge-green' : 'badge-gray'}">${isActive ? 'Active' : 'Saved'}</span>
      </div>
      <div class="plan-details">
        <p><strong>Classes:</strong> ${courses.length} (${totalCredits} hrs)</p>
        <p><strong>Exams/Events:</strong> ${customEvents.length}</p>
        <p><strong>CRNs:</strong> ${crns.length > 0 ? crns.join(", ") : "None"}</p>
      </div>
      <div class="plan-actions">
        ${!isActive ? `<button onclick="setActivePlan('${plan.id}')" class="btn-primary">Load to Calendar</button>` : `<button disabled class="btn-disabled">Currently Active</button>`}
        <button onclick="duplicatePlan('${plan.id}')" class="btn-secondary">Duplicate</button>
        ${data.plans.length > 1 && !isActive ? `<button onclick="deletePlan('${plan.id}')" class="btn-danger">Delete</button>` : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

// Switch Active Plan
function setActivePlan(planId) {
  const data = getPlansData();
  data.activePlanId = planId;
  savePlansData(data);
  alert("Active schedule updated!");
}

// Create New Blank Plan
function createNewPlan() {
  const name = prompt("Enter a name for this new plan draft:", "Plan B (Backup)");
  if (!name) return;

  const data = getPlansData();
  const newId = "plan_" + Date.now();
  data.plans.push({ id: newId, name: name, schedule: [] });
  savePlansData(data);
}

// Duplicate Plan
function duplicatePlan(planId) {
  const data = getPlansData();
  const target = data.plans.find(p => p.id === planId);
  if (!target) return;

  const newPlan = {
    id: "plan_" + Date.now(),
    name: `${target.name} (Copy)`,
    schedule: JSON.parse(JSON.stringify(target.schedule))
  };
  data.plans.push(newPlan);
  savePlansData(data);
}

// Delete Plan
function deletePlan(planId) {
  const data = getPlansData();
  if (data.activePlanId === planId) {
    alert("You cannot delete the currently active plan.");
    return;
  }
  if (confirm("Are you sure you want to delete this plan?")) {
    data.plans = data.plans.filter(p => p.id !== planId);
    savePlansData(data);
  }
}

// Copy CRNs to Clipboard
function copyCrnList() {
  const activeSchedule = JSON.parse(localStorage.getItem("raider_schedule") || "[]");
  const crns = activeSchedule.map(i => i.crn).filter(Boolean);

  if (crns.length === 0) {
    alert("No course CRNs found in active schedule.");
    return;
  }

  navigator.clipboard.writeText(crns.join(", "));
  alert(`Copied ${crns.length} CRNs to clipboard: ${crns.join(", ")}`);
}

// Batch Import CRNs via scraper endpoint
async function importCrnBatch() {
  const text = document.getElementById("importCrnText").value.trim();
  if (!text) {
    alert("Please paste at least one CRN.");
    return;
  }

  const rawCrns = text.split(/[\s,]+/).filter(s => s.length === 5);
  if (rawCrns.length === 0) {
    alert("No valid 5-digit CRNs detected.");
    return;
  }

  let data = getPlansData();
  let activePlan = data.plans.find(p => p.id === data.activePlanId);
  let addedCount = 0;

  for (let crn of rawCrns) {
    if (!activePlan.schedule.some(i => i.crn === crn)) {
      try {
        const res = await fetch(`/api/search?q=${crn}`);
        const result = await res.json();
        if (result.courses && result.courses.length > 0) {
          const course = result.courses.find(c => c.crn === crn) || result.courses[0];
          activePlan.schedule.push(course);
          addedCount++;
        }
      } catch (e) {
        console.error(`Failed to fetch CRN ${crn}`, e);
      }
    }
  }

  savePlansData(data);
  document.getElementById("importCrnText").value = "";
  alert(`Successfully added ${addedCount} new courses to your active plan!`);
}

// Export Schedule to standard .ICS File
function exportIcsFile() {
  const activeSchedule = JSON.parse(localStorage.getItem("raider_schedule") || "[]");
  if (activeSchedule.length === 0) {
    alert("Your active schedule is empty.");
    return;
  }

  let icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Raider Planner//TTU Schedule Builder//EN"
  ];

  activeSchedule.forEach(item => {
    if (item.type === "custom") {
      const dtStart = item.start.replace(/[-:]/g, "") + "00Z";
      const dtEnd = item.end.replace(/[-:]/g, "") + "00Z";
      icsContent.push("BEGIN:VEVENT");
      icsContent.push(`SUMMARY:${item.title}`);
      icsContent.push(`DTSTART:${dtStart}`);
      icsContent.push(`DTEND:${dtEnd}`);
      icsContent.push("END:VEVENT");
    } else {
      icsContent.push("BEGIN:VEVENT");
      icsContent.push(`SUMMARY:${item.code} - ${item.title}`);
      icsContent.push(`DESCRIPTION:CRN: ${item.crn} | Instructor: ${item.instructor}`);
      icsContent.push(`LOCATION:${item.meetings && item.meetings[0] ? item.meetings[0].location : 'TTU Campus'}`);
      icsContent.push("END:VEVENT");
    }
  });

  icsContent.push("END:VCALENDAR");

  const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute("download", "Raider_Planner_Schedule.ics");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}