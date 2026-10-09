const S = io();

const $ = q => document.querySelector(q);

const D = {
  croc: {
    n: '크록냥',
    img: 'crocnyang.png',
    s: ['크록샷', '짝짝이', '크록스 폭격']
  },
  gayper: {
    n: '게이퍼',
    img: 'gayper.png',
    s: ['저격탄', '관통탄', '헤드샷']
  },
  ham: {
    n: '햄붕이',
    img: 'hambungi.png',
    s: ['햄탄', '따다당', '햄스터 난사']
  },
  big: {
    n: '빅딕',
    img: 'bigdick.png',
    s: ['박격포', '빅볼', '빅딕밤']
  },
  odo: {
    n: '오도냥',
    img: 'odonyang.png',
    s: ['빠따포', '따따블', '오도폭타']
  },
  bazu: {
    n: '바주냥',
    img: 'bazunyang.png',
    s: ['바주카', '울보탄', '대성통곡']
  }
};

const names = {
  double: '💥 더블',
  power: '🔥 화력 +30%',
  heal: '❤️ 참치캔',
  shield: '🛡️ 철갑',
  wind: '🌪️ 풍향반전'
};

let st = null;
let id = null;
let skill = 1;
let timer = null;
let left = 20;
let lastTurn = null;
let selectedChar = null;

/* =========================
   접속
========================= */

S.on('connect', () => {
  id = S.id;

  const qs = new URLSearchParams(location.search);
  const room = qs.get('room');

  if (room) {
    $('#code').value = room.trim().toUpperCase();
    $('#create').style.display = 'none';
    $('#join').textContent = '초대받은 방 참가';
    $('#err').textContent = '닉네임을 입력하고 참가를 눌러주세요.';
  }
});

/* =========================
   캐릭터 목록
========================= */

$('#roster').innerHTML = Object.entries(D)
  .map(([k, v]) => `
    <button type="button" class="pick" data-k="${k}">
      <img src="${v.img}" alt="${v.n}">
      <b>${v.n}</b>
      <small>${v.s.join(' · ')}</small>
    </button>
  `)
  .join('');

/* =========================
   방 만들기 / 참가
========================= */

$('#create').onclick = () => {
  const nick = $('#nick').value.trim();

  if (!nick) {
    $('#err').textContent = '닉네임을 입력하세요.';
    return;
  }

  $('#err').textContent = '';
  S.emit('create', { nick });
};

$('#join').onclick = () => {
  const nick = $('#nick').value.trim();
  const code = $('#code').value.trim().toUpperCase();

  if (!nick) {
    $('#err').textContent = '닉네임을 입력하세요.';
    return;
  }

  if (!code) {
    $('#err').textContent = '방 코드가 없습니다.';
    return;
  }

  $('#err').textContent = '';

  S.emit('join', {
    nick,
    code
  });
};

S.on('err', m => {
  $('#err').textContent = m;
  notice(m);
});

/* =========================
   캐릭터 선택
========================= */

document.querySelectorAll('.pick').forEach(button => {
  button.addEventListener('click', () => {
    const char = button.dataset.k;

    if (!char || !D[char]) return;

    selectedChar = char;

    document.querySelectorAll('.pick').forEach(x => {
      x.classList.remove('on');
    });

    button.classList.add('on');

    S.emit('select', {
      char
    });

    updateWaitingText();
  });
});

/* =========================
   초대 링크
========================= */

$('#share').onclick = async () => {
  if (!st || !st.code) return;

  const url =
    location.origin +
    location.pathname +
    '?room=' +
    encodeURIComponent(st.code);

  try {
    await navigator.clipboard.writeText(url);
    $('#share').textContent = '복사됨!';
  } catch {
    prompt('이 링크를 친구에게 보내세요', url);
  }

  setTimeout(() => {
    $('#share').textContent = '초대 링크 복사';
  }, 1200);
};

/* =========================
   서버 상태 수신
========================= */

S.on('state', x => {
  const turnChanged = lastTurn !== x.turn;

  lastTurn = x.turn;
  st = x;

  $('#lobby').classList.add('hide');
  $('#roomCode').textContent = x.code;

  if (x.started) {
    $('#select').classList.add('hide');
    $('#game').classList.remove('hide');

    render();

    if (turnChanged) {
      resetTimer();
    }

    return;
  }

  $('#game').classList.add('hide');
  $('#select').classList.remove('hide');

  updateWaitingText();

  const me = x.players.find(p => p.id === id);

  if (me && me.ready && me.char) {
    selectedChar = me.char;

    document.querySelectorAll('.pick').forEach(button => {
      button.classList.toggle(
        'on',
        button.dataset.k === me.char
      );
    });
  }
});

