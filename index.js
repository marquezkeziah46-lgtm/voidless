const fs = require("fs");
const path = require("path");
const express = require("express");
const chalk = require("chalk");
const { login } = require("biar-fca");

// ⚙️ CONFIG
const ADMIN_IDS = ["61594616562680", "61594981323552"];
const DATA_FILE = path.join(__dirname, "bot_data.json");
const CREDS_FILE = path.join(__dirname, "creds.json");
const PORT = process.env.PORT || 3000;

// 🛡️ ANTI-SPAM SETTINGS
const SPAM_LIMIT = 3; // max messages per window
const SPAM_WINDOW = 10000; // 10 seconds
const REPLY_CHANCE = 0.72; // 72% lang sumasagot — parang tao

let data = {
  hunting: { active: false, targetThread: null, count: 0, target: 50, startedAt: null },
  stats: { received: 0, sent: 0, commands: 0, duplicates: 0, spamBlocked: 0 },
  lastReplies: {},
  spamTrack: {} // threadID -> { count, firstSeen }
};
let botState = { online: false, uid: null, lastLogin: null };

function loadData() {
  if (fs.existsSync(DATA_FILE)) try { data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) }; } catch (e) {}
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function saveCreds(c) { fs.writeFileSync(CREDS_FILE, JSON.stringify({ appState: c }, null, 2)); }
function loadCreds() {
  if (process.env.APPSTATE_JSON) return JSON.parse(process.env.APPSTATE_JSON);
  if (fs.existsSync(CREDS_FILE)) return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8")).appState;
  return null;
}

// 🧍 HUMAN MIMICKER — Natural Replies
const BASE_REPLIES = [
  "andyan ka pa ba?", "sumagot ka naman wag duwag 😏", "bakit tahimik ka dyan?",
  "tapos na ba?", "hay naku ang bagal mo", "ikaw lang naman inaantay ko",
  "skl lang nmn bat ka ganyan", "wag kang magtago alam kong nandyan ka",
  "buhay kapa ba?", "bakit bigla tumahimik?", "wag mo kong patagalin dyan",
  "pagod na ko maghintay sayo", "ganun lang ba kaya mo?", "ano wala ka nang masabi?",
  "akala ko pa naman matapang ka", "ganyan ka ba talaga?", "bilis naman mawala",
  "sige magtago ka dyan", "hindi ka makakatakas saken", "alam kong nandyan ka pa"
];
const FILLERS = ["", " eh", " nmn", " kasi", " ba"];
const TYPO_VARIANTS = {
  "ka": ["ka", "k", "kaa", "kaaa"],
  "ba": ["ba", "b", "baa"],
  "mo": ["mo", "m", "mo"]
};
const SUFFIXES = ["", " 😈", " 💀", " 👁️", " 👀", ""];

// Generate unique human-style reply
function getHumanReply() {
  const base = BASE_REPLIES[Math.floor(Math.random() * BASE_REPLIES.length)];
  let reply = base;
  
  // Random typos & shortenings
  Object.entries(TYPO_VARIANTS).forEach(([word, vars]) => {
    if (Math.random() < 0.35) { // 35% chance magka-typo
      reply = reply.replace(new RegExp(`\\b${word}\\b`, 'g'), vars[Math.floor(Math.random() * vars.length)]);
    }
  });
  
  // Random filler at end
  if (Math.random() < 0.5) reply += FILLERS[Math.floor(Math.random() * FILLERS.length)];
  
  // Random suffix/emoji
  if (Math.random() < 0.4) reply += SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  
  return reply;
}

// ⏱️ Natural delay — hindi fixed
function humanDelay() {
  // 2.8s – 5.5s + small random variation
  return Math.floor(2800 + Math.random() * 2700 + Math.random() * 500);
}

// 🛡️ Anti-Spam Check
function isSpamming(threadID) {
  const now = Date.now();
  if (!data.spamTrack[threadID]) {
    data.spamTrack[threadID] = { count: 1, firstSeen: now };
    return false;
  }
  const entry = data.spamTrack[threadID];
  if (now - entry.firstSeen > SPAM_WINDOW) {
    data.spamTrack[threadID] = { count: 1, firstSeen: now };
    return false;
  }
  entry.count++;
  if (entry.count > SPAM_LIMIT) {
    data.stats.spamBlocked++;
    return true;
  }
  return false;
}

// Should we reply? — human-like inconsistency
function shouldReply() {
  return Math.random() < REPLY_CHANCE;
}

function isAdmin(id) { return ADMIN_IDS.includes(id); }

// 📊 DASHBOARD
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_, res) => {
  const u = process.uptime();
  res.send(`<!DOCTYPE html><html><head><meta charset=UTF-8><title>NULLFIED-BOT</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:monospace}
body{background:#0a0a0a;color:#0f0;padding:20px;max-width:900px;margin:0 auto}
h1{color:#0f0;margin-bottom:20px}
.card{background:#111;border:1px solid #333;padding:15px;margin:10px 0;border-radius:8px}
.ok{color:#0f0}.off{color:#f55}.warn{color:#ff0}
textarea,button{width:100%;padding:10px;margin:5px 0;background:#222;border:1px solid #444;color:#fff;border-radius:4px}
button{background:#080;cursor:pointer;font-weight:bold}
button.del{background:#800}
</style></head><body>
<h1>🤖 NULLFIED-BOT — HUMAN MIMIC + ANTI-SPAM</h1>
<div class=card><h3>📡 STATUS</h3>
<p>Status: <span class="${botState.online?'ok':'off'}">${botState.online?'✅ ONLINE':'🔴 OFFLINE'}</span></p>
<p>Bot ID: ${botState.uid||'—'}</p>
<p>Uptime: ${Math.floor(u/3600)}h ${Math.floor(u%3600/60)}m</p>
</div>
<div class=card><h3>🔐 LOGIN — Paste AppState</h3>
<form method=POST action=/login>
<textarea name=appstate rows=8 placeholder='[{"key":"c_user","value":"123"}]'></textarea>
<button type=submit>💾 SAVE & CONNECT</button>
</form></div>
<div class=card><h3>🎯 HUNTING</h3>
<p>Progress: ${data.hunting.count}/50</p>
<p class=warn>Anti-Spam: ON | Reply Chance: ${REPLY_CHANCE*100}% | Spam Limit: ${SPAM_LIMIT}/10s</p>
<form method=POST action=/hunt/on><button>▶️ START HUNT</button></form>
<form method=POST action=/hunt/off><button class=del>⏹️ STOP HUNT</button></form>
</div>
<div class=card><h3>📊 STATS</h3>
<pre>Received: ${data.stats.received}
Sent: ${data.stats.sent}
Spam Blocked: ${data.stats.spamBlocked}
Duplicates Skipped: ${data.stats.duplicates}</pre>
</div>
</body></html>`);
});

