document.addEventListener("DOMContentLoaded", () => {
  loadRoadmap();
});

const DEFAULT_ROADMAP = [
  {
    id: "sem_fall_2026",
    term: "Fall 2026",
    courses: [
      { code: "CS 2413", title: "Data Structures", credits: 4, status: "enrolled" },
      { code: "MATH 2450", title: "Calculus III", credits: 4, status: "enrolled" },
      { code: "PHYS 1408", title: "Principles of Physics I", credits: 4, status: "enrolled" }
    ]
  },
  {
    id: "sem_spring_2027",
    term: "Spring 2027",
    courses: [
      { code: "CS 3364", title: "Design of Algorithms", credits: 3, status: "planned" },
      { code: "PHYS 2401", title: "Principles of Physics II", credits: 4, status: "planned" }
    ]
  }
];

function getRoadmapData() {
  const saved = localStorage.getItem("raider_degree_roadmap");
  return saved ? JSON.parse(saved) : DEFAULT_ROADMAP;
}

function saveRoadmapData(data) {
  localStorage.setItem("raider_degree_roadmap", JSON.stringify(data));
  renderRoadmap();
}

function loadRoadmap() {
  renderRoadmap();
}

function renderRoadmap() {
  const grid = document.getElementById("semesterGrid");
  if (!grid) return;

  const data = getRoadmapData();
  grid.innerHTML = "";

  let totalEarnedHours = 0;

  data.forEach((sem, semIdx) => {
    let semHours = 0;

    const bucket = document.createElement("div");
    bucket.className = "semester-bucket";
    bucket.style.cssText = "background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px;";

   let coursesHtml = sem.courses.map((c, courseIdx) => {
      semHours += Number(c.credits || 3);
      if (c.status === "completed" || c.status === "enrolled") {
        totalEarnedHours += Number(c.credits || 3);
      }

      const badgeColor = c.status === "completed" ? "#10b981" : (c.status === "enrolled" ? "#3b82f6" : "#64748b");

      return `
        <li style="display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 8px 12px; border-radius: 6px; margin-bottom: 8px;">
          <div style="flex-grow: 1;">
            <strong style="color: #f8fafc; font-size: 0.9rem;">${c.code}</strong>
            <span style="font-size: 0.75rem; color: #94a3b8; display: block;">${c.title} (${c.credits} hrs)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.7rem; background: ${badgeColor}; color: white; padding: 2px 6px; border-radius: 4px; text-transform: capitalize;">
              ${c.status}
            </span>
            <!-- Delete Course Button -->
            <button onclick="removeCourseFromSemester('${sem.id}', ${courseIdx})" 
                    title="Remove course"
                    style="background: transparent; border: none; color: #ef4444; font-size: 1.1rem; cursor: pointer; padding: 0 4px; line-height: 1;">
              &times;
            </button>
          </div>
        </li>
      `;
    }).join("");

    bucket.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 1.1rem; color: #f8fafc;">${sem.term}</h3>
        <span style="font-size: 0.8rem; color: #94a3b8;">${semHours} Hrs</span>
      </div>
      <ul class="course-list" style="list-style: none; padding: 0; margin: 0 0 12px 0;">
        ${coursesHtml || '<p style="font-size: 0.8rem; color: #64748b;">No courses added.</p>'}
      </ul>
      <button onclick="addCourseToSemester('${sem.id}')" style="width: 100%; background: #334155; color: #f8fafc; border: none; padding: 6px; border-radius: 6px; font-size: 0.8rem; cursor: pointer;">
        + Add Course
      </button>
    `;

    grid.appendChild(bucket);
  });

  // Update Degree Progress Summary
  const hoursText = document.getElementById("earnedHoursText");
  const progressBar = document.getElementById("degreeProgressBar");
  if (hoursText) hoursText.textContent = totalEarnedHours;
  if (progressBar) {
    const percentage = Math.min(100, Math.round((totalEarnedHours / 120) * 100));
    progressBar.style.width = `${percentage}%`;
  }
}

// Add New Semester Bucket
function addSemesterBucket() {
  const termName = prompt("Enter semester name (e.g., Fall 2027):");
  if (!termName) return;

  const data = getRoadmapData();
  data.push({
    id: "sem_" + Date.now(),
    term: termName,
    courses: []
  });
  saveRoadmapData(data);
}

// Add Course to Specific Semester
function addCourseToSemester(semId) {
  const code = prompt("Course Code (e.g., CS 3375):");
  if (!code) return;
  const title = prompt("Course Title (e.g., Computer Organization):", "Elective");
  const credits = prompt("Credit Hours:", "3");

  const data = getRoadmapData();
  const targetSem = data.find(s => s.id === semId);
  if (targetSem) {
    targetSem.courses.push({
      code: code.toUpperCase(),
      title: title,
      credits: parseInt(credits, 10) || 3,
      status: "planned"
    });
    saveRoadmapData(data);
  }
}

// DegreeWorks Audit Text Parser
function parseAuditText() {
  const text = document.getElementById("auditText").value;
  if (!text.trim()) {
    alert("Please paste text from your DegreeWorks audit.");
    return;
  }

  // Regex pattern matching course codes like CS 1412, MATH 2450, PHYS 1408
  const courseRegex = /([A-Z]{2,4})\s+(\d{4})/g;
  let matches;
  const extractedCourses = [];

  while ((matches = courseRegex.exec(text)) !== null) {
    const fullCode = `${matches[1]} ${matches[2]}`;
    if (!extractedCourses.some(c => c.code === fullCode)) {
      extractedCourses.push({
        code: fullCode,
        title: "Imported Course",
        credits: 3,
        status: "completed"
      });
    }
  }

  if (extractedCourses.length === 0) {
    alert("No course codes detected in the pasted text.");
    return;
  }

  const data = getRoadmapData();
  data.unshift({
    id: "sem_imported_" + Date.now(),
    term: "Transfer / Completed Credits",
    courses: extractedCourses
  });

  saveRoadmapData(data);
  closeAuditModal();
  alert(`Imported ${extractedCourses.length} courses into your roadmap!`);
}

// Modal Handlers
function openAuditModal() {
  document.getElementById("auditModal").classList.remove("hidden");
}

function closeAuditModal() {
  document.getElementById("auditModal").classList.add("hidden");
}
// Remove a single course from a specific semester bucket
function removeCourseFromSemester(semId, courseIdx) {
  const data = getRoadmapData();
  const targetSem = data.find(s => s.id === semId);
  
  if (targetSem && targetSem.courses[courseIdx] !== undefined) {
    const removedCourse = targetSem.courses[courseIdx];
    targetSem.courses.splice(courseIdx, 1);
    saveRoadmapData(data);
  }
}