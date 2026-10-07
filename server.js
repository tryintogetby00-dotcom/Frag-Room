// Small dependency-free HTTP + WebSocket room server for FRAG ROOM.
// It intentionally keeps match state in memory: rooms reset when the service restarts.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const MAX_PLAYERS = 8;
const MATCH_SECONDS = 180;
const rooms = new Map();
const clients = new Set();
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
const SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function send(client, value) {
  if (!client || client.socket.destroyed) return;
  const body = Buffer.from(JSON.stringify(value));
  let header;
  if (body.length < 126) header = Buffer.from([0x81, body.length]);
  else if (body.length <= 65535) { header = Buffer.alloc(4); header[0]=0x81; header[1]=126; header.writeUInt16BE(body.length,2); }
  else { header = Buffer.alloc(10); header[0]=0x81; header[1]=127; header.writeBigUInt64BE(BigInt(body.length),2); }
  client.socket.write(Buffer.concat([header, body]));
}
function fail(client, message) { send(client, { type:'error', message }); }
function snapshot(room) {
  return { code:room.code, host:room.host, phase:room.phase, bots:room.bots,
    players:[...room.players.values()].map(({id,name,health,kills,deaths,x,z,yaw,respawn})=>({id,name,health,kills,deaths,x,z,yaw,respawn})),
    remaining:room.phase==='playing' ? Math.max(0, Math.ceil((room.endsAt-Date.now())/1000)) : MATCH_SECONDS };
}
function broadcast(room, value) { for (const p of room.players.values()) send(p.client, value); }
function lobby(room) { broadcast(room, { type:'lobby', room:snapshot(room) }); }
function leave(client) {
  const room = client.room;
  if (!room) return;
  room.players.delete(client.id); client.room=null; client.id=null;
  if (!room.players.size) { rooms.delete(room.code); return; }
  if (!room.players.has(room.host)) room.host=room.players.keys().next().value;
  if (room.phase==='playing' && room.players.size===0) rooms.delete(room.code);
  else lobby(room);
}
function roomCode() {
  let code; do { code=''; for(let i=0;i<4;i++) code+=SAFE[Math.floor(Math.random()*SAFE.length)]; } while(rooms.has(code)); return code;
}
function join(client, room, name) {
  if (room.players.size>=MAX_PLAYERS) return fail(client, 'That room is full (8 players maximum).');
  if (room.phase!=='lobby') return fail(client, 'That match has already started.');
  const id=crypto.randomUUID(); client.id=id; client.room=room;
  if(!room.host) room.host=id;
  room.players.set(id,{id,name:name.slice(0,16)||'PLAYER',client,x:0,z:34,yaw:0,health:100,kills:0,deaths:0,respawn:0,lastState:Date.now(),lastShot:0});
  send(client,{type:'joined',id,room:snapshot(room)}); lobby(room);
}
function hitTest(room, shooter, yaw, pitch) {
  const origin={x:shooter.x,y:1.4,z:shooter.z};
  const dir={x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};
  let best=null,bestDot=.994;
  for(const target of room.players.values()) {
    if(target===shooter||target.respawn>0) continue;
    const dx=target.x-shooter.x, dy=1.25-origin.y, dz=target.z-shooter.z, dist=Math.hypot(dx,dy,dz);
    if(dist>42) continue;
    const dot=(dx*dir.x+dy*dir.y+dz*dir.z)/dist;
    if(dot>bestDot){best=target;bestDot=dot;}
  }
  return best;
}
function onMessage(client, message) {
  let data; try { data=JSON.parse(message); } catch { return fail(client,'Invalid message.'); }
  if(data.type==='create') {
    if(client.room) leave(client);
    const room={code:roomCode(),host:null,phase:'lobby',bots:true,players:new Map(),endsAt:0}; rooms.set(room.code,room);
    join(client,room,String(data.name||'PLAYER').replace(/[^\w -]/g,'').trim()); return;
  }
  if(data.type==='join') {
    if(client.room) leave(client);
    const room=rooms.get(String(data.code||'').toUpperCase());
    if(!room) return fail(client,'Room not found. Check the code and try again.');
    join(client,room,String(data.name||'PLAYER').replace(/[^\w -]/g,'').trim()); return;
  }
  const room=client.room, player=room?.players.get(client.id);
  if(data.type==='leave') { leave(client); return send(client,{type:'left'}); }
  if(!room||!player) return fail(client,'Join a room first.');
  if(data.type==='start') {
    if(room.host!==player.id) return fail(client,'Only the room host can start the match.');
    if(room.phase!=='lobby') return;
    if(room.players.size<2 && !room.bots) return fail(client,'You need another player or bots to start.');
    room.phase='playing'; room.endsAt=Date.now()+MATCH_SECONDS*1000;
    const spawns=[[0,34],[0,-34],[34,0],[-34,0],[24,24],[-24,-24],[24,-24],[-24,24]];
    [...room.players.values()].forEach((p,i)=>{p.health=100;p.kills=0;p.deaths=0;p.respawn=0;p.lastState=Date.now();[p.x,p.z]=spawns[i];p.yaw=0;});
    broadcast(room,{type:'start',room:snapshot(room)}); return;
  }
  if(data.type==='state' && room.phase==='playing') {
    const now=Date.now(), elapsed=Math.max(.05,(now-player.lastState)/1000), x=Number(data.x), z=Number(data.z), yaw=Number(data.yaw);
    if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(yaw)) return;
    const maxTravel=Math.max(1.25,elapsed*10+.65);
    if(Math.hypot(x-player.x,z-player.z)>maxTravel) return;
    player.x=Math.max(-51,Math.min(51,x)); player.z=Math.max(-51,Math.min(51,z)); player.yaw=yaw; player.lastState=now; return;
  }
  if(data.type==='shoot' && room.phase==='playing') {
    const now=Date.now(); if(now-player.lastShot<185||player.respawn>0) return;
    player.lastShot=now;
    const yaw=Number(data.yaw),pitch=Number(data.pitch)||0;if(!Number.isFinite(yaw))return;
    const target=hitTest(room,player,yaw,pitch);
    if(!target)return;
    target.health=Math.max(0,target.health-34);
    if(target.health===0){target.deaths++;target.respawn=2800;player.kills++;player.health=Math.min(100,player.health+10);}
    broadcast(room,{type:'hit',shooter:player.id,target:target.id,killed:target.health===0,room:snapshot(room)}); return;
  }
}
function acceptSocket(req,socket) {
  if(req.url!=='/ws'){socket.destroy();return;}
  const key=req.headers['sec-websocket-key']; if(!key){socket.destroy();return;}
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  socket.setNoDelay(true);
  const client={socket,buffer:Buffer.alloc(0),room:null,id:null};clients.add(client);
  socket.on('data',chunk=>{
    client.buffer=Buffer.concat([client.buffer,chunk]);
    while(client.buffer.length>=2){
      const b0=client.buffer[0],b1=client.buffer[1],opcode=b0&15,masked=(b1&128)!==0;let len=b1&127,offset=2;
      if(len===126){if(client.buffer.length<4)return;len=client.buffer.readUInt16BE(2);offset=4;}
      else if(len===127){if(client.buffer.length<10)return;const big=client.buffer.readBigUInt64BE(2);if(big>1048576n){socket.destroy();return;}len=Number(big);offset=10;}
      if(!masked||len>1048576){socket.destroy();return;} if(client.buffer.length<offset+4+len)return;
      const mask=client.buffer.subarray(offset,offset+4),payload=Buffer.from(client.buffer.subarray(offset+4,offset+4+len));client.buffer=client.buffer.subarray(offset+4+len);
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
      if(opcode===8){socket.end();return;} if(opcode===9){socket.write(Buffer.from([0x8a,0]));continue;} if(opcode===1)onMessage(client,payload.toString('utf8'));
    }
  });
  socket.on('close',()=>{clients.delete(client);leave(client);});
  socket.on('error',()=>{clients.delete(client);leave(client);});
}
const server=http.createServer((req,res)=>{
  if(req.url==='/healthz'){res.writeHead(200,{'content-type':'text/plain'});return res.end('ok');}
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Bad request');}
  if(pathname==='/')pathname='/index.html';const file=path.resolve(ROOT,'.'+pathname);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,body)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(body);});
});
server.on('upgrade',acceptSocket);
setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()){
    if(room.phase!=='playing')continue;
    for(const p of room.players.values())if(p.respawn>0){p.respawn=Math.max(0,p.respawn-50);if(!p.respawn){const spawns=[[-23,0],[23,0],[0,-23],[0,23],[0,34]];const s=spawns[Math.floor(Math.random()*spawns.length)];p.x=s[0];p.z=s[1];p.health=100;}}
    if(now>=room.endsAt){room.phase='ended';broadcast(room,{type:'ended',room:snapshot(room)});continue;}
    broadcast(room,{type:'world',room:snapshot(room)});
  }
},50);
setInterval(()=>{for(const client of clients)if(!client.socket.destroyed)client.socket.write(Buffer.from([0x89,0]));},25000).unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`FRAG ROOM listening on ${PORT}`));
