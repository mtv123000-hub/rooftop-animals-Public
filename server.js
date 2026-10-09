const express=require('express'),http=require('http'),{Server}=require('socket.io'),path=require('path');
const app=express(),server=http.createServer(app),io=new Server(server,{pingTimeout:20000});app.use(express.static(path.join(__dirname,'public')));
app.use(express.static(__dirname));
app.get('/',(req,res)=>res.sendFile(__dirname+'/index.html'));
const rooms=new Map();
const C={croc:{n:'크록냥',hp:100},gayper:{n:'게이퍼',hp:90},ham:{n:'햄붕이',hp:95},big:{n:'빅딕',hp:120},odo:{n:'오도냥',hp:105},bazu:{n:'바주냥',hp:100}};
const makeCode=()=>Math.random().toString(36).slice(2,6).toUpperCase(),newWind=()=>Math.floor(Math.random()*21)-10;
function publicState(r){return {code:r.code,started:r.started,turn:r.turn,wind:r.wind,turnNo:r.turnNo,craters:r.craters,box:r.box,players:r.players.map(p=>({...p}))}}
function emit(r){io.to(r.code).emit('state',publicState(r))}function getRoom(s){return rooms.get(s.data.room)}
function player(r,id){return r.players.find(p=>p.id===id)}
function collect(r,p){if(r.box&&Math.abs(p.x-r.box.x)<70&&p.items.length<2){p.items.push(r.box.item);io.to(r.code).emit('pickup',{player:p.id,item:r.box.item});r.box=null}}
function unstable(r,p){return r.craters.some(c=>c.r>=58&&Math.abs(p.x-c.x)<Math.max(20,c.r*.32))}
function begin(r){r.started=true;r.wind=newWind();r.turnNo=1;r.craters=[];r.box=null;r.players[0].x=145;r.players[1].x=855;r.players.forEach(p=>{p.hp=C[p.char].hp;p.ult=1;p.items=[];p.shield=false;p.fallen=false});r.turn=r.players[Math.floor(Math.random()*2)].id;emit(r)}
function end(r,winner,reason){r.started=false;r.turn=null;emit(r);io.to(r.code).emit('over',{winner,reason});r.players.forEach(p=>p.ready=false)}
io.on('connection',s=>{
 s.on('create',d=>{let c;do c=makeCode();while(rooms.has(c));let r={code:c,players:[],started:false,turn:null,wind:0,turnNo:0,craters:[],box:null};rooms.set(c,r);r.players.push({id:s.id,nick:(d.nick||'익명').trim().slice(0,12)||'익명',char:'bazu',ready:false,hp:100,x:145,items:[],ult:1,shield:false,fallen:false});s.join(c);s.data.room=c;emit(r)});
 s.on('join',d=>{let r=rooms.get((d.code||'').trim().toUpperCase());if(!r||r.players.length>=2||r.started)return s.emit('err','입장할 수 없는 방입니다.');r.players.push({id:s.id,nick:(d.nick||'익명').trim().slice(0,12)||'익명',char:'bazu',ready:false,hp:100,x:855,items:[],ult:1,shield:false,fallen:false});s.join(r.code);s.data.room=r.code;emit(r)});
 s.on('select',d=>{let r=getRoom(s),p=r&&player(r,s.id);if(!p||r.started||!C[d.char])return;p.char=d.char;p.ready=true;emit(r);if(r.players.length===2&&r.players.every(x=>x.ready))setTimeout(()=>{if(r.players.length===2&&!r.started)begin(r)},500)});
 s.on('move',d=>{let r=getRoom(s),p=r&&player(r,s.id);if(!p||!r.started||r.turn!==s.id)return;p.x=Math.max(45,Math.min(955,p.x+Math.max(-50,Math.min(50,Number(d.dx)||0))));collect(r,p);if(unstable(r,p)){p.fallen=true;p.hp=0;emit(r);return end(r,r.players.find(x=>x.id!==p.id)?.id,'낙사')}emit(r)});
 s.on('use',d=>{let r=getRoom(s),p=r&&player(r,s.id);if(!p||!r.started||r.turn!==s.id||!p.items.includes(d.item))return;let i=p.items.indexOf(d.item);p.items.splice(i,1);if(d.item==='heal')p.hp=Math.min(C[p.char].hp,p.hp+25);if(d.item==='shield')p.shield=true;if(d.item==='wind')r.wind=-r.wind;emit(r)});
 s.on('fire',d=>{let r=getRoom(s);if(!r||!r.started||r.turn!==s.id)return;let p=player(r,s.id),q=r.players.find(x=>x.id!==s.id);if(!p||!q)return;
   let a=Math.max(10,Math.min(80,Number(d.angle)||45)),pow=Math.max(20,Math.min(100,Number(d.power)||60)),sk=Math.max(1,Math.min(3,Number(d.skill)||1));if(sk===3&&p.ult<=0)sk=1;if(sk===3)p.ult=0;
   let dir=p.x<q.x?1:-1,rad=a*Math.PI/180,speed=pow*.19,vx=Math.cos(rad)*speed*dir+r.wind*.045,vy=-Math.sin(rad)*speed,x=p.x,y=210,t=0,pts=[];
   while(t<18&&x>-80&&x<1080&&y<390){t+=.05;x+=vx*3.2;y+=vy*3.2;vy+=.13;if(pts.length<260)pts.push([x,y])}
   let hitX=x,dist=Math.abs(hitX-q.x),base={croc:27,gayper:36,ham:24,big:31,odo:30,bazu:33}[p.char],radius={croc:60,gayper:38,ham:48,big:72,odo:58,bazu:66}[p.char],mult=sk===1?1:sk===2?1.22:1.58,dmg=dist<radius?Math.round((base*(1-dist/radius)+8)*mult):0;
   let item=d.item;if(item&&p.items.includes(item)){p.items.splice(p.items.indexOf(item),1);if(item==='power')dmg=Math.round(dmg*1.3);if(item==='double')dmg=Math.round(dmg*1.65)}if(q.shield&&dmg){dmg=Math.ceil(dmg*.5);q.shield=false}q.hp=Math.max(0,q.hp-dmg);
   const crater={x:Math.max(0,Math.min(1000,hitX)),r:sk===3?72:sk===2?52:40};r.craters.push(crater);if(r.craters.length>18)r.craters.shift();io.to(r.code).emit('shot',{from:p.id,pts,hitX:crater.x,skill:sk,char:p.char,damage:dmg,victim:q.id});
   if(q.hp<=0)return end(r,p.id,'격파');if(unstable(r,q)){q.fallen=true;q.hp=0;emit(r);return setTimeout(()=>end(r,p.id,'낙사'),450)}
   r.turnNo++;if(r.turnNo%3===0&&!r.box){r.box={x:130+Math.random()*740,item:['double','power','heal','shield','wind'][Math.floor(Math.random()*5)]};io.to(r.code).emit('drop',r.box)}collect(r,p);r.wind=Math.max(-10,Math.min(10,r.wind+Math.floor(Math.random()*7)-3));if(Math.random()<.12)r.wind=-r.wind;r.turn=q.id;emit(r)
 });
 s.on('disconnect',()=>{let r=getRoom(s);if(!r)return;r.players=r.players.filter(p=>p.id!==s.id);if(!r.players.length)rooms.delete(r.code);else{r.started=false;r.turn=null;r.players.forEach(p=>p.ready=false);emit(r);io.to(r.code).emit('err','상대가 나갔습니다.')}})
});
const PORT=process.env.PORT||3000;server.listen(PORT,'0.0.0.0',()=>console.log(`옥상동물전 실행: http://localhost:${PORT}`));
