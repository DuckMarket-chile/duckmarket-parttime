// Part-Time Duck Market · vacaciones de planta (tablas vac_*, ver sql/08_vacaciones.sql).
// Solo aparece a quien tiene acceso en vac_accesos. La base decide las reglas y los permisos:
// esta pantalla muestra los errores de la base tal como llegan, y calcula solo lo que ayuda a ver.
(function (raiz) {
  'use strict';
  const LOCALES = ['ANDES', 'ENCINAS', 'SAN MARTIN'];
  const MESES = [[2026, 11, 'Diciembre 2026'], [2027, 0, 'Enero 2027'], [2027, 1, 'Febrero 2027'], [2027, 2, 'Marzo 2027']];
  const DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  const st = { lateral: false, sb: null, uid: null, acceso: null, personal: [], puestos: [], restr: [], feriados: new Set(), sol: [],
    mes: 1, tab: 'resumen', local: null, aviso: '', error: '', ruts: {}, comp: null, rep: { local: null, mes: 1, vista: 'mensual', estado: 'aprobada' } };

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
    if (!puedeProgramar()) return '<p class="vac-nota">Solo el encargado de cada local programa las vacaciones de su personal.</p>';
    const pers = st.personal.filter((p) => p.local === st.acceso.local && p.tiene_derecho && p.activo !== false && (!st.acceso.turno || p.turno === st.acceso.turno));
    if (!pers.length) return '<p class="vac-nota">No hay personal con derecho a vacaciones en tu local.</p>';
    return '<form id="vac-form" class="vac-form" novalidate>' +
      '<label class="campo"><span>Persona</span><select id="f-per">' + pers.map((p) => '<option value="' + p.id + '">' + esc(p.nombre) + ' · ' + esc(p.cargo) + '</option>').join('') + '</select></label>' +
      '<div id="f-pue-caja"></div>' +
      '<label class="campo"><span>Inicio (día hábil)</span><input id="f-ini" type="date" min="2026-12-01" max="2027-03-31"></label>' +
      '<label class="campo"><span>Días hábiles (1 a 30, lo normal es 10 a 15)</span><input id="f-dias" type="number" min="1" max="30" step="1" inputmode="numeric" value="15"></label>' +
      '<p id="f-vista" class="vac-nota"></p><p id="f-err" class="vac-error"></p>' +
      '<div class="botones"><button class="btn ama" type="submit">Enviar a aprobación</button></div></form>' +
      '<h3 class="vac-sub">Solicitudes de mi local</h3>' + listaSolicitudes(true);
  }
  // puesto: fijo si la persona lo tiene en su ficha; si no (roticeras y reponedores que rotan), se elige
  function pintarPuesto() {
    const per = st.personal.find((p) => String(p.id) === $('#f-per').value);
    const caja = $('#f-pue-caja');
    if (per && per.puesto) {
      caja.innerHTML = '<p class="vac-nota">Puesto fijo: <b>' + esc(per.puesto) + '</b></p>';
      caja.dataset.puesto = per.puesto;
    } else {
      caja.innerHTML = '<label class="campo"><span>Puesto (esta persona rota, elígelo)</span><select id="f-pue">' +
        st.puestos.filter((p) => p.local === st.acceso.local && p.cargo === per.cargo).map((p) => '<option>' + esc(p.puesto) + '</option>').join('') + '</select></label>';
      caja.dataset.puesto = '';
    }
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
    const r = await st.sb.from('vac_solicitudes').insert({ personal_id: per.id, local: st.acceso.local, puesto: puesto, inicio: ini, dias: dias, creado_por: st.uid });
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
    if (!r.local || locs.indexOf(r.local) < 0) r.local = locs[0];
    const [y, m] = MESES[r.mes];
    const selLoc = locs.length > 1 ? '<select id="rep-loc">' + locs.map((l) => '<option' + (l === r.local ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' : '<span class="vac-tag">' + esc(r.local) + '</span>';
    const selMes = '<select id="rep-mes">' + MESES.map((mm, i) => '<option value="' + i + '"' + (i === r.mes ? ' selected' : '') + '>' + mm[2] + '</option>').join('') + '</select>';
    const selVista = '<select id="rep-vista">' + [['mensual', 'Mensual'], ['semanal', 'Semanal'], ['listado', 'Listado completo'], ['saldos', 'Saldos del personal']].map(([k, t]) => '<option value="' + k + '"' + (r.vista === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
    const selEst = '<select id="rep-estado">' + [['aprobada', 'Solo aprobadas'], ['todas', 'Todas (pendientes incluidas)']].map(([k, t]) => '<option value="' + k + '"' + (r.estado === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>';
    const barra = '<div class="vac-barra vac-no-imprimir">' + selLoc + selMes + selVista + selEst +
      '<button type="button" class="btn" data-acc="rep-excel">Exportar a Excel</button><button type="button" class="btn" data-acc="rep-imprimir">Imprimir / PDF</button></div>';
    const titulo = '<h3 class="vac-sub">Vacaciones de planta · ' + esc(r.local) + ' · ' + (r.vista === 'saldos' ? 'saldos del personal al ' + hoyCorto() : r.vista === 'listado' ? 'listado completo' : MESES[r.mes][2]) + '</h3>';
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
    v.querySelectorAll('[data-dia]').forEach((fila) => { mostrarCampos(fila); ajustarHasta(fila); });
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
        st.reemAbierta = id; st.reemPre = {};
        if (!st.partime) st.partime = await leerPersonas();
        await Promise.all(diasAsignables(s).map(async (f) => {
          const r = await st.sb.rpc('vac_horario_precargado', { p_personal_id: s.personal_id, p_fecha: f });
          if (!r.error && r.data && r.data[0]) st.reemPre[f] = r.data[0];
        }));
        render(); return;
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
  // días del período en que se asigna reemplazo: lunes a sábado, sin feriados (el domingo no se trabaja)
  function diasAsignables(s) {
    const out = [];
    for (let d = dDe(s.inicio), h = dDe(s.fin); d <= h; d = sumaD(d, 1)) {
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
  // lo que se elige en un día se copia a los demás días. Los vacíos se completan solos; si otros días ya tienen
  // otro reemplazo, se pregunta si también se cambian (Aceptar = todos; Cancelar = solo este día y los vacíos)
  function propagarPlantilla(fila) {
    const form = fila.closest('#reem-form');
    if (!form) return;
    const leer = (el, k) => { const x = el.querySelector('[data-campo="' + k + '"]'); return x ? x.value : ''; };
    const plantilla = { tipo: leer(fila, 'tipo'), persona: leer(fila, 'persona'), nombre: leer(fila, 'nombre'), rut: leer(fila, 'rut'), desde: leer(fila, 'desde'), hasta: leer(fila, 'hasta') };
    if (!plantilla.tipo) return;
    const otras = [...form.querySelectorAll('[data-dia]')].filter((o) => o !== fila);
    const distintas = otras.filter((o) => {
      if (!leer(o, 'tipo')) return false;
      return Object.keys(plantilla).some((k) => leer(o, k) !== plantilla[k]);
    });
    const cambiarTodos = distintas.length > 0 && window.confirm(
      'Ya hay ' + distintas.length + ' día(s) con otro reemplazo.\n\n' +
      '¿Cambiarlos también a este reemplazo?\n\n' +
      'Aceptar: cambia todos los días.\n' +
      'Cancelar: solo cambia este día y completa los vacíos.');
    otras.forEach((o) => {
      const tipoOtra = leer(o, 'tipo');
      const sobrescribir = cambiarTodos && tipoOtra;
      if (tipoOtra && tipoOtra !== plantilla.tipo && !sobrescribir) return;
      Object.keys(plantilla).forEach((k) => {
        const x = o.querySelector('[data-campo="' + k + '"]');
        if (!x) return;
        if (sobrescribir || (!x.value && plantilla[k])) x.value = plantilla[k];
      });
      mostrarCampos(o); ajustarHasta(o);
    });
  }
  // "hasta" no puede ser anterior a "desde"
  function ajustarHasta(fila) {
    const d = fila.querySelector('[data-campo="desde"]'), h = fila.querySelector('[data-campo="hasta"]');
    if (!d || !h) return;
    h.min = d.value || '';
    if (d.value && h.value && h.value < d.value) h.value = d.value;
  }
  function formularioReemplazos(s) {
    const dias = diasAsignables(s), pre = st.reemPre || {};
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
      const nota = ex ? '' : (pre[f] ? ' <span class="vac-nota">(por defecto)</span>' : ' <span class="vac-nota">(sin horario por defecto: ingrésalo)</span>');
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
    return '<div id="reem-form" style="margin-top:12px"><p class="vac-nota">Hay que asignar reemplazo a <b>todas</b> las jornadas (' + dias.length + ' días). El horario por defecto es el último turno de ' + esc(nombrePersona(s.personal_id)) + ' para ese día de la semana; cámbialo si corresponde.</p>' +
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
    box.querySelectorAll('[data-dia]').forEach((fila) => {
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
        if (row.contrato_hasta < row.contrato_desde) throw new Error('El contrato "hasta" no puede ser anterior a "desde" (día ' + f + ').');
      }
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
      v.innerHTML = '<div class="cabecera"><h1>Publicar vacaciones de planta</h1><p>Decide cuándo las cuentas de encargado pueden ver el módulo.</p></div>' +
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
      v.innerHTML = '<div class="cabecera"><h1>Vacaciones de planta</h1><p>Calendario 2027 · diciembre a marzo</p></div><section class="zona"><p class="vac-nota">Cargando…</p></section>';
      cargar().then(() => { render(); }).catch((e) => { st.error = e.message; render(); });
      if (!v.dataset.listo) {
        v.dataset.listo = '1';
        v.addEventListener('click', accion);
        v.addEventListener('change', (ev) => {
          const campo = ev.target.dataset ? ev.target.dataset.campo : '';
          if (['tipo', 'persona', 'nombre', 'rut', 'desde', 'hasta'].indexOf(campo) >= 0) {
            const fila = ev.target.closest('[data-dia]');
            if (campo === 'tipo') mostrarCampos(fila);
            if (campo === 'desde') ajustarHasta(fila);
            propagarPlantilla(fila);
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
