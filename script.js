import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ⬇️ PEGA AQUÍ TU firebaseConfig REAL ⬇️
const firebaseConfig = {
  apiKey: "AIzaSyDwgLeiZXXqTCnrXWZHMyXr1U_8H93f3wA",
  authDomain: "rincon-de-oracion.firebaseapp.com",
  databaseURL: "https://rincon-de-oracion-default-rtdb.firebaseio.com",
  projectId: "rincon-de-oracion",
  storageBucket: "rincon-de-oracion.firebasestorage.app",
  messagingSenderId: "826181473170",
  appId: "1:826181473170:web:97156a227efdea5ef5e74b"
};
// ⬆️ FIN ⬆️

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let unsubscribePeticiones = null;
const $ = (id) => document.getElementById(id);

// ============ TEMA ============
const themeToggles = document.querySelectorAll('.theme-toggle');
function updateMetaThemeColor(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#17171c' : '#5d7b7a');
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch (e) {}
  const icon = theme === 'dark' ? '☀️' : '🌙';
  const label = theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  themeToggles.forEach(btn => { btn.textContent = icon; btn.setAttribute('aria-label', label); });
  updateMetaThemeColor(theme);
}
applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
themeToggles.forEach(btn => {
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
});

// ============ HELPERS ============
function escaparHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function formatearFecha(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

// ============ TABS AUTH ============
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $(`form-${tab.dataset.tab}`).classList.add('active');
  });
});

// ============ AUTH ============
$('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error-login').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, $('email-login').value.trim(), $('password-login').value);
  } catch (err) {
    $('error-login').textContent = traducirError(err.code);
  }
});
$('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('error-registro').textContent = '';
  try {
    await createUserWithEmailAndPassword(auth, $('email-registro').value.trim(), $('password-registro').value);
  } catch (err) {
    $('error-registro').textContent = traducirError(err.code);
  }
});
$('btn-logout').addEventListener('click', () => signOut(auth));

function traducirError(code) {
  const map = {
    'auth/invalid-email': 'El correo no es válido.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
    'auth/network-request-failed': 'Sin conexión. Revisa tu internet.',
    'auth/invalid-api-key': 'Falta pegar el firebaseConfig real en script.js.',
    'auth/configuration-not-found': 'Falta activar Authentication (Email/Contraseña) en Firebase.'
  };
  return map[code] || `Error: ${code || 'desconocido'}`;
}

// ============ ESTADO ============
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    $('auth-container').style.display = 'none';
    $('app-container').style.display = 'block';
    $('user-email').textContent = user.email;
    iniciarApp();
  } else {
    currentUser = null;
    if (unsubscribePeticiones) { unsubscribePeticiones(); unsubscribePeticiones = null; }
    detenerTimerVersiculo();
    categoriaActual = null;
    $('auth-container').style.display = 'flex';
    $('app-container').style.display = 'none';
    $('form-login').reset();
    $('form-registro').reset();
    $('error-login').textContent = '';
    $('error-registro').textContent = '';
  }
});

// ============ APP ============
function iniciarApp() {
  const peticionesRef = ref(db, 'peticiones');
  unsubscribePeticiones = onValue(peticionesRef, (snapshot) => {
    const data = snapshot.val();
    const mias = [], otras = [];
    if (data) {
      Object.keys(data).forEach((key) => {
        const p = { id: key, ...data[key] };
        if (p.autor === currentUser.uid) mias.push(p); else otras.push(p);
      });
    }
    mias.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    otras.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    renderizarMias(mias);
    renderizarOtras(otras);
    $('contador-mias').textContent = mias.length;
    $('contador-otro').textContent = otras.length;
    actualizarVersiculo(mias.filter(p => !p.contestada));
  }, (error) => {
    console.error('Error al leer peticiones:', error);
  });
}

function renderizarMias(peticiones) {
  const cont = $('lista-mis-peticiones');
  cont.innerHTML = '';
  if (peticiones.length === 0) {
    cont.innerHTML = '<div class="empty-state">Aún no has añadido peticiones. Escribe la primera arriba.</div>';
    return;
  }
  peticiones.forEach(p => {
    const card = document.createElement('div');
    card.className = `peticion-card ${p.contestada ? 'contestada' : ''}`;
    card.innerHTML = `
      <div class="peticion-info">
        <p class="texto-peticion">${escaparHTML(p.texto)}</p>
        <div class="peticion-meta"><span>${formatearFecha(p.fecha)}</span></div>
      </div>
      <span class="status-badge ${p.contestada ? 'done' : 'pending'}">
        ${p.contestada ? '<span class="check-icon">✓</span> Contestada' : '⏳ En oración'}
      </span>
    `;
    cont.appendChild(card);
  });
}

