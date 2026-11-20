// Part-Time Duck Market · versión web (pantallas)
(function () {
  'use strict';
  const L = window.L, DB = window.DB;
  const VERSION = '0.1.0';
  const S = { perfil: null, personas: [], fecha: L.hoyChile(), suc: 'TODAS', planSuc: null, planDia: null, quincena: null, pagoSel: null, conc: null, concTab: 0 };

  // ================================================================== utilidades
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tiene = (p) => !!S.perfil && (S.perfil.admin || (S.perfil.permisos || []).indexOf(p) >= 0);
  const visibles = () => (S.perfil.admin || tiene('VerOtras')) ? L.SUCURSALES.slice() : [S.perfil.sucursal].filter(Boolean);
  const escribibles = () => (S.perfil.admin || tiene('EditarOtras')) ? visibles() : [S.perfil.sucursal].filter(Boolean);
  const planificables = () => !tiene('Planificar') ? [] : (S.perfil.admin || tiene('PlanificarOtras')) ? visibles() : [S.perfil.sucursal].filter(Boolean);
  const montos = () => tiene('VerMontos') || tiene('Pagos');
  const pesoV = (v) => montos() ? L.peso(v) : '—';
  const hoy = () => L.hoyChile();
  const ICO = {
    registro: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M8 2v4M16 2v4M3 10h18"></path>',
    planificador: '<path d="M9 11l3 3 8-8"></path><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9"></path>',
    dias: '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M3 10h18M12 13v5M9.5 15.5h5"></path>',
    pagos: '<rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M2 10h20"></path>',
    conciliacion: '<path d="M7 7h11l-3-3M17 17H6l3 3"></path>',
    personas: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0113 0"></path><path d="M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6"></path>',
    reportes: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>',
    historial: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    usuarios: '<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 018 0v4"></path>',
    buscar: '<circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path>'
  };
  const icono = (n, t) => '<svg aria-hidden="true" width="' + (t || 18) + '" height="' + (t || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICO[n] + '</svg>';
  const est = (txt, tipo) => '<span class="est ' + tipo + '">' + esc(txt) + '</span>';
  const opciones = (lista, sel) => lista.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');

  let tMsg;
  function mensaje(txt, mal) {
    let m = $('.mensaje'); if (!m) { m = document.createElement('div'); m.setAttribute('role', 'status'); document.body.appendChild(m); }
    m.className = 'mensaje' + (mal ? ' mal' : ''); m.textContent = txt; clearTimeout(tMsg); tMsg = setTimeout(() => m.remove(), mal ? 7000 : 3500);
  }
  const falla = (e) => mensaje(e && e.message ? e.message : String(e), true);

  // diálogo con formulario: resuelve con un objeto con los campos (o null si se cancela)
  function dialogo(titulo, cuerpo, opts) {
    opts = opts || {};
    return new Promise((resolver) => {
      const d = document.createElement('dialog');
      d.innerHTML = '<form method="dialog"><h2>' + esc(titulo) + '</h2>' + cuerpo + '<div class="error oculto"></div><div class="botones" style="justify-content:flex-end">' +
        (opts.sinCancelar ? '' : '<button type="button" class="btn" data-x>Cancelar</button>') +
        '<button type="submit" class="btn ' + (opts.peligro ? 'peligro' : 'pri') + '">' + esc(opts.boton || 'Aceptar') + '</button></div></form>';
      document.body.appendChild(d);
      const f = $('form', d), err = $('.error', d);
      const cerrar = (v) => { d.close(); d.remove(); resolver(v); };
      $('[data-x]', d) && $('[data-x]', d).addEventListener('click', () => cerrar(null));
      d.addEventListener('cancel', (e) => { e.preventDefault(); cerrar(null); });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const datos = {}; new FormData(f).forEach((v, k) => { datos[k] = v; });
        f.querySelectorAll('input[type=checkbox]').forEach((c) => { if (c.name && !c.dataset.multi) datos[c.name] = c.checked; });
        if (opts.validar) {
          const btn = f.querySelector('[type=submit]'); btn.disabled = true;
          try { const r = await opts.validar(datos, f); if (r) { err.textContent = r; err.classList.remove('oculto'); btn.disabled = false; return; } }
          catch (ex) { err.textContent = ex.message || String(ex); err.classList.remove('oculto'); btn.disabled = false; return; }
        }
        cerrar(datos);
      });
      d.showModal();
      if (opts.alAbrir) opts.alAbrir(f);
      const primero = f.querySelector('input:not([type=hidden]), select, textarea'); if (primero) primero.focus();
    });
  }
  const confirmar = (titulo, txt, boton, peligro) => dialogo(titulo, '<p style="margin:0;white-space:pre-line">' + esc(txt) + '</p>', { boton: boton || 'Sí', peligro }).then((r) => !!r);

  function descargarCSV(nombre, filas) {
    const txt = '﻿' + filas.map((f) => f.map((c) => { const s = c == null ? '' : String(c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  }

  // campo de persona con sugerencias (nombre o RUT) · al elegir llama alElegir(persona)
  function campoPersona(input, cajaSug, alElegir) {
    const pintar = () => {
      const lista = L.sugerirPersonas(S.personas, input.value, 6);
      const exacta = L.buscarPersona(S.personas, input.value);
      if (!input.value.trim() || (exacta && lista.length <= 1)) { cajaSug.innerHTML = ''; cajaSug.classList.add('oculto'); return; }
      cajaSug.innerHTML = lista.length ? lista.map((p) => '<button type="button" data-id="' + p.id + '">' + esc(p.nombre) + (p.rut ? '<small>' + esc(p.rut) + '</small>' : '') + '</button>').join('')
        : '<div class="nota" style="padding:10px 12px">No está en la base de part-time. Se guardará como persona nueva' + (tiene('Personas') ? '.' : ' (avisa a la oficina).') + '</div>';
      cajaSug.classList.remove('oculto');
    };
    input.addEventListener('input', pintar);
    input.addEventListener('focus', pintar);
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { const b = cajaSug.querySelector('button'); if (b) { e.preventDefault(); b.focus(); } } });
    cajaSug.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]'); if (!b) return;
      const p = S.personas.find((x) => String(x.id) === b.dataset.id); input.value = p.nombre; cajaSug.classList.add('oculto'); alElegir && alElegir(p);
    });
    cajaSug.addEventListener('keydown', (e) => {
      const bs = [...cajaSug.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i < bs.length - 1) { e.preventDefault(); bs[i + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? bs[i - 1] : input).focus(); }
      if (e.key === 'Escape') { cajaSug.classList.add('oculto'); input.focus(); }
    });
  }
  const nombreOficial = (texto) => { const p = L.buscarPersona(S.personas, texto); return p ? { nombre: p.nombre, rut: p.rut || '' } : { nombre: L.nombrePropio(texto), rut: '' }; };

  // ================================================================== entrada
  function pantallaEntrada(error) {
    window.onhashchange = null;
    document.body.innerHTML = '<main class="login"><form autocomplete="on">' +
      '<div class="marca"><div class="logo">D</div><div><b>Duck Market</b><span>Registro Part-Time</span></div></div>' +
      (DB.demo ? '<div class="error" style="background:var(--avisof);color:var(--aviso)">MODO DE PRUEBA: datos de ejemplo, no se guarda nada. Entra como admin, gerente, andes, encinas o sanmartin con cualquier clave.</div>' : '') +
      '<label class="campo">Usuario<input name="u" autocomplete="username" required autocapitalize="none"></label>' +
      '<label class="campo">Clave<input name="c" type="password" autocomplete="current-password" required></label>' +
      '<div class="error' + (error ? '' : ' oculto') + '">' + esc(error || '') + '</div>' +
      '<button class="btn pri" type="submit">Entrar</button><p class="nota" style="text-align:center">v' + VERSION + '</p></form></main>';
    const f = $('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button', f); b.disabled = true; b.textContent = 'Entrando…';
      try { S.perfil = await DB.entrar(f.u.value, f.c.value); montar(); }
      catch (ex) { pantallaEntrada(ex.message); }
    });
    f.u.focus();
  }

  // ================================================================== estructura
  const SECCIONES = [
    { id: 'registro', txt: 'Registro del día', ve: () => true },
    { id: 'planificador', txt: 'Planificador', ve: () => tiene('Planificar') || tiene('DiasPlan') || tiene('ReportesPlan') },
    { id: 'buscar', txt: 'Buscar persona', ve: () => true },
    { id: 'pagos', txt: 'Pagos quincenales', ve: () => tiene('Pagos') },
    { id: 'conciliacion', txt: 'Conciliar Mercado Pago', ve: () => tiene('Conciliar') },
    { grupo: 'ADMINISTRACIÓN' },
    { id: 'dias', txt: 'Días a planificar', ve: () => tiene('DiasPlan') },
    { id: 'personas', txt: 'Personas', ve: () => tiene('Personas') },
    { id: 'reportes', txt: 'Reportes', ve: () => tiene('VerResumen') || tiene('ReportesPlan') },
    { id: 'historial', txt: 'Historial de cambios', ve: () => tiene('Historial') },
    { id: 'usuarios', txt: 'Usuarios y permisos', ve: () => S.perfil.admin || tiene('Usuarios') }
  ];
  async function montar() {
    try { S.personas = await DB.personasLista(); } catch (e) { S.personas = []; }
    S.planSuc = S.planSuc || planificables()[0] || visibles()[0];
    if (visibles().length === 1) S.suc = visibles()[0];
    const items = []; let grupo = null;
    for (const s of SECCIONES) {
      if (s.grupo) { grupo = s.grupo; continue; }
      if (!s.ve()) continue;
      if (grupo) { items.push('<div class="grupo">' + grupo + '</div>'); grupo = null; }
      items.push('<a href="#/' + s.id + '" data-sec="' + s.id + '">' + icono(s.id) + '<span>' + s.txt + '</span>' + (s.id === 'planificador' ? '<span class="globo oculto" id="globo-plan"></span>' : '') + '</a>');
    }
    const nomRol = { admin: 'Administrador', gerente: 'Gerente', sucursal: 'Sucursal' }[S.perfil.rol] || S.perfil.rol || '';
    const rol = S.perfil.admin ? 'Administrador' : nomRol + (S.perfil.sucursal ? ' · ' + S.perfil.sucursal : '');
    document.body.innerHTML = '<div class="app"><nav class="menu" aria-label="Secciones">' +
      '<div class="marca"><div class="logo">D</div><div><b>Duck Market</b><span>Part-Time</span></div></div>' + items.join('') +
      '<div class="yo"><b>' + esc(S.perfil.usuario) + '</b><span>' + esc(rol) + '</span><button type="button" id="b-clave">Cambiar mi clave</button><button type="button" id="b-salir">Salir</button></div></nav>' +
      '<div class="principal"><div class="barra-movil"><button type="button" id="b-menu" aria-label="Abrir menú"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"></path></svg></button><b id="tit-movil">Part-Time</b></div>' +
      (DB.demo ? '<div class="aviso-demo">MODO DE PRUEBA · datos de ejemplo, nada se guarda en la base</div>' : '') +
      '<div id="vista"></div></div></div>';
    $('#b-salir').onclick = async () => { await DB.salir(); S.perfil = null; location.hash = ''; pantallaEntrada(); };
    $('#b-clave').onclick = cambiarClave;
    $('#b-menu').onclick = () => $('.menu').classList.toggle('abierto');
    $('.menu').addEventListener('click', (e) => { if (e.target.closest('a')) $('.menu').classList.remove('abierto'); });
    window.onhashchange = ir;
    ir();
    avisarPendientes();
  }
  async function avisarPendientes() {
    if (!tiene('Planificar')) return;
    try {
      const p = (await DB.plan({ desde: L.sumarDias(hoy(), -14), hasta: hoy() })).filter((x) => x.estado === 'PLANIFICADO' && planificables().indexOf(x.sucursal) >= 0);
      const g = $('#globo-plan'); if (g && p.length) { g.textContent = p.length; g.classList.remove('oculto'); g.title = p.length + ' por confirmar asistencia'; }
    } catch (e) { /* sin aviso */ }
  }
  async function cambiarClave() {
    const r = await dialogo('Cambiar mi clave', '<label class="campo">Clave nueva<input name="a" type="password" minlength="8" required autocomplete="new-password"></label>' +
      '<label class="campo">Repetir clave nueva<input name="b" type="password" minlength="8" required autocomplete="new-password"></label><p class="nota">Mínimo 8 caracteres.</p>',
    { boton: 'Cambiar', validar: async (d) => { if (d.a !== d.b) return 'Las claves no coinciden.'; await DB.cambiarClave(d.a); } });
    if (r) mensaje('Clave cambiada.');
  }
  async function ir() {
    if (!$('#vista')) return;
    const id = (location.hash.replace(/^#\/?/, '') || 'registro').split('?')[0];
    const sec = SECCIONES.find((s) => s.id === id && s.ve()) || SECCIONES[0];
    document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('activo', a.dataset.sec === sec.id));
    $('#tit-movil').textContent = sec.txt;
    const v = $('#vista'); v.innerHTML = '<div class="cargando">Cargando…</div>';
    try { await VISTAS[sec.id](v); } catch (e) { v.innerHTML = '<div class="zona"><div class="error">' + esc(e.message || e) + '</div></div>'; }
  }
  const cabecera = (titulo, sub, extra) => '<header class="cabecera"><div class="titulo"><h1>' + esc(titulo) + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (extra || '') + '</header>';
  const tarjeta = (t, cifra, sub, oscura) => '<div class="tarjeta' + (oscura ? ' oscura' : '') + '"><span>' + esc(t) + '</span><span class="cifra">' + cifra + '</span><small>' + (sub || '') + '</small></div>';

  // ================================================================== REGISTRO DEL DÍA
  async function vistaRegistro(v, editar) {
    const f = S.fecha, sucs = visibles(), q = L.quincenaDe(f);
    const [turnosQ, planes] = await Promise.all([DB.turnos({ desde: q.desde, hasta: q.hasta }), DB.plan({ desde: f, hasta: f })]);
    const filtro = (x) => S.suc === 'TODAS' ? sucs.indexOf(x.sucursal) >= 0 : x.sucursal === S.suc;
    const turnos = turnosQ.filter((t) => t.fecha === f && filtro(t));
    const plan = planes.filter(filtro);
    const planDe = new Map(plan.filter((p) => p.turno_id).map((p) => [p.turno_id, p]));
    const pend = plan.filter((p) => p.estado === 'PLANIFICADO'), noAsis = plan.filter((p) => p.estado === 'NO ASISTIÓ');
    const totalDia = turnos.reduce((s, t) => s + Number(t.total), 0), locDia = turnos.reduce((s, t) => s + Number(t.locomocion), 0);
    const totalQ = turnosQ.filter(filtro).reduce((s, t) => s + Number(t.total), 0);
    const puedeReg = tiene('Registrar') && escribibles().length > 0;
    const puedeEditarFecha = (fe) => tiene('EditarAnteriores') || fe >= hoy();
    const puedePlan = (p) => planificables().indexOf(p.sucursal) >= 0 && p.fecha <= hoy();

    const filas = [];
    for (const t of turnos) {
      const p = planDe.get(t.id);
      const acc = [];
      if (tiene('Modificar') && escribibles().indexOf(t.sucursal) >= 0 && puedeEditarFecha(t.fecha)) acc.push('<button class="btn chico" data-acc="editar" data-id="' + t.id + '">Editar</button>');
      if (tiene('Eliminar') && escribibles().indexOf(t.sucursal) >= 0 && puedeEditarFecha(t.fecha)) acc.push('<button class="btn chico peligro" data-acc="eliminar" data-id="' + t.id + '" aria-label="Eliminar turno de ' + esc(t.nombre) + '">Eliminar</button>');
      filas.push({ orden: t.entrada, html: '<tr' + (editar && editar.id === t.id ? ' class="sel"' : '') + '><td class="fuerte" data-t="Persona">' + esc(t.nombre) + (t.obs ? '<div class="nota">' + esc(t.obs) + '</div>' : '') + '</td><td class="gris" data-t="Sucursal">' + esc(t.sucursal) + '</td><td data-t="Horario">' + t.entrada + ' – ' + t.salida + '</td><td class="num" data-t="Horas">' + L.horasTxt(t.horas) + '</td>' +
        '<td class="num" data-t="Pago">' + pesoV(t.pago) + '</td><td class="num gris" data-t="Locom.">' + (Number(t.locomocion) ? pesoV(t.locomocion) : '—') + '</td><td class="num fuerte" data-t="Total">' + pesoV(t.total) + '</td>' +
        '<td data-t="Estado">' + (p ? est('Planificado · asistió', 'ok') : est('Registrado', 'ok')) + '</td><td data-t=""><div class="botones">' + acc.join('') + '</div></td></tr>' });
    }
    for (const p of pend.concat(noAsis)) {
      const acc = p.estado === 'PLANIFICADO' && puedePlan(p) ? '<button class="btn chico pri" data-acc="asistio" data-id="' + p.id + '">Asistió</button><button class="btn chico peligro" data-acc="noasistio" data-id="' + p.id + '">No asistió</button>' : '';
      filas.push({ orden: p.entrada, html: '<tr><td class="fuerte" data-t="Persona">' + esc(p.nombre) + (p.motivo ? '<div class="nota">' + esc(p.motivo) + '</div>' : '') + '</td><td class="gris" data-t="Sucursal">' + esc(p.sucursal) + '</td><td data-t="Horario">' + p.entrada + ' – ' + p.salida + '</td><td class="num" data-t="Horas">' + L.horasTxt(p.horas) + '</td>' +
        '<td class="num" data-t="Pago">' + pesoV(p.pago) + '</td><td class="num gris" data-t="Locom.">' + (Number(p.locomocion) ? pesoV(p.locomocion) : '—') + '</td><td class="num gris" data-t="Total">' + pesoV(p.total) + '</td>' +
        '<td data-t="Estado">' + (p.estado === 'PLANIFICADO' ? est(p.fecha > hoy() ? 'Planificado' : 'Planificado · por confirmar', 'info') : est('No asistió', 'mal')) + '</td><td data-t=""><div class="botones">' + acc + '</div></td></tr>' });
    }
    filas.sort((a, b) => a.orden.localeCompare(b.orden));
    const tabs = (sucs.length > 1 ? [['TODAS', 'Todas']] : []).concat(sucs.map((s) => [s, s]));
    const e = editar || {};
    const sucForm = e.sucursal || (S.suc !== 'TODAS' && escribibles().indexOf(S.suc) >= 0 ? S.suc : escribibles()[0]);

    v.innerHTML = cabecera('Registro del día', esc(L.fechaLarga(f)) + ' · ' + esc(L.quincenaTxt(q)),
      '<div class="botones"><button class="btn" data-acc="dia" data-d="-1" aria-label="Día anterior">‹</button><label class="campo"><span class="sr">Fecha</span><input type="date" id="r-fecha" value="' + f + '" max="' + L.sumarDias(hoy(), 60) + '"></label>' +
      '<button class="btn" data-acc="dia" data-d="1" aria-label="Día siguiente">›</button>' + (f !== hoy() ? '<button class="btn" data-acc="hoy">Hoy</button>' : '') + '</div>' +
      (puedeReg ? '<button class="btn ama solo-movil" data-acc="ir-form">Registrar turno</button>' : '')) +
      (tabs.length > 1 ? '<div class="zona"><div class="pestanas" role="tablist" aria-label="Sucursal">' + tabs.map(([k, t]) => '<button type="button" role="tab" data-acc="suc" data-s="' + k + '" aria-selected="' + (S.suc === k) + '">' + esc(t) + '</button>').join('') + '</div></div>' : '') +
      '<section class="tarjetas" aria-label="Resumen">' +
      tarjeta('Turnos del día', String(turnos.length), turnos.length + ' registrados' + (plan.length ? ' · ' + plan.length + ' planificados' : '')) +
      tarjeta('Total del día', pesoV(totalDia), locDia && montos() ? 'incluye ' + L.peso(locDia) + ' de locomoción' : '') +
      tarjeta('Por confirmar asistencia', '<span style="color:' + (pend.length ? '#A35A00' : 'inherit') + '">' + pend.length + '</span>', pend.length ? 'planificados para este día' : 'nada pendiente') +
      tarjeta('Quincena ' + L.quincenaTxt(q, true), pesoV(totalQ), turnosQ.filter(filtro).length + (turnosQ.filter(filtro).length === 1 ? ' turno registrado' : ' turnos registrados'), true) + '</section>' +
      '<section class="rejilla"><div class="caja ancho2"><div class="caja-tit"><h2>Turnos · ' + esc(S.suc === 'TODAS' ? 'todas las sucursales' : S.suc) + '</h2>' +
      (tiene('Exportar') ? '<button class="btn chico" data-acc="exportar">Descargar día (Excel)</button>' : '') + '</div>' +
      (filas.length ? '<div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Persona</th><th>Sucursal</th><th>Horario</th><th class="num">Horas</th><th class="num">Pago</th><th class="num">Locom.</th><th class="num">Total</th><th>Estado</th><th><span class="sr">Acciones</span></th></tr></thead><tbody>' +
        filas.map((x) => x.html).join('') + '</tbody></table></div>' : '<div class="vacio">No hay turnos ' + (f === hoy() ? 'hoy' : 'este día') + '.</div>') + '</div>' +
      (puedeReg ? '<form class="caja" id="f-turno" autocomplete="off"><div class="caja-tit"><h2>' + (e.id ? 'Modificar turno N°' + e.id : 'Registrar turno') + '</h2>' + (e.id ? '<button type="button" class="btn chico" data-acc="nuevo">Nuevo</button>' : '') + '</div>' +
        (escribibles().length > 1 ? '<label class="campo">Sucursal<select name="sucursal">' + opciones(escribibles(), sucForm) + '</select></label>' : '<input type="hidden" name="sucursal" value="' + esc(sucForm) + '">') +
        '<label class="campo">Persona (nombre o RUT)<input name="nombre" required value="' + esc(e.nombre || '') + '" autocomplete="off"></label><div class="sugerencias oculto" id="sug"></div><div id="aviso-plan"></div>' +
        '<div class="campos2"><label class="campo">Entrada<input name="entrada" type="time" required value="' + esc(e.entrada || '09:00') + '"></label><label class="campo">Salida<input name="salida" type="time" required value="' + esc(e.salida || '15:00') + '"></label>' +
        '<label class="campo">Colación (min)<input name="colacion" type="number" min="0" step="5" value="' + esc(e.colacion || 0) + '"></label><label class="campo">Pago del turno<input name="pago" inputmode="numeric" required value="' + esc(e.pago != null ? e.pago : '') + '"></label></div>' +
        '<label class="campo">Locomoción (opcional)<input name="locomocion" inputmode="numeric" value="' + esc(Number(e.locomocion) ? e.locomocion : '') + '" placeholder="0"></label>' +
        '<label class="campo">Observación<input name="obs" value="' + esc(e.obs || '') + '" placeholder="Opcional"></label>' +
        '<div class="total-linea"><span id="t-horas">—</span><b id="t-total">—</b></div><input type="hidden" name="id" value="' + esc(e.id || '') + '">' +
        '<button class="btn ama" type="submit">' + (e.id ? 'Guardar cambios' : 'Guardar turno') + '</button>' +
        (f < hoy() && !tiene('EditarAnteriores') ? '<p class="nota">Ojo: registras en un día anterior; después no podrás modificarlo.</p>' : '') + '</form>' : '') + '</section>';

    $('#r-fecha', v).onchange = (ev) => { if (ev.target.value) { S.fecha = ev.target.value; vistaRegistro(v); } };
    v.onclick = async (ev) => {
      const b = ev.target.closest('[data-acc]'); if (!b) return;
      const a = b.dataset.acc;
      if (a === 'dia') { S.fecha = L.sumarDias(S.fecha, Number(b.dataset.d)); return vistaRegistro(v); }
      if (a === 'hoy') { S.fecha = hoy(); return vistaRegistro(v); }
      if (a === 'suc') { S.suc = b.dataset.s; return vistaRegistro(v); }
      if (a === 'nuevo') return vistaRegistro(v);
      if (a === 'ir-form') { const fr = $('#f-turno', v); fr.scrollIntoView({ behavior: 'smooth' }); fr.nombre.focus({ preventScroll: true }); return; }
      if (a === 'editar') return vistaRegistro(v, turnos.find((t) => String(t.id) === b.dataset.id));
      if (a === 'eliminar') {
        const t = turnos.find((x) => String(x.id) === b.dataset.id);
        if (!(await confirmar('Eliminar turno', '¿Eliminar el turno de ' + t.nombre + ' (' + t.sucursal + ', ' + L.fechaTxt(t.fecha) + ', ' + t.entrada + '–' + t.salida + ')?\nQueda anotado en el historial.', 'Eliminar', true))) return;
        try { await DB.eliminarTurno(t.id); mensaje('Turno eliminado.'); vistaRegistro(v); } catch (e2) { falla(e2); }
      }
      if (a === 'asistio') { const p = plan.find((x) => String(x.id) === b.dataset.id); if (await confirmarAsistencia(p, turnosQ)) vistaRegistro(v); }
      if (a === 'noasistio') { const p = plan.find((x) => String(x.id) === b.dataset.id); if (await marcarNoAsistio(p)) vistaRegistro(v); }
      if (a === 'exportar') descargarCSV('PartTime_' + f + '.csv', [['N°', 'Fecha', 'Sucursal', 'Nombre', 'RUT', 'Entrada', 'Salida', 'Colación', 'Horas', 'Pago', 'Locomoción', 'Total', 'Observación', 'Registrado por']]
        .concat(turnos.map((t) => [t.id, L.fechaTxt(t.fecha), t.sucursal, t.nombre, t.rut, t.entrada, t.salida, t.colacion, L.horasTxt(t.horas), montos() ? t.pago : '', montos() ? t.locomocion : '', montos() ? t.total : '', t.obs, t.creado_por])));
    };

    const form = $('#f-turno', v);
    if (!form) return;
    const recalcular = () => {
      const h = L.calcHoras(form.entrada.value, form.salida.value, form.colacion.value);
      $('#t-horas', v).textContent = h == null ? '—' : L.horasTxt(h) + ' h · total del turno';
      $('#t-total', v).textContent = L.peso(L.num(form.pago.value) + L.num(form.locomocion.value));
    };
    const avisoPlan = () => {
      const n = L.normNombre(form.nombre.value), p = pend.find((x) => L.normNombre(x.nombre) === n && x.sucursal === form.sucursal.value);
      $('#aviso-plan', v).innerHTML = p && !e.id ? '<div class="ayuda" style="background:#EAF1FA;color:var(--azul)"><b>Estaba planificada para este día</b> (' + p.entrada + '–' + p.salida + ', ' + pesoV(p.total) + '). Al guardar se confirma su asistencia.</div>' : '';
      if (p && !e.id && !form.pago.value) { form.entrada.value = p.entrada; form.salida.value = p.salida; form.pago.value = p.pago; form.locomocion.value = Number(p.locomocion) || ''; recalcular(); }
    };
    campoPersona(form.nombre, $('#sug', v), () => { avisoPlan(); form.entrada.focus(); });
    form.addEventListener('input', recalcular);
    form.nombre.addEventListener('change', avisoPlan);
    form.sucursal && form.sucursal.addEventListener && form.sucursal.addEventListener('change', avisoPlan);
    recalcular();
    if (!e.id) form.nombre.focus();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const per = nombreOficial(form.nombre.value);
      const t = { id: form.id.value ? Number(form.id.value) : null, fecha: f, sucursal: form.sucursal.value, nombre: per.nombre, rut: per.rut || (e.rut || ''),
        entrada: form.entrada.value, salida: form.salida.value, colacion: L.num(form.colacion.value), pago: L.num(form.pago.value), locomocion: L.num(form.locomocion.value), obs: form.obs.value.trim() };
      if (!t.nombre) return mensaje('Escribe el nombre de la persona.', true);
      if (L.calcHoras(t.entrada, t.salida, t.colacion) === 0) return mensaje('Revisa el horario: el turno queda en 0 horas.', true);
      if (!t.pago && !(await confirmar('Pago en cero', 'El pago del turno está en $0. ¿Guardar igual?'))) return;
      const repetido = turnos.find((x) => x.id !== t.id && L.normNombre(x.nombre) === L.normNombre(t.nombre) && x.sucursal === t.sucursal);
      if (repetido && !(await confirmar('Ya tiene un turno', t.nombre + ' ya tiene un turno este día en ' + t.sucursal + ' (' + repetido.entrada + '–' + repetido.salida + '). ¿Agregar otro?'))) return;
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const p = !t.id && pend.find((x) => L.normNombre(x.nombre) === L.normNombre(t.nombre) && x.sucursal === t.sucursal);
        if (p && p.fecha <= hoy() && planificables().indexOf(p.sucursal) >= 0) { await DB.confirmarPlan(p.id, t); mensaje('Turno guardado y asistencia confirmada.'); }
        else { await DB.guardarTurno(t); mensaje(t.id ? 'Cambios guardados.' : 'Turno guardado.'); }
        if (!L.buscarPersona(S.personas, t.nombre)) S.personas.push({ id: 'n' + Date.now(), nombre: t.nombre, rut: t.rut, activo: true, variantes: '' });
        vistaRegistro(v);
      } catch (e2) { falla(e2); btn.disabled = false; }
    });
  }

  async function confirmarAsistencia(p, turnosConocidos) {
    let turnos = turnosConocidos;
    if (!turnos) turnos = await DB.turnos({ desde: p.fecha, hasta: p.fecha, sucursal: p.sucursal });
    const ya = turnos.find((t) => t.fecha === p.fecha && t.sucursal === p.sucursal && L.normNombre(t.nombre) === L.normNombre(p.nombre));
    const r = await dialogo('Confirmar asistencia', '<p class="nota" style="margin:0"><b>' + esc(p.nombre) + '</b> · ' + esc(p.sucursal) + ' · ' + L.fechaTxt(p.fecha) + '</p>' +
      (ya ? '<label class="check"><input type="checkbox" name="enlazar" checked> Ya tiene el turno N°' + ya.id + ' registrado (' + ya.entrada + '–' + ya.salida + '): usar ese, no crear otro</label>' : '') +
      '<div class="campos2"><label class="campo">Entrada<input name="entrada" type="time" required value="' + p.entrada + '"></label><label class="campo">Salida<input name="salida" type="time" required value="' + p.salida + '"></label>' +
      '<label class="campo">Colación (min)<input name="colacion" type="number" min="0" step="5" value="' + Number(p.colacion || 0) + '"></label><label class="campo">Pago<input name="pago" inputmode="numeric" value="' + Number(p.pago) + '"></label></div>' +
      '<label class="campo">Locomoción<input name="locomocion" inputmode="numeric" value="' + (Number(p.locomocion) || '') + '"></label><label class="campo">Observación<input name="obs" value="' + esc(p.obs || '') + '"></label>',
    { boton: 'Asistió', validar: (d) => DB.confirmarPlan(p.id, { entrada: d.entrada, salida: d.salida, colacion: L.num(d.colacion), pago: L.num(d.pago), locomocion: L.num(d.locomocion), obs: d.obs }, d.enlazar && ya ? ya.id : null).then(() => null) });
    if (r) mensaje('Asistencia confirmada: ' + p.nombre + '.');
    return !!r;
  }
  async function marcarNoAsistio(p) {
    const r = await dialogo('No asistió', '<p class="nota" style="margin:0"><b>' + esc(p.nombre) + '</b> · ' + esc(p.sucursal) + ' · ' + L.fechaTxt(p.fecha) + '</p><label class="campo">Motivo (opcional)<input name="motivo" placeholder="Ej. avisó enfermo"></label>',
      { boton: 'Marcar no asistió', peligro: true, validar: (d) => DB.inasistencia(p.id, d.motivo).then(() => null) });
    if (r) mensaje('Anotado: ' + p.nombre + ' no asistió.');
    return !!r;
  }

  // ================================================================== PLANIFICADOR
  async function vistaPlanificador(v) {
    const sucs = visibles();
    if (sucs.indexOf(S.planSuc) < 0) S.planSuc = sucs[0];
    const suc = S.planSuc, desde = L.sumarDias(hoy(), -14), hasta = L.sumarDias(hoy(), 120);
    const [dias, planes] = await Promise.all([DB.dias({ desde, hasta }), DB.plan({ desde, hasta, sucursal: suc })]);
    const activos = dias.filter((d) => d.activo !== false && (Number((d.dotacion || {})[suc]) > 0 || planes.some((p) => p.fecha === d.fecha)));
    if (!S.planDia || !activos.some((d) => d.fecha === S.planDia)) S.planDia = (activos.find((d) => d.fecha >= hoy()) || activos[activos.length - 1] || {}).fecha || null;
    const puede = planificables().indexOf(suc) >= 0;
    const dia = activos.find((d) => d.fecha === S.planDia);
    const delDia = dia ? planes.filter((p) => p.fecha === dia.fecha) : [];
    const cob = dia ? L.cobertura(dia, planes, suc) : null;

    const lista = activos.map((d) => {
      const c = L.cobertura(d, planes, suc), pend = planes.filter((p) => p.fecha === d.fecha && p.estado === 'PLANIFICADO').length;
      const tipo = d.fecha < hoy() ? (pend ? 'aviso' : 'neu') : (c.asign >= c.pedida ? 'ok' : c.asign === 0 ? 'mal' : 'aviso');
      return '<button type="button" class="dia-btn" data-acc="dia" data-f="' + d.fecha + '" aria-pressed="' + (d.fecha === S.planDia) + '"><span><b>' + esc(L.diaSemana(d.fecha)) + ' ' + L.fechaTxt(d.fecha) + '</b><small>' + esc(d.nombre || '') + (d.fecha < hoy() && pend ? ' · ' + pend + ' por confirmar' : '') + '</small></span>' + est(c.asign + ' de ' + c.pedida, tipo) + '</button>';
    }).join('');

    const filas = delDia.map((p) => {
      const tipo = { 'PLANIFICADO': p.fecha <= hoy() ? 'aviso' : 'info', 'ASISTIÓ': 'ok', 'NO ASISTIÓ': 'mal', 'CANCELADO': 'neu' }[p.estado];
      const txt = p.estado === 'PLANIFICADO' ? (p.fecha <= hoy() ? 'Por confirmar' : 'Asignado') : p.estado === 'ASISTIÓ' ? 'Asistió · turno N°' + p.turno_id : p.estado === 'NO ASISTIÓ' ? 'No asistió' : 'Cancelado';
      const acc = [];
      if (puede && p.estado === 'PLANIFICADO') {
        if (p.fecha <= hoy()) acc.push('<button class="btn chico pri" data-acc="asistio" data-id="' + p.id + '">Asistió</button><button class="btn chico peligro" data-acc="noasistio" data-id="' + p.id + '">No asistió</button>');
        if (p.fecha >= hoy()) acc.push('<button class="btn chico" data-acc="editar" data-id="' + p.id + '">Editar</button><button class="btn chico peligro" data-acc="cancelar" data-id="' + p.id + '">Quitar</button>');
      }
      return '<tr><td class="fuerte" data-t="Persona">' + esc(p.nombre) + (p.motivo ? '<div class="nota">' + esc(p.motivo) + '</div>' : '') + '</td><td data-t="Horario">' + p.entrada + ' – ' + p.salida + '</td><td class="num" data-t="Pago">' + pesoV(p.total) + '</td><td data-t="Estado">' + est(txt, tipo) + '</td><td data-t="">' + '<div class="botones">' + acc.join('') + '</div></td></tr>';
    }).join('');
    const libres = cob ? Math.max(cob.pedida - delDia.filter((p) => p.estado !== 'CANCELADO').length, 0) : 0;
    const filasLibres = Array.from({ length: libres }, () => '<tr><td class="gris" data-t="Persona">Sin asignar</td><td class="gris" data-t="Horario">—</td><td class="num gris" data-t="Pago">—</td><td data-t="Estado">' + est('Libre', 'neu') + '</td><td></td></tr>').join('');
    const pct = cob && cob.pedida ? Math.min(100, Math.round(100 * cob.asign / cob.pedida)) : 0;

    v.innerHTML = cabecera('Planificador · ' + suc, 'La oficina define los días y la dotación. ' + (puede ? 'Tú asignas a las personas y confirmas si asistieron.' : 'Vista de consulta.'),
      sucs.length > 1 ? '<label class="campo">Sucursal<select id="p-suc">' + opciones(sucs, suc) + '</select></label>' : '') +
      '<section class="rejilla"><div class="caja"><h2>Días planificados</h2>' + (lista || '<div class="vacio">La oficina aún no define días' + (tiene('DiasPlan') ? '. <a href="#/dias">Definir días</a>' : '') + '.</div>') +
      '<div class="ayuda"><b style="color:var(--azul)">Cómo se usa:</b> desde hoy hacia adelante se asigna. Desde el mismo día hacia atrás se confirma “Asistió” o “No asistió”; al confirmar se crea el turno solo.</div></div>' +
      (dia ? '<div class="caja ancho2"><div class="caja-tit"><div style="flex:1"><h2 style="font-size:18px">' + esc(L.fechaLarga(dia.fecha)) + '</h2><p class="nota">' + esc(dia.nombre || '') + ' · dotación pedida: ' + cob.pedida + ' personas</p></div>' +
        est(cob.asign + ' de ' + cob.pedida + ' cubiertos', cob.asign >= cob.pedida ? 'ok' : 'aviso') +
        (puede && dia.fecha <= hoy() && delDia.filter((p) => p.estado === 'PLANIFICADO').length > 1 ? '<button class="btn chico pri" data-acc="todos">Asistieron todos</button>' : '') + '</div>' +
        '<div class="progreso"><div style="width:' + pct + '%;background:' + (cob.asign >= cob.pedida ? '#1F7A4A' : '#D99A00') + '"></div></div>' +
        '<div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Persona</th><th>Horario</th><th class="num">Pago</th><th>Estado</th><th><span class="sr">Acciones</span></th></tr></thead><tbody>' + filas + filasLibres + '</tbody></table></div>' +
        (puede && dia.fecha >= hoy() ? '<form id="f-plan" class="campos-auto ayuda" autocomplete="off"><label class="campo" style="grid-column:1/-1">Asignar persona<input name="nombre" required placeholder="Nombre o RUT"></label><div class="sugerencias oculto" id="sug" style="grid-column:1/-1"></div>' +
          '<label class="campo">Entrada<input name="entrada" type="time" required value="09:00"></label><label class="campo">Salida<input name="salida" type="time" required value="15:00"></label>' +
          '<label class="campo">Pago<input name="pago" inputmode="numeric" required></label><label class="campo">Locomoción<input name="locomocion" inputmode="numeric" placeholder="0"></label>' +
          '<label class="campo" style="grid-column:1/-1">Observación<input name="obs" placeholder="Opcional"></label><button class="btn ama" type="submit">Asignar</button></form>' : '') + '</div>' : '') + '</section>';

    const s = $('#p-suc', v); if (s) s.onchange = () => { S.planSuc = s.value; S.planDia = null; vistaPlanificador(v); };
    v.onclick = async (ev) => {
      const b = ev.target.closest('[data-acc]'); if (!b) return;
      const p = planes.find((x) => String(x.id) === b.dataset.id);
      if (b.dataset.acc === 'dia') { S.planDia = b.dataset.f; return vistaPlanificador(v); }
      if (b.dataset.acc === 'todos') {
        const pend = delDia.filter((x) => x.estado === 'PLANIFICADO');
        if (!(await confirmar('Asistieron todos', 'Se confirmará la asistencia de ' + pend.length + ' personas con el horario y pago planificados:\n' + pend.map((x) => '· ' + x.nombre + ' ' + x.entrada + '–' + x.salida).join('\n'), 'Confirmar todos'))) return;
        let n = 0;
        try {
          const ya = await DB.turnos({ desde: dia.fecha, hasta: dia.fecha, sucursal: suc });
          for (const x of pend) {
            const t = ya.find((y) => L.normNombre(y.nombre) === L.normNombre(x.nombre) && !planes.some((z) => z.turno_id === y.id));
            await DB.confirmarPlan(x.id, x, t ? t.id : null); n++;
          }
          mensaje(n + ' asistencias confirmadas.');
        } catch (e) { falla(e); }
        return vistaPlanificador(v);
      }
      if (b.dataset.acc === 'asistio' && await confirmarAsistencia(p)) return vistaPlanificador(v);
      if (b.dataset.acc === 'noasistio' && await marcarNoAsistio(p)) return vistaPlanificador(v);
      if (b.dataset.acc === 'cancelar' && await confirmar('Quitar asignación', '¿Quitar a ' + p.nombre + ' del ' + L.fechaTxt(p.fecha) + '?', 'Quitar', true)) {
        try { await DB.cancelarPlan(p.id, 'Quitado por ' + S.perfil.usuario); mensaje('Asignación quitada.'); vistaPlanificador(v); } catch (e) { falla(e); }
      }
      if (b.dataset.acc === 'editar') {
        const r = await dialogo('Editar asignación', '<p class="nota" style="margin:0"><b>' + esc(p.nombre) + '</b> · ' + L.fechaTxt(p.fecha) + '</p><div class="campos2"><label class="campo">Entrada<input name="entrada" type="time" value="' + p.entrada + '"></label><label class="campo">Salida<input name="salida" type="time" value="' + p.salida + '"></label>' +
          '<label class="campo">Pago<input name="pago" inputmode="numeric" value="' + Number(p.pago) + '"></label><label class="campo">Locomoción<input name="locomocion" inputmode="numeric" value="' + (Number(p.locomocion) || '') + '"></label></div><label class="campo">Observación<input name="obs" value="' + esc(p.obs) + '"></label>',
        { boton: 'Guardar', validar: (d) => DB.guardarPlan(Object.assign({}, p, { entrada: d.entrada, salida: d.salida, pago: L.num(d.pago), locomocion: L.num(d.locomocion), obs: d.obs })).then(() => null) });
        if (r) { mensaje('Asignación actualizada.'); vistaPlanificador(v); }
      }
    };
    const f = $('#f-plan', v);
    if (f) {
      campoPersona(f.nombre, $('#sug', v), () => f.entrada.focus());
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const per = nombreOficial(f.nombre.value);
        if (delDia.some((p) => p.estado !== 'CANCELADO' && L.normNombre(p.nombre) === L.normNombre(per.nombre)) && !(await confirmar('Ya está asignada', per.nombre + ' ya está asignada este día. ¿Asignarla otra vez?'))) return;
        try {
          await DB.guardarPlan({ fecha: dia.fecha, sucursal: suc, nombre: per.nombre, rut: per.rut, entrada: f.entrada.value, salida: f.salida.value, pago: L.num(f.pago.value), locomocion: L.num(f.locomocion.value), obs: f.obs.value.trim() });
          mensaje(per.nombre + ' asignada al ' + L.fechaTxt(dia.fecha) + '.'); vistaPlanificador(v);
        } catch (e) { falla(e); }
      });
    }
  }

  // ================================================================== DÍAS A PLANIFICAR (oficina)
  async function vistaDias(v) {
    const desde = L.sumarDias(hoy(), -30);
    const [dias, feriados, planes] = await Promise.all([DB.dias({ desde }), DB.feriados().catch(() => []), DB.plan({ desde })]);
    const filas = dias.map((d) => '<tr data-f="' + d.fecha + '"><td class="fuerte" data-t="Fecha">' + esc(L.diaSemana(d.fecha)) + ' ' + L.fechaTxt(d.fecha) + '</td><td data-t="Nombre"><input aria-label="Nombre del día" name="nombre" value="' + esc(d.nombre) + '" style="min-height:36px;border:1px solid var(--borde2);border-radius:8px;padding:0 8px;width:100%"></td>' +
      L.SUCURSALES.map((s) => { const c = L.cobertura(d, planes, s); return '<td class="num" data-t="' + s + '"><input aria-label="Dotación ' + s + '" name="' + s + '" type="number" min="0" value="' + Number((d.dotacion || {})[s] || 0) + '" style="width:64px;min-height:36px;border:1px solid var(--borde2);border-radius:8px;padding:0 6px"><div class="nota">' + c.asign + ' asignados</div></td>'; }).join('') +
      '<td data-t="Activo"><input type="checkbox" name="activo" aria-label="Activo"' + (d.activo !== false ? ' checked' : '') + '></td><td data-t=""><div class="botones"><button class="btn chico pri" data-acc="guardar">Guardar</button><button class="btn chico peligro" data-acc="borrar">Quitar</button></div></td></tr>').join('');
    v.innerHTML = cabecera('Días a planificar', 'Defines qué días se planifican (domingos, feriados) y cuántas personas necesita cada sucursal.',
      '<div class="botones"><button class="btn" data-acc="sugerir">Sugerir domingos y feriados</button></div>') +
      '<section class="rejilla"><div class="caja ancho2"><div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Fecha</th><th>Nombre</th>' + L.SUCURSALES.map((s) => '<th class="num">' + s + '</th>').join('') + '<th>Activo</th><th></th></tr></thead><tbody>' +
      (filas || '<tr><td colspan="7" class="vacio">Aún no hay días. Agrega uno o usa “Sugerir”.</td></tr>') + '</tbody></table></div></div>' +
      '<form class="caja" id="f-dia"><h2>Agregar día</h2><label class="campo">Fecha<input type="date" name="fecha" required min="' + hoy() + '"></label><label class="campo">Nombre<input name="nombre" placeholder="Ej. Domingo, Fiestas Patrias"></label>' +
      '<div class="campos2">' + L.SUCURSALES.map((s) => '<label class="campo">' + s + '<input type="number" min="0" name="' + s + '" value="2"></label>').join('') + '</div><button class="btn ama" type="submit">Agregar</button></form></section>';
    const f = $('#f-dia', v);
    f.fecha.addEventListener('change', () => { if (f.fecha.value && !f.nombre.value) { const fe = feriados.find((x) => x.fecha === f.fecha.value); f.nombre.value = fe ? fe.nombre : L.diaSemana(f.fecha.value).replace(/^./, (c) => c.toUpperCase()); } });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (dias.some((d) => d.fecha === f.fecha.value)) return mensaje('Ese día ya está en la lista.', true);
      const dot = {}; L.SUCURSALES.forEach((s) => { dot[s] = Number(f[s].value || 0); });
      try { await DB.guardarDia({ fecha: f.fecha.value, nombre: f.nombre.value.trim(), dotacion: dot, activo: true }); mensaje('Día agregado.'); vistaDias(v); } catch (e) { falla(e); }
    });
    v.onclick = async (ev) => {
      const b = ev.target.closest('[data-acc]'); if (!b) return;
      if (b.dataset.acc === 'sugerir') {
        const ya = new Set(dias.map((d) => d.fecha)), sug = [];
        for (let i = 0; i <= 60; i++) {
          const fe = L.sumarDias(hoy(), i), fer = feriados.find((x) => x.fecha === fe);
          if (ya.has(fe) || (fer && fer.abierto === false)) continue;
          if (fer || L.aFecha(fe).getDay() === 0) sug.push([fe, fer ? fer.nombre : 'Domingo']);
        }
        if (!sug.length) return mensaje('No hay domingos ni feriados nuevos en los próximos 60 días.');
        const r = await dialogo('Sugerir días', '<p class="nota" style="margin:0">Domingos y feriados de los próximos 60 días que aún no están:</p><div style="max-height:260px;overflow:auto">' +
          sug.map(([fe, n], i) => '<label class="check"><input type="checkbox" data-multi="1" name="s' + i + '" checked> ' + esc(L.diaSemana(fe)) + ' ' + L.fechaTxt(fe) + ' · ' + esc(n) + '</label>').join('') + '</div>' +
          '<div class="campos2">' + L.SUCURSALES.map((s) => '<label class="campo">Dotación ' + s + '<input type="number" min="0" name="' + s + '" value="2"></label>').join('') + '</div>', { boton: 'Agregar seleccionados' });
        if (!r) return;
        const dot = {}; L.SUCURSALES.forEach((s) => { dot[s] = Number(r[s] || 0); });
        try { for (let i = 0; i < sug.length; i++) if (r['s' + i]) await DB.guardarDia({ fecha: sug[i][0], nombre: sug[i][1], dotacion: dot, activo: true }); mensaje('Días agregados.'); vistaDias(v); } catch (e) { falla(e); }
        return;
      }
      const tr = b.closest('tr'), fe = tr.dataset.f, d = dias.find((x) => x.fecha === fe);
      if (b.dataset.acc === 'guardar') {
        const dot = {}; L.SUCURSALES.forEach((s) => { dot[s] = Number($('[name="' + s + '"]', tr).value || 0); });
        try { await DB.guardarDia({ fecha: fe, nombre: $('[name=nombre]', tr).value.trim(), dotacion: dot, activo: $('[name=activo]', tr).checked, obs: d.obs }); mensaje('Día guardado.'); } catch (e) { falla(e); }
      }
      if (b.dataset.acc === 'borrar') {
        const n = planes.filter((p) => p.fecha === fe && p.estado !== 'CANCELADO').length;
        if (!(await confirmar('Quitar día', '¿Quitar el ' + L.fechaTxt(fe) + ' de los días a planificar?' + (n ? '\nYa tiene ' + n + ' personas asignadas: mejor desmárcalo como inactivo.' : ''), 'Quitar', true))) return;
        try { await DB.eliminarDia(fe); vistaDias(v); } catch (e) { falla(e); }
      }
    };
  }

  // ================================================================== PAGOS QUINCENALES
  const ESTADO_PAGO = { 'PENDIENTE': 'neu', 'PARCIAL': 'aviso', 'PAGADO': 'ok', 'PAGADO DE MÁS': 'mal' };
  async function vistaPagos(v, filtro) {
    filtro = filtro || { estado: 'Todos', texto: '' };
    const qs = L.ultimasQuincenas(12);
    if (!S.quincena) S.quincena = qs[0].clave;
    const q = L.quincenaDeClave(S.quincena);
    const [turnos, abonos, personas] = await Promise.all([DB.turnos({ desde: q.desde, hasta: q.hasta }), DB.abonos(), DB.personas().catch(() => [])]);
    const filas = L.resumenQuincena(turnos, abonos, q);
    const vis = filas.filter((f) => (filtro.estado === 'Todos' || (filtro.estado === 'Con saldo' ? f.saldo > 0.5 : f.estado === filtro.estado)) && (!filtro.texto || L.normNombre(f.nombre).includes(L.normNombre(filtro.texto))));
    const tot = filas.reduce((s, f) => s + f.total, 0), pag = filas.reduce((s, f) => s + f.pagado, 0), conSaldo = filas.filter((f) => f.saldo > 0.5);
    let sel = filas.find((f) => f.nombre === S.pagoSel) || vis[0];
    const per = sel ? L.buscarPersona(personas, sel.nombre, sel.rut) : null;

    v.innerHTML = cabecera('Pagos quincenales', 'Cada persona suma lo trabajado en todas las sucursales. Un pago bloquea los cambios de esos turnos para los encargados.',
      '<label class="campo">Quincena<select id="g-q">' + opciones(qs.map((x) => [x.clave, L.quincenaTxt(x)]), S.quincena) + '</select></label><button class="btn" data-acc="revisar">Revisar antes de pagar</button>' + (tiene('Exportar') ? '<button class="btn" data-acc="exportar">Descargar (Excel)</button>' : '')) +
      '<section class="tarjetas">' + tarjeta('Total quincena', L.peso(tot), filas.length + ' personas · ' + turnos.length + ' turnos') + tarjeta('Pagado', '<span style="color:#1F7A4A">' + L.peso(pag) + '</span>', filas.filter((f) => f.estado === 'PAGADO').length + ' pagadas · ' + filas.filter((f) => f.estado === 'PARCIAL').length + ' con abono') +
      tarjeta('Saldo por pagar', L.peso(tot - pag), conSaldo.length + ' personas con saldo', true) + '</section>' +
      '<section class="rejilla"><div class="caja ancho2"><div class="caja-tit"><h2>Personas de la quincena</h2><label class="campo"><span class="sr">Estado</span><select id="g-est">' + opciones(['Todos', 'Con saldo', 'PENDIENTE', 'PARCIAL', 'PAGADO', 'PAGADO DE MÁS'], filtro.estado) + '</select></label>' +
      '<label class="campo"><span class="sr">Buscar persona</span><input type="search" id="g-txt" placeholder="Buscar persona" value="' + esc(filtro.texto) + '"></label></div>' +
      (vis.length ? '<div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Persona</th><th>Sucursales</th><th class="num">Días</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th><th>Estado</th></tr></thead><tbody>' +
        vis.map((f) => '<tr class="clic' + (sel && f.nombre === sel.nombre ? ' sel' : '') + '" data-acc="ver" data-n="' + esc(f.nombre) + '"><td class="fuerte" data-t="Persona"><button class="enlace" data-acc="ver" data-n="' + esc(f.nombre) + '">' + esc(f.nombre) + '</button></td><td class="gris" data-t="Sucursales">' + esc(f.sucursales) + '</td><td class="num" data-t="Días">' + f.dias + '</td>' +
          '<td class="num" data-t="Total">' + L.peso(f.total) + '</td><td class="num gris" data-t="Pagado">' + L.peso(f.pagado) + '</td><td class="num fuerte" data-t="Saldo">' + L.peso(f.saldo) + '</td><td data-t="Estado">' + est(f.estado === 'PARCIAL' ? 'Abono' : f.estado.charAt(0) + f.estado.slice(1).toLowerCase(), ESTADO_PAGO[f.estado]) + '</td></tr>').join('') +
        '</tbody></table></div>' : '<div class="vacio">No hay personas con ese filtro en esta quincena.</div>') + '</div>' +
      (sel ? '<div class="caja" id="detalle"><div><h2>' + esc(sel.nombre) + '</h2><p class="nota">' + esc(L.quincenaTxt(q)) + (per && per.banco ? ' · ' + esc(per.banco) + ' ' + esc(per.tipo_cuenta) + ' ' + esc(per.cuenta) + (per.rut ? ' · RUT ' + esc(per.rut) : '') : '') + '</p></div>' +
        '<div>' + sel.turnos.map((t) => '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--linea)"><span class="gris" style="width:48px">' + L.fechaTxt(t.fecha).slice(0, 5) + '</span><span style="flex:1;font-weight:600">' + esc(t.sucursal) + '</span><span>' + L.peso(t.total) + '</span></div>').join('') + '</div>' +
        (sel.abonos.length ? '<div><b class="nota">Pagos</b>' + sel.abonos.map((a) => '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--linea)' + (a.estado === 'ANULADO' ? ';text-decoration:line-through;color:var(--gris)' : '') + '"><span style="flex:1">N°' + a.id + ' · ' + L.fechaTxt(a.fecha_pago) + (a.comprobante ? ' · MP ' + esc(a.comprobante) : '') + '<div class="nota">' + esc(a.obs) + '</div></span><b>' + L.peso(a.monto) + '</b>' +
          (a.estado === 'VIGENTE' && tiene('AnularPago') ? '<button class="btn chico peligro" data-acc="anular" data-id="' + a.id + '">Anular</button>' : '') + '</div>').join('') + '</div>' : '') +
        '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;text-align:center"><div class="ayuda"><div>Total</div><b>' + L.peso(sel.total) + '</b></div><div class="ayuda"><div>Pagado</div><b>' + L.peso(sel.pagado) + '</b></div><div class="ayuda" style="background:var(--azul);color:#fff"><div>Saldo</div><b>' + L.peso(sel.saldo) + '</b></div></div>' +
        (sel.saldo > 0.5 && tiene('RegistrarPago') ? '<form id="f-pago" style="display:flex;flex-direction:column;gap:10px"><div class="campos2"><label class="campo">Monto a pagar<input name="monto" inputmode="numeric" required value="' + Math.round(sel.saldo) + '"></label><label class="campo">Fecha de pago<input type="date" name="fecha" required value="' + hoy() + '"></label></div>' +
          '<label class="campo">Medio / observación<input name="obs" value="Transferencia"></label><label class="campo">N° transacción / comprobante<input name="comp" placeholder="Opcional (ej. ID de Mercado Pago)"></label>' +
          '<button class="btn ama" type="submit">Registrar pago</button><p class="nota">Si pagas menos que el saldo queda como abono y el resto sigue pendiente.</p></form>' : '<div class="ayuda">' + (sel.saldo < -0.5 ? 'Se pagó ' + L.peso(-sel.saldo) + ' de más: revisa los pagos.' : sel.saldo > 0.5 ? 'Saldo pendiente de ' + L.peso(sel.saldo) + '.' : 'Quincena pagada completa.') + '</div>') + '</div>' : '') + '</section>';

    $('#g-q', v).onchange = (e) => { S.quincena = e.target.value; S.pagoSel = null; vistaPagos(v, filtro); };
    $('#g-est', v).onchange = (e) => vistaPagos(v, { estado: e.target.value, texto: filtro.texto });
    let tTxt; $('#g-txt', v).oninput = (e) => { clearTimeout(tTxt); tTxt = setTimeout(() => vistaPagos(v, { estado: filtro.estado, texto: e.target.value }).then(() => { const i = $('#g-txt', v); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 350); };
    v.onclick = async (ev) => {
      const b = ev.target.closest('[data-acc]'); if (!b) return;
      if (b.dataset.acc === 'ver') { S.pagoSel = b.dataset.n; await vistaPagos(v, filtro); const d = $('#detalle', v); if (d && window.innerWidth < 900) d.scrollIntoView({ behavior: 'smooth' }); return; }
      if (b.dataset.acc === 'revisar') {
        const [planes, pers] = await Promise.all([DB.plan({ desde: q.desde, hasta: q.hasta }), DB.personas().catch(() => personas)]);
        const lista = L.revisarQuincena(turnos, planes, pers, q);
        const tipo = (t) => /duplicado|cruzan|sin confirmar/.test(t) ? 'mal' : /0/.test(t) ? 'aviso' : 'neu';
        await dialogo('Revisar ' + L.quincenaTxt(q), lista.length ? '<p class="nota" style="margin:0">' + lista.length + ' cosas que conviene corregir antes de pagar:</p><div style="max-height:55vh;overflow:auto"><table><tbody>' +
          lista.map((x) => '<tr><td>' + est(x[0], tipo(x[0])) + '</td><td class="gris" style="white-space:nowrap">' + L.fechaTxt(x[1]).slice(0, 5) + ' ' + esc(x[2]) + '</td><td><b>' + esc(x[3]) + '</b><div class="nota">' + esc(x[4]) + '</div></td></tr>').join('') + '</tbody></table></div>'
          : '<p style="margin:0">Todo en orden: no hay planificados sin confirmar, turnos duplicados, pagos en $0 ni personas fuera de la base.</p>', { boton: 'Cerrar', sinCancelar: true });
        return;
      }
      if (b.dataset.acc === 'anular') {
        const a = sel.abonos.find((x) => String(x.id) === b.dataset.id);
        if (!(await confirmar('Anular pago', '¿Anular el pago N°' + a.id + ' de ' + a.nombre + ' por ' + L.peso(a.monto) + '?\nEl saldo de la quincena vuelve a quedar pendiente.', 'Anular', true))) return;
        try { await DB.anularAbono(a.id); mensaje('Pago anulado.'); vistaPagos(v, filtro); } catch (e) { falla(e); }
      }
      if (b.dataset.acc === 'exportar') {
        const rows = [['Quincena', L.quincenaTxt(q)], [], ['Nombre', 'RUT', 'Sucursales', 'Días', 'Horas', 'Pagos', 'Locomoción', 'Total', 'Pagado', 'Saldo', 'Estado', 'Banco', 'Tipo de cuenta', 'N° de cuenta']];
        filas.forEach((f) => { const p = L.buscarPersona(personas, f.nombre, f.rut) || {}; rows.push([f.nombre, f.rut || p.rut, f.sucursales, f.dias, L.horasTxt(f.horas), f.pagos, f.locomocion, f.total, f.pagado, f.saldo, f.estado, p.banco, p.tipo_cuenta, p.cuenta]); });
        rows.push([], ['Detalle por turno'], ['Nombre', 'Fecha', 'Sucursal', 'Entrada', 'Salida', 'Horas', 'Pago', 'Locomoción', 'Total']);
        filas.forEach((f) => f.turnos.forEach((t) => rows.push([f.nombre, L.fechaTxt(t.fecha), t.sucursal, t.entrada, t.salida, L.horasTxt(t.horas), t.pago, t.locomocion, t.total])));
        descargarCSV('PartTime_Pagos_' + q.clave + '.csv', rows);
      }
    };
    const fp = $('#f-pago', v);
    if (fp) fp.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const monto = L.num(fp.monto.value);
      if (monto <= 0) return mensaje('El monto debe ser mayor que cero.', true);
      if (monto > sel.saldo + 0.5 && !(await confirmar('Monto mayor que el saldo', 'Vas a pagar ' + L.peso(monto) + ' y el saldo es ' + L.peso(sel.saldo) + '. ¿Registrar igual?'))) return;
      try {
        const id = await DB.registrarAbono({ nombre: sel.nombre, rut: sel.rut || (per && per.rut) || '', quincena: q.clave, monto, fecha_pago: fp.fecha.value, obs: fp.obs.value.trim(), comprobante: fp.comp.value.trim() });
        mensaje('Pago N°' + id + ' registrado: ' + sel.nombre + ' ' + L.peso(monto) + '.'); vistaPagos(v, filtro);
      } catch (e) { falla(e); }
    });
  }

  // ================================================================== CONCILIACIÓN MERCADO PAGO
  async function vistaConciliacion(v) {
    const c = S.conc;
    const tabs = c ? [['Transferencias a part-time', c.res.partTime.length], ['Pagos sin respaldo', c.res.sinRespaldo.length], ['Otras transferencias', c.res.otras.length]] : [];
    const ESTC = { 'SUGERIDO': 'info', 'CONCILIADO': 'ok', 'YA REGISTRADO': 'ok', 'SIN SALDO': 'mal' };
    let tabla = '';
    if (c && S.concTab === 0) tabla = '<table class="tarjetas-movil"><thead><tr><th><span class="sr">Elegir</span></th><th>Fecha</th><th>Destinatario en la cartola</th><th>Persona</th><th class="num">Monto</th><th>Se aplica a</th><th>Estado</th></tr></thead><tbody>' +
      c.res.partTime.map((f, i) => '<tr><td data-t="">' + (f.estado === 'SUGERIDO' && tiene('RegistrarPago') ? '<input type="checkbox" class="c-sel" data-i="' + i + '" aria-label="Elegir"' + (c.marcadas.has(i) ? ' checked' : '') + ' style="width:20px;height:20px">' : '') + '</td><td class="gris" data-t="Fecha">' + L.fechaTxt(f.fecha) + '</td>' +
        '<td data-t="Destinatario" style="font-family:Consolas,monospace;font-size:13px">' + esc(f.destinatario) + '</td><td class="fuerte" data-t="Persona">' + esc(f.persona) + '<div class="nota">calce ' + f.calce + '</div></td><td class="num fuerte" data-t="Monto">' + L.peso(f.monto) + '</td>' +
        '<td data-t="Se aplica a" style="font-size:13px">' + esc(f.detalle) + '</td><td data-t="Estado">' + est(f.estado === 'SUGERIDO' ? 'Sugerido' : f.estado.charAt(0) + f.estado.slice(1).toLowerCase(), ESTC[f.estado]) + '</td></tr>').join('') + '</tbody></table>';
    if (c && S.concTab === 1) tabla = '<p class="nota">Pagos anotados en el sistema con fecha dentro de la cartola, que no aparecen como transferencia (pueden ser efectivo u otra cuenta).</p><table class="tarjetas-movil"><thead><tr><th>N° pago</th><th>Fecha</th><th>Persona</th><th class="num">Monto</th><th>Quincena</th><th>Medio</th></tr></thead><tbody>' +
      c.res.sinRespaldo.map((a) => '<tr><td data-t="N°">' + a.id + '</td><td data-t="Fecha">' + L.fechaTxt(a.fecha_pago) + '</td><td class="fuerte" data-t="Persona">' + esc(a.nombre) + '</td><td class="num" data-t="Monto">' + L.peso(a.monto) + '</td><td data-t="Quincena">' + esc(L.quincenaTxt(a, true)) + '</td><td class="gris" data-t="Medio">' + esc(a.obs) + '</td></tr>').join('') + '</tbody></table>';
    if (c && S.concTab === 2) tabla = '<p class="nota">Transferencias cuyo destinatario no se reconoce como part-time. ' + (tiene('EditarPersonas') ? 'Si una sí lo es, vincúlala a la persona y desde ahí se reconoce sola.' : '') + '</p><table class="tarjetas-movil"><thead><tr><th>Fecha</th><th>Destinatario</th><th class="num">Monto</th><th></th></tr></thead><tbody>' +
      c.res.otras.map((t, i) => '<tr><td class="gris" data-t="Fecha">' + L.fechaTxt(t.fecha) + '</td><td data-t="Destinatario" style="font-family:Consolas,monospace;font-size:13px">' + esc(t.destinatario || '(sin nombre)') + '</td><td class="num" data-t="Monto">' + L.peso(t.monto) + '</td><td data-t="">' + (tiene('EditarPersonas') && t.destinatario ? '<button class="btn chico" data-acc="vincular" data-i="' + i + '">Vincular a persona</button>' : '') + '</td></tr>').join('') + '</tbody></table>';
    const cuenta = (e) => c ? c.res.partTime.filter((f) => f.estado === e).length : 0;
    const sinComp = c ? c.res.partTime.filter((f) => f.estado === 'CONCILIADO' && f.idPago) : [];

    v.innerHTML = cabecera('Conciliar con Mercado Pago', 'Sube el estado de cuenta (account_statement…csv) y se cruza cada transferencia con lo que se debe a cada part-time.') +
      '<section class="zona"><label class="caja" style="flex-direction:row;flex-wrap:wrap;align-items:center;border:2px dashed #9FB3CA;cursor:pointer">' +
      '<svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1D4E89" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"></path><path d="M14 3v6h6"></path><path d="M12 18v-6M9 15l3-3 3 3"></path></svg>' +
      '<span style="flex:1 1 240px"><b style="color:var(--azul)">' + (c ? esc(c.archivo) : 'Elegir estado de cuenta (.csv)') + '</b><br><span class="nota">' + (c ? 'Período ' + L.fechaTxt(c.cart.desde) + ' al ' + L.fechaTxt(c.cart.hasta) + ' · ' + c.cart.totalMovs + ' movimientos · ' + c.cart.transferencias.length + ' transferencias enviadas. Haz clic para cambiarlo.' : 'Mercado Pago → Tu dinero → Reportes → Estado de cuenta. El archivo no sale de este equipo: se lee aquí.') + '</span></span>' +
      '<input type="file" id="c-arch" accept=".csv,text/csv" class="sr"><span class="btn">' + (c ? 'Cambiar archivo' : 'Elegir archivo') + '</span></label></section>' +
      (c ? '<section class="tarjetas">' + tarjeta('Transferencias a part-time', String(c.res.partTime.length), 'de ' + c.cart.transferencias.length + ' enviadas') + tarjeta('Sugeridas para registrar', '<span style="color:var(--azul2)">' + cuenta('SUGERIDO') + '</span>', 'calzan con un saldo pendiente') +
        tarjeta('Ya registradas', '<span style="color:#1F7A4A">' + (cuenta('CONCILIADO') + cuenta('YA REGISTRADO')) + '</span>', cuenta('CONCILIADO') + ' sin N° de transacción guardado') + tarjeta('Pagos sin respaldo', '<span style="color:#A3330F">' + c.res.sinRespaldo.length + '</span>', 'anotados, no están en la cartola') + '</section>' +
        '<section class="zona"><div class="caja"><div class="botones"><div class="pestanas" role="tablist">' + tabs.map(([t, n], i) => '<button type="button" role="tab" data-acc="tab" data-i="' + i + '" aria-selected="' + (S.concTab === i) + '">' + t + ' (' + n + ')</button>').join('') + '</div><span style="flex:1"></span>' +
        (S.concTab === 0 ? (tiene('RegistrarPago') ? '<button class="btn" data-acc="todas">Seleccionar sugeridas</button><button class="btn ama" data-acc="registrar">Registrar pagos seleccionados</button>' : '') + (sinComp.length ? '<button class="btn" data-acc="comp">Guardar N° de transacción (' + sinComp.length + ')</button>' : '') : '') +
        (tiene('Exportar') ? '<button class="btn" data-acc="exportar">Descargar (Excel)</button>' : '') + '</div><div class="tabla-caja">' + tabla + '</div></div></section>' : '');

    $('#c-arch', v).onchange = async (e) => {
      const arch = e.target.files[0]; if (!arch) return;
      try {
        const cart = L.leerCartolaMP(await arch.text());
        mensaje('Leyendo pagos y turnos…');
        await recalcularConc(cart, arch.name);
        S.concTab = 0; vistaConciliacion(v);
      } catch (ex) { falla(ex); }
    };
    v.onchange = (e) => { const x = e.target.closest('.c-sel'); if (x) { const i = Number(x.dataset.i); x.checked ? c.marcadas.add(i) : c.marcadas.delete(i); } };
    v.onclick = async (ev) => {
      const b = ev.target.closest('[data-acc]'); if (!b) return;
      const a = b.dataset.acc;
      if (a === 'tab') { S.concTab = Number(b.dataset.i); return vistaConciliacion(v); }
      if (a === 'todas') { c.res.partTime.forEach((f, i) => { if (f.estado === 'SUGERIDO') c.marcadas.add(i); }); return vistaConciliacion(v); }
      if (a === 'registrar') {
        const elegidas = [...c.marcadas].map((i) => c.res.partTime[i]).filter((f) => f && f.estado === 'SUGERIDO');
        if (!elegidas.length) return mensaje('Marca las transferencias que quieres registrar.', true);
        const movs = elegidas.reduce((s, f) => s.concat(f.asignacion.map((x) => Object.assign({}, x, { fecha_pago: f.fecha, comprobante: f.id }))), []);
        if (!(await confirmar('Registrar pagos', 'Se registrarán ' + movs.length + ' pagos por ' + L.peso(movs.reduce((s, x) => s + x.monto, 0)) + ', con su N° de transacción de Mercado Pago. ¿Continuar?', 'Registrar'))) return;
        try { for (const m of movs) await DB.registrarAbono({ nombre: m.nombre, rut: m.rut, quincena: m.quincena, monto: m.monto, fecha_pago: m.fecha_pago, obs: 'Mercado Pago · transferencia ' + m.comprobante, comprobante: m.comprobante }); mensaje(movs.length + ' pagos registrados.'); }
        catch (e) { falla(e); }
        await recalcularConc(c.cart, c.archivo); return vistaConciliacion(v);
      }
      if (a === 'comp') {
        try { for (const f of sinComp) await DB.marcarComprobante(f.idPago, f.id); mensaje('N° de transacción guardado en ' + sinComp.length + ' pagos.'); } catch (e) { falla(e); }
        await recalcularConc(c.cart, c.archivo); return vistaConciliacion(v);
      }
      if (a === 'vincular') {
        const t = c.res.otras[Number(b.dataset.i)];
        const lista = (await DB.personas()).filter((p) => p.activo !== false);
        const r = await dialogo('Vincular destinatario', '<p class="nota" style="margin:0">“<b>' + esc(t.destinatario) + '</b>” es esta persona (se guarda como otro nombre suyo):</p><label class="campo">Persona<select name="p" required><option value="">Elegir…</option>' + opciones(lista.map((p) => [p.id, p.nombre]), '') + '</select></label>', { boton: 'Vincular' });
        if (!r || !r.p) return;
        const p = lista.find((x) => String(x.id) === r.p);
        try { await DB.guardarPersona(Object.assign({}, p, { variantes: L.variantes(p).slice(1).concat([t.destinatario]).filter((x, i, arr) => arr.findIndex((y) => L.normNombre(y) === L.normNombre(x)) === i).join('|') })); S.personas = await DB.personasLista(); mensaje('Vinculado.'); }
        catch (e) { falla(e); }
        await recalcularConc(c.cart, c.archivo); return vistaConciliacion(v);
      }
      if (a === 'exportar') {
        const rows = [['Conciliación Mercado Pago', L.fechaTxt(c.cart.desde) + ' al ' + L.fechaTxt(c.cart.hasta)], [], ['Fecha', 'ID transacción', 'Destinatario', 'Persona', 'Calce', 'Monto', 'Estado', 'Detalle']];
        c.res.partTime.forEach((f) => rows.push([L.fechaTxt(f.fecha), f.id, f.destinatario, f.persona, f.calce, f.monto, f.estado, f.detalle]));
        rows.push([], ['Pagos sin respaldo'], ['N° pago', 'Fecha', 'Persona', 'Monto', 'Medio']);
        c.res.sinRespaldo.forEach((x) => rows.push([x.id, L.fechaTxt(x.fecha_pago), x.nombre, x.monto, x.obs]));
        rows.push([], ['Otras transferencias'], ['Fecha', 'ID transacción', 'Destinatario', 'Monto']);
        c.res.otras.forEach((t) => rows.push([L.fechaTxt(t.fecha), t.id, t.destinatario, t.monto]));
        descargarCSV('Conciliacion_MP_' + c.cart.desde + '_' + c.cart.hasta + '.csv', rows);
      }
    };
  }
  async function recalcularConc(cart, archivo) {
    const desde = L.quincenaDe(L.sumarDias(cart.desde, -120)).desde;
    const [turnos, abonos, personas] = await Promise.all([DB.turnos({ desde }), DB.abonos(), DB.personas()]);
    S.conc = { cart, archivo, res: L.conciliar(cart, personas, turnos, abonos), marcadas: new Set() };
  }

  // ================================================================== PERSONAS
  const BANCOS = ['BancoEstado', 'Banco de Chile', 'Banco Santander', 'BCI', 'Scotiabank', 'Banco Itaú', 'Banco Falabella', 'Banco Ripley', 'Banco Security', 'Banco BICE', 'Banco Consorcio', 'Coopeuch', 'Mercado Pago', 'Tenpo', 'Prepago Los Héroes'];
  const TIPOS = ['Cuenta RUT', 'Cuenta Vista', 'Cuenta Corriente', 'Cuenta de Ahorro', 'Chequera Electrónica'];
  async function vistaPersonas(v, texto, selId) {
    const lista = await DB.personas();
    const t = L.normNombre(texto || '');
    const vis = lista.filter((p) => !t || L.variantes(p).some((x) => L.normNombre(x).includes(t)) || L.normRut(p.rut).includes(L.normRut(texto)));
    const p = selId === 'nueva' ? { activo: true } : lista.find((x) => x.id === selId) || null;
    const campo = (k, tit, extra) => '<label class="campo">' + tit + '<input name="' + k + '" value="' + esc(p[k] || '') + '"' + (extra || '') + '></label>';
    const edita = tiene('EditarPersonas');
    v.innerHTML = cabecera('Personas', lista.length + ' part-time en la base. Los datos bancarios solo los ve quien tiene permiso de Personas o Pagos.', edita ? '<button class="btn ama" data-acc="nueva">Agregar persona</button>' : '') +
      '<section class="rejilla"><div class="caja ancho2"><label class="campo"><span class="sr">Buscar</span><input type="search" id="p-txt" placeholder="Buscar por nombre o RUT" value="' + esc(texto || '') + '"></label>' +
      '<div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Nombre</th><th>RUT</th><th>Teléfono</th><th>Banco</th><th>Estado</th></tr></thead><tbody>' +
      vis.map((x) => '<tr class="clic' + (p && p.id === x.id ? ' sel' : '') + '" data-acc="ver" data-id="' + x.id + '"><td class="fuerte" data-t="Nombre"><button class="enlace" data-acc="ver" data-id="' + x.id + '">' + esc(x.nombre) + '</button></td><td data-t="RUT">' + esc(x.rut) + '</td><td data-t="Teléfono">' + esc(x.telefono) + '</td><td class="gris" data-t="Banco">' + esc(x.banco) + '</td><td data-t="Estado">' + (x.activo !== false ? est('Activo', 'ok') : est('Inactivo', 'neu')) + '</td></tr>').join('') +
      '</tbody></table></div></div>' +
      (p ? '<form class="caja" id="f-per"><h2>' + (p.id ? 'Editar persona' : 'Nueva persona') + '</h2>' + campo('nombre', 'Nombre completo', ' required') + '<div class="campos2">' + campo('rut', 'RUT') + campo('telefono', 'Teléfono', ' inputmode="tel"') + '</div>' + campo('correo', 'Correo', ' type="email"') + campo('direccion', 'Dirección') +
        '<div class="campos2"><label class="campo">Banco<input name="banco" list="l-bancos" value="' + esc(p.banco || '') + '"></label><label class="campo">Tipo de cuenta<select name="tipo_cuenta"><option value=""></option>' + opciones(TIPOS, p.tipo_cuenta) + '</select></label></div>' +
        campo('cuenta', 'N° de cuenta') + '<label class="campo">Otros nombres (como aparece en transferencias), separados por |<input name="variantes" value="' + esc(p.variantes || '') + '"></label>' + campo('obs', 'Observación') +
        '<label class="check"><input type="checkbox" name="activo"' + (p.activo !== false ? ' checked' : '') + '> Activo (aparece al registrar)</label><datalist id="l-bancos">' + BANCOS.map((b) => '<option value="' + b + '"></option>').join('') + '</datalist>' +
        (edita ? '<button class="btn ama" type="submit">Guardar</button>' : '<p class="nota">Solo consulta: no tienes permiso para modificar personas.</p>') + '</form>' : '<div class="caja"><p class="nota">Elige una persona para ver' + (edita ? ' o editar' : '') + ' sus datos.</p></div>') + '</section>';
    let tt; $('#p-txt', v).oninput = (e) => { clearTimeout(tt); tt = setTimeout(() => vistaPersonas(v, e.target.value, selId).then(() => { const i = $('#p-txt', v); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 300); };
    v.onclick = (ev) => { const b = ev.target.closest('[data-acc]'); if (!b) return; if (b.dataset.acc === 'nueva') vistaPersonas(v, texto, 'nueva'); if (b.dataset.acc === 'ver') vistaPersonas(v, texto, Number(b.dataset.id)); };
    const f = $('#f-per', v);
    if (f && !edita) f.querySelectorAll('input, select').forEach((x) => { x.disabled = true; });
    if (f && edita) f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const d = {}; new FormData(f).forEach((x, k) => { d[k] = String(x).trim(); }); d.activo = f.activo.checked;
      d.nombre = L.nombrePropio(d.nombre); d.correo = d.correo.toLowerCase();
      if (d.rut) { const r = L.formatearRut(d.rut); if (!r) return mensaje('El RUT no es válido (revisa el dígito verificador).', true); d.rut = r; }
      try { const g = await DB.guardarPersona(Object.assign({}, p, d)); S.personas = await DB.personasLista(); mensaje('Datos guardados.'); vistaPersonas(v, texto, g.id); } catch (e) { falla(e); }
    });
  }

  // ================================================================== REPORTES
  async function vistaReportes(v, mes) {
    mes = mes || hoy().slice(0, 7);
    const desde = mes + '-01', hasta = L.iso(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0));
    const [turnos, planes] = await Promise.all([DB.turnos({ desde, hasta }), DB.plan({ desde, hasta })]);
    const porPer = new Map();
    turnos.forEach((t) => { const k = t.nombre; const x = porPer.get(k) || { nombre: k, turnos: 0, horas: 0, total: 0, sucs: new Set() }; x.turnos++; x.horas += Number(t.horas); x.total += Number(t.total); x.sucs.add(t.sucursal); porPer.set(k, x); });
    const porSuc = visibles().map((s) => { const ts = turnos.filter((t) => t.sucursal === s); return { s, n: ts.length, h: ts.reduce((a, t) => a + Number(t.horas), 0), tot: ts.reduce((a, t) => a + Number(t.total), 0) }; });
    const asis = new Map();
    planes.filter((p) => p.estado !== 'CANCELADO' && p.fecha <= hoy()).forEach((p) => { const x = asis.get(p.nombre) || { nombre: p.nombre, plan: 0, si: 0, no: 0, pend: 0 }; x.plan++; if (p.estado === 'ASISTIÓ') x.si++; else if (p.estado === 'NO ASISTIÓ') x.no++; else x.pend++; asis.set(p.nombre, x); });
    const costoPlan = planes.filter((p) => p.estado !== 'CANCELADO').reduce((a, p) => a + Number(p.total), 0);
    const costoReal = turnos.filter((t) => planes.some((p) => p.turno_id === t.id)).reduce((a, t) => a + Number(t.total), 0);
    const meses = []; for (let i = 0; i < 12; i++) { const d = new Date(Number(hoy().slice(0, 4)), Number(hoy().slice(5, 7)) - 1 - i, 1); meses.push([L.iso(d).slice(0, 7), L.MESES[d.getMonth()] + ' ' + d.getFullYear()]); }
    const pers = [...porPer.values()].sort((a, b) => b.total - a.total);
    v.innerHTML = cabecera('Reportes', 'Resumen del mes y cumplimiento de la planificación.', '<label class="campo">Mes<select id="r-mes">' + opciones(meses, mes) + '</select></label>' + (tiene('Exportar') ? '<button class="btn" data-acc="exportar">Descargar (Excel)</button>' : '')) +
      '<section class="tarjetas">' + porSuc.map((x) => tarjeta(x.s, pesoV(x.tot), x.n + ' turnos · ' + L.horasTxt(x.h) + ' h')).join('') + tarjeta('Planificado vs real', pesoV(costoReal), 'planificado ' + pesoV(costoPlan), true) + '</section>' +
      '<section class="rejilla"><div class="caja ancho2"><h2>Por persona</h2><div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Persona</th><th>Sucursales</th><th class="num">Turnos</th><th class="num">Horas</th><th class="num">Total</th></tr></thead><tbody>' +
      pers.map((x) => '<tr><td class="fuerte" data-t="Persona">' + esc(x.nombre) + '</td><td class="gris" data-t="Sucursales">' + esc([...x.sucs].join(', ')) + '</td><td class="num" data-t="Turnos">' + x.turnos + '</td><td class="num" data-t="Horas">' + L.horasTxt(x.horas) + '</td><td class="num fuerte" data-t="Total">' + pesoV(x.total) + '</td></tr>').join('') +
      '</tbody></table></div></div><div class="caja"><h2>Asistencia a lo planificado</h2>' + (asis.size ? '<table><thead><tr><th>Persona</th><th class="num">Plan.</th><th class="num">Asistió</th><th class="num">Faltó</th></tr></thead><tbody>' +
        [...asis.values()].sort((a, b) => b.no - a.no || b.plan - a.plan).map((x) => '<tr><td>' + esc(x.nombre) + '</td><td class="num">' + x.plan + '</td><td class="num">' + x.si + '</td><td class="num" style="color:' + (x.no ? 'var(--mal)' : 'inherit') + '">' + x.no + (x.pend ? ' <span class="nota">(' + x.pend + ' sin confirmar)</span>' : '') + '</td></tr>').join('') + '</tbody></table>' : '<p class="nota">No hay planificación en este mes.</p>') + '</div></section>';
    $('#r-mes', v).onchange = (e) => vistaReportes(v, e.target.value);
    v.onclick = (ev) => {
      if (!ev.target.closest('[data-acc=exportar]')) return;
      descargarCSV('PartTime_Resumen_' + mes + '.csv', [['Persona', 'Sucursales', 'Turnos', 'Horas', 'Total']].concat(pers.map((x) => [x.nombre, [...x.sucs].join(', '), x.turnos, L.horasTxt(x.horas), montos() ? x.total : ''])));
    };
  }

  // ================================================================== HISTORIAL
  const CAMPOS_VISTOS = ['detalle', 'fecha', 'sucursal', 'nombre', 'entrada', 'salida', 'colacion', 'pago', 'locomocion', 'obs', 'estado', 'monto', 'quincena', 'comprobante', 'motivo', 'dotacion', 'activo', 'banco', 'cuenta', 'rut', 'permisos', 'admin'];
  function detalleHist(h) {
    const o = h.antes || {}, n = h.despues || {};
    const fmt = (k, x) => x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : (['pago', 'locomocion', 'monto'].indexOf(k) >= 0 ? L.peso(x) : String(x));
    if (h.antes && h.despues) return CAMPOS_VISTOS.filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && (k in n)).map((k) => k + ': ' + fmt(k, o[k]) + ' → ' + fmt(k, n[k])).join(' · ');
    const x = h.despues || h.antes || {};
    return CAMPOS_VISTOS.filter((k) => k in x && x[k] !== '' && x[k] != null && ['nombre', 'sucursal', 'fecha'].indexOf(k) < 0).map((k) => k + ': ' + fmt(k, x[k])).join(' · ');
  }
  async function vistaHistorial(v, texto) {
    const lista = await DB.historial({ desde: L.sumarDias(hoy(), -90) + 'T00:00:00', limite: 1500 });
    const t = L.normNombre(texto || '');
    const vis = lista.filter((h) => !t || L.normNombre([h.usuario, h.accion, h.sucursal, h.persona, h.ref_id].join(' ')).includes(t)).slice(0, 400);
    const tipo = (a) => /ELIMIN|ANULADO|INASIST|CANCEL/.test(a) ? 'mal' : /MODIF/.test(a) ? 'aviso' : 'ok';
    v.innerHTML = cabecera('Historial de cambios', 'Todo ingreso, cambio, eliminación y pago queda anotado automáticamente y no se puede borrar. Últimos 90 días.') +
      '<section class="zona"><div class="caja"><label class="campo"><span class="sr">Buscar</span><input type="search" id="h-txt" placeholder="Buscar por persona, usuario, acción o sucursal" value="' + esc(texto || '') + '"></label>' +
      '<div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Cuándo</th><th>Usuario</th><th>Acción</th><th>Sucursal</th><th>Persona</th><th>Detalle</th></tr></thead><tbody>' +
      vis.map((h) => { const d = new Date(h.cuando); return '<tr><td class="gris" data-t="Cuándo" style="white-space:nowrap">' + d.toLocaleDateString('es-CL') + ' ' + d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + '</td><td data-t="Usuario">' + esc(h.usuario) + '</td><td data-t="Acción">' + est(h.accion, tipo(h.accion)) + '</td><td data-t="Sucursal">' + esc(h.sucursal) + '</td><td class="fuerte" data-t="Persona">' + esc(h.persona) + (h.fecha_reg ? '<div class="nota">' + L.fechaTxt(h.fecha_reg) + '</div>' : '') + '</td><td data-t="Detalle" style="font-size:13px;max-width:460px">' + esc(detalleHist(h)) + '</td></tr>'; }).join('') +
      '</tbody></table>' + (vis.length ? '' : '<div class="vacio">Sin movimientos.</div>') + '</div></div></section>';
    let tt; $('#h-txt', v).oninput = (e) => { clearTimeout(tt); tt = setTimeout(() => vistaHistorial(v, e.target.value).then(() => { const i = $('#h-txt', v); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }), 300); };
  }

  // ================================================================== USUARIOS Y ROLES
  function casillasPermisos(marcados, habilitado) {
    return L.GRUPOS_PERMISOS.map(([g, ps]) => '<fieldset style="border:0;padding:0;margin:0 0 6px"><legend class="nota" style="font-weight:700;padding:6px 0 2px">' + esc(g) + '</legend>' +
      ps.map(([k, t]) => '<label class="check"><input type="checkbox" data-multi="1" name="perm_' + k + '" data-perm="' + k + '"' + (marcados.indexOf(k) >= 0 ? ' checked' : '') + (habilitado(k) ? '' : ' disabled') + '> ' + esc(t) + '</label>').join('') + '</fieldset>').join('');
  }
  const permisosMarcados = (d) => L.conDependencias(L.PERMISOS.map(([k]) => k).filter((k) => d['perm_' + k] === 'on'));
  async function vistaUsuarios(v, pestana) {
    pestana = pestana || 'usuarios';
    const [lista, roles] = await Promise.all([DB.perfiles(), DB.roles()]);
    const nombreRol = (id) => id === 'admin' ? 'Administrador' : ((roles.find((r) => r.id === id) || {}).nombre || id);
    const mios = S.perfil.admin ? L.PERMISOS.map(([k]) => k) : (S.perfil.permisos || []);
    let cuerpo;
    if (pestana === 'usuarios') {
      cuerpo = '<div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Sucursal</th><th class="num">Permisos</th><th>Estado</th><th></th></tr></thead><tbody>' +
        lista.map((p) => '<tr><td class="fuerte" data-t="Usuario">' + esc(p.usuario) + '</td><td data-t="Nombre">' + esc(p.nombre) + '</td><td data-t="Rol">' + (p.admin ? est('Administrador', 'info') : esc(nombreRol(p.rol))) + '</td><td data-t="Sucursal">' + esc(p.sucursal || 'Oficina') + '</td>' +
          '<td class="num" data-t="Permisos">' + (p.admin ? 'todos' : (p.permisos || []).length) + '</td><td data-t="Estado">' + (p.activo ? est('Activo', 'ok') : est('Desactivado', 'neu')) + '</td>' +
          '<td data-t="">' + (S.perfil.admin || !p.admin ? '<button class="btn chico" data-acc="editar" data-id="' + p.id + '">Editar</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
        '<div class="ayuda"><b style="color:var(--azul)">Crear un usuario nuevo:</b> en Supabase → Authentication → Users → Add user, con el correo <b>usuario@' + esc((window.CONFIG_PARTTIME || {}).dominio || 'parttime.duckmarket.cl') + '</b>, una clave y “Auto confirm”. ' +
        'Después agrégalo a la tabla perfiles (ver GUIA en la carpeta Web_PartTime) y aquí le das el rol y los permisos.</div>';
    } else {
      cuerpo = '<div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Rol</th><th class="num">Permisos</th><th class="num">Usuarios</th><th></th></tr></thead><tbody>' +
        '<tr><td class="fuerte" data-t="Rol">Administrador</td><td class="num" data-t="Permisos">todos</td><td class="num" data-t="Usuarios">' + lista.filter((p) => p.admin).length + '</td><td class="gris" data-t="">fijo</td></tr>' +
        roles.map((r) => '<tr><td class="fuerte" data-t="Rol">' + esc(r.nombre) + (r.sistema ? ' <span class="nota">(base)</span>' : '') + '</td><td class="num" data-t="Permisos">' + r.permisos.length + '</td><td class="num" data-t="Usuarios">' + lista.filter((p) => p.rol === r.id).length + '</td>' +
          '<td data-t=""><div class="botones"><button class="btn chico" data-acc="rol" data-id="' + esc(r.id) + '">Editar</button>' + (!r.sistema ? '<button class="btn chico peligro" data-acc="borrarrol" data-id="' + esc(r.id) + '">Borrar</button>' : '') + '</div></td></tr>').join('') +
        '</tbody></table></div><div class="botones"><button class="btn ama" data-acc="rol" data-id="">Nuevo rol</button></div>' +
        '<p class="nota">Un rol es una plantilla de permisos. Cambiarlo NO cambia a los usuarios que ya lo tienen: al editar un usuario y elegir el rol se cargan sus permisos.</p>';
    }
    v.innerHTML = cabecera('Usuarios y permisos', S.perfil.admin ? 'Roles y permisos iguales a los del programa de escritorio.' : 'Puedes dar a otros solo los permisos que tú tienes.') +
      '<section class="zona"><div class="caja">' + (S.perfil.admin ? '<div class="pestanas" role="tablist"><button type="button" role="tab" data-acc="pest" data-p="usuarios" aria-selected="' + (pestana === 'usuarios') + '">Usuarios</button><button type="button" role="tab" data-acc="pest" data-p="roles" aria-selected="' + (pestana === 'roles') + '">Roles</button></div>' : '') +
      cuerpo + '</div></section>';
    v.onclick = async (ev) => {
      const b = ev.target.closest('[data-acc]'); if (!b) return;
      if (b.dataset.acc === 'pest') return vistaUsuarios(v, b.dataset.p);
      if (b.dataset.acc === 'editar') {
        const p = lista.find((x) => x.id === b.dataset.id);
        const opcionesRol = (S.perfil.admin ? [['admin', 'Administrador (todo)']] : []).concat(roles.map((r) => [r.id, r.nombre]));
        const r = await dialogo('Usuario ' + p.usuario, '<label class="campo">Nombre<input name="nombre" value="' + esc(p.nombre) + '"></label><div class="campos2"><label class="campo">Rol<select name="rol">' + opciones(opcionesRol, p.rol) + '</select></label>' +
          '<label class="campo">Sucursal<select name="sucursal">' + opciones([['', 'Oficina (ninguna)']].concat(L.SUCURSALES.map((s) => [s, s])), p.sucursal || '') + '</select></label></div>' +
          '<div id="perms" style="max-height:42vh;overflow:auto;border-top:1px solid var(--linea);padding-top:4px">' + casillasPermisos(p.permisos || [], (k) => mios.indexOf(k) >= 0) + '</div>' +
          '<label class="check"><input type="checkbox" name="activo"' + (p.activo ? ' checked' : '') + '> Activo (puede entrar)</label>', {
          boton: 'Guardar',
          alAbrir: (f) => {
            const pintar = () => { const adm = f.rol.value === 'admin'; f.querySelectorAll('[data-perm]').forEach((c) => { c.disabled = adm || mios.indexOf(c.dataset.perm) < 0; }); $('#perms', f).style.opacity = adm ? '.45' : '1'; };
            f.rol.addEventListener('change', () => {
              const rr = roles.find((x) => x.id === f.rol.value);
              if (rr) f.querySelectorAll('[data-perm]').forEach((c) => { c.checked = rr.permisos.indexOf(c.dataset.perm) >= 0 && mios.indexOf(c.dataset.perm) >= 0; });
              pintar();
            });
            pintar();
          },
          validar: (d, f) => {
            f.querySelectorAll('[data-perm]:disabled').forEach((c) => { if (c.checked) d['perm_' + c.dataset.perm] = 'on'; });
            if (p.id === S.perfil.id && (d.rol !== S.perfil.rol || !d.activo)) return 'No puedes cambiar tu propio rol ni desactivarte.';
            return DB.guardarPerfil({ id: p.id, nombre: d.nombre, sucursal: d.sucursal || null, rol: d.rol, activo: d.activo, permisos: permisosMarcados(d) }).then(() => null);
          }
        });
        if (r) { mensaje('Usuario guardado.'); vistaUsuarios(v, 'usuarios'); }
      }
      if (b.dataset.acc === 'rol') {
        const rol = roles.find((x) => x.id === b.dataset.id) || { id: '', nombre: '', permisos: [], sistema: false };
        const r = await dialogo(rol.id ? 'Rol ' + rol.nombre : 'Nuevo rol', '<label class="campo">Nombre del rol<input name="nombre" required value="' + esc(rol.nombre) + '"' + (rol.sistema ? ' readonly' : '') + '></label>' +
          '<div style="max-height:50vh;overflow:auto">' + casillasPermisos(rol.permisos, () => true) + '</div>', {
          boton: 'Guardar',
          validar: (d) => {
            const id = rol.id || L.normNombre(d.nombre).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (!id || id === 'admin') return 'Elige otro nombre.';
            if (!rol.id && roles.some((x) => x.id === id)) return 'Ya existe un rol con ese nombre.';
            return DB.guardarRol({ id, nombre: d.nombre.trim(), permisos: permisosMarcados(d), sistema: rol.sistema }).then(() => null);
          }
        });
        if (r) { mensaje('Rol guardado.'); vistaUsuarios(v, 'roles'); }
      }
      if (b.dataset.acc === 'borrarrol') {
        const rol = roles.find((x) => x.id === b.dataset.id), n = lista.filter((p) => p.rol === rol.id).length;
        if (n) return mensaje('El rol ' + rol.nombre + ' lo usan ' + n + ' usuarios: cámbialos de rol antes de borrarlo.', true);
        if (!(await confirmar('Borrar rol', '¿Borrar el rol ' + rol.nombre + '?', 'Borrar', true))) return;
        try { await DB.eliminarRol(rol.id); vistaUsuarios(v, 'roles'); } catch (e) { falla(e); }
      }
    };
  }

  // ================================================================== BUSCAR PERSONA
  async function vistaBuscar(v, filtro) {
    filtro = filtro || { nombre: '', desde: L.sumarDias(hoy(), -90), hasta: L.sumarDias(hoy(), 30) };
    let res = '';
    if (filtro.nombre.trim()) {
      // nombre exacto de la base, o el único que calza con lo escrito (ej. "diego araya")
      const unico = L.sugerirPersonas(S.personas, filtro.nombre, 2);
      if (!L.buscarPersona(S.personas, filtro.nombre) && unico.length === 1) filtro.nombre = unico[0].nombre;
      const n = L.normNombre(nombreOficial(filtro.nombre).nombre);
      const [ts, ps] = await Promise.all([DB.turnos({ desde: filtro.desde, hasta: filtro.hasta }), tiene('Planificar') || tiene('ReportesPlan') || tiene('DiasPlan') ? DB.plan({ desde: filtro.desde, hasta: filtro.hasta }) : Promise.resolve([])]);
      const mios = ts.filter((t) => L.normNombre(t.nombre) === n);
      const ligados = new Set(ps.map((p) => p.turno_id).filter(Boolean));
      const planes = ps.filter((p) => L.normNombre(p.nombre) === n && p.estado !== 'ASISTIÓ' && p.estado !== 'CANCELADO');
      const filas = mios.map((t) => ({ f: t.fecha + t.entrada, html: '<tr><td data-t="Fecha">' + esc(L.diaSemana(t.fecha).slice(0, 3)) + ' ' + L.fechaTxt(t.fecha) + '</td><td data-t="Sucursal">' + esc(t.sucursal) + '</td><td data-t="Horario">' + t.entrada + ' – ' + t.salida + '</td><td class="num" data-t="Horas">' + L.horasTxt(t.horas) + '</td><td class="num fuerte" data-t="Total">' + pesoV(t.total) + '</td><td data-t="Estado">' + est(ligados.has(t.id) ? 'Planificado · asistió' : 'Registrado', 'ok') + '</td></tr>' }))
        .concat(planes.map((p) => ({ f: p.fecha + p.entrada, html: '<tr><td data-t="Fecha">' + esc(L.diaSemana(p.fecha).slice(0, 3)) + ' ' + L.fechaTxt(p.fecha) + '</td><td data-t="Sucursal">' + esc(p.sucursal) + '</td><td data-t="Horario">' + p.entrada + ' – ' + p.salida + '</td><td class="num" data-t="Horas">' + L.horasTxt(p.horas) + '</td><td class="num gris" data-t="Total">' + pesoV(p.total) + '</td><td data-t="Estado">' + (p.estado === 'NO ASISTIÓ' ? est('No asistió', 'mal') : est(p.fecha > hoy() ? 'Planificado' : 'Por confirmar', 'info')) + '</td></tr>' })))
        .sort((a, b) => a.f.localeCompare(b.f));
      res = '<div class="caja"><div class="caja-tit"><h2>' + esc(nombreOficial(filtro.nombre).nombre) + '</h2><span class="nota">' + mios.length + ' turnos · ' + L.horasTxt(mios.reduce((s, t) => s + Number(t.horas), 0)) + ' h · ' + pesoV(mios.reduce((s, t) => s + Number(t.total), 0)) + '</span></div>' +
        (filas.length ? '<div class="tabla-caja"><table class="tarjetas-movil"><thead><tr><th>Fecha</th><th>Sucursal</th><th>Horario</th><th class="num">Horas</th><th class="num">Total</th><th>Estado</th></tr></thead><tbody>' + filas.map((x) => x.html).join('') + '</tbody></table></div>' : '<div class="vacio">Sin turnos ni planificaciones en esas fechas' + (visibles().length < 3 ? ' (en las sucursales que puedes ver)' : '') + '.</div>') + '</div>';
    }
    v.innerHTML = cabecera('Buscar persona', 'Todos los turnos y planificaciones de una persona en un rango de fechas.') +
      '<section class="zona"><form class="caja" id="f-bus" autocomplete="off"><div class="campos-auto"><label class="campo" style="grid-column:span 2">Persona<input name="nombre" required value="' + esc(filtro.nombre) + '" placeholder="Nombre o RUT"></label>' +
      '<label class="campo">Desde<input type="date" name="desde" value="' + filtro.desde + '"></label><label class="campo">Hasta<input type="date" name="hasta" value="' + filtro.hasta + '"></label><button class="btn pri" type="submit">Buscar</button></div><div class="sugerencias oculto" id="sug"></div></form></section>' +
      '<section class="zona">' + res + '</section>';
    const f = $('#f-bus', v);
    const buscar = () => vistaBuscar(v, { nombre: f.nombre.value, desde: f.desde.value, hasta: f.hasta.value });
    campoPersona(f.nombre, $('#sug', v), buscar);
    f.addEventListener('submit', (ev) => { ev.preventDefault(); buscar(); });
    if (!filtro.nombre) f.nombre.focus();
  }

  const VISTAS = { registro: (v) => vistaRegistro(v), planificador: vistaPlanificador, dias: vistaDias, pagos: (v) => vistaPagos(v), conciliacion: vistaConciliacion,
    personas: (v) => vistaPersonas(v, '', null), reportes: (v) => vistaReportes(v), historial: (v) => vistaHistorial(v, ''), usuarios: (v) => vistaUsuarios(v),
    buscar: (v) => vistaBuscar(v) };

  // ================================================================== arranque
  window.addEventListener('DOMContentLoaded', async () => {
    try { S.perfil = await DB.sesion(); } catch (e) { S.perfil = null; }
    if (S.perfil) montar(); else pantallaEntrada();
  });
})();
