const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingTimeout: 30000,
  pingInterval: 10000
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = new Map();

const C = {
  croc: { n: '크록냥', hp: 100 },
  gayper: { n: '게이퍼', hp: 90 },
  ham: { n: '햄붕이', hp: 95 },
  big: { n: '빅딕', hp: 120 },
  odo: { n: '오도냥', hp: 105 },
  bazu: { n: '바주냥', hp: 100 }
};

function makeCode() {
  return Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase();
}

function newWind() {
  return Math.floor(Math.random() * 21) - 10;
}

function publicState(r) {
  return {
    code: r.code,
    started: r.started,
    turn: r.turn,
    wind: r.wind,
    turnNo: r.turnNo,
    craters: r.craters,
    box: r.box,

    players: r.players.map(p => ({
      id: p.id,
      nick: p.nick,
      char: p.char,
      ready: p.ready,
      hp: p.hp,
      x: p.x,
      items: p.items,
      ult: p.ult,
      shield: p.shield,
      fallen: p.fallen,
      online: p.online
    }))
  };
}

function emit(r) {
  io.to(r.code).emit('state', publicState(r));
}

function getRoom(socket) {
  return rooms.get(socket.data.room);
}

function getPlayer(r, pid) {
  return r.players.find(p => p.id === pid);
}

function getSocketPlayer(r, socket) {
  return getPlayer(r, socket.data.pid);
}

function collect(r, p) {
  if (
    r.box &&
    Math.abs(p.x - r.box.x) < 70 &&
    p.items.length < 2
  ) {
    p.items.push(r.box.item);

    io.to(r.code).emit('pickup', {
      player: p.id,
      item: r.box.item
    });

    r.box = null;
  }
}

function unstable(r, p) {
  return r.craters.some(c =>
    c.r >= 58 &&
    Math.abs(p.x - c.x) <
      Math.max(20, c.r * 0.32)
  );
}

function begin(r) {
  if (r.started) return;
  if (r.players.length !== 2) return;
  if (!r.players.every(p => p.ready && p.online)) return;

  r.started = true;
  r.wind = newWind();
  r.turnNo = 1;
  r.craters = [];
  r.box = null;

  r.players[0].x = 145;
  r.players[1].x = 855;

  r.players.forEach(p => {
    p.hp = C[p.char].hp;
    p.ult = 1;
    p.items = [];
    p.shield = false;
    p.fallen = false;
  });

  r.turn =
    r.players[
      Math.floor(Math.random() * 2)
    ].id;

  console.log(
    '게임 시작:',
    r.code,
    r.players.map(p => p.nick)
  );

  emit(r);
}

function end(r, winner, reason) {
  r.started = false;
  r.turn = null;

  emit(r);

  io.to(r.code).emit('over', {
    winner,
    reason
  });

  r.players.forEach(p => {
    p.ready = false;
  });
}

function attachPlayer(socket, r, p) {
  p.socketId = socket.id;
  p.online = true;

  socket.data.room = r.code;
  socket.data.pid = p.id;

  socket.join(r.code);
}