function renderizarOtras(peticiones) {
  const cont = $('lista-peticiones-otro');
  cont.innerHTML = '';
  if (peticiones.length === 0) {
    cont.innerHTML = '<div class="empty-state">Aún no hay peticiones de la otra persona.</div>';
    return;
  }
  peticiones.forEach(p => {
    const card = document.createElement('div');
    card.className = `peticion-card ${p.contestada ? 'contestada' : ''}`;
    const tooltip = p.contestada ? 'Marcar como en oración' : 'Marcar como contestada';
    card.innerHTML = `
      <div class="peticion-info">
        <p class="texto-peticion">${escaparHTML(p.texto)}</p>
        <div class="peticion-meta"><span>${formatearFecha(p.fecha)}</span></div>
      </div>
      <button class="btn-estado ${p.contestada ? 'contestada' : ''}"
              data-id="${p.id}" data-contestada="${p.contestada}"
              data-tooltip="${tooltip}" aria-label="${tooltip}">
        ${p.contestada ? '✓' : '⏳'}
      </button>
    `;
    cont.appendChild(card);
  });
}

$('form-mis-peticiones').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('input-mis-peticiones');
  const texto = input.value.trim();
  if (!texto || !currentUser) return;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    await push(ref(db, 'peticiones'), {
      autor: currentUser.uid, texto,
      fecha: new Date().toISOString(), contestada: false
    });
    input.value = '';
  } catch (err) {
    console.error(err);
    alert('No se pudo guardar. Revisa tu conexión.');
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-estado');
  if (!btn) return;
  const id = btn.dataset.id;
  const contestadaActual = btn.dataset.contestada === 'true';
  btn.disabled = true;
  try {
    await update(ref(db, `peticiones/${id}`), { contestada: !contestadaActual });
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});

// ============ VERSÍCULOS CON ROTACIÓN ============
const INTERVALO_ROTACION_MS = 60000;

const VERSICULOS = {
  ansiedad: [
    { texto: '«Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.»', cita: 'Filipenses 4:6' },
    { texto: '«Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.»', cita: '1 Pedro 5:7' },
    { texto: '«Tú guardarás en completa paz a aquel cuyo pensamiento en ti persevera; porque en ti ha confiado.»', cita: 'Isaías 26:3' },
    { texto: '«No os afanéis, pues, diciendo: ¿Qué comeremos, o qué beberemos, o qué vestiremos? … Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.»', cita: 'Mateo 6:31-33' }
  ],
  temor: [
    { texto: '«No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia.»', cita: 'Isaías 41:10' },
    { texto: '«Porque no nos ha dado Dios espíritu de cobardía, sino de poder, de amor y de dominio propio.»', cita: '2 Timoteo 1:7' },
    { texto: '«Mira que te mando que te esfuerces y seas valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo en dondequiera que vayas.»', cita: 'Josué 1:9' },
    { texto: '«Busqué a Jehová, y él me oyó, y me libró de todos mis temores.»', cita: 'Salmo 34:4' }
  ],
  enfermedad: [
    { texto: '«Él es quien perdona todas tus iniquidades, el que sana todas tus dolencias.»', cita: 'Salmo 103:2-3' },
    { texto: '«Sáname, oh Jehová, y seré sano; sálvame, y seré salvo; porque tú eres mi alabanza.»', cita: 'Jeremías 17:14' },
    { texto: '«Y la oración de fe salvará al enfermo, y el Señor lo levantará.»', cita: 'Santiago 5:15' },
    { texto: '«Jehová lo sustentará sobre el lecho del dolor; mullirás toda su cama en su enfermedad.»', cita: 'Salmo 41:3' }
  ],
  fe: [
    { texto: '«Y sabemos que a los que aman a Dios, todas las cosas les ayudan a bien, esto es, a los que conforme a su propósito son llamados.»', cita: 'Romanos 8:28' },
    { texto: '«Es, pues, la fe la certeza de lo que se espera, la convicción de lo que no se ve.»', cita: 'Hebreos 11:1' },
    { texto: '«Fíate de Jehová de todo tu corazón, y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, y él endereza­rá tus veredas.»', cita: 'Proverbios 3:5-6' },
    { texto: '«Por tanto, os digo que todo lo que pidiereis orando, creed que lo recibiréis, y os vendrá.»', cita: 'Marcos 11:24' }
  ],
  tristeza: [
    { texto: '«Jehová está cerca de los quebrantados de corazón; y salva a los contritos de espíritu.»', cita: 'Salmos 34:18' },
    { texto: '«Porque por un momento será su ira, pero su favor dura toda la vida. Por la noche durará el lloro, y a la mañana vendrá la alegría.»', cita: 'Salmos 30:5' },
    { texto: '«Bienaventurados los que lloran, porque ellos recibirán consolación.»', cita: 'Mateo 5:4' },
    { texto: '«Enjugará Dios toda lágrima de los ojos de ellos; y ya no habrá muerte, ni habrá más llanto, ni clamor, ni dolor.»', cita: 'Apocalipsis 21:4' }
  ],
  provision: [
    { texto: '«Mi Dios, pues, suplirá todo lo que os falta conforme a sus riquezas en gloria en Cristo Jesús.»', cita: 'Filipenses 4:19' },
    { texto: '«No os afanéis por el día de mañana, porque el día de mañana traerá su afán. Basta a cada día su propio mal.»', cita: 'Mateo 6:34' },
    { texto: '«Joven fui, y he envejecido, y no he visto justo desamparado, ni su descendencia que mendigue pan.»', cita: 'Salmos 37:25' },
    { texto: '«Honra a Jehová con tus bienes, y con las primicias de todos tus frutos; y serán llenos tus graneros con abundancia.»', cita: 'Proverbios 3:9-10' }
  ],
  familia: [
    { texto: '«Cree en el Señor Jesucristo, y serás salvo, tú y tu casa.»', cita: 'Hechos 16:31' },
    { texto: '«Pero yo y mi casa serviremos a Jehová.»', cita: 'Josué 24:15' },
    { texto: '«Instruye al niño en su camino, y aun cuando fuere viejo no se apartará de él.»', cita: 'Proverbios 22:6' },
    { texto: '«Y estas palabras que yo te mando hoy, estarán sobre tu corazón; y las repetirás a tus hijos.»', cita: 'Deuteronomio 6:6-7' }
  ],
  general: [
    { texto: '«Jehová es mi pastor; nada me faltará.»', cita: 'Salmos 23:1' },
    { texto: '«Porque yo sé los pensamientos que tengo acerca de vosotros, pensamientos de paz, y no de mal, para daros el fin que esperáis.»', cita: 'Jeremías 29:11' },
    { texto: '«Pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas.»', cita: 'Isaías 40:31' },
    { texto: '«Por la misericordia de Jehová no hemos sido consumidos, porque nunca decayeron sus misericordias. Nuevas son cada mañana; grande es tu fidelidad.»', cita: 'Lamentaciones 3:22-23' }
  ]
};