function updateWaitingText() {
  if (!st) return;

  const me = st.players.find(p => p.id === id);
  const other = st.players.find(p => p.id !== id);

  if (st.players.length < 2) {
    $('#wait').textContent =
      selectedChar
        ? '✅ 캐릭터 선택 완료 · 상대를 기다리는 중…'
        : '상대를 기다리는 중…';

    return;
  }

  if (!me || !other) {
    $('#wait').textContent = '상대 정보를 불러오는 중…';
    return;
  }

  if (!me.ready) {
    $('#wait').textContent =
      '👆 내 캐릭터를 선택하세요';

    return;
  }

  if (!other.ready) {
    $('#wait').textContent =
      '✅ 나는 준비 완료 · 상대 캐릭터 선택 대기 중…';

    return;
  }

  $('#wait').textContent =
    '🔥 둘 다 준비 완료 · 게임 시작 중…';
}

/* =========================
   공통 함수
========================= */

function maxhp(c) {
  return {
    croc: 100,
    gayper: 90,
    ham: 95,
    big: 120,
    odo: 105,
    bazu: 100
  }[c];
}

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c])
  );
}

function hud(p) {
  return `
    <div class="hud">
      <b>${esc(p.nick)}</b>
      · ${D[p.char].n}
      ❤️ ${p.hp}/${maxhp(p.char)}
      ${p.shield ? ' 🛡️' : ''}

      <div class="hp">
        <i style="width:${100 * p.hp / maxhp(p.char)}%"></i>
      </div>
    </div>
  `;
}

function notice(t) {
  $('#notice').textContent = t || '';

  if (t) {
    setTimeout(() => {
      if ($('#notice').textContent === t) {
        $('#notice').textContent = '';
      }
    }, 1800);
  }
}

/* =========================
   게임 화면
========================= */

function render() {
  if (!st) return;

  const me =
    st.players.find(p => p.id === id);

  const foe =
    st.players.find(p => p.id !== id);

  if (!me || !foe) return;

  $('#meHud').innerHTML = hud(me);
  $('#foeHud').innerHTML = hud(foe);

  $('#wind').textContent =
    '🌬️ ' +
    (st.wind >= 0 ? '→ ' : '← ') +
    Math.abs(st.wind);

  $('#turn').textContent =
    st.turn === id
      ? '🟡 내 턴'
      : '상대 턴';

  const myTurn =
    st.turn === id;

  $('#fire').disabled = !myTurn;
  $('#left').disabled = !myTurn;
  $('#right').disabled = !myTurn;
  $('#use').disabled = !myTurn;

  $('#me').src = D[me.char].img;
  $('#foe').src = D[foe.char].img;

  $('#me').style.left =
    `calc(${me.x / 10}% - 55px)`;

  $('#foe').style.left =
    `calc(${foe.x / 10}% - 55px)`;

  $('#me').className =
    'unit' +
    (me.fallen ? ' fall' : '');

  $('#foe').className =
    'unit foe' +
    (foe.fallen ? ' fall' : '');

  draw();

  $('#skills').innerHTML =
    D[me.char].s
      .map((name, i) => `
        <button
          class="skill ${skill === i + 1 ? 'on' : ''}"
          data-s="${i + 1}"
          ${i === 2 && me.ult <= 0 ? 'disabled' : ''}
        >
          ${i + 1}. ${name}${i === 2 ? ' · 1회' : ''}
        </button>
      `)
      .join('');

  document
    .querySelectorAll('.skill')
    .forEach(button => {
      button.onclick = () => {
        skill = Number(button.dataset.s);
        render();
      };
    });

  $('#item').innerHTML =
    '<option value="">아이템</option>' +
    me.items
      .map(x =>
        `<option value="${x}">${names[x]}</option>`
      )
      .join('');
}

/* =========================
   맵
========================= */

function draw() {
  const c = $('#cv');
  const g = c.getContext('2d');

  const w = c.width;
  const h = c.height;

  const grd =
    g.createLinearGradient(0, 0, 0, h);

  grd.addColorStop(0, '#8c9aa2');
  grd.addColorStop(0.55, '#d7a36f');
  grd.addColorStop(0.56, '#6d6b66');
  grd.addColorStop(1, '#494744');

  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);

  g.fillStyle = '#555';

  for (let x = 0; x < w; x += 90) {
    const bh =
      50 + (x * 17 % 95);

    g.fillRect(
      x,
      230 - bh,
      80,
      bh
    );
  }

  g.fillStyle = '#77736d';
  g.fillRect(0, 260, w, 170);

  g.fillStyle = '#514d48';
  g.fillRect(0, 260, w, 14);

  g.fillStyle = '#4c5b60';
  g.beginPath();
  g.ellipse(
    500,
    245,
    55,
    70,
    0,
    Math.PI,
    0
  );
  g.fill();

  g.fillStyle = '#8d8a80';
  g.fillRect(160, 205, 135, 55);

  g.fillStyle = '#aaa79d';
  g.fillRect(785, 225, 105, 35);

  for (const cr of st.craters || []) {
    g.save();

    g.globalCompositeOperation =
      'destination-out';

    g.beginPath();
    g.arc(
      cr.x,
      270,
      cr.r,
      0,
      Math.PI * 2
    );
    g.fill();

    g.restore();

    g.strokeStyle = '#2c2926';
    g.lineWidth = 5;

    g.beginPath();
    g.arc(
      cr.x,
      270,
      cr.r,
      Math.PI,
      Math.PI * 2
    );
    g.stroke();
  }

  if (st.box) {
    g.font = '38px sans-serif';
    g.fillText(
      '📦',
      st.box.x,
      245
    );
  }
}

