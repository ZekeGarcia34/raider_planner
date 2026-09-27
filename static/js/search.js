let searchTimeout = null;
let currentPage = 1;
let totalPages = 1;

let loadedSubjects = [];
document.addEventListener('DOMContentLoaded', async () => {
  await loadTerms();
});

async function loadTerms() {
  const termSelect = document.getElementById('term-filter');
  if (!termSelect) return;

  try {
    const res = await fetch('/api/terms');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    
    const data = await res.json();
    
    if (data.terms && data.terms.length > 0) {
      termSelect.innerHTML = data.terms.map(t => 
        `<option value="${t.code}">${t.description}</option>`
      ).join('');

      // Fetch subjects for the default selected term
      await loadSubjects(termSelect.value);
    } else {
      termSelect.innerHTML = '<option value="202727">Fall 2026 TTU</option>';
      await loadSubjects('202727');
    }
  } catch (err) {
    console.error("Error fetching terms:", err);
    // Fallback term if API fails so the UI never stays stuck loading
    termSelect.innerHTML = '<option value="202727">Fall 2026 TTU (Fallback)</option>';
    await loadSubjects('202727');
  }
}

async function loadSubjects(termCode) {
  const datalist = document.getElementById('dept-options');
  const deptInput = document.getElementById('dept-filter');
  if (!datalist || !deptInput || !termCode) return;

  deptInput.value = ''; // Clear current text input
  deptInput.placeholder = 'Loading subjects...';

  try {
    const res = await fetch(`/api/subjects?term=${termCode}`);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const data = await res.json();
    loadedSubjects = data.subjects || [];

    if (loadedSubjects.length > 0) {
      datalist.innerHTML = `
        <option value="ALL">All Subjects (${loadedSubjects.length})</option>
      ` + loadedSubjects.map(s => 
        `<option value="${s.code}">${s.description} (${s.code})</option>`
      ).join('');

      deptInput.placeholder = 'Type subject code or name...';
    } else {
      datalist.innerHTML = '<option value="ALL">All Subjects</option>';
      deptInput.placeholder = 'All Subjects';
    }
  } catch (err) {
    console.error("Error fetching subjects:", err);
    deptInput.placeholder = 'All Subjects (Error loading)';
  }
}

function onSubjectSelectInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => performSearch(1), 300);
}

async function onTermChange() {
  const termSelect = document.getElementById('term-filter');
  if (termSelect && termSelect.value) {
    await loadSubjects(termSelect.value);
    performSearch(1);
  }
}

async function performSearch(page = 1) {
  currentPage = page;

  const queryInput = document.getElementById('search-query');
  const deptInput = document.getElementById('dept-filter');
  const termInput = document.getElementById('term-filter');
  const resultsGrid = document.getElementById('results-grid');
  const resultsSummary = document.getElementById('results-summary');
  const paginationControls = document.getElementById('pagination-controls');

  if (!resultsGrid) return;

  const query = queryInput ? queryInput.value.trim() : '';
  const dept = deptInput ? deptInput.value : 'ALL';
  const term = termInput ? termInput.value : '';

  const params = new URLSearchParams();
  if (query) params.append('q', query);
  if (dept && dept !== 'ALL') params.append('dept', dept);
  if (term) params.append('term', term);
  params.append('page', currentPage);
  params.append('limit', 20);

  resultsGrid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">Searching TTU Catalog...</p>';

  try {
    const response = await fetch(`/api/search?${params.toString()}`);
    const data = await response.json();

    if (!data.courses || data.courses.length === 0) {
      resultsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">
          <p>No courses found matching criteria.</p>
        </div>`;

      if (resultsSummary) resultsSummary.style.display = 'none';
      if (paginationControls) paginationControls.style.display = 'none';
      return;
    }

    if (resultsSummary) {
      document.getElementById('current-count').textContent = data.courses.length;
      document.getElementById('total-count').textContent = data.total || data.courses.length;
      resultsSummary.style.display = 'block';
    }

    totalPages = data.total_pages || 1;
    if (paginationControls) {
      document.getElementById('page-indicator').textContent = `Page ${data.page || 1} of ${totalPages}`;
      document.getElementById('prev-page-btn').disabled = (currentPage <= 1);
      document.getElementById('next-page-btn').disabled = (currentPage >= totalPages);
      paginationControls.style.display = 'flex';
    }

    resultsGrid.innerHTML = data.courses.map(course => {
      // Safely stringify the course object into an HTML attribute
      const courseJson = JSON.stringify(course).replace(/"/g, '&quot;');

      return `
        <div class="course-card">
          <div class="card-header">
            <h3 style="color: var(--ttu-red); font-size: 1.1rem;">${course.code}</h3>
            <span class="crn-badge">CRN ${course.crn}</span>
          </div>
          <h4 style="font-size: 0.95rem; font-weight: 600;">${course.title} (${course.credits} hrs)</h4>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">
            <p><strong>Sec:</strong> ${course.section} | <strong>Seats Left:</strong> ${course.seats_available}</p>
            <p><strong>Schedule:</strong> ${course.days} ${course.time}</p>
            <p><strong>Instructor:</strong> ${course.instructor}</p>
            <p><strong>Location:</strong> ${course.meetings && course.meetings[0] ? course.meetings[0].location : 'TBA'}</p>
          </div>

          <button onclick="enrollInCourse(${courseJson})" 
                  style="width: 100%; padding: 8px; background: #2563eb; color: #ffffff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
            + Add to Schedule
          </button>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error("Search API Error:", err);
    resultsGrid.innerHTML = '<p style="color: #ef4444; grid-column: 1/-1;">Failed to connect to search backend.</p>';
  }
}

function changePage(direction) {
  const newPage = currentPage + direction;
  if (newPage >= 1 && newPage <= totalPages) {
    performSearch(newPage);
  }
}

function onSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => performSearch(1), 300);
}

// Function called when user clicks "+ Add to Schedule" in search results
function enrollInCourse(courseData) {
  let schedule = JSON.parse(localStorage.getItem("raider_schedule") || "[]");
  
  if (schedule.some(item => item.crn === courseData.crn)) {
    alert("This course is already in your schedule!");
    return;
  }
  
  schedule.push(courseData);
  localStorage.setItem("raider_schedule", JSON.stringify(schedule));
  alert(`Added ${courseData.code} (CRN: ${courseData.crn}) to your schedule!`);
}