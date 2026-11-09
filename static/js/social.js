// Load saved profiles and group chats on page load
document.addEventListener("DOMContentLoaded", () => {
    loadUserOptInState();
    loadGroupChats();
    loadPeerDirectory();
});

// 1. Profile Opt-In Logic
function saveSocialProfile() {
    const name = document.getElementById("userDisplayName").value.trim();
    const contact = document.getElementById("userContact").value.trim();
    const status = document.getElementById("userStatus").value;

    if (!name || !contact) {
        alert("Please enter your name and preferred contact method.");
        return;
    }

    // Pull active schedule courses from localStorage to auto-attach
    const activeSchedule = JSON.parse(localStorage.getItem("raider_schedule") || "[]");
    const userCourses = [...new Set(activeSchedule.map(item => item.code || item.title))];

    const profileData = {
        name,
        contact,
        status,
        courses: userCourses.length > 0 ? userCourses : ["General Student"],
        timestamp: new Date().toLocaleDateString()
    };

    localStorage.setItem("raider_social_profile", JSON.stringify(profileData));
    
    // Also push to mock peer directory list
    let directory = JSON.parse(localStorage.getItem("raider_peer_directory") || "[]");
    // Remove old entry by this name if exists, then add fresh
    directory = directory.filter(p => p.name !== name);
    directory.unshift(profileData);
    localStorage.setItem("raider_peer_directory", JSON.stringify(directory));

    loadUserOptInState();
    loadPeerDirectory();
    alert("Successfully opted in! Classmates can now see your status.");
}

function loadUserOptInState() {
    const saved = localStorage.getItem("raider_social_profile");
    const formContainer = document.getElementById("optInFormContainer");
    const banner = document.getElementById("profileActiveBanner");
    const statusDisplay = document.getElementById("currentStatusDisplay");

    if (saved) {
        const profile = JSON.parse(saved);
        if (formContainer) formContainer.style.display = "none";
        if (banner) banner.style.display = "flex";
        if (statusDisplay) statusDisplay.textContent = `${profile.status} (${profile.contact})`;
    } else {
        if (formContainer) formContainer.style.display = "grid";
        if (banner) banner.style.display = "none";
    }
}

function optOutProfile() {
    localStorage.removeItem("raider_social_profile");
    loadUserOptInState();
}

// 2. Group Chats Logic
function openGroupModal() {
    const box = document.getElementById("addGroupBox");
    if (box) box.style.display = box.style.display === "none" ? "block" : "none";
}

function saveGroupChat() {
    const course = document.getElementById("groupCourse").value.trim();
    const platform = document.getElementById("groupPlatform").value;
    const link = document.getElementById("groupLinkUrl").value.trim();

    if (!course || !link) {
        alert("Please fill out the course name and invite link.");
        return;
    }

    const newChat = { course, platform, link };
    let chats = JSON.parse(localStorage.getItem("raider_group_chats") || "[]");
    chats.unshift(newChat);
    localStorage.setItem("raider_group_chats", JSON.stringify(chats));

    document.getElementById("groupCourse").value = "";
    document.getElementById("groupLinkUrl").value = "";
    openGroupModal();
    loadGroupChats();
}

function loadGroupChats() {
    const container = document.getElementById("groupChatsList");
    if (!container) return;

    let chats = JSON.parse(localStorage.getItem("raider_group_chats") || '[{"course": "CS 2413", "platform": "Discord", "link": "https://discord.gg"}]');
    
    container.innerHTML = chats.map(chat => `
        <div class="chat-card">
            <h3 style="font-size: 1rem; margin-bottom: 0.25rem;">${chat.course}</h3>
            <p style="font-size: 0.85rem; color: #94a3b8;"><strong>Platform:</strong> ${chat.platform}</p>
            <span class="badge">Study Group</span>
            <a href="${chat.link}" target="_blank" class="join-btn">Join Chat</a>
        </div>
    `).join("");
}

// 3. Peer Directory & Filtering Logic
function loadPeerDirectory() {
    const container = document.getElementById("classmatesList");
    if (!container) return;

    // Default mock classmates combined with local storage records
    let directory = JSON.parse(localStorage.getItem("raider_peer_directory") || "[]");
    if (directory.length === 0) {
        directory = [
            { name: "Jordan Smith", contact: "Discord: jordan#9999", status: "Looking for Lab Partner", courses: ["CS 2413", "MATH 2360"] },
            { name: "Taylor Davis", contact: "Snapchat: @taylor_d", status: "Studying for Midterms", courses: ["ENGL 1302", "CS 1412"] }
        ];
        localStorage.setItem("raider_peer_directory", JSON.stringify(directory));
    }

    renderDirectoryCards(directory);
}

function renderDirectoryCards(cards) {
    const container = document.getElementById("classmatesList");
    if (!container) return;

    if (cards.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; grid-column: 1/-1;">No classmates found matching your filter.</p>';
        return;
    }

    container.innerHTML = cards.map(peer => `
        <div class="peer-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <h3 style="font-size: 1.05rem;">${peer.name}</h3>
                <span class="badge" style="background-color: var(--accent-green);">${peer.status}</span>
            </div>
            <p style="font-size: 0.85rem; color: var(--accent-blue); margin-bottom: 0.75rem;"><strong>Contact:</strong> ${peer.contact}</p>
            <div style="font-size: 0.8rem; color: #94a3b8;">
                <strong>Classes:</strong> ${Array.isArray(peer.courses) ? peer.courses.join(", ") : peer.courses}
            </div>
        </div>
    `).join("");
}

function filterClassmates() {
    const query = document.getElementById("directorySearch").value.toLowerCase();
    const directory = JSON.parse(localStorage.getItem("raider_peer_directory") || "[]");

    const filtered = directory.filter(peer => {
        const nameMatch = peer.name.toLowerCase().includes(query);
        const statusMatch = peer.status.toLowerCase().includes(query);
        const courseMatch = peer.courses.some(c => c.toLowerCase().includes(query));
        return nameMatch || statusMatch || courseMatch;
    });

    renderDirectoryCards(filtered);
}