/* =========================
   조작
========================= */

$('#angle').oninput = e => {
  $('#av').textContent =
    e.target.value + '°';
};

$('#power').oninput = e => {
  $('#pv').textContent =
    e.target.value;
};

$('#left').onclick = () => {
  S.emit('move', {
    dx: -45
  });
};

$('#right').onclick = () => {
  S.emit('move', {
    dx: 45
  });
};

$('#use').onclick = () => {
  const v = $('#item').value;

  if (v) {
    S.emit('use', {
      item: v
    });
  }
};

$('#fire').onclick = () => {
  S.emit('fire', {
    angle: Number($('#angle').value),
    power: Number($('#power').value),
    skill,
    item: $('#item').value
  });
};

/* =========================
   턴 타이머
========================= */

function resetTimer() {
  clearInterval(timer);

  left = 20;

  $('#timer').textContent =
    left;

  timer = setInterval(() => {
    if (
      !st ||
      st.turn !== id
    ) return;

    left--;

    $('#timer').textContent =
      left;

    if (left <= 0) {
      clearInterval(timer);

      S.emit('fire', {
        angle: 45,
        power: 35,
        skill: 1,
        item: ''
      });
    }
  }, 1000);
}

/* =========================
   발사 애니메이션
========================= */

S.on('shot', d => {
  const a = $('#arena');
  const fx = $('#fx');

  const mine =
    d.from === id;

  const unit =
    mine
      ? $('#me')
      : $('#foe');

  unit.classList.add('shake');

  setTimeout(() => {
    unit.classList.remove('shake');
  }, 280);

  const m =
    document.createElement('div');

  m.className = 'muzzle';

  m.textContent =
    d.char === 'odo'
      ? '💢'
      : '🔥';

  m.style.left =
    mine ? '16%' : '80%';

  m.style.bottom = '34%';

  fx.appendChild(m);

  setTimeout(() => {
    m.remove();
  }, 300);

  const dot =
    document.createElement('div');

  dot.style.cssText =
    'position:absolute;' +
    'width:12px;' +
    'height:12px;' +
    'border-radius:50%;' +
    'background:#171717;' +
    'z-index:8;';

  fx.appendChild(dot);

  const pts =
    d.pts || [];

  let i = 0;

  const scale =
    a.clientWidth / 1000;

  function go() {
    if (i >= pts.length) {
      dot.remove();

      const b =
        document.createElement('div');

      b.className = 'boom';
      b.textContent = '💥';

      b.style.left =
        (d.hitX * scale - 35) +
        'px';

      b.style.top = '55%';

      fx.appendChild(b);

      setTimeout(() => {
        b.remove();
      }, 500);

      if (d.damage) {
        notice(
          `${d.damage} 피해!`
        );
      }

      return;
    }

    const p =
      pts[i++];

    dot.style.left =
      (p[0] * scale) +
      'px';

    dot.style.top =
      (
        p[1] *
        a.clientHeight /
        430
      ) +
      'px';

    requestAnimationFrame(go);
  }

  go();
});

/* =========================
   보급상자
========================= */

S.on('drop', () => {
  const f =
    document.createElement('div');

  f.className = 'boom';
  f.textContent = '🪂📦';
  f.style.left = '48%';
  f.style.top = '8%';

  $('#fx').appendChild(f);

  setTimeout(() => {
    f.remove();
  }, 700);

  notice(
    '보급상자 투하! 가까이 이동해서 획득'
  );
});

S.on('pickup', d => {
  notice(
    d.player === id
      ? '📦 ' +
        names[d.item] +
        ' 획득!'
      : '상대가 보급상자를 획득했습니다.'
  );
});

/* =========================
   게임 종료
========================= */

S.on('over', d => {
  clearInterval(timer);

  setTimeout(() => {
    alert(
      d.winner === id
        ? `승리! 🏆 (${d.reason})`
        : `패배! 💀 (${d.reason})`
    );
  }, 500);
});