app.post("/login", async (req, res) => {
  try { saveCreds(JSON.parse(req.body.appstate)); res.redirect("/"); setTimeout(()=>process.exit(1), 1000); }
  catch { res.send("<h3 style=color:red>❌ Invalid JSON</h3><a href=/>Back</a>"); }
});
app.post("/hunt/on", (_, res) => { data.hunting.active = true; saveData(); res.redirect("/"); });
app.post("/hunt/off", (_, res) => { data.hunting.active = false; saveData(); res.redirect("/"); });
app.get("/health", (_, res) => res.send({ status: botState.online?"online":"offline" }));

// 🤖 BOT CORE
let api = null;
const UA = "Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36";

async function startBot() {
  const appState = loadCreds();
  if (!appState) { botState.online = false; return; }
  
  login({ appState, userAgent: UA }, (err, botApi) => {
    if (err) {
      console.log(chalk.red("❌ Login failed — retrying in 10s"));
      botState.online = false;
      setTimeout(startBot, 10000);
      return;
    }
    api = botApi;
    botState.online = true;
    botState.uid = api.getCurrentUserID();
    botState.lastLogin = new Date().toLocaleString("en-PH", {timeZone:"Asia/Manila"});
    console.log(chalk.green(`✅ LOGGED IN: ${botState.uid}`));

    api.listenMqtt((err, ev) => {
      if (err) return;
      if (!ev || ev.type !== "message") return;
      
      data.stats.received++;
      const { threadID, senderID, body, messageID, isSticker, isMedia } = ev;
      
      // Skip stickers/gifs/empty — tao hindi ganyan sumasagot
      if (!body || isSticker || isMedia) return;
      
      // 🛡️ Anti-Spam
      if (isSpamming(threadID)) return;
      
      // 👑 Admin Commands
      if (isAdmin(senderID)) {
        const cmd = body.trim().toLowerCase();
        data.stats.commands++;
        
        if (cmd === "." || cmd === "hunt") {
          data.hunting.active = true;
          data.hunting.targetThread = threadID;
          data.hunting.startedAt = Date.now();
          api.setMessageReaction("🩸", messageID, ()=>{});
          api.sendMessage("🩸 HUNTING ACTIVATED — Human Mimic ON", threadID);
          saveData(); return;
        }
        if (cmd === "hunting off") {
          data.hunting.active = false;
          api.sendMessage("🔴 HUNTING STOPPED", threadID);
          saveData(); return;
        }
        if (cmd.startsWith("setname ")) {
          api.changeThreadTitle(threadID, body.slice(8), ()=>{});
          return;
        }
      }
      
      // 🎯 Hunting Logic
      if (!data.hunting.active || data.hunting.targetThread !== threadID) return;
      
      // Skip duplicate replies
      if (data.lastReplies[threadID] === body) {
        data.stats.duplicates++;
        return;
      }
      data.lastReplies[threadID] = body;
      
      // Human-like inconsistency — minsan hindi sumasagot
      if (!shouldReply()) return;
      
      // Progress counting
      data.hunting.count++;
      const c = data.hunting.count;
      
      if ([10, 25, 50].includes(c)) {
        api.sendMessage(`📍 PROGRESS: ${c}/50`, threadID);
      }
      if (c >= 50) {
        const now = new Date().toLocaleString("en-PH", {timeZone:"Asia/Manila"});
        const dur = Math.floor((Date.now() - data.hunting.startedAt) / 60000);
        api.sendMessage(`
═══════════════════════
   ✅ RESIBO — NULLFIED
═══════════════════════
   MULA: 1
   HANGGANG: 50
   DURATION: ${dur} min
   ORAS: ${now}
   MODE: Human Mimic + Anti-Spam
═══════════════════════
   💀 HUNT COMPLETE
        `.trim(), threadID);
        data.hunting.active = false;
        data.hunting.count = 0;
        saveData();
        return;
      }
      
      // Send with typing + natural delay
      const delay = humanDelay();
      api.setTypingIndicator(true, threadID);
      
      setTimeout(() => {
        api.sendMessage(getHumanReply(), threadID, () => {
          data.stats.sent++;
          api.setTypingIndicator(false, threadID);
          saveData();
        });
      }, delay);
    });
  });
}

// 🔄 Auto-restart
process.on("uncaughtException", (e) => {
  console.log(chalk.yellow("⚠️ Restarting..."), e.message);
  setTimeout(startBot, 5000);
});

loadData();
app.listen(PORT, () => {
  console.log(chalk.green("✅ DASHBOARD READY — Human Mimic + Anti-Spam ACTIVE"));
  startBot();
});
