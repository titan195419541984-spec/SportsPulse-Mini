const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon" };
const sports = {
  nba:{sport:"basketball",league:"nba",label:"NBA"},
  nfl:{sport:"football",league:"nfl",label:"NFL"},
  mlb:{sport:"baseball",league:"mlb",label:"MLB"},
  nhl:{sport:"hockey",league:"nhl",label:"NHL"},
  soccer:{sport:"soccer",league:"usa.1",label:"SOCCER"},
  pga:{sport:"golf",league:"pga",label:"PGA TOUR"},
  wnba:{sport:"basketball",league:"wnba",label:"WNBA"},
  tennis:{sport:"tennis",league:"atp",label:"TENNIS"}
};
const cache = new Map();
async function espn(url) {
  const now = Date.now(), hit = cache.get(url);
  if (hit && hit.expires > now) return hit.data;
  const response = await fetch(url, {headers:{"user-agent":"SportsArenaPulse/1.0 (+live sports scoreboard)","accept":"application/json"}, signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error("Sports data provider returned " + response.status);
  const data = await response.json();
  cache.set(url,{data,expires:now+25000});
  return data;
}
function send(res,status,body,type="application/json; charset=utf-8") {
  res.writeHead(status,{"content-type":type,"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin"});
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
const server = http.createServer(async (req,res) => {
  const origin = req.headers.origin || "";
  if (origin === "https://sportsarena-pulse-global.onrender.com") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url,"http://localhost");
  if (url.pathname === "/healthz") return send(res,200,{ok:true,app:"SportsArena Pulse",base44:false});
  if (url.pathname === "/api/sports") return send(res,200,{sports:Object.entries(sports).map(([id,s])=>({id,...s}))});
  const board = url.pathname.match(/^\/api\/scoreboard\/([a-z0-9.-]+)$/i);
  if (board) {
    const s=sports[board[1].toLowerCase()];
    if(!s) return send(res,404,{error:"Unknown sport"});
    try {
      const date = url.searchParams.get("dates");
      const endpoint = "https://site.api.espn.com/apis/site/v2/sports/"+encodeURIComponent(s.sport)+"/"+encodeURIComponent(s.league)+"/scoreboard"+(date?"?dates="+encodeURIComponent(date):"");
      const data=await espn(endpoint);
      return send(res,200,{sport:board[1].toLowerCase(),events:data.events||[],leagues:data.leagues||[],day:data.day||null,provider:"ESPN",updatedAt:new Date().toISOString()});
    } catch(e) { return send(res,502,{error:"Live scores are temporarily unavailable",detail:e.message}); }
  }
  const detail=url.pathname.match(/^\/api\/game\/([a-z0-9.-]+)\/([0-9]+)$/i);
  if(detail) {
    const s=sports[detail[1].toLowerCase()];
    if(!s) return send(res,404,{error:"Unknown sport"});
    try {
      const data=await espn("https://site.api.espn.com/apis/site/v2/sports/"+encodeURIComponent(s.sport)+"/"+encodeURIComponent(s.league)+"/summary?event="+encodeURIComponent(detail[2]));
      return send(res,200,{sport:detail[1].toLowerCase(),event:data.header?.competitions?.[0]||data.header||null,header:data.header||null,boxscore:data.boxscore||null,leaders:data.leaders||null,plays:data.plays||null,winprobability:data.winprobability||null,odds:data.odds||null,provider:"ESPN",updatedAt:new Date().toISOString()});
    } catch(e) { return send(res,502,{error:"Game details are temporarily unavailable",detail:e.message}); }
  }
  if (url.pathname.startsWith("/api/")) return send(res,404,{error:"API route not found"});
  let filePath = path.join(ROOT,"public",decodeURIComponent(url.pathname));
  if (!filePath.startsWith(path.join(ROOT,"public"))) return send(res,403,"Forbidden","text/plain");
  try {
    let stat;
    try { stat=fs.statSync(filePath); } catch {}
    if(stat?.isDirectory()) filePath=path.join(filePath,"index.html");
    if(!fs.existsSync(filePath)||!fs.statSync(filePath).isFile()) filePath=path.join(ROOT,"public","index.html");
    const ext=path.extname(filePath);
    res.writeHead(200,{"content-type":MIME[ext]||"application/octet-stream","cache-control":ext===".html"?"no-cache":"public, max-age=3600","x-content-type-options":"nosniff","referrer-policy":"strict-origin-when-cross-origin"});
    fs.createReadStream(filePath).pipe(res);
  } catch { send(res,500,"Server error","text/plain; charset=utf-8"); }
});
server.listen(PORT,"0.0.0.0",()=>console.log("SportsArena Pulse listening on "+PORT));
