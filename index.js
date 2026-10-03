const fs = require("fs");
const path = require("path");
const express = require("express");
const chalk = require("chalk");
const { login } = require("ws3-fca");

// ⚙️ CONFIG
const ADMIN_IDS = ["61594616562680", "61594981323552"];
const DATA_FILE = path.join(__dirname, "bot_data.json");
const CREDS_FILE = path.join(__dirname, "creds.json");
const PORT = process.env.PORT || 3000;

// 🛡️ ANTI-SPAM
const SPAM_LIMIT = 3;
const SPAM_WINDOW = 10000;
const REPLY_CHANCE = 0.72;

let data = {
  hunting: { active: false, targetThread: null, count: 0, target: 50, startedAt: null },
  stats: { received: 0, sent: 0, commands: 0, duplicates: 0, spamBlocked: 0 },
  lastReplies: {},
  spamTrack: {}
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

// 💬 REPLIES MO
const REPLIES = [
  "hunting ka na naman?",
  "ayan na naman siya",
  "huli na naman kita",
  "caught in 4k",
  "nahuli ka",
  "wala ka nang kawala",
  "kitang kita ka",
  "resibo muna",
  "may ebidensya ako",
  "wag ka magtago",
  "alam ko yan",
  "kilala kita",
  "mukhang guilty",
  "umamin ka na",
  "deny pa more",
  "obvious masyado",
  "huli pero di kulong",
  "nakaabang lang ako",
  "ayan lumabas din",
  "bumalik ka rin",
  "di ka talaga nadadala",
  "same pattern",
  "paulit ulit ka",
  "mimic ka na naman",
  "copy paste era",
  "may sariling version pero kapareho",
  "parang pamilyar ah",
  "saan ko na nga ba nakita yan",
  "interesting choice",
  "very familiar",
  "hunting mode activated",
  "target spotted",
  "movement detected",
  "activity confirmed",
  "caught lacking",
  "exposed",
  "receipts secured",
  "evidence collected",
  "case closed",
  "guilty as charged",
  "no escape",
  "too obvious",
  "nice try",
  "try again",
  "better luck next time",
  "not today",
  "we saw that",
  "we noticed",
  "walang lusot",
  "walang takas",
  "di gumana pagtatago",
  "mahina ang disguise",
  "halata ka",
  "sobrang halata",
  "wag mo nang itago",
  "alam na namin",
  "may nakakita",
  "may nakapansin",
  "resibo incoming",
  "resibo ready",
  "resibo secured",
  "archive muna",
  "screenshot worthy",
  "documented",
  "recorded",
  "noted",
  "logged",
  "marked",
  "tracked",
  "spotted again",
  "repeat offender",
  "usual suspect",
  "same person",
  "same energy",
  "same move",
  "same pattern",
  "same script",
  "same style",
  "same behavior",
  "copycat detected",
  "mimic detected",
  "mimic spotted",
  "original saan",
  "kanino galing yan",
  "inspired daw",
  "inspired masyado",
  "creative pero familiar",
  "originality check failed",
  "copy detected",
  "duplicate detected",
  "similarity detected",
  "pattern matched",
  "match found",
  "we have a match",
  "case reopened",
  "investigation continues",
  "hunting continues",
  "wala pang tapos",
  "round two",
  "another one",
  "eto na naman",
  "again?",
  "seriously?",
  "talaga ba?",
  "sure ka?",
  "confident ka pa?",
  "di ka ba nahihiya?",
  "smooth sana kaso halata"
];

const FILLERS = ["", " eh", " nmn", " ba"];
const SUFFIXES = ["", " 😈", " 💀", " 👁️", ""];

function getHumanReply() {
  let reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
  if (Math.random() < 0.4) reply += FILLERS[Math.floor(Math.random() * FILLERS.length)];
  if (Math.random() < 0.35) reply += SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  return reply;
}

// ⏱️ 10 SECONDS — Fixed
function humanDelay() {
  return 10000; // 10 seconds per reply
}

function isSpamming(tid) {
  const now = Date.now();
  if (!data.spamTrack[tid]) { data.spamTrack[tid] = { count: 1, firstSeen: now }; return false; }
  if (now - data.spamTrack[tid].firstSeen > SPAM_WINDOW) {
    data.spamTrack[tid] = { count: 1, firstSeen: now }; return false;
  }
  data.spamTrack[tid].count++;
  if (data.spamTrack[tid].count > SPAM_LIMIT) { data.stats.spamBlocked++; return true; }
  return false;
}
function shouldReply() { return Math.random() < REPLY_CHANCE; }
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
.ok{color:#0f0}.off{color:#f55}
textarea,button{width:100%;padding:10px;margin:5px 0;background:#222;border:1px solid #444;color:#fff;border-radius:4px}
button{background:#080;cursor:pointer}
button.del{background:#800}
</style></head><body>
<h1>🤖 NULLFIED-BOT</h1>
<div class=card><h3>STATUS</h3>
<p>Status: <span class="${botState.online?'ok':'off'}">${botState.online?'✅ ONLINE':'🔴 OFFLINE'}</span></p>
<p>Delay: ⏱️ 10 SECONDS per reply</p>
<p>Uptime: ${Math.floor(u/3600)}h ${Math.floor(u%3600/60)}m</p>
</div>
<div class=card><h3>🔐 LOGIN — Paste AppState</h3>
<form method=POST action=/login>
<textarea name=appstate rows=8 placeholder='[{"key":"c_user","value":"123"}]'></textarea>
<button type=submit>💾 SAVE & CONNECT</button>
</form></div>
<div class=card><h3>🎯 HUNTING</h3>
<p>Progress: ${data.hunting.count}/50</p>
<form method=POST action=/hunt/on><button>▶️ START</button></form>
<form method=POST action=/hunt/off><button class=del>⏹️ STOP</button></form>
</div>
</body></html>`);
});

app.post("/login", (req, res) => {
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
    console.log(chalk.green(`✅ LOGGED IN: ${botState.uid} | ⏱️ 10s DELAY`));

    api.listenMqtt((err, ev) => {
      if (err) return;
      if (!ev || ev.type !== "message") return;
      data.stats.received++;
      const { threadID, senderID, body, messageID, isSticker, isMedia } = ev;
      if (!body || isSticker || isMedia) return;
      if (isSpamming(threadID)) return;

      // Admin Commands
      if (isAdmin(senderID)) {
        const cmd = body.trim().toLowerCase();
        data.stats.commands++;
        if (cmd === "." || cmd === "hunt") {
          data.hunting.active = true;
          data.hunting.targetThread = threadID;
          data.hunting.startedAt = Date.now();
          api.setMessageReaction("🩸", messageID, ()=>{});
          api.sendMessage("🩸 HUNTING ACTIVATED — ⏱️ 10s DELAY", threadID);
          saveData(); return;
        }
        if (cmd === "hunting off") {
          data.hunting.active = false;
          api.sendMessage("🔴 STOPPED", threadID);
          saveData(); return;
        }
        if (cmd.startsWith("setname ")) {
          api.changeThreadTitle(threadID, body.slice(8), ()=>{});
          return;
        }
      }

      // Hunting
      if (!data.hunting.active || data.hunting.targetThread !== threadID) return;
      if (data.lastReplies[threadID] === body) { data.stats.duplicates++; return; }
      data.lastReplies[threadID] = body;
      if (!shouldReply()) return;

      data.hunting.count++;
      const c = data.hunting.count;
      if ([10, 25, 50].includes(c)) {
        api.sendMessage(`📍 PROGRESS: ${c}/50`, threadID);
      }
      if (c >= 50) {
        const now = new Date().toLocaleString("en-PH", {timeZone:"Asia/Manila"});
        api.sendMessage(`
═══════════════════════
   ✅ RESIBO — NULLFIED
═══════════════════════
   MULA: 1
   HANGGANG: 50
   ORAS: ${now}
   DELAY: 10s per reply
═══════════════════════
   💀 HUNT COMPLETE
        `.trim(), threadID);
        data.hunting.active = false;
        data.hunting.count = 0;
        saveData();
        return;
      }

      api.setTypingIndicator(true, threadID);
      setTimeout(() => {
        api.sendMessage(getHumanReply(), threadID, () => {
          data.stats.sent++;
          api.setTypingIndicator(false, threadID);
          saveData();
        });
      }, humanDelay()); // ⏱️ 10 seconds
    });
  });
}

process.on("uncaughtException", () => setTimeout(startBot, 5000));
loadData();
app.listen(PORT, () => { console.log("✅ DASHBOARD READY — ⏱️ 10s DELAY SET"); startBot(); });
