import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

(() => {
  const $ = (s) => document.querySelector(s);
  const canvas = $('#view'), home = $('#home'), game = $('#game');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9bb0ba');
  scene.fog = new THREE.FogExp2('#9bb0ba', 0.0095);
  const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const controls = new PointerLockControls(camera, canvas);
  const world = new THREE.Group();
  scene.add(world);
  const botsGroup = new THREE.Group(); scene.add(botsGroup);
  const solids = [], solidMeshes = [], botMeshes = [], cachedGeometries = new Map(), materials = {};
  const up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(), right = new THREE.Vector3(), direction = new THREE.Vector3();
  let state = null, raf = 0, last = 0, sound = true, audio = null, pointerLocked = false, touchLook = null, jumpVelocity = 0, jumpHeight = 0;
  let roomSocket=null, onlineId=null, onlineRoom=null, remoteActors=new Map(), lastNetSend=0, mouseLookActive=false;
  const MAX_PLAYERS = 12;
  const MATCH_PHASES=[['battle',1,65],['trivia',1,30],['battle',2,65],['trivia',2,30],['battle',3,65],['trivia',3,30],['final',4,70]];
  const UPGRADE_NAMES=['KNIFE','SHIELD','BOW','PISTOL','SHOTGUN','MACHINE GUN','SPEED BOOST','SUPER JUMP','AKIMBO SHOTGUNS','ROCKET LAUNCHER'];
  function baseTerrain(x,z){if(Math.abs(x)<12.4||Math.abs(z)<12.4||(Math.abs(z+25)<4.2&&x>-47&&x<-14)||(Math.abs(z-27)<4.2&&x>12&&x<48))return 0;const edge=Math.max(Math.abs(x),Math.abs(z));return edge>40?Math.sin(x*.19)*Math.cos(z*.15)*.22+Math.sin(z*.37+x*.1)*.08:Math.sin(x*.1+z*.11)*.025;}

  function rand(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let n = t; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }
  function texture(kind, base, repeatX = 1, repeatY = 1) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), r = rand(kind.length * 121 + base.length * 17);
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    if (kind === 'brick') {
      for (let row = 0; row < 12; row++) { const shift = row % 2 ? -24 : 0; for (let x = -24; x < 280; x += 64) { g.fillStyle = `rgba(8,12,16,${.18+r()*.12})`; g.fillRect(x + shift, row * 22, 60, 18); g.fillStyle = `rgba(216,171,132,${.035+r()*.07})`; g.fillRect(x + shift + 2, row * 22 + 2, 56, 2); } }
    } else if (kind === 'metal') {
      for (let y = 0; y < 256; y += 32) { g.fillStyle = '#ffffff12'; g.fillRect(0, y, 256, 2); g.fillStyle = '#00000022'; g.fillRect(0, y + 29, 256, 3); for (let x = 12; x < 256; x += 48) { g.fillStyle = '#d8e0e018'; g.beginPath(); g.arc(x, y + 15, 2, 0, Math.PI * 2); g.fill(); } }
    } else if (kind === 'asphalt') {
      for (let i = 0; i < 2100; i++) { const v = Math.floor(70 + r() * 70); g.fillStyle = `rgba(${v},${v+3},${v+5},${.04+r()*.12})`; const s = 1 + r() * 3; g.fillRect(r()*256, r()*256, s, s); }
      for (let i = 0; i < 7; i++) { g.strokeStyle = '#080d12'; g.lineWidth = 1 + r()*2; g.beginPath(); g.moveTo(r()*256, r()*256); g.lineTo(r()*256, r()*256); g.stroke(); }
    } else if (kind === 'grass') {
      for (let i = 0; i < 1800; i++) { const v = Math.floor(50 + r()*65); g.fillStyle = `rgba(${v},${v+38},${v-20},${.08+r()*.22})`; g.fillRect(r()*256, r()*256, 1+r()*3, 1+r()*5); }
    } else if (kind === 'wood') {
      for(let y=0;y<256;y+=11+r()*14){g.strokeStyle=`rgba(${48+Math.floor(r()*30)},${29+Math.floor(r()*25)},${14+Math.floor(r()*15)},${.18+r()*.2})`;g.lineWidth=1+r()*3;g.beginPath();g.moveTo(0,y);g.bezierCurveTo(70,y-5,165,y+7,256,y-2);g.stroke();}
      for(let i=0;i<6;i++){const x=r()*256,y=r()*256;g.strokeStyle='#38241555';g.beginPath();g.ellipse(x,y,5+r()*12,2+r()*5,0,0,Math.PI*2);g.stroke();}
    } else {
      for (let i = 0; i < 1800; i++) { const v = Math.floor(110+r()*100); g.fillStyle = `rgba(${v},${v},${v},${.025+r()*.10})`; g.fillRect(r()*256, r()*256, 1+r()*7, 1+r()*5); }
      if (kind === 'concrete') { g.strokeStyle = '#303a401c'; g.lineWidth = 2; for (let i=0;i<4;i++){g.beginPath();g.moveTo(i*75,0);g.lineTo(i*75,256);g.stroke();} }
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeatX, repeatY); tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); return tex;
  }
  const maps = {
    brick: texture('brick','#795849',2,2), metal: texture('metal','#68757a',2,1), asphalt: texture('asphalt','#333b40',8,6),
    concrete: texture('concrete','#8a8980',3,3), grass: texture('grass','#526847',12,12), plaster: texture('plaster','#c0b09a',2,2),
    wood: texture('wood','#76583c',2,2), sidewalk: texture('concrete','#aaa89b',5,2),
  };
  function mat(name, color, map = null, opts = {}) {
    if (materials[name]) return materials[name];
    materials[name] = new THREE.MeshStandardMaterial({ color, map, roughness: opts.roughness ?? .86, metalness: opts.metalness ?? 0, emissive: opts.emissive || '#000000', emissiveIntensity: opts.emissiveIntensity || 0, transparent: opts.transparent || false, opacity: opts.opacity ?? 1, side: opts.side || THREE.FrontSide });
    return materials[name];
  }
  const M = {
    asphalt:mat('asphalt','#aaa',maps.asphalt), grass:mat('grass','#aabb8c',maps.grass), concrete:mat('concrete','#b9b6aa',maps.concrete),
    brick:mat('brick','#d2c5b4',maps.brick), plaster:mat('plaster','#e1d1b8',maps.plaster), metal:mat('metal','#b7c5c7',maps.metal,{metalness:.45}),
    darkMetal:mat('darkMetal','#29343a',maps.metal,{metalness:.55}), wood:mat('wood','#b38a5f',maps.wood), roadPaint:mat('roadPaint','#d6c9a3'),
    glass:mat('glass','#83c8cf',null,{roughness:.18,metalness:.2,emissive:'#1c5760',emissiveIntensity:.18,transparent:true,opacity:.58}),
    litGlass:mat('litGlass','#f6d992',null,{roughness:.3,emissive:'#d5923b',emissiveIntensity:.65}),
    cyan:mat('cyan','#50e3d1',null,{emissive:'#27c9bc',emissiveIntensity:1.1}), red:mat('red','#bd3841',null,{emissive:'#5a0a16',emissiveIntensity:.4}),
    black:mat('black','#10171a'), white:mat('white','#d6d9cf'), leaf:mat('leaf','#53754a'), leaf2:mat('leaf2','#6b8753'),
    rust:mat('rust','#84543b'), tire:mat('tire','#15191b'), skin:mat('skin','#b88769'), bot:mat('bot','#692a39',null,{roughness:.55}), botGlow:mat('botGlow','#ff5068',null,{emissive:'#ff193d',emissiveIntensity:2.2}),
  };
  // Correct material map argument for glass variants.
  M.glass.map = null; M.litGlass.map = null;

  function boxGeo(w,h,d){ const key=`b${w.toFixed(2)}:${h.toFixed(2)}:${d.toFixed(2)}`; if(!cachedGeometries.has(key))cachedGeometries.set(key,new THREE.BoxGeometry(w,h,d)); return cachedGeometries.get(key); }
  function box(group,x,y,z,w,h,d,material,solid=false,cast=true){const mesh=new THREE.Mesh(boxGeo(w,h,d),material);mesh.position.set(x,y+h/2,z);mesh.castShadow=cast;mesh.receiveShadow=true;group.add(mesh);if(solid){solids.push({x,z,w,d,minY:y,maxY:y+h});solidMeshes.push(mesh)}return mesh}
  function cylinder(group,x,y,z,r,h,material,solid=false,segments=10){const geoKey=`c${r.toFixed(2)}:${h.toFixed(2)}:${segments}`;if(!cachedGeometries.has(geoKey))cachedGeometries.set(geoKey,new THREE.CylinderGeometry(r*.86,r,h,segments));const mesh=new THREE.Mesh(cachedGeometries.get(geoKey),material);mesh.position.set(x,y+h/2,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);if(solid){solids.push({x,z,w:r*2,d:r*2,minY:y,maxY:y+h});solidMeshes.push(mesh)}return mesh}
  function plane(group,x,y,z,w,d,material,rotation=-Math.PI/2){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),material);mesh.rotation.x=rotation;mesh.position.set(x,y,z);mesh.receiveShadow=true;group.add(mesh);return mesh}
  function line(group,a,b,r,material){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=new THREE.Vector3().subVectors(vb,va);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),7),material);mesh.position.copy(va).add(vb).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(up,delta.normalize());mesh.castShadow=true;group.add(mesh);return mesh}
  function wire(points,r=.035,material=M.darkMetal){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,24,r,5,false),material);world.add(mesh);return mesh}
  function signTexture(text,sub,color='#50e3d1'){
    const c=document.createElement('canvas');c.width=512;c.height=160;const g=c.getContext('2d');g.fillStyle='#101a20';g.fillRect(0,0,512,160);g.fillStyle=color;g.fillRect(0,0,512,6);g.fillRect(0,154,512,6);g.fillStyle='#eef1df';g.font='900 46px Arial';g.fillText(text,24,76);g.fillStyle='#9baeb1';g.font='500 18px monospace';g.fillText(sub,26,118);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map:t,emissive:color,emissiveIntensity:.12,roughness:.72});
  }
  function addSign(x,y,z,w,h,text,sub,color){const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),signTexture(text,sub,color));m.position.set(x,y,z);world.add(m);return m}
  function addCollider(x,z,w,d,minY=0,maxY=20){solids.push({x,z,w,d,minY,maxY})}
  function windowUnit(x,y,z,w=1.5,h=1.3,front=true){
    const zFront=z+(front?.035:-.035);box(world,x,y,zFront,w+.22,h+.2,.14,M.darkMetal,false);
    box(world,x,y,zFront+(front?.09:-.09),w,h,.04,Math.random()<.32?M.litGlass:M.glass,false,false);
    box(world,x,y+h*.5,zFront+.11,w+.12,.08,.08,M.concrete,false);
    box(world,x,y-h*.5,zFront+.1,w+.12,.08,.08,M.darkMetal,false);
    box(world,x,y,zFront+.12,.045,h,.035,M.metal,false,false);
  }
  function addBuilding({x,z,w,d,h,style='shop',name='WORKS',door=2.2}){
    const facade=style==='brick'?M.brick:style==='warehouse'?M.metal:M.plaster, wall=.42, front=z+d/2;
    // Four real walls leave an entrance opening; the interior is walkable.
    box(world,x,0,z-d/2,w,h,wall,facade,true);
    box(world,x-w/2,0,z,wall,h,d,facade,true);box(world,x+w/2,0,z,wall,h,d,facade,true);
    const side=(w-door)/2;box(world,x-(door+side)/2,0,front,side,h,wall,facade,true);box(world,x+(door+side)/2,0,front,side,h,wall,facade,true);
    box(world,x,h-.38,front,door,.76,wall,facade,true);
    box(world,x,style==='warehouse'?1.1:.1,z,w,.2,d,style==='warehouse'?M.concrete:M.wood,false);
    box(world,x,h,z,w+.6,.45,d+.6,M.darkMetal,true);
    // Parapet, gutters, and downpipes establish a readable roof silhouette.
    box(world,x,h+.3,z-d/2,w+.45,.45,.22,facade,false);box(world,x,h+.3,z+d/2,w+.45,.45,.22,facade,false);
    box(world,x-w/2,h+.3,z,.22,.45,d,facade,false);box(world,x+w/2,h+.3,z,.22,.45,d,facade,false);
    cylinder(world,x+w/2+.24,0,z+d/2-.45,.08,h+.35,M.rust,false,8);
    // Open, lit entry with a door leaf set back from the facade.
    box(world,x+door*.28,.08,front-.28,door*.42,2.45,.12,M.wood,false);
    box(world,x+door*.28,.08,front-.2,.06,2.45,.04,M.darkMetal,false,false);
    cylinder(world,x+door*.12,1.2,front-.1,.045,.1,M.cyan,false,8).rotation.x=Math.PI/2;
    plane(world,x,.205,z,w-.8,d-.8,style==='warehouse'?M.concrete:M.wood);
    // Interior lamps and a few fixtures make entrances feel like usable spaces.
    box(world,x,h-.65,z,.45,.08,1.6,M.litGlass,false,false);
    if(style==='warehouse'){box(world,x-3,1.4,front+2,3.5,1.1,.55,M.darkMetal,true);box(world,x-3,2.5,front+2,3.25,.08,.6,M.metal,false);}
    else {box(world,x-door*.15,.15,z-d*.18,1.1,1,.55,M.darkMetal,true);box(world,x-door*.15,.72,z-d*.18,1.05,.08,.52,M.wood,false);}
    // High-set, barred windows; placement varies by building width.
    const count=Math.max(2,Math.floor((w-door-2)/3));for(let i=0;i<count;i++){const wx=x-w/2+1.7+i*((w-3.4)/(count-1||1));if(Math.abs(wx-x)<door/2+1.2)continue;windowUnit(wx,Math.min(h-1.3,3.1),front,1.25,1.15,true);if(h>7)windowUnit(wx,5.8,front,1.25,1.15,true);}
    // Roof HVAC, exhaust stacks, and service rails.
    for(let i=0;i<(style==='warehouse'?3:2);i++){const ax=x-w*.32+i*w*.3,az=z-d*.22;box(world,ax,h+.47,az,1.2,.7,.9,M.metal,false);box(world,ax,h+.86,az,.95,.08,.72,M.darkMetal,false);for(let fin=0;fin<4;fin++)box(world,ax-.35+fin*.22,h+.9,az,.035,.34,.62,M.black,false,false);}
    for(let i=0;i<3;i++)box(world,x-w*.4+i*.4,h+.54,z+d*.24,.08,.08,.08,M.roadPaint,false,false);
    if(style==='warehouse'){
      box(world,x,1.12,front+1.5,w*.62,.18,3.3,M.concrete,false);
      // Sloped, walkable loading ramp to the raised dock.
      const ramp=new THREE.BufferGeometry();const verts=[x-w*.31,.05,front+4.8,x+w*.31,.05,front+4.8,x-w*.31,1.3,front+.6,x+w*.31,.05,front+4.8,x+w*.31,1.3,front+.6,x-w*.31,1.3,front+.6];ramp.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));ramp.computeVertexNormals();const rm=new THREE.Mesh(ramp,new THREE.MeshStandardMaterial({color:'#777d78',roughness:.9,side:THREE.DoubleSide}));rm.receiveShadow=true;world.add(rm);
      const rampLow=front+4.8,rampHigh=front+.6;for(const side of [-1,1]){const edgeX=x+side*w*.34;line(world,[edgeX,.45,rampLow],[edgeX,1.75,rampHigh],.07,M.metal);line(world,[edgeX,1.05,rampLow],[edgeX,2.35,rampHigh],.065,M.darkMetal);addCollider(edgeX,(rampLow+rampHigh)/2,.14,rampLow-rampHigh,.4,2.35);for(let t=.2;t<1;t+=.25){const z=rampLow+(rampHigh-rampLow)*t,y=.45+1.3*t;line(world,[edgeX,y,z],[edgeX,y+.6,z],.04,M.metal);}}
    }
    addSign(x,h*.68,front+.04,Math.min(w*.62,7),.85,name,style==='warehouse'?'RECEIVING • 06:00–18:00':'OPEN DAILY','#50e3d1');
    if(style==='brick'){for(let i=0;i<4;i++)box(world,x-w*.36+i*w*.24,1.4,front+.12,.18,.45,.17,M.rust,false);}
    return {x,z,w,d,h};
  }
  function roadBox(x,z,w,d,material=M.asphalt,y=.025){plane(world,x,y,z,w,d,material)}
  function curbRun(x,z,w,d){box(world,x,.02,z,w,.22,d,M.concrete,false)}
  function roadDash(x,z,w,d){box(world,x,.045,z,w,.035,d,M.roadPaint,false,false)}
  function addTree(x,z,scale=1,seed=1){const r=rand(seed),trunkH=2.8*scale,y=baseTerrain(x,z);cylinder(world,x,y,z,.28*scale,trunkH,M.wood,true,9);for(let i=0;i<3;i++){const size=(1.2+r()*.55)*scale,geo=new THREE.IcosahedronGeometry(size,1),mesh=new THREE.Mesh(geo,i%2?M.leaf:M.leaf2);mesh.position.set(x+(r()-.5)*.65*scale,y+trunkH+size*.38+i*.48*scale,z+(r()-.5)*.55*scale);mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);}cylinder(world,x,y+.02,z,.62*scale,.11,M.concrete,false,10);}
  function addBush(x,z,s=1,seed=9){const r=rand(seed),y=baseTerrain(x,z);for(let i=0;i<4;i++){const size=(.42+r()*.2)*s,mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(size,1),i%2?M.leaf:M.leaf2);mesh.position.set(x+(r()-.5)*s,y+.38*s+(r()*.3),z+(r()-.5)*s);mesh.castShadow=true;world.add(mesh);}}
  function addLamp(x,z){cylinder(world,x,0,z,.11,6.3,M.darkMetal,true,9);line(world,[x,6.05,z],[x+.85,6.45,z],.09,M.darkMetal);box(world,x+.82,6.3,z,.55,.12,.28,M.litGlass,false,false);box(world,x+.82,6.22,z,.68,.09,.38,M.metal,false);}
  function addUtilityPole(x,z){cylinder(world,x,0,z,.19,8.6,M.wood,true,10);line(world,[x-1.1,7.6,z],[x+1.1,7.6,z],.12,M.wood);for(const dx of [-.8,0,.8]){cylinder(world,x+dx,7.6,z,.12,.35,M.darkMetal,false,8);cylinder(world,x+dx,7.84,z,.07,.18,M.white,false,8);}box(world,x+.35,5.4,z,.75,.85,.65,M.metal,false);box(world,x+.35,5.4,z+.34,.56,.57,.03,M.darkMetal,false);}
  function addFence(x1,z1,x2,z2,height=2.1){const n=Math.ceil(Math.hypot(x2-x1,z2-z1)/2),len=Math.hypot(x2-x1,z2-z1),mx=(x1+x2)/2,mz=(z1+z2)/2;for(let i=0;i<=n;i++){const t=i/n,x=x1+(x2-x1)*t,z=z1+(z2-z1)*t;cylinder(world,x,0,z,.055,height,M.darkMetal,true,6);}addCollider(mx,mz,Math.abs(x2-x1)>.1?len:.13,Math.abs(z2-z1)>.1?len:.13,0,height);for(let y=.15;y<height;y+=.35)line(world,[x1,y,z1],[x2,y,z2],.018,M.metal);for(let i=0;i<n;i++){const t=(i+.5)/n,x=x1+(x2-x1)*t,z=z1+(z2-z1)*t;line(world,[x-.9,.18,z],[x+.9,height-.12,z],.012,M.metal);line(world,[x+.9,.18,z],[x-.9,height-.12,z],.012,M.metal);}line(world,[x1,height,z1],[x2,height,z2],.045,M.darkMetal);}
  function addBench(x,z,rot=0){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;world.add(g);const c=Math.abs(Math.cos(rot)),s=Math.abs(Math.sin(rot));addCollider(x,z,2*c+.75*s,2*s+.75*c,0,1.8);box(g,0,.65,0,1.9,.15,.52,M.wood,false);box(g,0,1.05,-.2,1.9,.78,.12,M.wood,false);for(const dx of [-.72,.72]){box(g,dx,.28,0,.12,.6,.12,M.darkMetal,false);box(g,dx,.12,-.06,.38,.1,.62,M.darkMetal,false);}}
  function addDumpster(x,z,rot=0){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;world.add(g);const c=Math.abs(Math.cos(rot)),s=Math.abs(Math.sin(rot));addCollider(x,z,2.3*c+1.4*s,2.3*s+1.4*c,0,1.7);box(g,0,.75,0,2.2,1.35,1.25,M.darkMetal,false);box(g,0,1.46,-.04,2.3,.13,1.35,M.metal,false);for(let i=0;i<4;i++)box(g,-.75+i*.5,1.31,.64,.24,.2,.18,M.rust,false);box(g,0,.38,.64,1.5,.35,.05,M.black,false);}
  function addCar(x,z,color='#7b8582',rot=0,van=false){const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;world.add(g);const body=mat(`car-${color}`,color),bw=van?2.4:2.1,bd=van?5.2:4.1,c=Math.abs(Math.cos(rot)),s=Math.abs(Math.sin(rot));addCollider(x,z,bw*c+bd*s,bw*s+bd*c,0,1.9);box(g,0,.65,0,bw,van?1.1:.72,bd,body,false);box(g,0,1.35,-.25,van?2.15:1.82,.7,van?2.7:2.15,M.darkMetal,false);for(const zz of [-1.5,1.5])for(const xx of [-1,1]){const w=cylinder(g,xx,.12,zz,.42,.22,M.tire,false,12);w.rotation.z=Math.PI/2;}for(const zz of [-2.05,2.05]){box(g,-.67,.79,zz,.28,.17,.08,zz>0?M.litGlass:M.red,false,false);box(g,.67,.79,zz,.28,.17,.08,zz>0?M.litGlass:M.red,false,false);}for(const xw of [-.56,.56])box(g,xw,1.39,-.25,.035,.55,van?2.5:1.9,M.glass,false,false);return g;}
  function addCrate(x,z,s=1,material=M.wood){box(world,x,.02,z,s,.75*s,s,material,true);for(let i=-1;i<=1;i++){box(world,x+i*s*.27,.08,z+s*.505,.08,.62*s,.03,M.rust,false);box(world,x+s*.505,.08,z+i*s*.27,.03,.62*s,.08,M.rust,false);}}
  function addHydrant(x,z){cylinder(world,x,.02,z,.22,.62,M.red,true,10);cylinder(world,x,.59,z,.29,.17,M.red,false,10);cylinder(world,x,.35,z,.26,.12,M.red,false,10);cylinder(world,x+.25,.35,z,.11,.22,M.red,false,8);}
  function addBot(x,z,name,index){const g=new THREE.Group();g.position.set(x,0,z);botsGroup.add(g);const team=mat(`botTeam${index}`,['#334d55','#46515d','#594439','#3c4c47'][index]);
    cylinder(g,0,.07,0,.43,.12,M.black,false,12);box(g,0,.48,0,.78,.78,.48,team,false);box(g,0,.95,-.06,.44,.2,.5,M.darkMetal,false);const head=new THREE.Mesh(new THREE.SphereGeometry(.3,12,9),team);head.position.set(0,1.43,0);head.castShadow=true;g.add(head);box(g,0,1.48,-.275,.38,.12,.035,M.botGlow,false,false);box(g,-.22,.03,0,.22,.48,.24,M.darkMetal,false);box(g,.22,.03,0,.22,.48,.24,M.darkMetal,false);box(g,.5,.48,-.15,.19,.62,.2,team,false);box(g,-.5,.48,-.15,.19,.62,.2,team,false);box(g,.4,.58,-.46,.14,.12,.78,M.black,false);box(g,.4,.6,-.84,.11,.1,.28,M.metal,false);const bot={id:`bot${index}`,name,x,z,health:100,kills:0,respawn:0,fire:1.1+index*.24,mesh:g,team};botMeshes.push(g);return bot;}
  function buildingInteriorLamp(x,z){const lamp=new THREE.PointLight('#ffe2ad',3.5,10,2);lamp.position.set(x,5,z);scene.add(lamp);}
  function addGrassTufts(count=260){const geometry=new THREE.ConeGeometry(.075,.42,4),tufts=new THREE.InstancedMesh(geometry,M.leaf,count),dummy=new THREE.Object3D(),r=rand(92814);let n=0;while(n<count){const x=-47+r()*94,z=-47+r()*94;if(Math.abs(x)<12||Math.abs(z)<12)continue;const building=[[ -31,-29,13,10],[30,-30,11,9],[-30,29,10,9],[30,29,10,8]].some(([bx,bz,bw,bd])=>Math.abs(x-bx)<bw&&Math.abs(z-bz)<bd);if(building)continue;const s=.48+r()*.9;dummy.position.set(x,groundHeight(x,z)+s*.2,z);dummy.rotation.set((r()-.5)*.15,r()*Math.PI*2,(r()-.5)*.15);dummy.scale.set(s,s,s);dummy.updateMatrix();tufts.setMatrixAt(n,dummy.matrix);tufts.setColorAt(n,new THREE.Color().setHSL(.25+r()*.035,.22,.33+r()*.14));n++;}tufts.castShadow=false;tufts.receiveShadow=true;world.add(tufts);}

  function buildWorld(){
    // Lighting: cool daylight, warm shop interiors, and soft ambient fill.
    scene.add(new THREE.HemisphereLight('#dbe9e9','#575349',2.15));
    const sun=new THREE.DirectionalLight('#fff0d8',3.1);sun.position.set(-32,55,28);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.near=1;sun.shadow.camera.far=140;sun.shadow.bias=-.0003;scene.add(sun);
    // Slightly uneven outskirts blend into a broad, flat and combat-readable street grid.
    const geo=new THREE.PlaneGeometry(108,108,72,72);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,baseTerrain(x,z));}geo.computeVertexNormals();const terrain=new THREE.Mesh(geo,M.grass);terrain.receiveShadow=true;terrain.castShadow=false;world.add(terrain);
    // Main asphalt avenue, cross street, service lane and a believable four-way junction.
    roadBox(0,0,108,12);roadBox(0,0,12,108);roadBox(-30,-25,30,8);roadBox(29,27,34,8);
    for(const z of [-7.8,7.8])curbRun(0,z,108,.28);for(const x of [-7.8,7.8])curbRun(x,0,.28,108);
    for(let x=-48;x<49;x+=8){if(Math.abs(x)<9)continue;roadDash(x,0,4,.16);}
    for(let z=-48;z<49;z+=8){if(Math.abs(z)<9)continue;roadDash(0,z,.16,4);}
    // Sidewalks and access lanes; all four combat routes remain open.
    for(const z of [-10.2,10.2])roadBox(0,z,108,4.2,M.concrete,.02);for(const x of [-10.2,10.2])roadBox(x,0,4.2,108,M.concrete,.02);
    // Crosswalks, stop bars, drains and manholes.
    for(let i=-4;i<=4;i++){box(world,i*1.18,.052,-8.6,.62,.035,1.1,M.roadPaint,false,false);box(world,i*1.18,.052,8.6,.62,.035,1.1,M.roadPaint,false,false);}
    for(let i=-4;i<=4;i++){box(world,-8.6,.052,i*1.18,1.1,.035,.62,M.roadPaint,false,false);box(world,8.6,.052,i*1.18,1.1,.035,.62,M.roadPaint,false,false);}
    for(const [x,z] of [[-6,-6],[6,-6],[-6,6],[6,6]]){cylinder(world,x,.05,z,.72,.035,M.darkMetal,false,16);cylinder(world,x,.07,z,.51,.025,M.metal,false,16);}
    for(const [x,z] of [[-4.8,-7.8],[4.8,7.8],[-7.8,4.8],[7.8,-4.8]])box(world,x,.05,z,1.5,.03,.22,M.darkMetal,false,false);
    // Parking bays beside the depot and clinic.
    for(let i=0;i<5;i++){box(world,-31+i*3.2,.055,-11,.08,.035,5.3,M.roadPaint,false,false);box(world,27+i*3.1,.055,11,.08,.035,5.3,M.roadPaint,false,false);}
    // District landmarks: old depot, brick repair garage, apartment shop, and corner market.
    addBuilding({x:-31,z:-29,w:23,d:18,h:8.5,style:'warehouse',name:'NORTHLINE DEPOT',door:7.4});
    addBuilding({x:30,z:-30,w:20,d:16,h:10,style:'brick',name:'MILLER AUTO',door:3.1});
    addBuilding({x:-30,z:29,w:19,d:16,h:8,style:'brick',name:'RIVER STREET REPAIR',door:3.2});
    addBuilding({x:30,z:29,w:17,d:15,h:7,style:'shop',name:'CORNER MARKET',door:2.8});
    for(const [x,z] of [[-31,-29],[30,-30],[-30,29],[30,29]])buildingInteriorLamp(x,z);
    // Loading yard: two shipping containers, pallets, dumpster, and a wide gate.
    box(world,-39,.03,-14,7,2.8,2.6,M.rust,true);for(let i=0;i<9;i++)box(world,-42+i*.75,1.45,-14,.07,2.7,2.62,M.darkMetal,false,false);
    box(world,-26,.03,-13,5.5,2.8,2.6,M.metal,true);for(let i=0;i<7;i++)box(world,-28+i*.65,1.45,-13,.055,2.7,2.62,M.darkMetal,false,false);
    addDumpster(-20,-17,.2);addCrate(-37,-11,1.25);addCrate(-34,-12,.9);addCrate(-25,-16,.8);
    for(let i=0;i<4;i++){box(world,-39+i*1.6,.02,-8,.9,.25,.65,M.wood,true);for(let k=0;k<3;k++)box(world,-39+i*1.6,.28+k*.22,-8,.82,.18,.62,M.wood,false);}
    // Repair yard: open-sided service canopy, fuel drums and exterior work area.
    for(const x of [ -39,-24])cylinder(world,x,0,23,.16,5.5,M.darkMetal,true,9);
    for(const x of [-39,-24])box(world,x,5.45,23,1,.18,13,M.metal,false);
    box(world,-31,.12,22,12,.22,14,M.concrete,false);addCar(-31,24,'#777c78',Math.PI/2,true);
    for(const [x,z] of [[-39,31],[-36,31],[-24,31]])cylinder(world,x,.02,z,.48,1.05,M.rust,true,12);
    addDumpster(-23,35,-.15);addCrate(-38,35,.9);addCrate(-35,35,1.1);
    // Open central plaza with low cover, planter boxes and a raised, sloped service platform.
    for(const [x,z] of [[-17,-16],[17,-16],[-17,16],[17,16]]){box(world,x,.03,z,3.2,.82,1.1,M.concrete,true);box(world,x,.86,z,2.95,.1,.84,M.wood,false);for(let k=0;k<4;k++)addBush(x-1.1+k*.72,z,.52,30+k);}
    for(const [x,z] of [[-21,0],[21,0],[0,-21],[0,21]]){box(world,x,.02,z,2.4,.9,2.4,M.rust,true);for(let k=0;k<4;k++)box(world,x-1+k*.65,.94,z,.045,.12,2.35,M.metal,false,false);}
    // Small public green in the southeast block with paths, benches, trees and low fencing.
    roadBox(29,30,23,20,M.grass,.04);roadBox(29,30,2.2,18,M.concrete,.08);roadBox(29,30,21,2,M.concrete,.08);
    for(const [x,z,s] of [[21,23,1.05],[37,23,.9],[21,37,1.2],[37,37,1],[29,24,.8]])addTree(x,z,s,Math.round(x*17+z*3));
    for(const [x,z,r] of [[24,29,0],[34,33,.3],[26,36,-.2]])addBench(x,z,r);
    addFence(18,20,40,20,1.4);addFence(18,20,18,29,1.4);addFence(40,20,40,29,1.4); // open path through the south edge
    for(const [x,z] of [[21,30],[37,30],[24,38],[34,38]])addBush(x,z,.85,Math.round(x+z));
    // Utility poles and continuous sagging electrical/telecom lines along both streets.
    const poles=[];for(const side of [-1,1])for(const z of [-46,-25,0,25,46]){const x=side*9.1;addUtilityPole(x,z);poles.push([x,z]);}
    for(const side of [-1,1]){const row=poles.filter(p=>Math.sign(p[0])===side).sort((a,b)=>a[1]-b[1]);for(let i=0;i<row.length-1;i++){const [x1,z1]=row[i],[x2,z2]=row[i+1];for(const off of [-.58,0,.58])wire([[x1+off,8.05,z1],[x1+off*.4,7.6,(z1+z2)/2],[x2+off*.4,7.6,(z1+z2)/2],[x2+off,8.05,z2]],.025,off===0?M.black:M.darkMetal);}}
    // Street lamps, traffic signals, bus stop sign, hydrants, and utility cabinets.
    for(const [x,z] of [[-8,-31],[8,-31],[-8,31],[8,31],[-31,-8],[31,-8],[-31,8],[31,8]])addLamp(x,z);
    for(const [x,z] of [[-10.6,-10.6],[10.6,-10.6],[-10.6,10.6],[10.6,10.6]]){cylinder(world,x,0,z,.11,5.1,M.darkMetal,true,9);line(world,[x,4.9,z],[x+.8,4.9,z],.07,M.darkMetal);box(world,x+.78,4.6,z,.42,.64,.32,M.black,false);box(world,x+.78,4.85,z-.17,.22,.14,.03,M.red,false,false);box(world,x+.78,4.62,z-.17,.22,.14,.03,M.litGlass,false,false);box(world,x+.78,4.39,z-.17,.22,.14,.03,M.cyan,false,false);}
    const avenueBlade=addSign(-10.1,5.35,-9.55,2.7,.48,'NORTHLINE AVE','DEPOT  ←  →  MARKET','#a9c77e');avenueBlade.rotation.y=Math.PI/2;
    addSign(-10.6,5.95,-10.05,2.7,.48,'FOUNDRY ST','RIVER DISTRICT','#e6c77a');
    for(const [x,z] of [[-6,13],[8,-15],[34,14],[-40,7]])addHydrant(x,z);
    for(const [x,z] of [[-12,-14],[13,14],[41,-12],[-42,12]]){box(world,x,.05,z,.75,.95,.62,M.darkMetal,true);box(world,x,.75,z+.32,.5,.28,.04,M.cyan,false,false);}
    // Parked vehicles add cover without closing the avenue or spawn lanes.
    addCar(-36,8,'#727a79',Math.PI/2,true);addCar(37,-8,'#80745f',-Math.PI/2,false);addCar(12,39,'#596c78',Math.PI,false);
    // Sidewalk clutter, drains, planters, scattered rocks and varied vegetation.
    for(let i=0;i<15;i++){const z=-42+i*6.1;addBush(i%2?-12.6:12.6,z,.65,100+i);}
    for(let i=0;i<13;i++){const x=-43+i*7.1;addTree(x,(i%2?-13.1:13.1),.72+(i%4)*.13,220+i);}
    for(const [x,z] of [[-13,-23],[13,-24],[-14,25],[14,24],[-42,-5],[42,5]]){box(world,x,.03,z,2.1,.7,1.1,M.concrete,true);box(world,x,.74,z,1.9,.12,.9,M.wood,false);}
    for(let i=0;i<22;i++){const x=-44+(i*13%87),z=-44+(i*19%87);if(Math.abs(x)<13||Math.abs(z)<13)continue;const s=.16+(i%4)*.06,y=groundHeight(x,z);const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),i%2?M.concrete:M.rust);rock.position.set(x,y+s*.6,z);rock.rotation.set(i*.23,i*.71,i*.17);rock.castShadow=true;world.add(rock);addCollider(x,z,s*1.7,s*1.7,y,y+s*1.3);}
    addGrassTufts();
    // Substation alley: fenced transformer pad with insulated cable runs to the pole line.
    addFence(37,-42,45,-42,2.2);addFence(45,-42,45,-31,2.2);addFence(37,-42,37,-31,2.2);
    // The fenced transformer yard has a pair of visibly open, collision-aware gate leaves.
    cylinder(world,37,0,-31,.1,2.1,M.darkMetal,true,8);cylinder(world,45,0,-31,.1,2.1,M.darkMetal,true,8);
    line(world,[37,.18,-31],[39.4,1.95,-29.95],.05,M.darkMetal);line(world,[37,2.05,-31],[39.4,.18,-29.95],.04,M.metal);
    line(world,[45,.18,-31],[42.6,1.95,-29.95],.05,M.darkMetal);line(world,[45,2.05,-31],[42.6,.18,-29.95],.04,M.metal);
    addCollider(38.2,-30.47,2.7,.2,0,2.1);addCollider(43.8,-30.47,2.7,.2,0,2.1);
    box(world,41,.1,-36,6,.2,9,M.concrete,false);box(world,41,1.15,-36,2.8,2.1,2.4,M.metal,true);box(world,41,2.3,-36,3.1,.22,2.7,M.darkMetal,false);
    for(let i=0;i<6;i++)box(world,39.9+i*.42,1.2,-34.76,.08,1.75,.08,M.black,false);
    wire([[41,2.5,-37.2],[38,4,-39],[18,7.6,-46],[9.1,8.05,-46]],.045,M.black);
    // World boundaries are a low berm, readable fence, and service gate, not invisible walls.
    addFence(-48,-48,48,-48,1.2);addFence(-48,48,48,48,1.2);addFence(-48,-48,-48,-10,1.2);addFence(-48,10,-48,48,1.2);addFence(48,-48,48,-10,1.2);addFence(48,10,48,48,1.2);
  }

  function groundHeight(x,z){
    // The depot loading ramp leads continuously onto the raised dock and warehouse floor.
    if(x>=-42.2&&x<=-19.8&&z>=-38.3&&z<=-20.4)return 1.3;
    if(x>=-38.1&&x<=-23.9&&z>=-20.4&&z<=-18.1)return 1.3;
    if(x>=-38.1&&x<=-23.9&&z>=-19.6&&z<=-15.1)return THREE.MathUtils.clamp((-15.1-z)/4.5,0,1)*1.3;
    return baseTerrain(x,z);
  }
  function collides(x,z,r=.43,verticalOffset=0){if(Math.abs(x)>51||Math.abs(z)>51)return true;const feet=groundHeight(x,z)+verticalOffset;for(const c of solids){if(feet>c.maxY-.15)continue;const px=THREE.MathUtils.clamp(x,c.x-c.w/2,c.x+c.w/2),pz=THREE.MathUtils.clamp(z,c.z-c.d/2,c.z+c.d/2);if((x-px)**2+(z-pz)**2<r*r)return true;}return false;}
  function auditEnvironment(){const points=[['player spawn',0,34],['bot spawn 1',-5,25],['bot spawn 2',5,25],['bot spawn 3',-6,16],['bot spawn 4',6,16],['warehouse doorway',-31,-20],['garage doorway',30,-22],['repair doorway',-30,37],['market doorway',30,36.5],['ramp',-31,-17.3],['south park entry',29,30]];const blocked=points.filter(([,x,z])=>collides(x,z,.32)).map(([name])=>name);const ramp=groundHeight(-31,-19.5)>1.1&&groundHeight(-31,-15.2)<.12;const result={districts:4,aiSpawns:4,majorColliders:solids.length,walkableRamp:ramp,blockedAccessPoints:blocked};if(blocked.length||!ramp)console.warn(`FRAG ROOM environment audit found an issue ${JSON.stringify(result)}`);else console.info('FRAG ROOM environment audit passed',result);return result;}
  function tryMove(entity,dx,dz,r=.43,verticalOffset=0){const nx=entity.x+dx,nz=entity.z+dz;if(!collides(nx,entity.z,r,verticalOffset))entity.x=nx;if(!collides(entity.x,nz,r,verticalOffset))entity.z=nz;}
  function lineBlocked(a,b){const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz),steps=Math.ceil(dist/.55);for(let i=1;i<steps;i++){const t=i/steps;if(collides(a.x+dx*t,a.z+dz*t,.12))return true;}return false;}

  function addWeapon(){const group=new THREE.Group();camera.add(group);group.position.set(.34,-.3,-.6);group.rotation.set(-.04,.02,0);
    const body=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,.44),M.darkMetal);body.position.set(0,0,-.1);group.add(body);
    const slide=new THREE.Mesh(new THREE.BoxGeometry(.17,.11,.34),M.metal);slide.position.set(0,.07,-.1);group.add(slide);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.045,.05,.28,10),M.black);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.045,-.36);group.add(barrel);
    const grip=new THREE.Mesh(new THREE.BoxGeometry(.13,.27,.16),M.black);grip.position.set(0,-.19,.02);grip.rotation.x=-.15;group.add(grip);
    const sight=new THREE.Mesh(new THREE.BoxGeometry(.045,.04,.04),M.cyan);sight.position.set(0,.15,-.11);group.add(sight);
    const muzzle=new THREE.PointLight('#ffcb78',0,3,2);muzzle.position.set(0,.04,-.53);group.add(muzzle);return {group,muzzle};}
  const weapon=addWeapon();
  const upgradeVisuals=new THREE.Group();camera.add(upgradeVisuals);let shieldVisual=null;
  function equipWeapon(level){weapon.group.visible=level===3;upgradeVisuals.clear();shieldVisual=null;const put=(geo,material,pos,rot=null)=>{const m=new THREE.Mesh(geo,material);m.position.set(...pos);if(rot)m.rotation.set(...rot);upgradeVisuals.add(m);return m;};
    if(level===0||level===1){put(new THREE.BoxGeometry(.075,.07,.34),M.darkMetal,[.34,-.32,-.74],[0,.12,-.16]);put(new THREE.ConeGeometry(.055,.34,6),M.metal,[.34,-.27,-.97],[Math.PI/2,0,0]);put(new THREE.BoxGeometry(.09,.18,.1),M.wood,[.34,-.41,-.56],[.2,0,0]);}
    if(level===1){shieldVisual=put(new THREE.BoxGeometry(.4,.52,.08),M.cyan,[-.38,-.23,-.61],[0,0,-.04]);}
    if(level===2){put(new THREE.TorusGeometry(.29,.025,6,18,Math.PI),M.wood,[.33,-.25,-.8],[0,0,Math.PI/2]);put(new THREE.CylinderGeometry(.012,.012,.65,5),M.metal,[.33,-.25,-.8],[0,0,0]);put(new THREE.BoxGeometry(.025,.53,.025),M.wood,[.33,-.25,-.8],[0,0,.45]);}
    if(level===4||level===5||level===8){const count=level===8?2:1;for(let i=0;i<count;i++){const x=.34+(i?-.36:0);put(new THREE.BoxGeometry(.19,.17,.58),M.darkMetal,[x,-.3,-.65]);put(new THREE.CylinderGeometry(.055,.06,.42,10),M.black,[x,-.27,-1.07],[Math.PI/2,0,0]);put(new THREE.BoxGeometry(.13,.28,.16),M.wood,[x,-.48,-.46],[.15,0,0]);}}
    if(level===6||level===7){put(new THREE.BoxGeometry(.12,.22,.12),M.cyan,[.38,-.36,-.66]);put(new THREE.BoxGeometry(.12,.22,.12),M.cyan,[-.38,-.36,-.66]);}
    if(level===9){put(new THREE.CylinderGeometry(.14,.17,.92,12),M.darkMetal,[.34,-.25,-.82],[Math.PI/2,0,0]);put(new THREE.CylinderGeometry(.09,.1,.23,10),M.red,[.34,-.25,-1.38],[Math.PI/2,0,0]);put(new THREE.BoxGeometry(.18,.3,.18),M.wood,[.34,-.48,-.53]);}
  }

  function playShot(){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const now=audio.currentTime,size=Math.floor(audio.sampleRate*.09),buf=audio.createBuffer(1,size,audio.sampleRate),data=buf.getChannelData(0);for(let i=0;i<size;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/size,3);const n=audio.createBufferSource(),f=audio.createBiquadFilter(),g=audio.createGain();n.buffer=buf;f.type='lowpass';f.frequency.setValueAtTime(1700,now);f.frequency.exponentialRampToValueAtTime(280,now+.09);g.gain.setValueAtTime(.42,now);g.gain.exponentialRampToValueAtTime(.001,now+.1);n.connect(f).connect(g).connect(audio.destination);n.start(now);n.stop(now+.1);const o=audio.createOscillator(),og=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(120,now);o.frequency.exponentialRampToValueAtTime(45,now+.13);og.gain.setValueAtTime(.22,now);og.gain.exponentialRampToValueAtTime(.001,now+.14);o.connect(og).connect(audio.destination);o.start(now);o.stop(now+.14);}catch{}}
  function say(t,bad=false){const m=$('#message');m.textContent=t;m.style.color=bad?'#ff5668':'#50e3d1';}
  function toast(t){const el=$('#toast');el.textContent=t;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.textContent='',1300);}
  function shuffled(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function makeLocalTrivia(round){const pool=state?.questionDeck||shuffled(window.FRAG_TRIVIA||[]).slice(0,9);return pool.slice((round-1)*3,round*3).map(q=>{const choices=shuffled(q.choices.map((text,index)=>({text,index})));return{id:q.id,question:q.question,category:q.category,choices:choices.map(c=>c.text),correctIndex:choices.findIndex(c=>c.index===q.answer)};});}
  function quizIndex(){return state?.quizIndex||0;}
  function renderTrivia(){if(!state||state.phase!=='trivia'){$('#triviaOverlay').classList.add('hidden');return;}$('#triviaOverlay').classList.remove('hidden');$('#triviaRound').textContent=`TRIVIA ${state.phaseRound}`;$('#triviaClock').textContent=String(Math.max(0,Math.ceil(state.time)));const index=quizIndex(),q=state.questions?.[index];$('#triviaProgress').textContent=index>=3?'ALL QUESTIONS COMPLETE':`QUESTION ${index+1} / 3`;const signature=`${state.phaseRound}:${index}:${q?.id??'done'}:${!!state.pendingAnswer}:${!!state.answered?.has(q?.id)}:${state.answerFeedback||''}`;if(state.renderedTriviaSignature===signature)return;state.renderedTriviaSignature=signature;$('#triviaCategory').textContent=q?.category?.toUpperCase()||'ROUND COMPLETE';if(!q){$('#triviaQuestion').textContent='You answered all 3 questions. Stay ready for the next battle.';$('#triviaChoices').replaceChildren();$('#triviaFeedback').textContent='No extra upgrades are available this round.';return;}$('#triviaQuestion').textContent=q.question;$('#triviaChoices').innerHTML=q.choices.map((choice,i)=>`<button class="trivia-choice" data-answer="${i}" ${state.pendingAnswer||state.answered?.has(q.id)?'disabled':''}>${escapeHtml(choice)}</button>`).join('');$('#triviaFeedback').textContent=state.answerFeedback||'Choose one answer. Each question can be answered once.';$('#triviaChoices').querySelectorAll('[data-answer]').forEach(button=>button.addEventListener('click',()=>submitTriviaAnswer(Number(button.dataset.answer))));}
  function submitTriviaAnswer(choiceIndex){if(!state||state.phase!=='trivia'||state.time<=0||performance.now()>=state.phaseEndAt||state.pendingAnswer)return;const index=quizIndex(),q=state.questions?.[index];if(!q||state.answered?.has(q.id))return;state.answered??=new Set();state.answered.add(q.id);state.pendingAnswer=true;if(state.online){if(roomSocket?.readyState===WebSocket.OPEN)roomSocket.send(JSON.stringify({type:'answer',questionIndex:index,choiceIndex}));else{state.pendingAnswer=false;state.answerFeedback='Connection lost. Answer was not submitted.';}renderTrivia();return;}const correct=choiceIndex===q.correctIndex;if(correct)awardUpgrade(state.p);state.pendingAnswer=false;state.answerFeedback=correct?`CORRECT · UPGRADE: ${UPGRADE_NAMES[state.p.upgradeLevel]}`:'INCORRECT · NO UPGRADE';hud();setTimeout(()=>{if(state?.phase==='trivia'){state.quizIndex++;state.answerFeedback='';renderTrivia();}},850);}
  function awardUpgrade(player){player.upgradeLevel=Math.min(UPGRADE_NAMES.length-1,(player.upgradeLevel||0)+1);player.upgrade=UPGRADE_NAMES[player.upgradeLevel];equipWeapon(player.upgradeLevel);}
  function setLocalPhase(index){if(!state||state.online)return;if(index>=MATCH_PHASES.length){state.phase='ended';finish();return;}state.phaseIndex=index;state.phase=MATCH_PHASES[index][0];state.phaseRound=MATCH_PHASES[index][1];state.time=MATCH_PHASES[index][2];state.phaseEndAt=performance.now()+state.time*1000;state.quizIndex=0;state.pendingAnswer=false;state.answered=new Set();state.questions=state.phase==='trivia'?makeLocalTrivia(state.phaseRound):[];renderTrivia();hud();toast(state.phase==='trivia'?`TRIVIA ROUND ${state.phaseRound}`:state.phase==='final'?'FINAL BATTLE':'BATTLE ROUND '+state.phaseRound);}
  function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(1.45,devicePixelRatio||1);renderer.setPixelRatio(d);renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix();}
  function drawScores(){if(!state)return;const list=[state.p,...state.bots].sort((a,b)=>(b.score||b.kills)-(a.score||a.kills));$('#scoreRows').innerHTML=list.map(o=>`<div class="score-row ${(o.id==='you'||o.id===onlineId)?'me':''}"><span>${escapeHtml(o.name)}</span><b>${o.score||o.kills||0}</b></div>`).join('');}
  function hud(){const t=Math.max(0,state.time),shown=Math.ceil(t);$('#timer').textContent=`${String(Math.floor(shown/60)).padStart(2,'0')}:${String(shown%60).padStart(2,'0')}`;$('#phaseLabel').textContent=state.phase==='trivia'?`TRIVIA ${state.phaseRound}`:state.phase==='final'?'FINAL BATTLE':`BATTLE ${state.phaseRound||1}`;$('#upgradeLabel').textContent=UPGRADE_NAMES[state.p.upgradeLevel||0];$('#weaponText').textContent=UPGRADE_NAMES[state.p.upgradeLevel||0];$('#healthBar').style.width=`${state.p.health}%`;$('#healthText').textContent=Math.ceil(state.p.health);$('#ammoText').innerHTML=state.p.upgradeLevel<=1?'∞ <small>MELEE</small>':`${state.p.ammo} <small>/ ${state.p.reserve}</small>`;renderTrivia();}
  function spawnBots(){const at=[[-5,25],[5,25],[-6,16],[6,16]];return at.map((p,i)=>addBot(p[0],p[1],['BYTE','GLITCH','ROOK','GHOST'][i],i));}
  function movePlayer(dt){const p=state.p;if(p.respawn>0||state.phase==='trivia')return;let f=(keys.KeyW||keys.ArrowUp||keys.w?1:0)-(keys.KeyS||keys.ArrowDown||keys.s?1:0),s=(keys.KeyD||keys.ArrowRight||keys.d?1:0)-(keys.KeyA||keys.ArrowLeft||keys.a?1:0);const len=Math.hypot(f,s)||1;camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,up).normalize();const boost=p.speedBoost>0?1.6:1;if(p.speedBoost>0)p.speedBoost=Math.max(0,p.speedBoost-dt);const speed=(keys.ShiftLeft||keys.ShiftRight?8:5.5)*boost*dt;const dx=(forward.x*f+right.x*s)/len*speed,dz=(forward.z*f+right.z*s)/len*speed;tryMove(p,dx,dz,.42,jumpHeight);
    if(keys.Space&&Math.abs(jumpHeight)<.001)jumpVelocity=p.upgradeLevel===7?8.4:5.4;jumpVelocity-=14*dt;jumpHeight=Math.max(0,jumpHeight+jumpVelocity*dt);if(jumpHeight===0)jumpVelocity=0;camera.position.set(p.x,groundHeight(p.x,p.z)+1.68+jumpHeight,p.z);
  }
  function updateBots(dt,now){if(state.phase==='trivia'||state.phase==='ended')return;const p=state.p;for(const b of state.bots){if(b.remote)continue;if(b.respawn>0){b.respawn-=dt;if(b.respawn<=0){const points=[[-5,25],[5,25],[-6,16],[6,16]];[b.x,b.z]=points[Math.floor(Math.random()*points.length)];b.mesh.position.set(b.x,groundHeight(b.x,b.z),b.z);b.mesh.visible=true;b.health=100;}continue;}
      const dx=p.x-b.x,dz=p.z-b.z,dist=Math.hypot(dx,dz),clear=!lineBlocked({x:b.x,z:b.z},{x:p.x,z:p.z});b.mesh.rotation.y=Math.atan2(-dx,-dz);
      if(dist>4.5){const speed=2.25*dt;const bx=b.x,bz=b.z;tryMove(b,dx/dist*speed,dz/dist*speed,.4);if(b.x===bx&&b.z===bz){tryMove(b,dz/dist*speed, -dx/dist*speed,.4);}}
      b.mesh.position.set(b.x,groundHeight(b.x,b.z),b.z);b.fire-=dt;if(clear&&dist<25&&b.fire<=0){b.fire=1.6+Math.random()*1.1;if(Math.random()<THREE.MathUtils.clamp(.56-dist*.012,.17,.48))damagePlayer(8+Math.random()*8,b);}
    }}
  function damagePlayer(d,attacker=null){const p=state.p;if(p.respawn>0||p.shield>0||state.phase==='trivia')return;if(p.upgradeLevel===1)d*=.45;p.health=Math.max(0,p.health-d);if(p.health<=0){p.health=0;p.deaths=(p.deaths||0)+1;p.respawn=2.5;p.shield=0;if(attacker){attacker.kills=(attacker.kills||0)+1;attacker.score=(attacker.score||0)+(attacker.upgradeLevel<=1?10:attacker.upgradeLevel===2?5:2);}toast('ELIMINATED · RESPAWNING');}hud();drawScores();}
  function weaponDamage(level){return [45,45,52,34,72,24,34,34,56,100][level]||34;}
  function killPoints(level){return level===0?10:level===2?5:2;}
  function fire(){const s=state,p=s?.p;if(!s?.active||s.phase==='trivia'||s.phase==='ended'||p.respawn>0||p.reload>0||performance.now()-s.lastShot<200)return;s.lastShot=performance.now();if(p.upgradeLevel===6){p.speedBoost=2.5;}if(p.upgradeLevel===7){if(Math.abs(jumpHeight)<.001)jumpVelocity=8.4;return;}if(p.upgradeLevel>1&&p.ammo===0){reload();return;}if(p.upgradeLevel>1)p.ammo--;playShot();hud();weapon.muzzle.intensity=5;weapon.group.position.z=-.69;setTimeout(()=>{weapon.muzzle.intensity=0;weapon.group.position.z=-.6;},75);
    if(s.online){if(roomSocket?.readyState===WebSocket.OPEN)roomSocket.send(JSON.stringify({type:'shoot',yaw:camera.rotation.y,pitch:camera.rotation.x}));return;}
    camera.getWorldDirection(direction);let target=null,best=.994;for(const b of s.bots){if(b.respawn>0)continue;const origin=new THREE.Vector3(p.x,groundHeight(p.x,p.z)+1.4+jumpHeight,p.z),point=new THREE.Vector3(b.x,groundHeight(b.x,b.z)+1.25,b.z),to=point.sub(origin),dist=to.length(),dot=direction.dot(to.normalize()),range=p.upgradeLevel===0?3.2:42;if(dist<range&&dot>best&& !lineBlocked({x:p.x,z:p.z},{x:b.x,z:b.z})){target=b;best=dot;}}
    if(target){target.health-=weaponDamage(p.upgradeLevel);$('#hitmarker').style.opacity='1';setTimeout(()=>$('#hitmarker').style.opacity='0',110);if(target.health<=0){target.kills++;target.health=0;target.respawn=2.8;target.mesh.visible=false;p.kills++;p.score=(p.score||0)+killPoints(p.upgradeLevel);p.health=Math.min(100,p.health+10);toast(`ELIMINATION +${killPoints(p.upgradeLevel)}`);drawScores();hud();}}
  }
  function reload(){if(!state||state.p.reload>0||state.p.ammo===12||state.p.reserve===0)return;state.p.reload=1.05;toast('RELOADING...');}
  function finish(){state.active=false;state.phase='ended';$('#triviaOverlay').classList.add('hidden');cancelAnimationFrame(raf);const list=[state.p,...state.bots],winner=[...list].sort((a,b)=>(b.score||b.kills)-(a.score||a.kills))[0]||state.p;const win=winner===state.p||winner.id===onlineId;$('#winner').textContent=win?'VICTORY':`${winner.name} WINS`;$('#winner').style.color=win?'#50e3d1':'#ff5668';$('#finalScore').textContent=list.sort((a,b)=>(b.score||b.kills)-(a.score||a.kills)).map(p=>`${p.name}: ${p.score||0} pts (${p.kills||0} K)`).join(' · ');$('#endCard').classList.remove('hidden');controls.unlock();}
  function homeScreen(){if(roomSocket?.readyState===WebSocket.OPEN){roomSocket.send(JSON.stringify({type:'leave'}));roomSocket.close();}roomSocket=null;onlineRoom=null;onlineId=null;remoteActors.clear();state=null;cancelAnimationFrame(raf);controls.unlock();$('#lobby').classList.add('hidden');game.classList.add('hidden');home.classList.remove('hidden');say('');}
  function loop(now){if(!state?.active)return;const dt=Math.min(.035,(now-last)/1000||0);last=now;if(!state.online){state.time-=dt;if(state.time<=0){const next=state.phaseIndex+1;if(next>=MATCH_PHASES.length){state.time=0;hud();finish();return;}setLocalPhase(next);}}
    const p=state.p;if(p.shield>0)p.shield=Math.max(0,p.shield-dt);if(p.respawn>0){p.respawn-=dt;if(p.respawn<=0){p.x=0;p.z=34;p.health=100;p.ammo=12;p.shield=2.8;camera.position.set(p.x,groundHeight(p.x,p.z)+1.68,p.z);toast('BACK IN THE FIGHT');}}
    if(p.respawn<=0){movePlayer(dt);if(p.reload>0){p.reload-=dt;if(p.reload<=0){const n=Math.min(12-p.ammo,p.reserve);p.ammo+=n;p.reserve-=n;hud();}}}
    if(state.phase==='battle'||state.phase==='final')updateBots(dt,now);if(state.online&&roomSocket?.readyState===WebSocket.OPEN&&now-lastNetSend>50&&(state.phase==='battle'||state.phase==='final')){lastNetSend=now;roomSocket.send(JSON.stringify({type:'state',x:p.x,z:p.z,yaw:camera.rotation.y}));}hud();renderer.render(scene,camera);raf=requestAnimationFrame(loop);
  }
  function toggleSound(){sound=!sound;$('#sound').style.color=sound?'#50e3d1':'#758198';$('#sound').setAttribute('aria-label',sound?'Mute sound':'Enable sound');if(sound)playShot();}

  function clearRemoteActors(){for(const actor of remoteActors.values())botsGroup.remove(actor.mesh);remoteActors.clear();}
  function showLobby(room){onlineRoom=room;$('#lobbyCode').textContent=room.code;$('#playerCount').textContent=`${room.players.length} / 12`;const url=new URL(location.href);url.searchParams.set('room',room.code);$('#inviteLink').value=url.toString();$('#lobbyPlayers').innerHTML=room.players.map(p=>`<li><i></i>${escapeHtml(p.name)}${p.id===room.host?'<small>HOST</small>':''}${p.id===onlineId?'<small>YOU</small>':''}</li>`).join('');const isHost=room.host===onlineId;$('#startMatch').disabled=!isHost||room.phase!=='lobby';$('#startMatch').textContent=isHost?'START MATCH →':'WAITING FOR HOST';$('#lobbyStatus').textContent=room.phase==='lobby'?(room.players.length===1?'Waiting for players. You can start solo against four bots.':'Ready when the host is.'):'Match in progress';$('#lobby').classList.remove('hidden');}
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function applyRoom(room){onlineRoom=room;if(!state?.online)return;state.time=room.remaining;const phaseKey=`${room.phase}:${room.round}`;if(state.phaseKey!==phaseKey){state.phaseKey=phaseKey;state.phase=room.phase;state.phaseRound=room.round;state.quizIndex=0;state.pendingAnswer=false;state.answered=new Set();state.questions=room.phase==='trivia'?room.questions:[];state.phaseEndAt=performance.now()+room.remaining*1000;renderTrivia();}const me=room.players.find(p=>p.id===onlineId);if(me){if(state.p.upgradeLevel!==(me.upgradeLevel||0))equipWeapon(me.upgradeLevel||0);state.p.kills=me.kills;state.p.score=me.score;state.p.upgradeLevel=me.upgradeLevel||0;state.p.upgrade=me.upgrade;state.p.health=me.health;state.p.respawn=me.respawn/1000;state.p.x=me.x;state.p.z=me.z;}
    for(const b of botsSeed)b.mesh.visible=false;const records=[...room.players.filter(p=>p.id!==onlineId),...(room.aiBots||[])],keep=new Set();for(const p of records){keep.add(p.id);let a=remoteActors.get(p.id);if(!a){a=addBot(p.x,p.z,p.name,remoteActors.size%4);a.id=p.id;a.remote=true;a.isAI=p.id.startsWith('bot');remoteActors.set(p.id,a);}a.name=p.name;a.x=p.x;a.z=p.z;a.kills=p.kills;a.score=p.score;a.upgradeLevel=p.upgradeLevel;a.health=p.health;a.respawn=p.respawn/1000;a.mesh.position.set(p.x,groundHeight(p.x,p.z),p.z);a.mesh.rotation.y=p.yaw;a.mesh.visible=p.respawn<=0;}for(const [id,a] of remoteActors){if(!keep.has(id)){botsGroup.remove(a.mesh);remoteActors.delete(id);}}state.bots=[...remoteActors.values()];botsGroup.visible=true;
    hud();drawScores();if(state.time<=0)finish();}
  function handleNetwork(data){if(data.type==='error'){say(data.message,true);if(state?.phase==='trivia'){state.pendingAnswer=false;state.answerFeedback=data.message;renderTrivia();}return;}if(data.type==='joined'){onlineId=data.id;showLobby(data.room);say('Room ready. Copy the link to invite players.');return;}if(data.type==='lobby'){showLobby(data.room);return;}if(data.type==='start'||data.type==='phase'){onlineRoom=data.room;if(!state){$('#lobby').classList.add('hidden');start({online:true,room:data.room});}else applyRoom(data.room);return;}if(data.type==='answerResult'){if(!state||state.phase!=='trivia')return;state.pendingAnswer=false;if(data.correct)toast(`CORRECT · ${data.upgrade}`);else toast('INCORRECT · NO UPGRADE');if(state.p.upgradeLevel!==data.upgradeLevel)equipWeapon(data.upgradeLevel);state.p.upgradeLevel=data.upgradeLevel;state.p.upgrade=data.upgrade;state.answerFeedback=data.correct?`CORRECT · UPGRADE: ${data.upgrade}`:'INCORRECT · NO UPGRADE';hud();setTimeout(()=>{if(state?.phase==='trivia'){state.quizIndex++;state.answerFeedback='';renderTrivia();}},800);return;}if(data.type==='world'){applyRoom(data.room);return;}if(data.type==='hit'){if(data.target===onlineId){toast(data.killed?'ELIMINATED · RESPAWNING':'UNDER FIRE');}if(data.shooter===onlineId&&data.target!==onlineId){$('#hitmarker').style.opacity='1';setTimeout(()=>$('#hitmarker').style.opacity='0',110);}applyRoom(data.room);return;}if(data.type==='ended'){applyRoom(data.room);finish();}}
  function connectRoom(action,code=''){say('CONNECTING TO ROOM SERVER…');const wsUrl=new URL('/ws',location.href);wsUrl.protocol=location.protocol==='https:'?'wss:':'ws:';const ws=new WebSocket(wsUrl);roomSocket=ws;ws.addEventListener('open',()=>{if(roomSocket!==ws)return;const name=$('#playerName').value.trim()||'PLAYER';ws.send(JSON.stringify({type:action,name,code}));});ws.addEventListener('message',e=>{if(roomSocket!==ws)return;try{handleNetwork(JSON.parse(e.data));}catch{say('The room server sent an invalid response.',true);}});ws.addEventListener('error',()=>{say('Could not reach the room server. Start server.js locally or open the hosted game link.',true);});ws.addEventListener('close',()=>{if(roomSocket===ws){roomSocket=null;if(state?.online&&state.active)toast('CONNECTION LOST');}});}
  function start(options={}){cancelAnimationFrame(raf);home.classList.add('hidden');$('#lobby').classList.add('hidden');game.classList.remove('hidden');$('#endCard').classList.add('hidden');resetBots();clearRemoteActors();botsGroup.visible=!options.online||!!options.room?.bots;const me=options.room?.players.find(p=>p.id===onlineId);const sx=me?.x??0,sz=me?.z??34;camera.position.set(sx,groundHeight(sx,sz)+1.68,sz);camera.rotation.set(0,me?.yaw??0,0);camera.rotation.order='YXZ';jumpHeight=0;jumpVelocity=0;state={p:{id:onlineId||'you',name:$('#playerName').value.trim()||'YOU',x:sx,z:sz,health:100,kills:0,deaths:0,score:0,upgradeLevel:0,respawn:0,shield:2.8,reload:0,ammo:12,reserve:48},bots:options.online?[]:botsSeed,time:65,phase:'battle',phaseRound:1,phaseIndex:0,phaseEndAt:performance.now()+65000,questionDeck:shuffled(window.FRAG_TRIVIA||[]).slice(0,9),questions:[],quizIndex:0,answered:new Set(),active:true,lastShot:0,online:!!options.online};equipWeapon(0);$('#roomTag').textContent=options.online?`ROOM ${options.room.code}`:'SOLO · 4 BOTS';$('#toast').textContent='';say('');last=performance.now();drawScores();hud();resize();canvas.focus({preventScroll:true});if(options.online)applyRoom(options.room);raf=requestAnimationFrame(loop);}

  buildWorld();
  const botsSeed=spawnBots();botsGroup.visible=false; // Build once to keep the map fully populated, then reuse these AI actors each round.
  auditEnvironment();
  function resetBots(){for(const b of botsSeed){b.x=[-5,5,-6,6][Number(b.id.slice(-1))];b.z=[25,25,16,16][Number(b.id.slice(-1))];b.health=100;b.kills=0;b.respawn=0;b.mesh.visible=true;b.mesh.position.set(b.x,groundHeight(b.x,b.z),b.z);b.fire=1.2;}}
  $('#playSolo').onclick=()=>start();$('#playAgain').onclick=()=>state?.online?homeScreen():start();$('#homeBtn').onclick=homeScreen;$('#leave').onclick=homeScreen;
  $('#createRoom').onclick=()=>connectRoom('create');$('#joinRoom').onclick=()=>{const code=$('#roomInput').value.trim().toUpperCase();if(code.length!==4)return say('ENTER THE 4-CHARACTER ROOM CODE.',true);connectRoom('join',code);};
  $('#startMatch').onclick=()=>{if(roomSocket?.readyState===WebSocket.OPEN)roomSocket.send(JSON.stringify({type:'start'}));};$('#leaveLobby').onclick=homeScreen;$('#copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('#inviteLink').value);$('#copyInvite').textContent='COPIED!';setTimeout(()=>$('#copyInvite').textContent='COPY LINK',1200);}catch{$('#inviteLink').select();document.execCommand('copy');}};
  $('#roomInput').addEventListener('input',e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4));$('#sound').onclick=toggleSound;
  const keys={};document.addEventListener('keydown',e=>{keys[e.code]=true;keys[e.key.toLowerCase()]=true;if(state?.active&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyR'||e.key.toLowerCase()==='r')reload();},{capture:true});document.addEventListener('keyup',e=>{keys[e.code]=false;keys[e.key.toLowerCase()]=false;},{capture:true});window.addEventListener('blur',()=>{for(const k of Object.keys(keys))keys[k]=false;});
  controls.addEventListener('lock',()=>{pointerLocked=true;mouseLookActive=false;});controls.addEventListener('unlock',()=>{pointerLocked=false;});canvas.addEventListener('mousedown',e=>{if(e.button===0&&!pointerLocked)mouseLookActive=true;});window.addEventListener('mouseup',()=>{mouseLookActive=false;});canvas.addEventListener('mousemove',e=>{if(state?.active&&!pointerLocked&&mouseLookActive){camera.rotation.order='YXZ';camera.rotation.y-=e.movementX*.003;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-e.movementY*.003,-1.35,1.35);}});canvas.addEventListener('click',()=>{if(state?.active&&!pointerLocked&&matchMedia('(pointer:fine)').matches)controls.lock();fire();});
  canvas.addEventListener('touchstart',e=>{if(e.touches.length){touchLook={x:e.touches[0].clientX,y:e.touches[0].clientY};}},{passive:true});canvas.addEventListener('touchmove',e=>{if(!touchLook||!state)return;const t=e.touches[0],dx=t.clientX-touchLook.x,dy=t.clientY-touchLook.y;camera.rotation.order='YXZ';camera.rotation.y-=dx*.004;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-dy*.004,-1.35,1.35);touchLook={x:t.clientX,y:t.clientY};},{passive:true});canvas.addEventListener('touchend',()=>touchLook=null);
  $('#mobileFire').addEventListener('touchstart',e=>{e.preventDefault();fire();},{passive:false});document.querySelectorAll('[data-move]').forEach(btn=>{const code={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD'}[btn.dataset.move];btn.addEventListener('touchstart',e=>{e.preventDefault();keys[code]=true;},{passive:false});for(const ev of ['touchend','touchcancel'])btn.addEventListener(ev,e=>{e.preventDefault();keys[code]=false;},{passive:false});});
  const sharedCode=new URLSearchParams(location.search).get('room');if(sharedCode)$('#roomInput').value=sharedCode.toUpperCase().slice(0,4);const savedName=localStorage.getItem('fragroom-name');if(savedName)$('#playerName').value=savedName;$('#playerName').addEventListener('change',()=>localStorage.setItem('fragroom-name',$('#playerName').value.trim().slice(0,16)));
  window.addEventListener('resize',resize);resize();
})();