io.on('connection', socket => {

  console.log('소켓 연결:', socket.id);

  /* =========================
     방 만들기
  ========================= */

  socket.on('create', d => {
    const pid = String(d.pid || '').trim();

    if (!pid) {
      return socket.emit(
        'err',
        '플레이어 ID가 없습니다. 새로고침 후 다시 시도하세요.'
      );
    }

    let code;

    do {
      code = makeCode();
    } while (rooms.has(code));

    const r = {
      code,
      players: [],
      started: false,
      turn: null,
      wind: 0,
      turnNo: 0,
      craters: [],
      box: null
    };

    const p = {
      id: pid,
      socketId: socket.id,
      nick:
        (d.nick || '익명')
          .trim()
          .slice(0, 12) || '익명',

      char: 'bazu',
      ready: false,
      hp: 100,
      x: 145,
      items: [],
      ult: 1,
      shield: false,
      fallen: false,
      online: true
    };

    r.players.push(p);
    rooms.set(code, r);

    attachPlayer(socket, r, p);

    console.log(
      '방 생성:',
      code,
      p.nick,
      pid
    );

    emit(r);
  });

  /* =========================
     방 참가
  ========================= */

  socket.on('join', d => {
    const code =
      String(d.code || '')
        .trim()
        .toUpperCase();

    const pid =
      String(d.pid || '')
        .trim();

    if (!code) {
      return socket.emit(
        'err',
        '방 코드가 없습니다.'
      );
    }

    if (!pid) {
      return socket.emit(
        'err',
        '플레이어 ID가 없습니다.'
      );
    }

    const r = rooms.get(code);

    if (!r) {
      return socket.emit(
        'err',
        '방을 찾을 수 없습니다: ' + code
      );
    }

    /*
      같은 플레이어가 다시 접속한 경우
      새 플레이어로 추가하지 않고 복귀시킨다.
    */
    let p = getPlayer(r, pid);

    if (p) {
      attachPlayer(socket, r, p);

      if (d.nick) {
        p.nick =
          String(d.nick)
            .trim()
            .slice(0, 12) || p.nick;
      }

      console.log(
        '플레이어 재접속:',
        code,
        p.nick
      );

      emit(r);
      return;
    }

    if (r.started) {
      return socket.emit(
        'err',
        '이미 게임이 시작된 방입니다.'
      );
    }

    if (r.players.length >= 2) {
      return socket.emit(
        'err',
        '이미 2명이 들어와 있는 방입니다.'
      );
    }

    p = {
      id: pid,
      socketId: socket.id,

      nick:
        (d.nick || '익명')
          .trim()
          .slice(0, 12) || '익명',

      char: 'bazu',
      ready: false,
      hp: 100,
      x: r.players.length === 0 ? 145 : 855,
      items: [],
      ult: 1,
      shield: false,
      fallen: false,
      online: true
    };

    r.players.push(p);

    attachPlayer(socket, r, p);

    console.log(
      '방 참가:',
      code,
      p.nick,
      '인원:',
      r.players.length
    );

    emit(r);
  });

  /* =========================
     자동 복귀
  ========================= */

  socket.on('resume', d => {
    const code =
      String(d.code || '')
        .trim()
        .toUpperCase();

    const pid =
      String(d.pid || '')
        .trim();

    if (!code || !pid) return;

    const r = rooms.get(code);

    if (!r) {
      return socket.emit('resume-failed');
    }

    const p = getPlayer(r, pid);

    if (!p) {
      return socket.emit('resume-failed');
    }

    attachPlayer(socket, r, p);

    console.log(
      '자동 복귀:',
      code,
      p.nick
    );

    emit(r);

    if (
      !r.started &&
      r.players.length === 2 &&
      r.players.every(x => x.ready && x.online)
    ) {
      setTimeout(() => begin(r), 300);
    }
  });

  /* =========================
     캐릭터 선택
  ========================= */

  socket.on('select', d => {
    const r = getRoom(socket);

    if (!r || r.started) return;

    const p =
      getSocketPlayer(r, socket);

    if (!p) return;
    if (!C[d.char]) return;

    p.char = d.char;
    p.ready = true;
    p.online = true;

    console.log(
      '캐릭터 선택:',
      r.code,
      p.nick,
      d.char
    );

    emit(r);

    if (
      r.players.length === 2 &&
      r.players.every(x => x.ready && x.online)
    ) {
      setTimeout(() => {
        begin(r);
      }, 500);
    }
  });

  /* =========================
     이동
  ========================= */

  socket.on('move', d => {
    const r = getRoom(socket);

    if (!r || !r.started) return;

    const p =
      getSocketPlayer(r, socket);

    if (!p) return;
    if (r.turn !== p.id) return;

    p.x = Math.max(
      45,
      Math.min(
        955,
        p.x +
          Math.max(
            -50,
            Math.min(
              50,
              Number(d.dx) || 0
            )
          )
      )
    );

    collect(r, p);

    if (unstable(r, p)) {
      p.fallen = true;
      p.hp = 0;

      emit(r);

      const winner =
        r.players.find(
          x => x.id !== p.id
        );

      return end(
        r,
        winner?.id,
        '낙사'
      );
    }

    emit(r);
  });

  /* =========================
     아이템
  ========================= */

  socket.on('use', d => {
    const r = getRoom(socket);

    if (!r || !r.started) return;

    const p =
      getSocketPlayer(r, socket);

    if (!p) return;
    if (r.turn !== p.id) return;

    if (!p.items.includes(d.item)) {
      return;
    }

    const i =
      p.items.indexOf(d.item);

    p.items.splice(i, 1);

    if (d.item === 'heal') {
      p.hp = Math.min(
        C[p.char].hp,
        p.hp + 25
      );
    }

    if (d.item === 'shield') {
      p.shield = true;
    }

    if (d.item === 'wind') {
      r.wind = -r.wind;
    }

    emit(r);
  });

  /* =========================
     발사
  ========================= */

  socket.on('fire', d => {
    const r = getRoom(socket);

    if (!r || !r.started) return;

    const p =
      getSocketPlayer(r, socket);

    if (!p) return;
    if (r.turn !== p.id) return;

    const q =
      r.players.find(
        x => x.id !== p.id
      );

    if (!q) return;

    let a =
      Math.max(
        10,
        Math.min(
          80,
          Number(d.angle) || 45
        )
      );

    let pow =
      Math.max(
        20,
        Math.min(
          100,
          Number(d.power) || 60
        )
      );

    let sk =
      Math.max(
        1,
        Math.min(
          3,
          Number(d.skill) || 1
        )
      );

    if (
      sk === 3 &&
      p.ult <= 0
    ) {
      sk = 1;
    }

    if (sk === 3) {
      p.ult = 0;
    }

    const dir =
      p.x < q.x ? 1 : -1;

    const rad =
      a * Math.PI / 180;

    const speed =
      pow * 0.19;

    let vx =
      Math.cos(rad) *
        speed *
        dir +
      r.wind * 0.045;

    let vy =
      -Math.sin(rad) *
      speed;

    let x = p.x;
    let y = 210;
    let t = 0;

    const pts = [];

    while (
      t < 18 &&
      x > -80 &&
      x < 1080 &&
      y < 390
    ) {
      t += 0.05;

      x += vx * 3.2;
      y += vy * 3.2;

      vy += 0.13;

      if (pts.length < 260) {
        pts.push([x, y]);
      }
    }

    const hitX = x;

    const dist =
      Math.abs(
        hitX - q.x
      );

    const base = {
      croc: 27,
      gayper: 36,
      ham: 24,
      big: 31,
      odo: 30,
      bazu: 33
    }[p.char];

    const radius = {
      croc: 60,
      gayper: 38,
      ham: 48,
      big: 72,
      odo: 58,
      bazu: 66
    }[p.char];

    const mult =
      sk === 1
        ? 1
        : sk === 2
        ? 1.22
        : 1.58;

    let dmg =
      dist < radius
        ? Math.round(
            (
              base *
                (1 - dist / radius) +
              8
            ) *
              mult
          )
        : 0;

    const item = d.item;

    if (
      item &&
      p.items.includes(item)
    ) {
      p.items.splice(
        p.items.indexOf(item),
        1
      );

      if (item === 'power') {
        dmg =
          Math.round(
            dmg * 1.3
          );
      }

      if (item === 'double') {
        dmg =
          Math.round(
            dmg * 1.65
          );
      }
    }

    if (
      q.shield &&
      dmg
    ) {
      dmg =
        Math.ceil(
          dmg * 0.5
        );

      q.shield = false;
    }

    q.hp =
      Math.max(
        0,
        q.hp - dmg
      );

    const crater = {
      x: Math.max(
        0,
        Math.min(
          1000,
          hitX
        )
      ),

      r:
        sk === 3
          ? 72
          : sk === 2
          ? 52
          : 40
    };

    r.craters.push(crater);

    if (
      r.craters.length > 18
    ) {
      r.craters.shift();
    }

    io.to(r.code).emit(
      'shot',
      {
        from: p.id,
        pts,
        hitX: crater.x,
        skill: sk,
        char: p.char,
        damage: dmg,
        victim: q.id
      }
    );

    if (q.hp <= 0) {
      return end(
        r,
        p.id,
        '격파'
      );
    }

    if (unstable(r, q)) {
      q.fallen = true;
      q.hp = 0;

      emit(r);

      return setTimeout(
        () =>
          end(
            r,
            p.id,
            '낙사'
          ),
        450
      );
    }

    r.turnNo++;

    if (
      r.turnNo % 3 === 0 &&
      !r.box
    ) {
      const itemList = [
        'double',
        'power',
        'heal',
        'shield',
        'wind'
      ];

      r.box = {
        x:
          130 +
          Math.random() * 740,

        item:
          itemList[
            Math.floor(
              Math.random() *
                itemList.length
            )
          ]
      };

      io.to(r.code).emit(
        'drop',
        r.box
      );
    }

    collect(r, p);

    r.wind =
      Math.max(
        -10,
        Math.min(
          10,
          r.wind +
            Math.floor(
              Math.random() * 7
            ) -
            3
        )
      );

    if (
      Math.random() < 0.12
    ) {
      r.wind = -r.wind;
    }

    r.turn = q.id;

    emit(r);
  });

  /* =========================
     연결 종료
     
     중요:
     바로 플레이어를 삭제하지 않는다.
     30초 동안 재접속 가능.
  ========================= */

  socket.on('disconnect', () => {
    const code =
      socket.data.room;

    const pid =
      socket.data.pid;

    if (!code || !pid) return;

    const r =
      rooms.get(code);

    if (!r) return;

    const p =
      getPlayer(r, pid);

    if (!p) return;

    /*
      이전 소켓이 끊긴 뒤 이미
      새 소켓으로 재접속한 경우에는
      offline 처리하지 않는다.
    */
    if (
      p.socketId !== socket.id
    ) {
      return;
    }

    p.online = false;

    console.log(
      '연결 끊김 - 복귀 대기:',
      code,
      p.nick
    );

    emit(r);

    setTimeout(() => {
      const currentRoom =
        rooms.get(code);

      if (!currentRoom) return;

      const currentPlayer =
        getPlayer(
          currentRoom,
          pid
        );

      if (!currentPlayer) return;

      /*
        30초 안에 돌아왔으면 유지
      */
      if (currentPlayer.online) {
        return;
      }

      currentRoom.players =
        currentRoom.players.filter(
          x => x.id !== pid
        );

      console.log(
        '30초 초과 - 플레이어 제거:',
        code,
        currentPlayer.nick
      );

      if (
        currentRoom.players.length === 0
      ) {
        rooms.delete(code);

        console.log(
          '빈 방 삭제:',
          code
        );

        return;
      }

      currentRoom.started = false;
      currentRoom.turn = null;

      currentRoom.players.forEach(x => {
        x.ready = false;
      });

      emit(currentRoom);

      io.to(code).emit(
        'err',
        '상대의 연결이 종료되었습니다.'
      );

    }, 30000);
  });
});

const PORT =
  process.env.PORT || 3000;

server.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `옥상동물전 실행: http://localhost:${PORT}`
    );
  }
);
