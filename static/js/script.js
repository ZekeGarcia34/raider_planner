document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');
    const addedCRNs = new Set();

    // Preset color palette for added courses
    const colorPalette = ['#CC0000', '#003366', '#006633', '#660066', '#D97706', '#4B5563'];
    let colorIndex = 0;

    // Initialize FullCalendar
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        slotMinTime: '07:30:00',
        slotMaxTime: '20:00:00',
        allDaySlot: false,
        hiddenDays: [0, 6], // Hide Sunday and Saturday for clean school week view
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridWeek,dayGridMonth'
        },
        events: []
    });
    calendar.render();

    // Add Course Button Event Listener
    document.getElementById('addCrnBtn').addEventListener('click', async function() {
        const crnInput = document.getElementById('crnInput');
        const crn = crnInput.value.trim();
        const term = document.getElementById('termSelect').value;

        if (!crn || crn.length !== 5 || isNaN(crn)) {
            return alert("Please enter a valid 5-digit Texas Tech CRN.");
        }

        if (addedCRNs.has(crn)) {
            return alert("This CRN has already been added to your schedule!");
        }

        try {
            const response = await fetch('http://127.0.0.1:8000/parse-crn', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ crn: crn, term: term })
            });

            const data = await response.json();

            if (response.ok && data.status === 'success') {
                const assignedColor = colorPalette[colorIndex % colorPalette.length];
                colorIndex++;

                // Add events to FullCalendar
                data.events.forEach(event => {
                    calendar.addEvent({
                        id: crn,
                        title: event.title,
                        daysOfWeek: event.daysOfWeek,
                        startTime: event.startTime,
                        endTime: event.endTime,
                        color: assignedColor
                    });
                });

                // Track CRN and render in sidebar UI
                addedCRNs.add(crn);
                renderClassSidebar(crn, data.events[0].title, assignedColor);
                crnInput.value = '';
            } else {
                alert(data.detail || "Could not find course details for this CRN.");
            }
        } catch (error) {
            console.error("Error connecting to backend:", error);
            alert("Could not connect to Python server. Make sure Uvicorn is running on port 8000.");
        }
    });

    // Helper to render the added class item in sidebar with a remove button
    function renderClassSidebar(crn, title, color) {
        const classList = document.getElementById('classList');
        
        // Remove 'empty' message if present
        const emptyMsg = classList.querySelector('.empty-msg');
        if (emptyMsg) emptyMsg.remove();

        const li = document.createElement('li');
        li.className = 'class-item';
        li.style.borderLeftColor = color;
        li.id = `class-item-${crn}`;
        
        li.innerHTML = `
            <span><b>CRN ${crn}</b><br><small>${title.split('-')[0]}</small></span>
            <button onclick="removeClass('${crn}')">Remove</button>
        `;

        classList.appendChild(li);
    }

    // Global helper function to remove class by CRN
    window.removeClass = function(crn) {
        // Remove from FullCalendar
        const calendarEvents = calendar.getEvents();
        calendarEvents.forEach(evt => {
            if (evt.id === crn) evt.remove();
        });

        // Remove from set & sidebar list
        addedCRNs.delete(crn);
        const item = document.getElementById(`class-item-${crn}`);
        if (item) item.remove();

        // Restore empty message if no classes left
        const classList = document.getElementById('classList');
        if (classList.children.length === 0) {
            classList.innerHTML = '<li class="empty-msg">No classes added yet.</li>';
        }
    };
});