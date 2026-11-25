// Part-Time Duck Market · vacaciones de planta (tablas vac_*, ver sql/08_vacaciones.sql).
// Solo aparece a quien tiene acceso en vac_accesos. La base decide las reglas y los permisos:
// esta pantalla muestra los errores de la base tal como llegan, y calcula solo lo que ayuda a ver.
(function (raiz) {
  'use strict';
  const LOCALES = ['ANDES', 'ENCINAS', 'SAN MARTIN'];
  const MESES = [[2026, 11, 'Diciembre 2026'], [2027, 0, 'Enero 2027'], [2027, 1, 'Febrero 2027'], [2027, 2, 'Marzo 2027']];
  const DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  // mes inicial: el mes actual si está en la lista; si no (antes de diciembre 2026), el primero de la lista
  const HOY_V = new Date();
  const MES_INI = Math.max(0, MESES.findIndex((m) => m[0] === HOY_V.getFullYear() && m[1] === HOY_V.getMonth()));
  const st = { lateral: false, sb: null, uid: null, acceso: null, personal: [], puestos: [], restr: [], feriados: new Set(), sol: [],
    mes: MES_INI, tab: 'resumen', local: null, aviso: '', error: '', ruts: {}, comp: null, rep: { local: null, mes: MES_INI, vista: 'mensual', estado: 'aprobada' } };

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dDe = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const sumaD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = (d) => d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  const habil = (d) => d.getDay() >= 1 && d.getDay() <= 5 && !st.feriados.has(iso(d));
  // mismas reglas que la base (vac_fin / vac_retorno / vac_inicio_valido, migración 17): solo para mostrar antes de enviar
  function fin(ini, dias) { let d = new Date(ini), n = 1; while (n < dias) { d = sumaD(d, 1); if (habil(d)) n++; } return d; }
  function retorno(f) { let d = sumaD(f, 1); while (!habil(d)) d = sumaD(d, 1); return d; }
  function inicioValido(s) {
    return habil(dDe(s)) && s >= '2026-12-01' && s <= '2027-03-31';
  }

  // ================================================================== acceso y datos
  async function acceso() {
    const sb = raiz.DB && raiz.DB.cliente ? raiz.DB.cliente() : null;
    if (!sb) return null;                       // modo demo: no hay base
    try {
      const u = (await sb.auth.getUser()).data.user;
      if (!u) return null;
      const r = await sb.from('vac_accesos').select('*').eq('usuario_id', u.id).maybeSingle();
      if (r.error || !r.data) return null;
      st.sb = sb; st.uid = u.id; st.acceso = r.data;
      return r.data;
    } catch (e) { return null; }
  }
  const esDirectivo = () => st.acceso && (st.acceso.rol === 'administracion' || st.acceso.rol === 'gerencia');
  const puedeProgramar = () => st.acceso && st.acceso.rol === 'encargado';
  const localesVisibles = () => esDirectivo() ? LOCALES.slice() : [st.acceso.local];
  const localSol = () => (st.acceso.rol === 'administracion' ? (st.locSol || LOCALES[0]) : st.acceso.local);

  async function leer(tabla, filtrar) {
    let q = st.sb.from(tabla).select('*');
    if (filtrar) q = filtrar(q);
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.data || [];
  }
  async function cargar() {
    const [puestos, restr, personal, feriados, sol] = await Promise.all([
      leer('vac_puestos'), leer('vac_restricciones'), leer('vac_personal'), leer('vac_feriados'), leer('vac_solicitudes')
    ]);
    st.puestos = puestos; st.restr = restr; st.personal = personal; st.sol = sol;
    st.feriados = new Set(feriados.map((f) => f.fecha));
    st.ruts = {};
    if (esDirectivo()) (await leer('vac_personal_rut')).forEach((x) => { st.ruts[x.personal_id] = x.rut; });
    st.reemplazos = await leer(esDirectivo() ? 'vac_reemplazos' : 'vac_reemplazos_vista');
    st.semana = {};
    if (!st.local || localesVisibles().indexOf(st.local) < 0) st.local = localesVisibles()[0];
  }

  // ================================================================== calendario
  function celdas(loc, puesto, y, m) {
    const out = {}, n = new Date(y, m + 1, 0).getDate();
    st.sol.filter((s) => s.local === loc && s.puesto === puesto && s.estado !== 'rechazada').forEach((s) => {
      const a = dDe(s.inicio), b = dDe(s.fin), r = dDe(s.retorno), p = s.estado === 'aprobada';
      for (let k = 1; k <= n; k++) {
        const x = new Date(y, m, k);
        if (x >= a && x <= b) out[k] = out[k] || (p ? 'v' : 'p');
        else if (iso(x) === iso(r)) out[k] = out[k] || 'r';
      }
    });
    return out;
  }
  // primer nombre y primer apellido (el nombre viene completo: nombres + apellido paterno + apellido materno)
  function nombreCorto(nombre) {
    const w = String(nombre || '').trim().split(/\s+/);
    if (w.length <= 2) return w.join(' ');
    return w[0] + ' ' + w[w.length - 2];
  }
  // una fila por persona de cada local (todo el personal, con o sin vacaciones en el mes)
  function grilla(locales, y, m) {
    const n = new Date(y, m + 1, 0).getDate();
    let h = '<thead><tr><th class="vac-puesto">Personal</th>';
    for (let k = 1; k <= n; k++) { const x = new Date(y, m, k); h += '<th>' + DIA[x.getDay()] + '<br>' + k + '</th>'; }
    h += '</tr></thead><tbody>';
    let vac = 0, pend = 0;
    locales.forEach((loc) => {
      if (locales.length > 1) h += '<tr><td class="vac-puesto vac-loc" colspan="' + (n + 1) + '">' + esc(loc) + '</td></tr>';
      const personas = st.personal.filter((x) => x.local === loc && x.activo !== false)
        .sort((u, v2) => (u.puesto || 'zzz').localeCompare(v2.puesto || 'zzz') || u.nombre.localeCompare(v2.nombre));
      personas.forEach((per) => {
        const sols = st.sol.filter((x) => x.personal_id === per.id && x.estado !== 'rechazada')
          .filter((x) => dDe(x.fin) >= new Date(y, m, 1) && dDe(x.inicio) <= new Date(y, m, n));
        h += '<tr><td class="vac-puesto' + (per.tiene_derecho === false ? ' vac-libre' : '') + '" title="' + esc(per.nombre + ' · ' + (per.puesto || 'sin puesto fijo')) + '">' + esc(nombreCorto(per.nombre)) + '</td>';
        for (let k = 1; k <= n; k++) {
          const x = new Date(y, m, k), sI = iso(x);
          const s2 = sols.find((q) => x >= dDe(q.inicio) && x <= dDe(q.fin));
          const r2 = sols.find((q) => sI === q.retorno);
          let cls = '', txt = '';
          if (s2) {
            cls = s2.estado === 'aprobada' ? 'v' : 'p';
            if (habil(x)) { if (cls === 'v') vac++; else pend++; }
            if (sI === s2.inicio) txt = 'I'; else if (sI === s2.fin) txt = 'F';
          } else if (r2) { cls = 'r'; txt = 'TR'; }
          else if (st.feriados.has(sI)) cls = 'fer';
          else if (x.getDay() === 0 || x.getDay() === 6) cls = 'fds';
          h += '<td class="' + cls + '" title="' + esc(loc + ' · ' + sI) + '">' + txt + '</td>';
        }
        h += '</tr>';
      });
    });
    return { html: h + '</tbody>', vac, pend };
  }
  const leyenda = '<div class="vac-leyenda"><span><i class="v"></i>Aprobada</span><span><i class="p"></i>Pendiente</span><span><i class="r"></i>Retorno</span><span><i class="fds"></i>Fin de semana</span><span><i class="fer"></i>Feriado</span></div>';
  const selMes = () => '<select id="vac-mes">' + MESES.map((m, i) => '<option value="' + i + '"' + (i === st.mes ? ' selected' : '') + '>' + m[2] + '</option>').join('') + '</select>';

  function vistaLocal() {
    const [y, m] = MESES[st.mes];
    const locs = localesVisibles();
    const selLoc = locs.length > 1 ? '<select id="vac-loc">' + locs.map((l) => '<option' + (l === st.local ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' : '<span class="vac-tag">' + esc(st.local) + '</span>';
    const g = grilla([st.local], y, m);
    const restr = st.restr.filter((r) => r.local === st.local).map((r) => r.puesto_a + ' con ' + r.puesto_b).join(' · ');
    return '<div class="vac-barra">' + selLoc + selMes() + '<span class="vac-res">' + g.vac + ' días de vacaciones aprobados · ' + g.pend + ' pendientes</span></div>' +
      '<div class="vac-cal"><table class="vac-grilla">' + g.html + '</table></div>' + leyenda +
      '<p class="vac-nota">Restricciones de este local: ' + esc(restr || 'ninguna') + '</p>';
  }
  function vistaGeneral() {
    const [y, m] = MESES[st.mes];
    const locs = localesVisibles();
    const g = grilla(locs, y, m);
    return '<div class="vac-barra">' + selMes() + '<span class="vac-res">' + locs.length + ' locales · ' + g.pend + ' días pendientes</span></div>' +
      '<div class="vac-cal"><table class="vac-grilla">' + g.html + '</table></div>' + leyenda;
  }

  // ================================================================== solicitud
  function vistaSolicitud() {
    const admin = st.acceso.rol === 'administracion';
    if (!puedeProgramar() && !admin) return '<p class="vac-nota">Solo el encargado de cada local, o administración, programa las vacaciones.</p>';
    const loc = localSol(), locs = localesVisibles();
    const pers = st.personal.filter((p) => p.local === loc && p.tiene_derecho && p.activo !== false && (!st.acceso.turno || p.turno === st.acceso.turno));
    if (!pers.length) return '<p class="vac-nota">No hay personal con derecho a vacaciones en tu local.</p>';
    const selLocAdmin = admin ? '<label class="campo"><span>Local</span><select id="f-loc">' + locs.map((l) => '<option' + (l === loc ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' : '';
    return '<form id="vac-form" class="vac-form" novalidate>' + selLocAdmin +
      '<label class="campo"><span>Persona</span><select id="f-per">' + pers.map((p) => '<option value="' + p.id + '">' + esc(p.nombre) + ' · ' + esc(p.cargo) + '</option>').join('') + '</select></label>' +
      '<div id="f-pue-caja"></div>' +
      '<label class="campo"><span>Inicio (día hábil)</span><input id="f-ini" type="date" min="2026-12-01" max="2027-03-31"></label>' +
      '<label class="campo"><span>Días hábiles (1 a 30, lo normal es 10 a 15)</span><input id="f-dias" type="number" min="1" max="30" step="1" inputmode="numeric" value="15"></label>' +
      '<p id="f-vista" class="vac-nota"></p><p id="f-err" class="vac-error"></p>' +
      '<div class="botones"><button class="btn ama" type="submit">Enviar a aprobación</button></div></form>' +
      '<h3 class="vac-sub">Solicitudes de mi local</h3>' + listaSolicitudes(true);
  }
  // puesto: fijo si la persona lo tiene en su ficha; si no (roticeras y reponedores que rotan), se elige
  async function pintarPuesto() {
    const per = st.personal.find((p) => String(p.id) === $('#f-per').value);
    const caja = $('#f-pue-caja');
    if (per && per.puesto) {
      caja.innerHTML = '<p class="vac-nota">Puesto fijo: <b>' + esc(per.puesto) + '</b></p>';
      caja.dataset.puesto = per.puesto;
      return;
    }
    const todos = per ? st.puestos.filter((p) => p.local === localSol() && p.cargo === per.cargo) : [];
    const turnos = todos.filter((p) => /^Turno (AM|PM) \(/.test(p.puesto));
    // solo quien tiene rotación elige turno AM/PM; los demás siguen con la lista de puestos
    const r = per && turnos.length ? await st.sb.rpc('vac_patron_personal', { p_personal_id: per.id }) : null;
    if (!per || String(per.id) !== $('#f-per').value) return; // cambió la persona mientras cargaba
    const rotativo = !!r && !r.error && r.data === 'rotativo';
    const opts = rotativo
      ? turnos.map((p) => '<option value="' + esc(p.puesto) + '">' + esc(p.puesto.replace(/ \(.*\)$/, '')) + '</option>').join('')
      : todos.filter((p) => turnos.indexOf(p) < 0).map((p) => '<option>' + esc(p.puesto) + '</option>').join('');
    caja.innerHTML = '<label class="campo"><span>' + (rotativo ? 'Turno (esta persona rota)' : 'Puesto') + '</span><select id="f-pue">' + opts + '</select></label>';
    caja.dataset.puesto = '';
  }
  function puestoElegido() {
    const caja = $('#f-pue-caja');
    return caja.dataset.puesto || ($('#f-pue') ? $('#f-pue').value : '');
  }
  function diasEscritos() { const n = Number($('#f-dias').value); return Number.isInteger(n) && n >= 1 && n <= 30 ? n : null; }
  function previsualizar() {
    const f = $('#f-ini'), v = $('#f-vista'), dias = diasEscritos();
    if (!f || !f.value) { v.textContent = ''; return; }
    if (dias === null) { v.textContent = 'Escribe una cantidad de días entre 1 y 30.'; return; }
    if (!inicioValido(f.value)) { v.textContent = 'El inicio debe ser un día hábil (lunes a viernes, sin feriado), entre el 01-12-2026 y el 31-03-2027.'; return; }
    const d = dDe(f.value), fn = fin(d, dias), rt = retorno(fn);
    v.textContent = dias + ' días hábiles: del ' + fmt(d) + ' al ' + fmt(fn) + ' · retorno ' + fmt(rt) + ' · La base revisa cruces con otras solicitudes antes de guardar.';
  }
  async function enviarSolicitud(ev) {
    ev.preventDefault();
    const per = st.personal.find((p) => String(p.id) === $('#f-per').value);
    const err = $('#f-err'); err.textContent = '';
    const ini = $('#f-ini').value, dias = diasEscritos();
    if (!ini) { err.textContent = 'Elige la fecha de inicio.'; return; }
    if (dias === null) { err.textContent = 'Escribe una cantidad de días entre 1 y 30.'; return; }
    const puesto = puestoElegido();
    if (!puesto) { err.textContent = 'Elige el puesto.'; return; }
    const r = await st.sb.from('vac_solicitudes').insert({ personal_id: per.id, local: localSol(), puesto: puesto, inicio: ini, dias: dias, creado_por: st.uid });
    if (r.error) { err.textContent = r.error.message; return; }
    st.aviso = 'Solicitud enviada. Queda pendiente hasta que administración y gerencia la aprueben.';
    await cargar(); render();
  }

  // ================================================================== listas y aprobación
  function nombrePersona(id) { const p = st.personal.find((x) => x.id === id); return p ? p.nombre : '—'; }
  function listaSolicitudes(solo_mios) {
    let lista = st.sol.filter((s) => s.local === st.acceso.local || esDirectivo());
    if (solo_mios) lista = lista.filter((s) => s.creado_por === st.uid);
    if (!lista.length) return '<p class="vac-nota">Sin solicitudes.</p>';
    return '<ul class="vac-lista">' + lista.sort((a, b) => a.inicio.localeCompare(b.inicio)).map((s) => {
      const cambiar = solo_mios && s.creado_por === st.uid && s.estado !== 'rechazada' ?
        ' <span class="vac-cambio"><input type="date" data-cambiar="' + s.id + '" min="2026-12-01" max="2027-03-31"><input type="number" min="1" max="30" value="' + s.dias + '" data-dias-cambiar="' + s.id + '" aria-label="Días"><button class="btn chico" data-acc="cambiar" data-id="' + s.id + '">Cambiar</button></span>' : '';
      const motivo = s.estado === 'rechazada' && s.motivo_rechazo ? '<div class="vac-nota">Motivo: ' + esc(s.motivo_rechazo) + '</div>' : '';
      return '<li><b>' + esc(nombrePersona(s.personal_id)) + '</b> · ' + esc(s.local) + '<br>' +
        '<span class="vac-nota">' + s.dias + ' días · ' + dDe(s.inicio).toLocaleDateString('es-CL') + ' al ' + dDe(s.fin).toLocaleDateString('es-CL') + ' · retorno ' + dDe(s.retorno).toLocaleDateString('es-CL') + ' · ' +
        '<span class="vac-est ' + s.estado + '">' + (s.estado === 'aprobada' ? 'Aprobada' : s.estado === 'rechazada' ? 'Rechazada' : 'Pendiente · admin ' + (s.ok_administracion ? '✔' : '—') + ' · gerencia ' + (s.ok_gerencia ? '✔' : '—')) + '</span></span>' +
        motivo + cambiar + '</li>';
    }).join('') + '</ul>';
  }
  function vistaAprobacion() {
    if (!esDirectivo()) return '<p class="vac-nota">Solo administración y gerencia aprueban.</p>';
    const pend = st.sol.filter((s) => s.estado === 'pendiente');
    if (!pend.length) return '<p class="vac-nota">No hay solicitudes pendientes.</p>';
    const admin = st.acceso.rol === 'administracion', ger = st.acceso.rol === 'gerencia';
    return '<ul class="vac-lista">' + pend.map((s) => {
      const botones = (admin && !s.ok_administracion ? '<button class="btn ama chico" data-acc="aprobar" data-campo="ok_administracion" data-id="' + s.id + '">Aprobar como administración</button> ' : '') +
        (ger && !s.ok_gerencia ? '<button class="btn ama chico" data-acc="aprobar" data-campo="ok_gerencia" data-id="' + s.id + '">Aprobar como gerencia</button> ' : '');
      return '<li><b>' + esc(nombrePersona(s.personal_id)) + '</b> · ' + esc(s.local) + '<br>' +
        '<span class="vac-nota">' + s.dias + ' días · ' + dDe(s.inicio).toLocaleDateString('es-CL') + ' al ' + dDe(s.fin).toLocaleDateString('es-CL') + ' · admin ' + (s.ok_administracion ? '✔' : '—') + ' · gerencia ' + (s.ok_gerencia ? '✔' : '—') + '</span><br>' +
        botones + '<span class="vac-cambio"><input type="text" data-motivo="' + s.id + '" placeholder="Motivo para rechazar"><button class="btn chico" data-acc="rechazar" data-id="' + s.id + '">Rechazar</button></span></li>';
    }).join('') + '</ul>';
  }

  // ================================================================== resumen por local
  function vistaResumen() {
    const hoy = iso(new Date());
    const en7 = iso(sumaD(new Date(), 6));
    const nombres = (lista) => lista.length ? lista.map((x) => esc(nombreCorto(x.nombre))).join(', ') : '<span class="vac-nota">ninguno</span>';
    // calcula una tarjeta para un conjunto de locales (uno, o todos juntos para el general)
    const tarjeta = (titulo, locs) => {
      const personal = st.personal.filter((p) => locs.indexOf(p.local) >= 0 && p.activo !== false && p.tiene_derecho !== false);
      const sols = st.sol.filter((s2) => locs.indexOf(s2.local) >= 0 && s2.estado !== 'rechazada');
      const persona = (s2) => st.personal.find((p) => p.id === s2.personal_id) || { nombre: '—' };
      const aprobadas = sols.filter((s2) => s2.estado === 'aprobada');
      const enVac = aprobadas.filter((s2) => s2.inicio <= hoy && s2.fin >= hoy).map(persona);
      const salen = aprobadas.filter((s2) => s2.inicio >= hoy && s2.inicio <= en7).map(persona);
      const vuelven = aprobadas.filter((s2) => s2.retorno >= hoy && s2.retorno <= en7).map(persona);
      const pendientes = sols.filter((s2) => s2.estado === 'pendiente').length;
      const conProgra = new Set(sols.filter((s2) => s2.fin >= hoy).map((s2) => s2.personal_id));
      const sinProgra = personal.filter((p) => !conProgra.has(p.id));
      return '<div class="tarjeta vac-res-loc"><h3>' + esc(titulo) + '</h3>' +
        '<div class="vac-kpis">' +
          '<div><b>' + personal.length + '</b><span>con derecho</span></div>' +
          '<div><b>' + enVac.length + '</b><span>de vacaciones hoy</span></div>' +
          '<div><b>' + salen.length + '</b><span>salen en 7 días</span></div>' +
          '<div><b>' + vuelven.length + '</b><span>vuelven en 7 días</span></div>' +
          '<div><b>' + pendientes + '</b><span>pendientes</span></div>' +
          '<div><b>' + sinProgra.length + '</b><span>sin programar</span></div>' +
        '</div>' +
        '<p><b>Hoy:</b> ' + nombres(enVac) + '</p>' +
        '<p><b>Salen en 7 días:</b> ' + nombres(salen) + '</p>' +
        '<p><b>Vuelven en 7 días:</b> ' + nombres(vuelven) + '</p>' +
        '<p><b>Sin vacaciones programadas:</b> ' + nombres(sinProgra) + '</p>' +
      '</div>';
    };
    const locs = localesVisibles();
    let html = '';
    if (locs.length > 1) html += tarjeta('General · todos los locales', locs);
    html += locs.map((loc) => tarjeta(loc, [loc])).join('');
    return '<p class="vac-nota">Al día de hoy: ' + hoy.split('-').reverse().join('-') + ' · próximos 7 días hasta ' + en7.split('-').reverse().join('-') + '</p>' +
      '<div class="vac-res-grid">' + html + '</div>';
  }

  // ================================================================== comprobantes (administración y gerencia)
  function vistaComprobantes() {
    if (st.comp) return comprobanteHtml(st.comp);
    const aprobadas = st.sol.filter((s2) => s2.estado === 'aprobada').sort((u, v2) => u.inicio.localeCompare(v2.inicio));
    if (!aprobadas.length) return '<p class="vac-nota">Aún no hay solicitudes aprobadas.</p>';
    return '<ul class="vac-lista vac-no-imprimir">' + aprobadas.map((s2) => {
      const p = st.personal.find((x) => x.id === s2.personal_id) || {};
      return '<li><b>' + esc(p.nombre || '—') + '</b> · ' + esc(s2.local) + '<br><span class="vac-nota">' + s2.dias + ' días · ' +
        dDe(s2.inicio).toLocaleDateString('es-CL') + ' al ' + dDe(s2.fin).toLocaleDateString('es-CL') + ' · retorno ' + dDe(s2.retorno).toLocaleDateString('es-CL') + '</span><br>' +
        '<button type="button" class="btn chico" data-acc="comp-ver" data-id="' + s2.id + '">Ver comprobante</button></li>';
    }).join('') + '</ul>';
  }
  // cuenta los sábados y domingos entre el inicio y el fin (ambos incluidos)
  function finDeSemanaEn(ini, fi) {
    let n = 0; for (let d = dDe(ini), h = dDe(fi); d <= h; d = sumaD(d, 1)) if (d.getDay() === 0 || d.getDay() === 6) n++;
    return n;
  }
  // comprobante: un documento por solicitud aprobada (se imprime o se guarda como PDF)
  function comprobanteHtml(id) {
    const s2 = st.sol.find((x) => x.id === id);
    if (!s2) return '<p class="vac-error">No se encuentra la solicitud.</p>';
    const p = st.personal.find((x) => x.id === s2.personal_id) || {};
    const f = (d) => dDe(d).toLocaleDateString('es-CL');
    const hoyTxt = new Date().toLocaleDateString('es-CL');
    const saldoAntes = (p.dias_pendientes != null) ? Number(p.dias_pendientes) : null;
    const saldoDespues = saldoAntes != null ? (saldoAntes - s2.dias).toFixed(1) : '—';
    const fila = (k, v) => '<tr><th>' + esc(k) + '</th><td>' + esc(v == null || v === '' ? '—' : v) + '</td></tr>';
    return '<div class="vac-no-imprimir" style="margin-bottom:12px"><button type="button" class="btn" data-acc="comp-imprimir">Imprimir / guardar como PDF</button> <button type="button" class="btn" data-acc="comp-volver">Volver</button></div>' +
      '<section class="comp-area"><div class="comp-enc"><img src="logo_pato.png" alt="Duck Market"><div><b>Duck Market</b><span>Comprobante de vacaciones</span></div><div class="comp-num">N° VAC-' + s2.id + '-' + dDe(s2.inicio).getFullYear() + '</div></div>' +
      '<table class="comp-tabla">' +
        fila('Nombre', p.nombre) + fila('RUT', st.ruts[s2.personal_id]) + fila('Local', s2.local) +
        fila('Fecha de ingreso', p.fecha_ingreso ? f(p.fecha_ingreso) : '') +
        fila('Período que se descuenta (anualidad)', p.periodo_inicio ? f(p.periodo_inicio) + ' al ' + f(p.periodo_fin) : '') +
        fila('Fechas de las vacaciones', f(s2.inicio) + ' al ' + f(s2.fin)) +
        fila('Días hábiles tomados', s2.dias) +
        fila('Sábados y domingos dentro del período', finDeSemanaEn(s2.inicio, s2.fin)) +
        fila('Retorno al trabajo', f(s2.retorno)) +
        fila('Saldo de días antes de esta solicitud', saldoAntes != null ? saldoAntes.toFixed(1) : '') +
        fila('Saldo de días después', saldoDespues) +
        fila('Fecha de emisión', hoyTxt) +
      '</table>' +
      '<p class="comp-nota">Saldo calculado al 21-11-2026 con el libro de vacaciones; ajustar si hay otras vacaciones tomadas después de esa fecha.</p>' +
      '<div class="comp-firmas"><div><span></span>Empresa</div><div><span></span>Trabajador</div></div></section>';
  }

  // ================================================================== reportes
  const CORTO_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  function localesRep() { return esDirectivo() ? LOCALES.slice() : [st.acceso.local]; }
  // semanas (lunes a domingo) que tocan el mes elegido
  function semanasDelMes(y, m) {
    const primero = new Date(y, m, 1), ultimo = new Date(y, m + 1, 0), out = [];
    let ini = new Date(primero); ini = sumaD(ini, -((ini.getDay() + 6) % 7));
    while (ini <= ultimo) { out.push([ini, sumaD(ini, 6)]); ini = sumaD(ini, 7); }
    return out;
  }
  // solicitudes del reporte (local y estado elegidos), con nombre de la persona
  function solsReporte(loc, estado) {
    return st.sol.filter((s2) => s2.local === loc && (estado === 'todas' ? s2.estado !== 'rechazada' : s2.estado === 'aprobada'))
      .sort((u, v2) => u.inicio.localeCompare(v2.inicio));
  }
  function vistaReportes() {
    const r = st.rep, locs = localesRep();
    if (r.vista === 'reemplazos' && !st.partime && !st.cargandoPartime) {
      st.cargandoPartime = true;
      leerPersonas().then((x) => { st.partime = Array.isArray(x) ? x : []; render(); }).catch(() => { st.partime = []; render(); });
    }
    if (!r.local || locs.indexOf(r.local) < 0) r.local = locs[0];
    const [y, m] = MESES[r.mes];
    const selLoc = locs.length > 1 ? '<select id="rep-loc">' + locs.map((l) => '<option' + (l === r.local ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' : '<span class="vac-tag">' + esc(r.local) + '</span>';
    const selMes = '<select id="rep-mes">' + MESES.map((mm, i) => '<option value="' + i + '"' + (i === r.mes ? ' selected' : '') + '>' + mm[2] + '</option>').join('') + '</select>';
    const selVista = '<select id="rep-vista">' + [['mensual', 'Mensual'], ['semanal', 'Semanal'], ['listado', 'Listado completo'], ['reemplazos', 'Reemplazos por persona que sale'], ['saldos', 'Saldos del personal']].map(([k, t]) => '<option value="' + k + '"' + (r.vista === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
    const selEst = '<select id="rep-estado">' + [['aprobada', 'Solo aprobadas'], ['todas', 'Todas (pendientes incluidas)']].map(([k, t]) => '<option value="' + k + '"' + (r.estado === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
    const barra = '<div class="vac-barra vac-no-imprimir">' + selLoc + selMes + selVista + selEst +
      '<button type="button" class="btn" data-acc="rep-excel">Exportar a Excel</button><button type="button" class="btn" data-acc="rep-imprimir">Imprimir / PDF</button></div>';
    const titulo = '<h3 class="vac-sub">Vacaciones · ' + esc(r.local) + ' · ' + (r.vista === 'saldos' ? 'saldos del personal al ' + hoyCorto() : r.vista === 'listado' ? 'listado completo' : MESES[r.mes][2]) + '</h3>';
    const { cabecera, filas } = datosReporte();
    let tabla = '';
    if (!filas.length) tabla = '<p class="vac-nota">No hay datos para este reporte.</p>';
    else tabla = '<div class="vac-cal"><table class="vac-tabla"><thead><tr>' + cabecera.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      filas.map((f) => '<tr>' + f.map((c) => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    return barra + titulo + tabla;
  }
  // filas del reporte que se ve (sirve para la pantalla y para Excel)
  function datosReporte() {
    const r = st.rep, loc = r.local;
    const sols = solsReporte(loc, r.estado);
    const nom = (s2) => (st.personal.find((p) => p.id === s2.personal_id) || {}).nombre || '';
    if (r.vista === 'saldos') {
      const f2 = (d) => d ? dDe(d).toLocaleDateString('es-CL') : '—';
      const personas = st.personal.filter((x) => x.local === loc && x.activo !== false).sort((u, v2) => u.nombre.localeCompare(v2.nombre));
      return { cabecera: ['Persona', 'Fecha de ingreso', 'Período que se descuenta', 'Días para programar', 'Saldo acumulado', 'Saldo al'],
        filas: personas.map((x) => [x.nombre, f2(x.fecha_ingreso),
          x.periodo_inicio ? f2(x.periodo_inicio) + ' al ' + f2(x.periodo_fin) : '—',
          x.dias_pendientes != null ? String(Number(x.dias_pendientes).toFixed(1)) : '—',
          x.dias_acumulados != null ? String(Number(x.dias_acumulados).toFixed(1)) : '—',
          x.saldo_al ? f2(x.saldo_al) : '—']) };
    }
    if (r.vista === 'reemplazos') {
      const f3 = (d) => dDe(d).toLocaleDateString('es-CL');
      const filas = sols.slice().sort((a, b) => a.inicio.localeCompare(b.inicio)).map((s2) => {
        const rs = (st.reemplazos || []).filter((x) => x.solicitud_id === s2.id);
        const grupos = {};
        rs.forEach((x) => { const n = reemNombre(x); grupos[n] = (grupos[n] || 0) + 1; });
        const txt = Object.keys(grupos).map((n) => n + ' (' + grupos[n] + (grupos[n] === 1 ? ' día' : ' días') + ')').join(', ') || '—';
        const sin = Math.max(diasAsignables(s2).length - rs.length, 0);
        return [nom(s2), f3(s2.inicio), f3(s2.fin), f3(s2.retorno), String(s2.dias), txt, String(sin)];
      });
      return { cabecera: ['Persona que sale', 'Inicio', 'Fin', 'Retorno', 'Días', 'Reemplazo asignado', 'Días sin reemplazo'], filas };
    }
    const f = (d) => dDe(d).toLocaleDateString('es-CL');
    if (r.vista === 'listado') {
      return { cabecera: ['Persona', 'Inicio', 'Fin', 'Días', 'Retorno', 'Estado'],
        filas: sols.map((s2) => [nom(s2), f(s2.inicio), f(s2.fin), String(s2.dias), f(s2.retorno), s2.estado]) };
    }
    const [y, m] = MESES[r.mes];
    if (r.vista === 'mensual') {
      const en = sols.filter((s2) => dDe(s2.fin) >= new Date(y, m, 1) && dDe(s2.inicio) <= new Date(y, m + 1, 0));
      return { cabecera: ['Persona', 'Inicio', 'Fin', 'Días', 'Retorno', 'Estado'],
        filas: en.map((s2) => [nom(s2), f(s2.inicio), f(s2.fin), String(s2.dias), f(s2.retorno), s2.estado]) };
    }
    // semanal: cada semana (lunes a domingo) con quién está de vacaciones
    return { cabecera: ['Semana', 'Personas de vacaciones', 'Cantidad'],
      filas: semanasDelMes(y, m).map(([a, b]) => {
        const quienes = sols.filter((s2) => dDe(s2.inicio) <= b && dDe(s2.fin) >= a).map(nom);
        const rot = (d) => CORTO_DIA[d.getDay()] + ' ' + d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
        return [rot(a) + ' al ' + rot(b), quienes.join(', ') || '—', String(quienes.length)];
      }) };
  }
  function reemNombre(x) {
    if (x.tipo === 'INTERNO') return (st.personal.find((p) => p.id === x.personal_id) || {}).nombre || 'Del local';
    if (x.tipo === 'PARTTIME') return ((st.partime || []).find((p) => p.id === x.persona_id) || {}).nombre || 'Part-time';
    return x.nombre || 'Contratado';
  }
  function hoyCorto() { return new Date().toLocaleDateString('es-CL'); }
  function cambiarReporte(el) {
    const r = st.rep;
    if (el.id === 'rep-loc') r.local = el.value;
    if (el.id === 'rep-mes') r.mes = Number(el.value);
    if (el.id === 'rep-vista') r.vista = el.value;
    if (el.id === 'rep-estado') r.estado = el.value;
    render();
  }
  function exportarReporte() {
    const r = st.rep, d = datosReporte();
    const nombre = 'Vacaciones_' + r.local.replace(/\s+/g, '_') + '_' + r.vista + (r.vista === 'listado' || r.vista === 'saldos' ? '' : '_' + MESES[r.mes][2].replace(' ', '_')) + '.csv';
    if (window.descargarExcel) window.descargarExcel(nombre, [d.cabecera].concat(d.filas));
    else st.error = 'La exportación a Excel no está disponible en esta página.';
  }

  // ================================================================== pantalla
  const PESTANAS = [['resumen', 'Resumen'], ['local', 'Calendario por local'], ['general', 'Vista general'], ['solicitud', 'Nueva solicitud'], ['aprobacion', 'Aprobaciones'], ['reportes', 'Reportes'], ['comprobantes', 'Comprobantes']];
  function render() {
    const v = st.v; if (!v) return;
    const contenido = st.tab === 'comprobantes' ? vistaComprobantes() : st.tab === 'resumen' ? vistaResumen() : st.tab === 'local' ? vistaLocal() : st.tab === 'general' ? vistaGeneral() : st.tab === 'solicitud' ? vistaSolicitud() : st.tab === 'reportes' ? vistaReportes() : st.tab === 'reemplazos' ? vistaReemplazos() : vistaAprobacion();
    // las secciones se eligen desde el menú lateral: aquí solo se muestra la sección y sus avisos
    v.innerHTML = (st.aviso ? '<p class="vac-ok">' + esc(st.aviso) + '</p>' : '') + (st.error ? '<p class="vac-error">' + esc(st.error) + '</p>' : '') +
      '<section class="zona">' + contenido + '</section>';
    v.querySelectorAll('.reem-fila[data-dia]').forEach((fila) => { mostrarCampos(fila); ajustarHasta(fila); actualizarSemana(fila); });
    st.aviso = ''; st.error = '';
    const f = $('#f-ini'); if (f) { f.addEventListener('input', previsualizar); $('#f-dias').addEventListener('input', previsualizar); previsualizar(); }
    const form = $('#vac-form'); if (form) form.addEventListener('submit', enviarSolicitud);
    if (form) { $('#f-per').addEventListener('change', pintarPuesto); pintarPuesto(); }
      }
  async function accion(ev) {
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    const acc = b.dataset.acc;
    try {
      if (acc === 'tab') { st.tab = b.dataset.tab; render(); return; }
      if (acc === 'rep-excel') { exportarReporte(); return; }
      if (acc === 'comp-ver') { st.comp = Number(b.dataset.id); render(); return; }
      if (acc === 'comp-volver') { st.comp = null; render(); return; }
      if (acc === 'reem-abrir') {
        const id = Number(b.dataset.id);
        if (st.reemAbierta === id) { st.reemAbierta = null; render(); return; }
        const s = st.sol.find((x) => x.id === id);
        st.reemAbierta = id; st.reemPre = {}; st.reemBloque = '';
        if (!st.partime) st.partime = await leerPersonas();
        const pat = await st.sb.rpc('vac_patron_personal', { p_personal_id: s.personal_id });
        st.reemPatron = (!pat.error && pat.data) || 'fijo';
        if (st.reemPatron === 'fijo') await precargarFijo(s);
        render(); return;
      }
      if (acc === 'reem-cancelar' || acc === 'reem-este' || acc === 'reem-resto') {
        const form = $('#reem-form', st.v);
        const origen = form.querySelector('.reem-fila[data-dia="' + b.dataset.dia + '"]');
        if (acc === 'reem-cancelar') {
          // vuelve el día a como estaba antes del cambio
          const previo = JSON.parse(origen.dataset.prev || '{}');
          Object.keys(previo).forEach((k) => { const x = origen.querySelector('[data-campo="' + k + '"]'); if (x) x.value = previo[k]; });
          mostrarCampos(origen); ajustarHasta(origen);
        } else if (acc === 'reem-resto') {
          const leer = (k) => { const x = origen.querySelector('[data-campo="' + k + '"]'); return x ? x.value : ''; };
          origen.dataset.modo = 'todos';
          aplicarPlantilla(form, origen, { tipo: leer('tipo'), persona: leer('persona'), nombre: leer('nombre'), rut: leer('rut'), desde: leer('desde'), hasta: leer('hasta') }, true);
          form.querySelectorAll('.reem-fila[data-dia]').forEach((o) => actualizarSemana(o));
        }
        form.querySelectorAll('#reem-aviso').forEach((x) => x.remove());
        return;
      }
      if (acc === 'reem-guardar') {
        const s = st.sol.find((x) => x.id === st.reemAbierta);
        const n = await guardarReemplazos(s, $('#reem-form', st.v));
        await cargar();
        st.aviso = n ? 'Reemplazos guardados (' + n + ' cambio' + (n === 1 ? '' : 's') + ').' : 'No había cambios que guardar.';
        render(); return;
      }
      if (acc === 'comp-imprimir') { window.print(); return; }
      if (acc === 'rep-imprimir') { window.print(); return; }
      if (acc === 'aprobar') {
        const campo = b.dataset.campo, id = Number(b.dataset.id);
        const r = await st.sb.from('vac_solicitudes').update({ [campo]: true }).eq('id', id);
        if (r.error) throw new Error(r.error.message);
        st.aviso = 'Aprobación registrada.';
      } else if (acc === 'rechazar') {
        const id = Number(b.dataset.id), txt = $('[data-motivo="' + id + '"]').value.trim();
        const r = await st.sb.from('vac_solicitudes').update({ estado: 'rechazada', motivo_rechazo: txt }).eq('id', id);
        if (r.error) throw new Error(r.error.message);
        st.aviso = 'Solicitud rechazada.';
      } else if (acc === 'cambiar') {
        const id = Number(b.dataset.id), nuevo = $('[data-cambiar="' + id + '"]').value;
        const dias = Number($('[data-dias-cambiar="' + id + '"]').value);
        if (!nuevo) throw new Error('Elige la nueva fecha de inicio.');
        if (!Number.isInteger(dias) || dias < 1 || dias > 30) throw new Error('Escribe una cantidad de días entre 1 y 30.');
        const r = await st.sb.from('vac_solicitudes').update({ inicio: nuevo, dias: dias }).eq('id', id);
        if (r.error) throw new Error(r.error.message);
        st.aviso = 'Solicitud cambiada. Vuelve a pendiente y necesita las dos aprobaciones.';
      }
      await cargar(); render();
    } catch (e) { st.error = e.message; render(); }
  }


  // ================================================================== reemplazos (solo administración)
  const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const TIPOS_REEM = { INTERNO: 'Interno (del local)', PARTTIME: 'Part-time (de la base)', CONTRATADO: 'Con contrato' };
  // días en que se asigna reemplazo: desde el inicio hasta el día ANTES del retorno (si termina un viernes,
  // el sábado siguiente también está libre), lunes a sábado, sin feriados (el domingo no se trabaja)
  function diasAsignables(s) {
    const out = [];
    for (let d = dDe(s.inicio), h = dDe(s.retorno || iso(retorno(dDe(s.fin)))); d < h; d = sumaD(d, 1)) {
      if (d.getDay() !== 0 && !st.feriados.has(iso(d))) out.push(iso(d));
    }
    return out;
  }
  function reemDe(sid, fecha) { return (st.reemplazos || []).find((r) => r.solicitud_id === sid && r.fecha === fecha) || null; }
  async function leerPersonas() {
    const r = await st.sb.from('personas_lista').select('id,nombre,rut,activo');
    if (r.error) throw new Error(r.error.message);
    return r.data || [];
  }
  // muestra solo los campos que corresponden al tipo elegido en la fila
  function mostrarCampos(fila) {
    const tipo = fila.querySelector('[data-campo="tipo"]').value;
    // un campo sin "data-solo" (o vacío) se muestra siempre; los demás, solo para los tipos que indican
    fila.querySelectorAll('[data-solo]').forEach((el) => {
      const lista = el.dataset.solo.split(' ').filter(Boolean);
      el.hidden = lista.length > 0 && lista.indexOf(tipo) < 0;
    });
  }
  // RUT chileno: se revisa el dígito verificador (módulo 11). Devuelve el RUT con formato o null si no es válido
  function rutNormal(txt) {
    const s = String(txt || '').replace(/[^0-9kK]/g, '').toUpperCase();
    if (s.length < 2) return null;
    const cuerpo = s.slice(0, -1), dv = s.slice(-1);
    let suma = 0, f = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * f; f = f === 7 ? 2 : f + 1; }
    const r = 11 - (suma % 11);
    const esperado = r === 11 ? '0' : r === 10 ? 'K' : String(r);
    if (esperado !== dv) return null;
    return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
  }
  // lo que se elige en un día se copia a los demás días. Los vacíos se completan solos; si otros días ya tienen
  // otro reemplazo, un aviso dentro del formulario pregunta si también se cambian (Cambiar todos / Solo este día)
  // un día "sin quién" todavía no tiene persona ni contratado elegido (puede tener solo el tipo, copiado de otro día)
  function sinQuien(o) {
    return ['persona', 'nombre', 'rut', 'desde', 'hasta'].every((k) => { const x = o.querySelector('[data-campo="' + k + '"]'); return !x || !x.value; });
  }
  function aplicarPlantilla(form, fila, plantilla, sobrescribir) {
    const leer = (el, k) => { const x = el.querySelector('[data-campo="' + k + '"]'); return x ? x.value : ''; };
    form.querySelectorAll('.reem-fila[data-dia]').forEach((o) => {
      if (o === fila) return;
      const tipoOtra = leer(o, 'tipo');
      // también se reemplaza un día que solo tiene el tipo, sin persona: se cambió de idea antes de elegir a alguien
      const reemplazar = (sobrescribir && tipoOtra) || (tipoOtra && tipoOtra !== plantilla.tipo && sinQuien(o));
      if (tipoOtra && tipoOtra !== plantilla.tipo && !reemplazar) return;
      Object.keys(plantilla).forEach((k) => {
        const x = o.querySelector('[data-campo="' + k + '"]');
        if (!x) return;
        if (reemplazar || (!x.value && plantilla[k])) x.value = plantilla[k];
      });
      mostrarCampos(o); ajustarHasta(o);
    });
  }
  // Al elegir el tipo o la persona, la pantalla pregunta: ¿solo este día o todos los días? Si la fila ya dijo
  // "todos los días", los datos del contratado (nombre, RUT, fechas) se copian solos a los demás días.
  function propagarPlantilla(fila, eligePersona) {
    const form = fila.closest('#reem-form');
    if (!form) return;
    if (!eligePersona && fila.dataset.modo !== 'todos') return;
    const leer = (el, k) => { const x = el.querySelector('[data-campo="' + k + '"]'); return x ? x.value : ''; };
    const plantilla = { tipo: leer(fila, 'tipo'), persona: leer(fila, 'persona'), nombre: leer(fila, 'nombre'), rut: leer(fila, 'rut'), desde: leer(fila, 'desde'), hasta: leer(fila, 'hasta') };
    if (!plantilla.tipo) return;
    form.querySelectorAll('#reem-aviso').forEach((x) => x.remove());
    if (fila.dataset.modo === 'todos') { aplicarPlantilla(form, fila, plantilla, true); form.querySelectorAll('.reem-fila[data-dia]').forEach((o) => actualizarSemana(o)); return; }
    const aviso = document.createElement('div');
    aviso.id = 'reem-aviso';
    aviso.setAttribute('style', 'margin:10px 0;padding:12px;border:1px solid #f0d28a;background:#fff8e6;border-radius:8px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:14px');
    aviso.innerHTML = '<span>¿Este reemplazo es solo para este día o para todos los días de la vacación?</span>' +
      '<button type="button" class="btn chico" data-acc="reem-cancelar" data-dia="' + fila.dataset.dia + '">Cancelar</button>' +
      '<button type="button" class="btn chico" data-acc="reem-este" data-dia="' + fila.dataset.dia + '">Solo este día</button>' +
      '<button type="button" class="btn ama chico" data-acc="reem-resto" data-dia="' + fila.dataset.dia + '">Todos los días</button>';
    form.insertBefore(aviso, form.firstChild);
  }
  // ---- horario de la semana de quien reemplaza, y choque con turnos o planificación en cualquier local
  const cuerpoRut = (t) => { const s = String(t || '').replace(/[^0-9kK]/g, '').toUpperCase(); return s.slice(0, Math.max(s.length - 1, 0)); };
  const minDe = (h) => { const [a, b] = String(h).slice(0, 5).split(':').map(Number); return a * 60 + b; };
  const minSalida = (h) => (String(h).slice(0, 5) === '00:00' ? 1440 : minDe(h));
  const cruzan = (e1, s1, e2, s2) => minDe(e1) < minSalida(s2) && minDe(e2) < minSalida(s1);
  const lunesDe = (f) => iso(sumaD(dDe(f), -((dDe(f).getDay() + 6) % 7)));
  // turnos y planificación de la semana: una consulta por semana (se guarda hasta recargar)
  function semanaDatos(lun) {
    st.semana = st.semana || {};
    if (!st.semana[lun]) {
      const dom = iso(sumaD(dDe(lun), 6));
      st.semana[lun] = Promise.all([
        st.sb.from('turnos').select('fecha,sucursal,entrada,salida,rut').gte('fecha', lun).lte('fecha', dom),
        st.sb.from('plan').select('fecha,sucursal,entrada,salida,rut,estado').gte('fecha', lun).lte('fecha', dom).neq('estado', 'CANCELADO')
      ]);
    }
    return st.semana[lun];
  }
  async function actualizarSemana(fila) {
    if (!fila || !st.sb) return;
    let caja = fila.querySelector('.reem-semana');
    if (!caja) { caja = document.createElement('div'); caja.className = 'reem-semana'; caja.setAttribute('style', 'grid-column:1/-1;font-size:12px;color:#334155;line-height:1.5'); fila.appendChild(caja); }
    const campo = (c) => { const x = fila.querySelector('[data-campo="' + c + '"]'); return x ? x.value : ''; };
    const valor = campo('persona');
    if (!campo('tipo') || campo('tipo') === 'CONTRATADO' || !valor) { caja.innerHTML = ''; return; }
    const [pre, id] = valor.split(':');
    let nombre = '', rut = '';
    if (pre === 'I') { const p = st.personal.find((x) => x.id === Number(id)); nombre = p ? p.nombre : ''; rut = st.ruts[Number(id)] || ''; }
    else { const p = (st.partime || []).find((x) => x.id === Number(id)); nombre = p ? p.nombre : ''; rut = p ? p.rut : ''; }
    const cuerpo = cuerpoRut(rut);
    if (!cuerpo) { caja.innerHTML = '<span style="color:#b91c1c">No tiene RUT registrado: no se puede revisar su horario.</span>'; return; }
    const lun = lunesDe(fila.dataset.dia);
    const [t, p] = await semanaDatos(lun);
    if (t.error || p.error) { caja.innerHTML = '<span style="color:#b91c1c">No se pudo leer su horario: ' + esc((t.error || p.error).message) + '</span>'; return; }
    const mios = [].concat(
      (t.data || []).filter((x) => cuerpoRut(x.rut) === cuerpo).map((x) => ({ fecha: x.fecha, suc: x.sucursal, e: String(x.entrada).slice(0, 5), s: String(x.salida).slice(0, 5), de: 'turno' })),
      (p.data || []).filter((x) => cuerpoRut(x.rut) === cuerpo).map((x) => ({ fecha: x.fecha, suc: x.sucursal, e: String(x.entrada).slice(0, 5), s: String(x.salida).slice(0, 5), de: 'planificación' })));
    const f = fila.dataset.dia;
    const e0 = campo('entrada'), s0 = campo('salida');
    let html = '<div><b>Semana de ' + esc(nombre) + ':</b> ';
    html += [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = iso(sumaD(dDe(lun), i));
      const items = mios.filter((x) => x.fecha === d);
      const txt = items.length ? items.map((x) => x.e + '–' + x.s + ' ' + esc(x.suc)).join(', ') : 'libre';
      return '<span style="' + (d === f ? 'font-weight:700' : '') + '">' + DIAS_CORTO[dDe(d).getDay()] + ' ' + dDe(d).getDate() + ': ' + txt + '</span>';
    }).join(' · ') + '</div>';
    if (e0 && s0) {
      mios.filter((x) => x.fecha === f && cruzan(e0, s0, x.e, x.s)).forEach((x) => {
        html += '<div style="color:#b91c1c;font-weight:600">⚠ Ese día tiene ' + (x.de === 'turno' ? 'turno' : 'planificación') + ' en ' + esc(x.suc) + ' (' + x.e + '–' + x.s + ') que se cruza con este horario. La base no lo deja guardar.</div>';
      });
    }
    caja.innerHTML = html;
  }
  // "hasta" no puede ser anterior a "desde"
  function ajustarHasta(fila) {
    const d = fila.querySelector('[data-campo="desde"]'), h = fila.querySelector('[data-campo="hasta"]');
    if (!d || !h) return;
    h.min = d.value || '';
    if (d.value && h.value && h.value < d.value) h.value = d.value;
  }
  // horario por defecto: fijos según su último mismo día de la semana; rotativos según el bloque (AM/PM) elegido
  async function precargarDias(s, fn) {
    st.reemPre = {};
    await Promise.all(diasAsignables(s).map(async (f) => {
      const r = await fn(f);
      if (!r.error && r.data && r.data[0]) st.reemPre[f] = r.data[0];
    }));
  }
  async function precargarFijo(s) {
    await precargarDias(s, (f) => st.sb.rpc('vac_horario_precargado', { p_personal_id: s.personal_id, p_fecha: f }));
  }
  // al elegir AM o PM: llena entrada y salida de los días sin reemplazo guardado, sin rehacer la pantalla
  async function precargarRotativo(s, bloque) {
    st.reemBloque = bloque;
    if (bloque) await precargarDias(s, (f) => st.sb.rpc('vac_horario_rotativo', { p_personal_id: s.personal_id, p_fecha: f, p_inicio: s.inicio, p_empieza: bloque }));
    else st.reemPre = {};
    const form = $('#reem-form', st.v);
    if (!form) return;
    form.querySelectorAll('.reem-fila[data-dia]').forEach((fila) => {
      const f = fila.dataset.dia;
      if (reemDe(s.id, f)) return;
      const pre = st.reemPre[f];
      const ent = fila.querySelector('[data-campo="entrada"]'), sal = fila.querySelector('[data-campo="salida"]');
      if (ent) ent.value = pre ? String(pre.entrada).slice(0, 5) : '';
      if (sal) sal.value = pre ? String(pre.salida).slice(0, 5) : '';
      fila.querySelectorAll('.vac-nota').forEach((n) => { n.textContent = pre ? '(por defecto)' : (bloque ? '(sin horario para ese bloque: ingrésalo)' : '(elige mañana o tarde arriba)'); });
    });
  }
  function formularioReemplazos(s) {
    const dias = diasAsignables(s), pre = st.reemPre || {};
    const rotativo = st.reemPatron === 'rotativo';
    const selBloque = rotativo ? '<div style="margin:10px 0;padding:12px;border:1px solid #cfe0f5;background:#f5f9ff;border-radius:8px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:14px"><span><b>' + esc(nombrePersona(s.personal_id)) + '</b> tiene horario rotativo. ¿Al inicio de la vacación empieza en el turno de mañana o de tarde? Desde ahí el horario alterna semana a semana.</span><select id="reem-bloque"><option value="">Elegir…</option><option value="AM"' + (st.reemBloque === 'AM' ? ' selected' : '') + '>Mañana (AM)</option><option value="PM"' + (st.reemBloque === 'PM' ? ' selected' : '') + '>Tarde (PM)</option></select></div>' : '';
    const internos = st.personal.filter((p) => p.local === s.local && p.activo !== false && p.id !== s.personal_id);
    const partime = (st.partime || []).filter((p) => p.activo !== false);
    const opciones = (sel) =>
      '<option value="">Elegir…</option>' +
      '<optgroup label="Del local (' + esc(s.local) + ')">' + internos.map((p) => '<option value="I:' + p.id + '"' + (sel === 'I:' + p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</optgroup>' +
      '<optgroup label="Part-time (de la base)">' + partime.map((p) => '<option value="P:' + p.id + '"' + (sel === 'P:' + p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>').join('') + '</optgroup>';
    const filas = dias.map((f) => {
      const ex = reemDe(s.id, f), d = dDe(f);
      const tipo = ex ? ex.tipo : '';
      const sel = ex ? (ex.tipo === 'INTERNO' ? 'I:' + ex.personal_id : ex.tipo === 'PARTTIME' ? 'P:' + ex.persona_id : '') : '';
      const ent = ex ? ex.entrada : (pre[f] ? String(pre[f].entrada).slice(0, 5) : '');
      const sal = ex ? ex.salida : (pre[f] ? String(pre[f].salida).slice(0, 5) : '');
      const nota = ex ? '' : (pre[f] ? ' <span class="vac-nota">(por defecto)</span>' : rotativo ? ' <span class="vac-nota">(elige mañana o tarde arriba)</span>' : ' <span class="vac-nota">(sin horario por defecto: ingrésalo)</span>');
      const campo = (txt, solo, html) => '<label data-solo="' + solo + '" style="display:flex;flex-direction:column;gap:4px;font-size:12px">' + txt + html + '</label>';
      return '<div class="reem-fila" data-dia="' + f + '" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;align-items:end;padding:10px 0;border-bottom:1px solid #eceff4">' +
        '<div style="font-size:13px"><b>' + DIAS_CORTO[d.getDay()] + ' ' + d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' }) + '</b></div>' +
        campo('Tipo', '', '<select data-campo="tipo"><option value="">Sin reemplazo</option>' + Object.keys(TIPOS_REEM).map((k) => '<option value="' + k + '"' + (tipo === k ? ' selected' : '') + '>' + TIPOS_REEM[k] + '</option>').join('') + '</select>') +
        campo('Persona', 'INTERNO PARTTIME', '<select data-campo="persona">' + opciones(sel) + '</select>') +
        campo('Nombre', 'CONTRATADO', '<input type="text" data-campo="nombre" value="' + esc(ex && ex.tipo === 'CONTRATADO' ? ex.nombre : '') + '">') +
        campo('RUT', 'CONTRATADO', '<input type="text" data-campo="rut" value="' + esc(ex && ex.tipo === 'CONTRATADO' ? ex.rut : '') + '">') +
        campo('Contrato desde', 'CONTRATADO', '<input type="date" data-campo="desde" value="' + esc(ex && ex.tipo === 'CONTRATADO' ? ex.contrato_desde : '') + '">') +
        campo('Contrato hasta', 'CONTRATADO', '<input type="date" data-campo="hasta" min="' + esc(ex && ex.tipo === 'CONTRATADO' ? ex.contrato_desde : '') + '" value="' + esc(ex && ex.tipo === 'CONTRATADO' ? ex.contrato_hasta : '') + '">') +
        campo('Entrada' + nota, '', '<input type="time" data-campo="entrada" value="' + esc(ent) + '">') +
        campo('Salida' + nota, '', '<input type="time" data-campo="salida" value="' + esc(sal) + '">') +
        '</div>';
    }).join('');
    return '<div id="reem-form" style="margin-top:12px"><p class="vac-nota">Hay que asignar reemplazo a <b>todas</b> las jornadas (' + dias.length + ' días). ' + (rotativo ? 'El horario por defecto sale del bloque de mañana o tarde que elijas arriba; cámbialo si corresponde.' : 'El horario por defecto es el último turno de ' + esc(nombrePersona(s.personal_id)) + ' para ese día de la semana; cámbialo si corresponde.') + '</p>' + selBloque +
      filas + '<div style="margin-top:12px"><button type="button" class="btn ama" data-acc="reem-guardar">Guardar reemplazos</button></div></div>';
  }
  function vistaReemplazos() {
    if (!st.acceso || st.acceso.rol !== 'administracion') return '<p class="vac-nota">Solo administración asigna reemplazos.</p>';
    const aprob = st.sol.filter((s) => s.estado === 'aprobada').sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (!aprob.length) return '<p class="vac-nota">Aún no hay solicitudes aprobadas.</p>';
    return '<ul class="vac-lista">' + aprob.map((s) => {
      const dias = diasAsignables(s), hechos = dias.filter((f) => reemDe(s.id, f)).length;
      const abierta = st.reemAbierta === s.id;
      return '<li><b>' + esc(nombrePersona(s.personal_id)) + '</b> · ' + esc(s.local) + '<br>' +
        '<span class="vac-nota">' + dDe(s.inicio).toLocaleDateString('es-CL') + ' al ' + dDe(s.fin).toLocaleDateString('es-CL') + ' · reemplazos: ' + hechos + ' de ' + dias.length + ' días</span><br>' +
        '<button type="button" class="btn chico" data-acc="reem-abrir" data-id="' + s.id + '">' + (abierta ? 'Cerrar' : 'Asignar reemplazos') + '</button>' +
        (abierta ? formularioReemplazos(s) : '') + '</li>';
    }).join('') + '</ul>';
  }
  // lee las filas del formulario y las guarda: primero borra, luego cambia, luego agrega
  async function guardarReemplazos(s, box) {
    const cambios = [], faltan = [];
    box.querySelectorAll('.reem-fila[data-dia]').forEach((fila) => {
      const f = fila.dataset.dia, ex = reemDe(s.id, f);
      const c = (k) => { const el = fila.querySelector('[data-campo="' + k + '"]'); return el ? el.value.trim() : ''; };
      const tipo = c('tipo');
      if (!tipo) { faltan.push(dDe(f).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })); return; }
      const row = { solicitud_id: s.id, fecha: f, tipo: tipo, personal_id: null, persona_id: null, nombre: '', rut: '', contrato_desde: null, contrato_hasta: null, entrada: c('entrada'), salida: c('salida') };
      if (!/^\d{2}:\d{2}$/.test(row.entrada) || !/^\d{2}:\d{2}$/.test(row.salida)) throw new Error('El día ' + f + ' necesita entrada y salida.');
      if (tipo === 'INTERNO' || tipo === 'PARTTIME') {
        const v = c('persona');
        if (!v) throw new Error('Elige la persona del día ' + f + '.');
        const [pre, id] = v.split(':');
        if (pre === 'I') row.personal_id = Number(id); else row.persona_id = Number(id);
      } else {
        row.nombre = c('nombre'); row.rut = c('rut'); row.contrato_desde = c('desde') || null; row.contrato_hasta = c('hasta') || null;
        if (!row.nombre || !row.rut || !row.contrato_desde || !row.contrato_hasta) throw new Error('El contratado del día ' + f + ' necesita nombre, RUT y fechas del contrato.');
        const rutOk = rutNormal(row.rut);
        if (!rutOk) throw new Error('El RUT del contratado del día ' + f + ' no es válido (revisa el dígito verificador).');
        row.rut = rutOk;
        if (row.contrato_hasta < row.contrato_desde) throw new Error('El contrato "hasta" no puede ser anterior a "desde" (día ' + f + ').');
      }
      // un día que quedó igual no se vuelve a guardar
      if (ex && Object.keys(row).every((k) => String(ex[k] == null ? '' : ex[k]) === String(row[k] == null ? '' : row[k]))) return;
      cambios.push({ f, op: ex ? 'update' : 'insert', id: ex ? ex.id : null, row });
    });
    if (faltan.length) throw new Error('Falta asignar reemplazo en ' + faltan.length + ' día(s): ' + faltan.join(', ') + '. Todas las jornadas de vacaciones deben tener reemplazo.');
    const orden = { delete: 0, update: 1, insert: 2 };
    cambios.sort((a, b) => orden[a.op] - orden[b.op]);
    let n = 0;
    for (const c of cambios) {
      let r;
      if (c.op === 'delete') r = await st.sb.from('vac_reemplazos').delete().eq('id', c.id);
      else if (c.op === 'update') r = await st.sb.from('vac_reemplazos').update(c.row).eq('id', c.id);
      else r = await st.sb.from('vac_reemplazos').insert(c.row);
      if (r.error) throw new Error('Día ' + c.f + ': ' + r.error.message + '. Los cambios anteriores a ese día sí quedaron guardados.');
      n++;
    }
    return n;
  }

  // ================================================================== API para app.js
  const VAC = {
    acceso,
    // acceso a Vacaciones de un usuario (lo lee y lo cambia solo administración; la base lo exige también)
    async accesoDe(uid) {
      if (!st.sb) return null;
      const r = await st.sb.from('vac_accesos').select('*').eq('usuario_id', uid).maybeSingle();
      return r.data || null;
    },
    async guardarAcceso(uid, rol, local) {
      if (!st.sb) throw new Error('Vacaciones no está conectado.');
      if (!rol) {
        const d = await st.sb.from('vac_accesos').delete().eq('usuario_id', uid);
        if (d.error) throw new Error(d.error.message);
        return;
      }
      const r = await st.sb.from('vac_accesos').upsert({ usuario_id: uid, rol: rol, local: rol === 'encargado' ? local : null });
      if (r.error) throw new Error(r.error.message);
    },
    // ¿el módulo está publicado para el personal? (administración y gerencia siempre lo ven)
    async publicado() {
      if (esDirectivo()) return true;
      const r = await st.sb.from('vac_config').select('valor').eq('clave', 'publicado').maybeSingle();
      return !!(r.data && r.data.valor);
    },
    // pantalla del interruptor (solo administración)
    async vistaPublicar(v) {
      const r = await st.sb.from('vac_config').select('valor').eq('clave', 'publicado').maybeSingle();
      const pub = !!(r.data && r.data.valor);
      v.innerHTML = '<div class="cabecera"><h1>Publicar vacaciones</h1><p>Decide cuándo las cuentas de encargado pueden ver el módulo.</p></div>' +
        '<section class="zona"><div class="tarjeta" style="max-width:520px"><p><b>Estado:</b> ' + (pub ? '<span class="vac-ok">Publicado (los encargados lo ven)</span>' : '<span class="vac-error">Oculto (solo administración y gerencia)</span>') + '</p>' +
        '<button type="button" class="btn ama" id="vac-pub-btn">' + (pub ? 'Ocultar de nuevo' : 'Publicar para el personal') + '</button>' +
        '<p class="vac-nota" id="vac-pub-msg"></p></div></section>';
      $('#vac-pub-btn', v).onclick = async () => {
        const nuevo = !pub;
        const up = await st.sb.from('vac_config').update({ valor: nuevo }).eq('clave', 'publicado');
        $('#vac-pub-msg', v).textContent = up.error ? up.error.message : (nuevo ? 'Publicado. Los encargados ya pueden entrar al módulo.' : 'Ocultado. Solo administración y gerencia lo ven.');
        if (!up.error) VAC.vistaPublicar(v);
      };
    },
    vista(v, seccion) {
      st.v = v;
      if (seccion) { st.tab = seccion; st.lateral = true; }
      v.innerHTML = '<div class="cabecera"><h1>Vacaciones</h1><p>Calendario 2027 · diciembre a marzo</p></div><section class="zona"><p class="vac-nota">Cargando…</p></section>';
      cargar().then(() => { render(); }).catch((e) => { st.error = e.message; render(); });
      if (!v.dataset.listo) {
        v.dataset.listo = '1';
        v.addEventListener('click', accion);
        v.addEventListener('focusin', (ev) => {
          const fila = ev.target.closest && ev.target.closest('#reem-form .reem-fila[data-dia]');
          if (!fila) return;
          const valores = {};
          ['tipo', 'persona', 'nombre', 'rut', 'desde', 'hasta', 'entrada', 'salida'].forEach((k) => {
            const x = fila.querySelector('[data-campo="' + k + '"]'); valores[k] = x ? x.value : '';
          });
          fila.dataset.prev = JSON.stringify(valores);
        });
        v.addEventListener('change', (ev) => {
          if (ev.target.id === 'f-loc') { st.locSol = ev.target.value; render(); return; }
          if (ev.target.id === 'reem-bloque') {
            const s = st.sol.find((x) => x.id === st.reemAbierta);
            if (s) precargarRotativo(s, ev.target.value);
            return;
          }
          const campo = ev.target.dataset ? ev.target.dataset.campo : '';
          if (campo === 'rut') {
            const ok = rutNormal(ev.target.value);
            if (ok) ev.target.value = ok;
            ev.target.style.borderColor = ok || !ev.target.value ? '' : '#b91c1c';
            ev.target.title = ok || !ev.target.value ? '' : 'RUT no válido: revisa el dígito verificador';
            return;
          }
          if (['tipo', 'persona', 'nombre', 'rut', 'desde', 'hasta'].indexOf(campo) >= 0) {
            const fila = ev.target.closest('.reem-fila[data-dia]');
            if (campo === 'tipo') mostrarCampos(fila);
            if (campo === 'desde') ajustarHasta(fila);
            if (campo === 'tipo' || campo === 'persona') fila.dataset.modo = '';
            propagarPlantilla(fila, campo === 'tipo' || campo === 'persona');
            actualizarSemana(fila);
            return;
          }
          if (campo === 'entrada' || campo === 'salida') {
            const fila = ev.target.closest('.reem-fila[data-dia]');
            if (fila) actualizarSemana(fila);
            return;
          }
          if (ev.target.id && ev.target.id.indexOf('rep-') === 0) { cambiarReporte(ev.target); return; }
          if (ev.target.id === 'vac-mes') { st.mes = Number(ev.target.value); render(); }
          if (ev.target.id === 'vac-loc') { st.local = ev.target.value; render(); }
        });
      }
    }
  };
  raiz.VAC = VAC;
})(window);
