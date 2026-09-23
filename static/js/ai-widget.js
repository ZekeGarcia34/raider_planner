/* static/js/ai-widget.js */
(function () {
  // 1. Inject HTML markup for AI Drawer dynamically
  const widgetContainer = document.createElement("div");
  widgetContainer.id = "raider-ai-widget-root";
  widgetContainer.innerHTML = `
    <button id="ai-widget-trigger" onclick="toggleAiDrawer()" title="Ask Raider AI">
      🤖 <span class="ai-btn-text">Ask Raider AI</span>
    </button>

    <div id="ai-widget-drawer" class="ai-drawer-closed">
      <div class="ai-drawer-header">
        <div class="ai-header-title">
          <span class="ai-icon">🤖</span>
          <strong>Raider AI Assistant</strong>
        </div>
        <button class="ai-close-btn" onclick="toggleAiDrawer()">&times;</button>
      </div>

      <div id="ai-chat-messages" class="ai-chat-body">
        <div class="ai-msg bot">
          👋 Hi! I'm your Raider AI Assistant. Ask me anything about your schedule, course prerequisites, or study plans!
        </div>
      </div>

      <div class="ai-input-container">
        <input type="text" id="ai-user-prompt" placeholder="Ask AI (e.g. Find CS electives without Friday classes)..." onkeydown="handleAiKeyPress(event)" />
        <button id="ai-send-btn" onclick="sendAiPrompt()">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(widgetContainer);

  // 2. Add styles dynamically
  const style = document.createElement("style");
  style.textContent = `
    #raider-ai-widget-root { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: system-ui, sans-serif; }
    #ai-widget-trigger { background: #CC0000; color: #fff; border: none; padding: 12px 18px; border-radius: 30px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 8px; transition: transform 0.2s; }
    #ai-widget-trigger:hover { transform: scale(1.05); background: #990000; }
    #ai-widget-drawer { position: fixed; bottom: 80px; right: 20px; width: 360px; height: 480px; background: #1e293b; border: 1px solid #334155; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); display: flex; flex-direction: column; overflow: hidden; transition: all 0.3s ease; }
    .ai-drawer-closed { opacity: 0; pointer-events: none; transform: translateY(20px); }
    .ai-drawer-header { background: #0f172a; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; color: #fff; }
    .ai-close-btn { background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; }
    .ai-chat-body { flex: 1; padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: #0f172a; }
    .ai-msg { padding: 10px 14px; border-radius: 8px; max-width: 85%; font-size: 0.88rem; line-height: 1.4; }
    .ai-msg.bot { background: #334155; color: #f8fafc; align-self: flex-start; }
    .ai-msg.user { background: #CC0000; color: #ffffff; align-self: flex-end; }
    .ai-input-container { padding: 10px; background: #1e293b; display: flex; gap: 8px; border-top: 1px solid #334155; }
    .ai-input-container input { flex: 1; background: #0f172a; border: 1px solid #334155; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; }
    .ai-input-container button { background: #CC0000; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; }
  `;
  document.head.appendChild(style);
})();

function toggleAiDrawer() {
  const drawer = document.getElementById("ai-widget-drawer");
  drawer.classList.toggle("ai-drawer-closed");
}

function handleAiKeyPress(e) {
  if (e.key === "Enter") sendAiPrompt();
}

async function sendAiPrompt() {
  const input = document.getElementById("ai-user-prompt");
  const query = input.value.trim();
  if (!query) return;

  const chatBody = document.getElementById("ai-chat-messages");
  
  // User bubble
  const userMsg = document.createElement("div");
  userMsg.className = "ai-msg user";
  userMsg.textContent = query;
  chatBody.appendChild(userMsg);
  input.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  // Bot loading bubble
  const botMsg = document.createElement("div");
  botMsg.className = "ai-msg bot";
  botMsg.textContent = "Thinking...";
  chatBody.appendChild(botMsg);

  // Gather current page state context to send to n8n
  const payload = {
    action: "ai_schedule",
    prompt: query,
    context: {
      page: window.location.pathname,
      activeCrns: JSON.parse(localStorage.getItem("raider_active_crns") || "[]"),
      savedPlans: JSON.parse(localStorage.getItem("raider_saved_plans") || "{}")
    }
  };

  try {
    const res = await fetch("http://localhost:5678/webhook/raider-planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    botMsg.textContent = data.output || data.message || "I'm having trouble connecting right now.";
  } catch (err) {
    botMsg.textContent = "Error connecting to backend server.";
  }
  chatBody.scrollTop = chatBody.scrollHeight;
}