const PALABRAS_CLAVE = {
  ansiedad:   ['ansiedad','ansios','preocup','afán','afan','estrés','estres','nervios'],
  temor:      ['miedo','temor','asust','pánico','panico','insegur'],
  enfermedad: ['enferm','salud','dolor','sanar','sanación','sanacion','hospital','médic','medic','cirugía','cirugia'],
  fe:         ['fe','confiar','confianza','esperanza','creer','fortalec'],
  tristeza:   ['triste','solo','soledad','deprim','llor','duelo','perdida','pérdida','angustia'],
  provision:  ['trabajo','empleo','dinero','provisión','provision','económic','economic','deuda','finanz','sustento'],
  familia:    ['familia','hijo','hija','esposo','esposa','matrimonio','padre','madre','hermano','hermana']
};

let categoriaActual = null;
let indiceVersiculo = 0;
let versiculoTimer = null;

function detectarCategoria(peticiones) {
  for (const p of peticiones) {
    const t = p.texto.toLowerCase();
    for (const [cat, palabras] of Object.entries(PALABRAS_CLAVE)) {
      if (palabras.some(pal => t.includes(pal))) return cat;
    }
  }
  return 'general';
}

function renderDots(total, activo) {
  const cont = $('verse-dots');
  if (!cont) return;
  cont.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'verse-dot' + (i === activo ? ' active' : '');
    dot.setAttribute('aria-label', `Versículo ${i + 1} de ${total}`);
    dot.addEventListener('click', () => {
      indiceVersiculo = i;
      mostrarVersiculo(categoriaActual);
      reiniciarTimerVersiculo();
    });
    cont.appendChild(dot);
  }
}

function mostrarVersiculo(categoria) {
  const versiculos = VERSICULOS[categoria] || VERSICULOS.general;
  if (indiceVersiculo >= versiculos.length) indiceVersiculo = 0;
  const v = versiculos[indiceVersiculo];
  const el = $('versiculo-texto');
  el.classList.add('fading');
  setTimeout(() => {
    el.innerHTML = `${v.texto}<strong>— ${v.cita} —</strong>`;
    el.classList.remove('fading');
    renderDots(versiculos.length, indiceVersiculo);
  }, 200);
}

function rotarVersiculo() {
  const versiculos = VERSICULOS[categoriaActual] || VERSICULOS.general;
  indiceVersiculo = (indiceVersiculo + 1) % versiculos.length;
  mostrarVersiculo(categoriaActual);
}

function reiniciarTimerVersiculo() {
  if (versiculoTimer) clearInterval(versiculoTimer);
  versiculoTimer = setInterval(rotarVersiculo, INTERVALO_ROTACION_MS);
}

function detenerTimerVersiculo() {
  if (versiculoTimer) { clearInterval(versiculoTimer); versiculoTimer = null; }
}

function actualizarVersiculo(peticionesEnProceso) {
  const nuevaCategoria = detectarCategoria(peticionesEnProceso);
  if (nuevaCategoria !== categoriaActual) {
    categoriaActual = nuevaCategoria;
    indiceVersiculo = Math.floor(Math.random() * VERSICULOS[categoriaActual].length);
    mostrarVersiculo(categoriaActual);
  }
  reiniciarTimerVersiculo();
}