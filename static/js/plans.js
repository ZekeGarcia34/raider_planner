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
                { id: "plan_default", name: "Plan A (Primary)", schedule: legacySchedule }
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
        const totalCredits = plan.schedule.reduce((acc, item) => acc + (parseInt(item.credits) || 3), 0);
        
        const card = document.createElement("div");
        card.className = `plan-card ${isActive ? 'active-plan' : ''}`;
        card.innerHTML = `
            <div class="plan-info">
                <h3>${plan.name} ${isActive ? '<span class="badge">Active</span>' : ''}</h3>
                <p>${plan.schedule.length} courses | ~${totalCredits} hours</p>
            </div>
            <div class="plan-actions">
                ${!isActive ? `<button class="btn-sm btn-primary" onclick="setActivePlan('${plan.id}')">Make Active</button>` : ''}
                <button class="btn-sm btn-secondary" onclick="duplicatePlan('${plan.id}')">Duplicate</button>
                ${data.plans.length > 1 ? `<button class="btn-sm btn-danger" onclick="deletePlan('${plan.id}')">Delete</button>` : ''}
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
    window.location.reload(); // Reloads to instantly paint the active schedule on the calendar view
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

// Copy CRNs to Clipboard (Pulls from active plan explicitly)
function copyCrnList() {
    const data = getPlansData();
    const activePlan = data.plans.find(p => p.id === data.activePlanId);
    const schedule = activePlan ? activePlan.schedule : [];
    
    const crns = schedule.map(i => i.crn).filter(Boolean);

    if (crns.length === 0) {
        alert("No course CRNs found in active schedule.");
        return;
    }

    navigator.clipboard.writeText(crns.join(", "));
    alert(`Copied ${crns.length} CRNs to clipboard: ${crns.join(", ")}`);
}

// Batch Import CRNs (Robust property matching & error reporting)
async function importCrnBatch() {
    const textarea = document.getElementById("importCrnText");
    const text = textarea ? textarea.value.trim() : "";
    if (!text) {
        alert("Please paste at least one CRN.");
        return;
    }

    // Cleanly split by commas, spaces, or newlines and filter valid 5-digit codes
    const rawCrns = [...new Set(text.split(/[\s,]+/).map(s => s.trim()).filter(s => s.length === 5 && !isNaN(s)))];
    
    if (rawCrns.length === 0) {
        alert("No valid 5-digit CRNs detected.");
        return;
    }

    let data = getPlansData();
    let activePlan = data.plans.find(p => p.id === data.activePlanId);
    let addedCount = 0;
    let failedCrns = [];

    for (let crn of rawCrns) {
        // Check both .crn and .courseReferenceNumber to prevent duplicate skips
        const alreadyExists = activePlan.schedule.some(i => 
            String(i.crn) === String(crn) || String(i.courseReferenceNumber) === String(crn)
        );

        if (!alreadyExists) {
            try {
                const res = await fetch(`/api/search?q=${crn}`);
                const result = await res.json();
                
                if (result.courses && result.courses.length > 0) {
                    // Match course checking both possible CRN field names from the API
                    const course = result.courses.find(c => 
                        String(c.crn) === String(crn) || String(c.courseReferenceNumber) === String(crn)
                    ) || result.courses[0];
                    
                    // Standardize the crn property for consistency across views
                    if (!course.crn && course.courseReferenceNumber) {
                        course.crn = course.courseReferenceNumber;
                    }

                    activePlan.schedule.push(course);
                    addedCount++;
                } else {
                    failedCrns.push(crn);
                }
            } catch (e) {
                console.error(`Failed to fetch CRN ${crn}`, e);
                failedCrns.push(crn);
            }
        }
    }

    savePlansData(data);
    textarea.value = "";
    
    let message = `Successfully added ${addedCount} new courses to your active plan!`;
    if (failedCrns.length > 0) {
        message += ` \nNote: Could not find or fetch the following CRNs: ${failedCrns.join(", ")}`;
    }
    alert(message);
    window.location.reload(); 
}
// Export Schedule to standard .ICS File
function exportIcsFile() {
    const data = getPlansData();
    const activePlan = data.plans.find(p => p.id === data.activePlanId);
    const activeSchedule = activePlan ? activePlan.schedule : [];

    if (activeSchedule.length === 0) {
        alert("Your active schedule is empty.");
        return;
    }

    let calendarName = activePlan ? activePlan.name.replace(/[^a-zA-Z0-9]/g, "_") : "Schedule";
    let icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Raider Planner//TTU Schedule Builder//EN"
    ];

    activeSchedule.forEach(item => {
        if (item.type === "custom") {
            const dtStart = item.start ? item.start.replace(/[-:]/g, "") + "00Z" : "";
            const dtEnd = item.end ? item.end.replace(/[-:]/g, "") + "00Z" : "";
            icsContent.push("BEGIN:VEVENT");
            icsContent.push(`SUMMARY:${item.title}`);
            if (dtStart) icsContent.push(`DTSTART:${dtStart}`);
            if (dtEnd) icsContent.push(`DTEND:${dtEnd}`);
            icsContent.push("END:VEVENT");
        } else {
            icsContent.push("BEGIN:VEVENT");
            icsContent.push(`SUMMARY:${item.code} - ${item.title}`);
            icsContent.push(`DESCRIPTION:CRN: ${item.crn} | Instructor: ${item.instructor || 'TBA'}`);
            icsContent.push(`LOCATION:${item.meetings && item.meetings[0] ? item.meetings[0].location : 'TTU Campus'}`);
            icsContent.push("END:VEVENT");
        }
    });

    icsContent.push("END:VCALENDAR");

    const blob = new Blob([icsContent.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute("download", `${calendarName}_Schedule.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
