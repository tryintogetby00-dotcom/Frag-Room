(() => {
  const $ = (s) => document.querySelector(s);
  const home = $('#home'), game = $('#game'), canvas = $('#view'), ctx = canvas.getContext('2d');
  const MAP = ['################','#              #','#  ##          #','#              #','#      ##      #','#              #','#    ##        #','#              #','#        ##    #','#              #','#  ##          #','#              #','################'];
  const W=MAP[0].length,H=MAP.length,FOV=Math.PI/3,MAX=8;
  const FLOOR_PALETTE=['rgba(52,91,104,.22)','rgba(43,73,86,.16)','rgba(38,63,75,.10)','rgba(32,52,64,.07)','rgba(56,91,105,.20)','rgba(44,70,81,.14)','rgba(35,56,68,.09)','rgba(30,47,58,.06)'];
  let state=null, keys={}, pointerLocked=false, last=0, raf=0, mouseTurn=0, sound=true, audio=null;
  function playShot(){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const now=audio.currentTime;const size=Math.floor(audio.sampleRate*.085),buf=audio.createBuffer(1,size,audio.sampleRate),data=buf.getChannelData(0);for(let i=0;i<size;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/size,2.8);const noise=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();noise.buffer=buf;filter.type='lowpass';filter.frequency.setValueAtTime(1800,now);filter.frequency.exponentialRampToValueAtTime(330,now+.085);gain.gain.setValueAtTime(.42,now);gain.gain.exponentialRampToValueAtTime(.001,now+.09);noise.connect(filter).connect(gain).connect(audio.destination);noise.start(now);noise.stop(now+.09);const osc=audio.createOscillator(),og=audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(115,now);osc.frequency.exponentialRampToValueAtTime(48,now+.11);og.gain.setValueAtTime(.2,now);og.gain.exponentialRampToValueAtTime(.001,now+.12);osc.connect(og).connect(audio.destination);osc.start(now);osc.stop(now+.12)}catch{}}
  function say(t, bad=false){const m=$('#message');m.textContent=t;m.style.color=bad?'#ff5668':'#50e3d1'}
  function start(){
    cancelAnimationFrame(raf);home.classList.add('hidden');game.classList.remove('hidden');$('#endCard').classList.add('hidden');
    const spawn=[[3,3],[12,2],[12,9],[3,9],[8,2],[8,9],[2,6],[13,6]];
    const bots=spawn.slice(1,5).map((p,i)=>({id:'bot'+i,name:['BYTE','GLITCH','ROOK','GHOST'][i],x:p[0]+.5,y:p[1]+.5,a:Math.atan2(6-p[1],7-p[0]),health:100,kills:0,respawn:0,bot:true,fire:1+i*.3,strafe:Math.random()<.5?-1:1}));
    state={p:{id:'you',name:'YOU',x:3.5,y:3.5,a:0,health:100,kills:0,respawn:0,shield:2.5,fire:0,reload:0,ammo:12,reserve:48},bots,time:180,active:true,depth:[],lastShot:0};
    $('#roomTag').textContent='SOLO · 4 BOTS';$('#toast').textContent='';last=performance.now();drawScores();resize();canvas.focus({preventScroll:true});raf=requestAnimationFrame(loop);
    if(matchMedia('(pointer:fine)').matches)canvas.requestPointerLock?.();
  }
  function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(1.5,devicePixelRatio||1);canvas.width=Math.max(1,Math.floor(r.width*d));canvas.height=Math.max(1,Math.floor(r.height*d));}
  function wall(x,y){const mx=Math.floor(x),my=Math.floor(y);return my<0||my>=H||mx<0||mx>=W||MAP[my][mx]==='#'}
  function ray(x,y,a,max=20){let d=0;for(d=.04;d<max;d+=.035){const rx=x+Math.cos(a)*d,ry=y+Math.sin(a)*d;if(wall(rx,ry))return d}return max}
  function move(o,dx,dy){if(!wall(o.x+dx,o.y))o.x+=dx;if(!wall(o.x,o.y+dy))o.y+=dy}
  function loop(now){if(!state?.active)return;const dt=Math.min(.04,(now-last)/1000||0);last=now;update(dt);render();raf=requestAnimationFrame(loop)}
  function update(dt){const s=state,p=s.p;s.time-=dt;if(s.time<=0){s.time=0;finish();return}
    if(p.shield>0)p.shield=Math.max(0,p.shield-dt);if(p.respawn>0){p.respawn-=dt;if(p.respawn<=0){p.x=3.5;p.y=3.5;p.health=100;p.ammo=12;p.shield=2.5;toast('BACK IN THE FIGHT')}}
    if(!p.respawn){let f=(keys.KeyW||keys.ArrowUp||keys.w||keys.arrowup?1:0)-(keys.KeyS||keys.ArrowDown||keys.s||keys.arrowdown?1:0),st=(keys.KeyD||keys.ArrowRight||keys.d||keys.arrowright?1:0)-(keys.KeyA||keys.ArrowLeft||keys.a||keys.arrowleft?1:0);const len=Math.hypot(f,st)||1;const speed=3.0;move(p,(Math.cos(p.a)*f+Math.cos(p.a+Math.PI/2)*st)/len*speed*dt,(Math.sin(p.a)*f+Math.sin(p.a+Math.PI/2)*st)/len*speed*dt);p.a+=mouseTurn;mouseTurn=0;
      if(p.reload>0){p.reload-=dt;if(p.reload<=0){const n=Math.min(12-p.ammo,p.reserve);p.ammo+=n;p.reserve-=n;ammo()}}
    }
    for(const b of s.bots){if(b.respawn>0){b.respawn-=dt;if(b.respawn<=0){const sp=[[12.5,2.5],[12.5,9.5],[7.5,2.5],[8.5,9.5]][Math.floor(Math.random()*4)];b.x=sp[0];b.y=sp[1];b.health=100}continue}
      const dx=p.x-b.x,dy=p.y-b.y,dist=Math.hypot(dx,dy),ang=Math.atan2(dy,dx);let da=norm(ang-b.a);b.a+=Math.max(-1.9*dt,Math.min(1.9*dt,da));
      const blocked=ray(b.x,b.y,ang,dist+.2)<dist-.15;const approach=dist>3.8?1:dist<2.5?-.4:0;const orbit=Math.sin(now/950+b.x)*.45;b.strafe=Math.sin(now/1300+b.y)>0?1:-1;
      if(!blocked){const vx=(Math.cos(b.a)*approach+Math.cos(b.a+Math.PI/2)*(orbit+b.strafe*.25))*1.25*dt,vy=(Math.sin(b.a)*approach+Math.sin(b.a+Math.PI/2)*(orbit+b.strafe*.25))*1.25*dt;move(b,vx,vy)}
      b.fire-=dt;if(!blocked&&dist<10&&Math.abs(da)<.22&&b.fire<=0){b.fire=1.05+Math.random()*.65;if(Math.random()<Math.max(.12,.58-dist*.035))damagePlayer(9+Math.random()*8)}
    }
    hud();
  }
  function norm(a){while(a>Math.PI)a-=Math.PI*2;while(a< -Math.PI)a+=Math.PI*2;return a}
  function damagePlayer(d){const p=state.p;if(p.respawn||p.shield>0)return;p.health=Math.max(0,p.health-d);if(p.health===0){p.respawn=2.2;for(const b of state.bots)if(Math.random()<.36)b.kills++;toast('ELIMINATED — RESPAWNING');p.health=0}$('#healthBar').style.width=p.health+'%';$('#healthText').textContent=Math.ceil(p.health);drawScores()}
  function shoot(){const s=state,p=s?.p;if(!s?.active||p.respawn||p.reload>0||performance.now()-s.lastShot<190)return;s.lastShot=performance.now();if(p.ammo<=0){reload();return}playShot();p.ammo--;ammo();let target=null,best=.12;for(const b of s.bots){if(b.respawn>0)continue;const dx=b.x-p.x,dy=b.y-p.y,dist=Math.hypot(dx,dy),delta=Math.abs(norm(Math.atan2(dy,dx)-p.a));const angular=Math.atan2(.24,dist);if(delta<angular&&delta<best&&ray(p.x,p.y,p.a,dist+.1)>=dist-.1){target=b;best=delta}}
    flash();if(target){target.health-=34;$('#hitmarker').style.opacity='1';setTimeout(()=>$('#hitmarker').style.opacity='0',100);if(target.health<=0){target.kills++;target.health=0;target.respawn=2.4;p.kills++;p.health=Math.min(100,p.health+10);$('#healthBar').style.width=p.health+'%';$('#healthText').textContent=Math.ceil(p.health);toast('ELIMINATION  +1');drawScores()}}}
  function reload(){if(!state||state.p.reload>0||state.p.ammo===12||state.p.reserve===0)return;state.p.reload=1.05;toast('RELOADING...')}
  function flash(){canvas.style.filter='brightness(1.13)';setTimeout(()=>canvas.style.filter='',55)}
  function toast(t){const el=$('#toast');el.textContent=t;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.textContent='',1000)}
  function ammo(){$('#ammoText').innerHTML=`${state.p.ammo} <small>/ ${state.p.reserve}</small>`}
  function hud(){$('#timer').textContent=`${String(Math.floor(state.time/60)).padStart(2,'0')}:${String(Math.floor(state.time%60)).padStart(2,'0')}`;$('#healthBar').style.width=state.p.health+'%';$('#healthText').textContent=Math.ceil(state.p.health)}
  function drawScores(){if(!state)return;const all=[state.p,...state.bots].sort((a,b)=>b.kills-a.kills);$('#scoreRows').innerHTML=all.map(x=>`<div class="score-row ${x.id==='you'?'me':''}"><span>${x.name}</span><b>${x.kills}</b></div>`).join('')}
  function drawArenaBase(p,w,h){
    const horizon=h*.52;
    // Ceiling panels and recessed cyan strip lights give the room a visible structure.
    const ceiling=ctx.createLinearGradient(0,0,0,horizon);ceiling.addColorStop(0,'#09111d');ceiling.addColorStop(.72,'#1a2636');ceiling.addColorStop(1,'#34404b');ctx.fillStyle=ceiling;ctx.fillRect(0,0,w,horizon);
    for(let i=0;i<9;i++){const y=horizon*(i/9),spread=2+(i/9)*w*.07;ctx.fillStyle=i%2?'#253344':'#1e2b3b';ctx.fillRect(0,y,w,Math.max(1,horizon*.012));ctx.fillStyle='#50e3d120';ctx.fillRect(w*.5-spread,y+2,spread*2,Math.max(1,horizon*.008))}
    for(let i=-4;i<=4;i++){const x=w*.5+i*w*.12;ctx.strokeStyle='#71879b25';ctx.beginPath();ctx.moveTo(w*.5,horizon*.08);ctx.lineTo(x,horizon);ctx.stroke()}
    ctx.fillStyle='#50e3d1';ctx.globalAlpha=.32;for(let i=0;i<7;i++){const x=w*(.08+i*.14),y=horizon*(.24+(i%2)*.06);ctx.fillRect(x,y,Math.max(5,w*.035),Math.max(2,horizon*.014))}ctx.globalAlpha=1;
    // Project a subtle metal floor tile pattern into world space.
    const base=ctx.createLinearGradient(0,horizon,0,h);base.addColorStop(0,'#263746');base.addColorStop(.38,'#26313a');base.addColorStop(1,'#111923');ctx.fillStyle=base;ctx.fillRect(0,horizon,w,h-horizon);
    const sx=Math.max(12,Math.ceil(w/48)),sy=12;
    for(let yy=horizon+2;yy<h;yy+=sy){const py=yy+sy*.5,depth=.56*h/(py-horizon);for(let xx=0;xx<w;xx+=sx){const a=p.a+((xx+sx*.5)/w-.5)*FOV,wx=p.x+Math.cos(a)*depth,wy=p.y+Math.sin(a)*depth,fx=wx-Math.floor(wx),fy=wy-Math.floor(wy),edge=Math.min(fx,1-fx,fy,1-fy),tile=(Math.floor(wx)+Math.floor(wy))&1,bin=edge<.022?0:edge<.05?1:edge<.1?2:3;ctx.fillStyle=FLOOR_PALETTE[tile*4+bin];if(Math.abs(fx-.5)<.012)ctx.fillStyle=FLOOR_PALETTE[4+bin];ctx.fillRect(xx,yy,sx,sy)}}
    // Two painted guide lanes run through the arena floor.
    ctx.globalAlpha=.2;ctx.fillStyle='#50e3d1';ctx.beginPath();ctx.moveTo(w*.47,horizon);ctx.lineTo(w*.49,horizon);ctx.lineTo(w*.34,h);ctx.lineTo(w*.26,h);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(w*.53,horizon);ctx.lineTo(w*.51,horizon);ctx.lineTo(w*.66,h);ctx.lineTo(w*.74,h);ctx.closePath();ctx.fill();ctx.globalAlpha=1;
  }
  function drawWallPanels(p,w,h,cols,step,depths){const horizon=h*.52;for(let i=0;i<cols;i++){const d=depths[i],a=p.a-FOV/2+((i+.5)/cols)*FOV,x=p.x+Math.cos(a)*d,y=p.y+Math.sin(a)*d,fx=x-Math.floor(x),fy=y-Math.floor(y),xFace=Math.abs(fx)<Math.abs(fy),u=xFace?fy:fx,wallH=Math.min(h*1.5,h/(d*.77)),top=(h-wallH)/2,left=i*step;const cell=(Math.floor(x)+Math.floor(y))&1;
      if(u<.035||u>.965){ctx.fillStyle='#050a12a0';ctx.fillRect(left,top,step+1,wallH)}
      const band=Math.max(1,wallH*.012);ctx.fillStyle=cell?'#5e809022':'#50e3d11a';ctx.fillRect(left,top+wallH*.16,step+1,band);ctx.fillRect(left,top+wallH*.82,step+1,band);
      if(((Math.floor(x)+Math.floor(y))%4===0)&&u>.46&&u<.5){ctx.fillStyle='#50e3d180';ctx.fillRect(left,top+wallH*.19,step+1,wallH*.62)}
    }}
  function render(){const s=state,w=canvas.width,h=canvas.height,p=s.p;const sky=ctx.createLinearGradient(0,0,0,h*.53);sky.addColorStop(0,'#121b2d');sky.addColorStop(1,'#293246');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h*.53);const floor=ctx.createLinearGradient(0,h*.52,0,h);floor.addColorStop(0,'#252b37');floor.addColorStop(1,'#0c111a');ctx.fillStyle=floor;ctx.fillRect(0,h*.52,w,h*.48);
    drawArenaBase(p,w,h);
    // Perspective floor lines
    ctx.strokeStyle='#b5d7ef18';ctx.lineWidth=1;for(let i=1;i<13;i++){let yy=h*.52+(i/13)**2*h*.48;ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke()}for(let i=-12;i<=12;i++){ctx.beginPath();ctx.moveTo(w*.5,h*.52);ctx.lineTo(w*.5+i*w*.12,h);ctx.stroke()}ctx.fillStyle='#50e3d108';ctx.fillRect(0,h*.515,w,Math.max(1,h*.004));
    const cols=Math.min(500,Math.ceil(w/3)),step=w/cols;s.depth=new Float32Array(cols);for(let i=0;i<cols;i++){const a=p.a-FOV/2+(i/cols)*FOV,d=ray(p.x,p.y,a),correct=d*Math.cos(a-p.a);s.depth[i]=correct;const wallH=Math.min(h*1.5,h/(correct*.77)),top=(h-wallH)/2;const shade=Math.max(30,150-correct*13),side=Math.abs(((p.x+Math.cos(a)*d)%1)-.5)>Math.abs(((p.y+Math.sin(a)*d)%1)-.5);ctx.fillStyle=side?`rgb(${shade*.61},${shade*.78},${shade})`:`rgb(${shade*.77},${shade*.94},${shade})`;ctx.fillRect(i*step,top,step+1,wallH);ctx.fillStyle='#02040a30';ctx.fillRect(i*step,top,1,wallH);if(i%Math.max(4,Math.floor(cols/32))===0){ctx.fillStyle='#09101a20';ctx.fillRect(i*step,top,Math.max(1,step*.5),wallH)}const trim=Math.max(2,wallH*.012);ctx.fillStyle='#50e3d126';ctx.fillRect(i*step,top+wallH-trim,step+1,trim)}
    drawWallPanels(p,w,h,cols,step,s.depth);const entities=s.bots.filter(b=>b.respawn<=0).map(b=>({b,dist:Math.hypot(b.x-p.x,b.y-p.y)})).sort((a,b)=>b.dist-a.dist);for(const e of entities){const b=e.b,ang=norm(Math.atan2(b.y-p.y,b.x-p.x)-p.a);if(Math.abs(ang)>FOV*.58)continue;const x=(.5+ang/FOV)*w,col=Math.max(0,Math.min(cols-1,Math.floor(x/step)));if(e.dist>s.depth[col]+.18)continue;const size=Math.min(h*.8,h/(e.dist*.82)),base=h*.52+size*.2,head=base-size*.82;const wid=size*.34;ctx.save();ctx.translate(x,base);const glow=ctx.createRadialGradient(0,-size*.42,1,0,-size*.42,size*.44);glow.addColorStop(0,'#ff778850');glow.addColorStop(1,'#ff556800');ctx.fillStyle=glow;ctx.fillRect(-size*.45,-size*.92,size*.9,size);ctx.fillStyle='#ff5969';ctx.beginPath();ctx.arc(0,-size*.78,size*.12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#711f32';ctx.fillRect(-wid*.48,-size*.65,wid*.96,size*.5);ctx.fillStyle='#ff6875';ctx.fillRect(-wid*.42,-size*.63,wid*.84,size*.37);ctx.fillStyle='#202738';ctx.fillRect(-wid*.5,-size*.18,wid*.38,size*.18);ctx.fillRect(wid*.12,-size*.18,wid*.38,size*.18);ctx.fillStyle='#fff';ctx.font=`${Math.max(9,size*.13)}px monospace`;ctx.textAlign='center';ctx.fillText(b.name,0,-size*.96);ctx.fillStyle='#101722';ctx.fillRect(-wid*.45,-size*.99,wid*.9,Math.max(3,size*.045));ctx.fillStyle='#ff5969';ctx.fillRect(-wid*.45,-size*.99,wid*.9*(b.health/100),Math.max(3,size*.045));ctx.restore()}
    // Weapon silhouette
    const gunW=Math.min(w*.22,210),gunH=Math.min(h*.3,205);ctx.fillStyle='#080d15';ctx.beginPath();ctx.moveTo(w*.5-gunW*.38,h);ctx.lineTo(w*.5-gunW*.28,h-gunH*.5);ctx.lineTo(w*.5-gunW*.15,h-gunH*.79);ctx.lineTo(w*.5+gunW*.15,h-gunH*.79);ctx.lineTo(w*.5+gunW*.28,h-gunH*.5);ctx.lineTo(w*.5+gunW*.38,h);ctx.fill();ctx.fillStyle='#394658';ctx.fillRect(w*.5-gunW*.105,h-gunH*.78,gunW*.21,gunH*.34);ctx.fillStyle='#172231';ctx.fillRect(w*.5-gunW*.14,h-gunH*.44,gunW*.28,gunH*.44);
    if(p.respawn>0){ctx.fillStyle='#02060cb3';ctx.fillRect(0,0,w,h);ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(24,h*.055)}px sans-serif`;ctx.textAlign='center';ctx.fillText('ELIMINATED',w/2,h*.46);ctx.fillStyle='#50e3d1';ctx.font=`${Math.max(12,h*.022)}px monospace`;ctx.fillText(`RESPAWNING ${Math.ceil(p.respawn)}`,w/2,h*.53)}
  }
  function finish(){state.active=false;cancelAnimationFrame(raf);const win=state.p.kills>=Math.max(...state.bots.map(b=>b.kills));$('#winner').textContent=win?'VICTORY':'DEFEAT';$('#winner').style.color=win?'#50e3d1':'#ff5668';$('#finalScore').textContent=`YOU ${state.p.kills} — BOT LEADER ${Math.max(...state.bots.map(b=>b.kills))}`;$('#endCard').classList.remove('hidden');document.exitPointerLock?.()}
  function showHome(){state=null;cancelAnimationFrame(raf);document.exitPointerLock?.();game.classList.add('hidden');home.classList.remove('hidden');say('')}
  $('#playSolo').onclick=()=>start();$('#playAgain').onclick=()=>start();$('#homeBtn').onclick=showHome;$('#leave').onclick=showHome;$('#createRoom').onclick=()=>say('ONLINE ROOMS ARE NEXT — SOLO VS BOTS IS READY');$('#joinRoom').onclick=()=>say('ROOM MULTIPLAYER IS BEING WIRED UP',true);
  $('#roomInput').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4));
  $('#sound').onclick=()=>{sound=!sound;$('#sound').style.color=sound?'#50e3d1':'#758198';$('#sound').setAttribute('aria-label',sound?'Mute sound':'Enable sound');if(sound)playShot()};
  const moveKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight']);
  document.addEventListener('keydown',e=>{const k=(e.key||'').toLowerCase();keys[e.code]=true;if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].includes(k))keys[k]=true;if(state?.active&&moveKeys.has(e.code))e.preventDefault();if(e.code==='KeyR'||k==='r')reload();if(e.code==='Escape'&&state?.active&&document.pointerLockElement)document.exitPointerLock()},{capture:true});
  document.addEventListener('keyup',e=>{keys[e.code]=false;keys[(e.key||'').toLowerCase()]=false},{capture:true});
  window.addEventListener('blur',()=>{keys={}});
  canvas.addEventListener('click',()=>{if(!state?.active)return;if(matchMedia('(pointer:fine)').matches&&!pointerLocked){canvas.requestPointerLock?.();return}shoot()});document.addEventListener('pointerlockchange',()=>{pointerLocked=document.pointerLockElement===canvas});document.addEventListener('mousemove',e=>{if(pointerLocked&&state)mouseTurn+=e.movementX*.0023});
  $('#mobileFire').addEventListener('touchstart',e=>{e.preventDefault();shoot()},{passive:false});document.querySelectorAll('[data-move]').forEach(btn=>{const code={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD'}[btn.dataset.move];btn.addEventListener('touchstart',e=>{e.preventDefault();keys[code]=true},{passive:false});for(const ev of ['touchend','touchcancel'])btn.addEventListener(ev,e=>{e.preventDefault();keys[code]=false},{passive:false})});
  window.addEventListener('resize',resize);
})();
