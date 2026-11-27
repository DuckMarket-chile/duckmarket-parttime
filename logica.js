// Part-Time Duck Market · reglas y cálculos (sin pantalla). Mismo comportamiento que el programa de escritorio.
// Se usa en el navegador (window.L) y en las pruebas con Node (module.exports).
(function (raiz) {
  'use strict';
  const SUCURSALES = ['ANDES', 'ENCINAS', 'SAN MARTIN'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  // mismos permisos y grupos que el programa de escritorio (1.4+)
  const GRUPOS_PERMISOS = [
    ['Registros del día', [
      ['Registrar', 'Registrar nuevos part-time'], ['Modificar', 'Modificar registros'], ['Eliminar', 'Eliminar registros'],
      ['EditarAnteriores', 'Modificar / eliminar registros de días anteriores'],
      ['EditarOtras', 'Registrar / modificar / eliminar en otras sucursales (de las que puede ver)'],
      ['ModificarPagado', 'Cambiar turnos de quincenas que ya tienen pagos'],
      ['VerMontos', 'Ver montos (pagos, locomoción, totales)'], ['VerResumen', 'Ver resumen del mes'],
      ['AbrirExcel', 'Abrir una copia del Excel (solo programa de escritorio)']]],
    ['Sucursales', [['VerOtras', 'Ver todas las sucursales (si no, solo la suya)']]],
    ['Planificación', [
      ['Planificar', 'Planificar part-time y confirmar asistencia en su sucursal'],
      ['PlanificarOtras', 'Planificar y confirmar asistencia en otras sucursales (de las que puede ver)'],
      ['DiasPlan', 'Definir días a planificar y dotación requerida'], ['ReportesPlan', 'Ver reportes de planificación']]],
    ['Pagos', [
      ['Pagos', 'Ver pagos quincenales (requiere ver todas las sucursales)'], ['VerPagosLocal', 'Ver estado y monto de pago de los part-time de su sucursal (solo lectura)'], ['RegistrarPago', 'Registrar pagos'],
      ['AnularPago', 'Anular pagos'], ['Conciliar', 'Conciliar con el estado de cuenta de Mercado Pago']]],
    ['Base de part-time', [
      ['Personas', 'Ver la base de part-time (datos personales)'], ['VerBancos', 'Ver y cambiar datos bancarios de part-time (banco, tipo y N° de cuenta)'], ['EditarPersonas', 'Agregar, modificar y desactivar personas']]],
    ['Informes y administración', [
      ['Exportar', 'Descargar informes en Excel'], ['Historial', 'Ver el historial de cambios'],
      ['Usuarios', 'Administrar usuarios (sin poder dar más permisos que los propios)'],
      ['Correos', 'Enviar resúmenes por correo (solo programa de escritorio)']]]
  ];
  const PERMISOS = GRUPOS_PERMISOS.reduce((s, g) => s.concat(g[1]), []);
  // un permiso sin el permiso del que depende no sirve
  const DEPENDE_DE = { Pagos: 'VerOtras', Correos: 'VerOtras', RegistrarPago: 'Pagos', AnularPago: 'Pagos', Conciliar: 'Pagos',
    EditarPersonas: 'Personas', VerBancos: 'Personas', PlanificarOtras: 'Planificar', AbrirExcel: 'VerMontos' };
  function conDependencias(lista) {
    let s = new Set(lista), cambio = true;
    while (cambio) { cambio = false; for (const k of [...s]) if (DEPENDE_DE[k] && !s.has(DEPENDE_DE[k])) { s.delete(k); cambio = true; } }
    return PERMISOS.map((p) => p[0]).filter((k) => s.has(k));
  }

  // ---------------------------------------------------------------- fechas (siempre 'AAAA-MM-DD', sin zona horaria)
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const aFecha = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
  const hoyChile = () => {
    // fecha de Chile aunque el PC tenga otra zona
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()); } catch (e) { return iso(new Date()); }
  };
  const sumarDias = (s, n) => { const d = aFecha(s); d.setDate(d.getDate() + n); return iso(d); };
  const fechaTxt = (s) => s ? s.slice(8, 10) + '-' + s.slice(5, 7) + '-' + s.slice(0, 4) : '';
  const diaSemana = (s) => DIAS[aFecha(s).getDay()];
  const fechaLarga = (s) => { const d = aFecha(s); return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' ' + d.getFullYear(); };

  function quincenaDe(s) {
    const d = aFecha(s), a = d.getFullYear(), m = d.getMonth();
    const clave = a + '-' + pad(m + 1) + (d.getDate() <= 15 ? '-Q1' : '-Q2');
    if (d.getDate() <= 15) return { desde: iso(new Date(a, m, 1)), hasta: iso(new Date(a, m, 15)), clave };
    return { desde: iso(new Date(a, m, 16)), hasta: iso(new Date(a, m + 1, 0)), clave };
  }
  function quincenaDeClave(clave) {
    const [a, m, q] = clave.split('-');
    return quincenaDe(a + '-' + m + (q === 'Q1' ? '-01' : '-16'));
  }
  function quincenaTxt(q, corto) {
    const d = aFecha(q.desde), h = aFecha(q.hasta);
    const t = (d.getDate() === 1 ? '1ª' : '2ª') + ' quincena de ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
    return corto ? d.getDate() + ' al ' + h.getDate() + ' de ' + MESES[d.getMonth()] : t + ' (' + fechaTxt(q.desde).slice(0, 5) + ' al ' + fechaTxt(q.hasta).slice(0, 5) + ')';
  }
  function ultimasQuincenas(n, desde) {
    const res = []; let q = quincenaDe(desde || hoyChile());
    for (let i = 0; i < n; i++) { res.push(q); q = quincenaDe(sumarDias(q.desde, -1)); }
    return res;
  }

  // ---------------------------------------------------------------- horas y montos
  const minutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  function calcHoras(entrada, salida, colacion) {
    if (!/^\d{2}:\d{2}$/.test(entrada || '') || !/^\d{2}:\d{2}$/.test(salida || '')) return null;
    let d = minutos(salida) - minutos(entrada);
    if (d < 0) d += 1440;               // turno que pasa la medianoche
    d -= Number(colacion || 0);
    return Math.round(Math.max(d, 0) / 60 * 100) / 100;
  }
  function parseHora(t) {
    t = String(t || '').trim().replace('.', ':').replace(',', ':');
    let m = t.match(/^(\d{1,2}):?(\d{2})?$/);
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2] || 0);
    if (h > 23 || mi > 59) return null;
    return pad(h) + ':' + pad(mi);
  }
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^\d,-]/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const peso = (v) => '$' + Math.round(Number(v || 0)).toLocaleString('es-CL');
  const horasTxt = (h) => (Math.round(Number(h || 0) * 100) / 100).toString().replace('.', ',');

  // ---------------------------------------------------------------- nombres y RUT
  const normNombre = (n) => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const normRut = (r) => String(r || '').replace(/[^0-9kK]/g, '').toUpperCase();
  function formatearRut(rut) {
    const c = normRut(rut);
    if (c.length < 2) return null;
    const cuerpo = c.slice(0, -1), dv = c.slice(-1);
    if (!/^\d+$/.test(cuerpo)) return null;
    let s = 0, f = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) { s += Number(cuerpo[i]) * f; f = f === 7 ? 2 : f + 1; }
    const r = 11 - (s % 11), esp = r === 11 ? '0' : r === 10 ? 'K' : String(r);
    if (esp !== dv) return null;
    return Number(cuerpo).toLocaleString('es-CL') + '-' + dv;
  }
  const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'van', 'von', 'el']);
  const ROMANOS = new Set(['ii', 'iii', 'iv', 'vi', 'vii', 'viii', 'ix', 'xi', 'xii']);
  function nombrePropio(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ', ');
    return t.split(' ').map((w, i) => {
      const lw = w.toLowerCase();
      if (i > 0 && PARTICULAS.has(lw)) return lw;
      if (ROMANOS.has(lw)) return lw.toUpperCase();
      return lw.replace(/(^|[-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    }).join(' ');
  }
  function variantes(p) { return [p.nombre].concat(String(p.variantes || '').split('|')).map((v) => v.trim()).filter(Boolean); }
  function buscarPersona(personas, nombre, rut) {
    const r = normRut(rut);
    if (r) { const p = personas.find((x) => normRut(x.rut) === r); if (p) return p; }
    const n = normNombre(nombre);
    if (!n) return null;
    return personas.find((x) => variantes(x).some((v) => normNombre(v) === n)) || null;
  }
  function sugerirPersonas(personas, texto, max) {
    const t = normNombre(texto), r = normRut(texto);
    if (!t) return [];
    const res = personas.filter((p) => p.activo !== false && (variantes(p).some((v) => normNombre(v).includes(t)) || (r.length >= 3 && normRut(p.rut).startsWith(r))));
    res.sort((a, b) => (normNombre(a.nombre).startsWith(t) ? 0 : 1) - (normNombre(b.nombre).startsWith(t) ? 0 : 1) || a.nombre.localeCompare(b.nombre));
    return res.slice(0, max || 8);
  }

  // ---------------------------------------------------------------- pagos por quincena (todas las sucursales)
  function resumenQuincena(turnos, abonos, q) {
    const grupos = new Map();
    for (const t of turnos) if (t.fecha >= q.desde && t.fecha <= q.hasta) {
      const k = normNombre(t.nombre); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t);
    }
    const abQ = abonos.filter((a) => a.quincena === q.clave);
    const claves = new Set([...grupos.keys(), ...abQ.filter((a) => a.estado === 'VIGENTE').map((a) => normNombre(a.nombre))]);
    const filas = [];
    for (const k of claves) {
      const g = (grupos.get(k) || []).slice().sort((a, b) => (a.fecha + a.entrada + a.sucursal).localeCompare(b.fecha + b.entrada + b.sucursal));
      const mis = abQ.filter((a) => normNombre(a.nombre) === k).sort((a, b) => a.id - b.id);
      const vig = mis.filter((a) => a.estado === 'VIGENTE');
      const nombre = g.length ? g[g.length - 1].nombre : mis[mis.length - 1].nombre;
      const rut = (g.slice().reverse().find((t) => t.rut) || {}).rut || (mis[0] || {}).rut || '';
      const pagos = g.reduce((s, t) => s + Number(t.pago), 0), loc = g.reduce((s, t) => s + Number(t.locomocion), 0);
      const total = pagos + loc, pagado = vig.reduce((s, a) => s + Number(a.monto), 0), saldo = total - pagado;
      const estado = pagado <= 0 ? 'PENDIENTE' : saldo > 0.5 ? 'PARCIAL' : saldo < -0.5 ? 'PAGADO DE MÁS' : 'PAGADO';
      filas.push({ quincena: q.clave, desde: q.desde, hasta: q.hasta, nombre, rut,
        sucursales: [...new Set(g.map((t) => t.sucursal))].sort().join(', '), dias: new Set(g.map((t) => t.fecha)).size,
        horas: g.reduce((s, t) => s + Number(t.horas), 0), pagos, locomocion: loc, total, pagado, saldo, estado,
        ultimoPago: vig.map((a) => a.fecha_pago).filter(Boolean).sort().pop() || null, abonos: mis, turnos: g });
    }
    return filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  function quincenaConPagos(abonos, nombre, fecha) {
    const q = quincenaDe(fecha).clave, n = normNombre(nombre);
    return abonos.filter((a) => a.estado === 'VIGENTE' && a.quincena === q && normNombre(a.nombre) === n).reduce((s, a) => s + Number(a.monto), 0);
  }

  // ---------------------------------------------------------------- conciliación con la cartola de Mercado Pago
  const CONC_DIAS = 5;
  const montoCL = (s) => { const n = Number(String(s || '').trim().replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  function partirCSV(linea, sep) {
    const res = []; let cur = '', q = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (q) { if (c === '"') { if (linea[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === sep) { res.push(cur); cur = ''; } else cur += c;
    }
    res.push(cur); return res;
  }
  function leerCartolaMP(texto) {
    const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
    const ini = lineas.findIndex((l) => l.toUpperCase().startsWith('RELEASE_DATE;'));
    if (ini < 0) throw new Error('No parece un estado de cuenta de Mercado Pago (falta la columna RELEASE_DATE).');
    const cab = partirCSV(lineas[ini], ';').map((c) => c.trim().toUpperCase());
    const col = (f, n) => (f[cab.indexOf(n)] || '').trim();
    const trans = [], fechas = []; let total = 0;
    for (const l of lineas.slice(ini + 1)) {
      if (!l.trim()) continue;
      const f = partirCSV(l, ';'); total++;
      const fh = col(f, 'RELEASE_DATE'), m = fh.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
      if (!m) continue;
      const fecha = m[3] + '-' + m[2] + '-' + m[1];
      fechas.push(fecha);
      const tipo = col(f, 'TRANSACTION_TYPE').toLowerCase();
      if (col(f, 'MOVEMENT_TYPE').toLowerCase() === 'cargo' && tipo.startsWith('transferencia enviada'))
        trans.push({ fecha, fechaHora: fecha + ' ' + (m[4] || '00:00:00'), id: col(f, 'TRANSACTION_ID'),
          monto: Math.abs(montoCL(col(f, 'TRANSACTION_NET_AMOUNT'))), destinatario: col(f, 'STORE_NAME').replace(/\s+/g, ' ') });
    }
    if (!fechas.length) throw new Error('El archivo no tiene movimientos.');
    fechas.sort();
    return { desde: fechas[0], hasta: fechas[fechas.length - 1], totalMovs: total, transferencias: trans };
  }
  const tokens = (s) => new Set(normNombre(s).split(' ').filter((t) => t.length > 2));
  function personaDeDestinatario(personas, nombre) {
    if (!nombre) return [null, ''];
    const p = buscarPersona(personas, nombre);
    if (p) return [p, 'exacto'];
    const tn = tokens(nombre);
    if (tn.size < 2) return [null, ''];
    const punt = personas.map((q) => [Math.max(...variantes(q).map((c) => [...tokens(c)].filter((x) => tn.has(x)).length)), q]).sort((a, b) => b[0] - a[0]);
    if (punt.length && punt[0][0] >= 2 && (punt.length === 1 || punt[1][0] < punt[0][0])) return [punt[0][1], 'aproximado'];
    return [null, ''];
  }
  function saldosPorPersona(turnos, abonos) {
    const qs = new Map();
    for (const t of turnos) { const q = quincenaDe(t.fecha); qs.set(q.clave, q); }
    const res = new Map();
    for (const q of [...qs.values()].sort((a, b) => a.desde.localeCompare(b.desde)))
      for (const f of resumenQuincena(turnos, abonos, q)) if (f.saldo > 0.5) {
        const k = normNombre(f.nombre); if (!res.has(k)) res.set(k, []); res.get(k).push(Object.assign({}, f));
      }
    return res;
  }
  const diasEntre = (a, b) => Math.round((aFecha(a) - aFecha(b)) / 86400000);
  function conciliar(cartola, personas, turnos, abonos) {
    const usados = new Set(abonos.filter((a) => a.comprobante).map((a) => a.comprobante));
    const vig = abonos.filter((a) => a.estado === 'VIGENTE'), abonoUsado = new Set();
    const saldos = saldosPorPersona(turnos, abonos);
    const aPart = [], otras = [];
    for (const t of cartola.transferencias.slice().sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))) {
      const [per, calce] = personaDeDestinatario(personas, t.destinatario);
      if (!per) { otras.push(t); continue; }
      const fila = Object.assign({}, t, { persona: per.nombre, rut: per.rut, calce, estado: '', detalle: '', asignacion: [], idPago: 0, sobrante: 0 });
      const k = normNombre(per.nombre);
      if (t.id && usados.has(t.id)) {
        const ab = abonos.find((a) => a.comprobante === t.id);
        Object.assign(fila, { estado: 'YA REGISTRADO', idPago: ab.id, detalle: 'Pago N°' + ab.id + ' (' + ab.estado + ')' });
        abonoUsado.add(ab.id);
      } else {
        const cand = vig.filter((a) => !abonoUsado.has(a.id) && normNombre(a.nombre) === k && Math.abs(a.monto - t.monto) < 1 && a.fecha_pago && Math.abs(diasEntre(a.fecha_pago, t.fecha)) <= CONC_DIAS);
        if (cand.length) {
          const ab = cand.sort((a, b) => Math.abs(diasEntre(a.fecha_pago, t.fecha)) - Math.abs(diasEntre(b.fecha_pago, t.fecha)))[0];
          abonoUsado.add(ab.id);
          Object.assign(fila, { estado: 'CONCILIADO', idPago: ab.id, detalle: 'Pago N°' + ab.id + ' del ' + fechaTxt(ab.fecha_pago) + ' (' + quincenaTxt(ab, true) + ')' });
        } else {
          let restante = t.monto; const asign = [];
          const todas = saldos.get(k) || [];
          const qs = todas.filter((q) => q.desde <= t.fecha);       // no se paga trabajo que aún no ocurre
          const exacta = qs.find((q) => Math.abs(q.saldo - restante) < 1);
          for (const q of (exacta ? [exacta] : qs)) {
            if (restante < 1) break;
            const aplica = Math.min(restante, q.saldo);
            asign.push({ quincena: q.quincena, desde: q.desde, hasta: q.hasta, nombre: q.nombre, rut: q.rut || per.rut, monto: aplica });
            q.pagado += aplica; q.saldo -= aplica; restante -= aplica;
          }
          saldos.set(k, todas.filter((q) => q.saldo > 0.5));
          if (asign.length) {
            let det = asign.map((x) => quincenaTxt(x, true) + ' ' + peso(x.monto)).join(' + ');
            if (restante >= 1) det += ' · sobran ' + peso(restante) + ' (no hay más saldo)';
            Object.assign(fila, { estado: 'SUGERIDO', asignacion: asign, detalle: det, sobrante: restante });
          } else Object.assign(fila, { estado: 'SIN SALDO', detalle: 'No hay turnos con saldo por pagar para esta persona' });
        }
      }
      aPart.push(fila);
    }
    const sinRespaldo = vig.filter((a) => !abonoUsado.has(a.id) && a.fecha_pago && a.fecha_pago >= cartola.desde && a.fecha_pago <= cartola.hasta)
      .sort((a, b) => (a.fecha_pago + a.nombre).localeCompare(b.fecha_pago + b.nombre));
    return { partTime: aPart, otras, sinRespaldo };
  }

  // ---------------------------------------------------------------- revisar una quincena antes de pagar
  function revisarQuincena(turnos, planes, personas, q, hoy) {
    hoy = hoy || hoyChile();
    const res = [], tq = turnos.filter((t) => t.fecha >= q.desde && t.fecha <= q.hasta);
    for (const p of planes) if (p.estado === 'PLANIFICADO' && p.fecha >= q.desde && p.fecha <= (q.hasta < hoy ? q.hasta : hoy))
      res.push(['Planificado sin confirmar', p.fecha, p.sucursal, p.nombre, p.entrada + ' a ' + p.salida + ': confirma si asistió o no']);
    for (const t of tq) {
      if (!t.rut) res.push(['Turno sin RUT', t.fecha, t.sucursal, t.nombre, 'Completa el RUT (en Personas o al modificar el turno)']);
      if (!Number(t.pago)) res.push(['Pago en $0', t.fecha, t.sucursal, t.nombre, 'Revisa el pago del día']);
    }
    const grupos = new Map();
    for (const t of tq) { const k = t.fecha + '|' + normNombre(t.nombre); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t); }
    for (const rs of grupos.values()) {
      rs.sort((a, b) => minutos(a.entrada) - minutos(b.entrada));
      for (let i = 1; i < rs.length; i++) {
        const a = rs[i - 1], b = rs[i];
        if (minutos(b.entrada) < minutos(a.salida))
          res.push([a.entrada === b.entrada && a.salida === b.salida ? 'Turno duplicado' : 'Horarios que se cruzan', b.fecha, b.sucursal, b.nombre,
            a.sucursal + ' ' + a.entrada + '-' + a.salida + ' y ' + b.sucursal + ' ' + b.entrada + '-' + b.salida]);
      }
    }
    if (personas && personas.length) {
      const vistos = new Set();
      for (const t of tq) {
        const k = normNombre(t.nombre); if (vistos.has(k)) continue; vistos.add(k);
        if (!buscarPersona(personas, t.nombre, t.rut)) res.push(['No está en la base', t.fecha, t.sucursal, t.nombre, 'Avisa a la oficina para agregarla a la base de part-time']);
      }
    }
    return res.sort((a, b) => (a[1] + a[0] + a[3]).localeCompare(b[1] + b[0] + b[3]));
  }

  // ---------------------------------------------------------------- planificación
  function cobertura(dia, planes, suc) {
    const pedida = Number((dia.dotacion || {})[suc] || 0);
    const asign = planes.filter((p) => p.fecha === dia.fecha && p.sucursal === suc && p.estado !== 'CANCELADO').length;
    return { pedida, asign, falta: Math.max(pedida - asign, 0) };
  }

  const L = { SUCURSALES, GRUPOS_PERMISOS, PERMISOS, DEPENDE_DE, conDependencias, revisarQuincena, DIAS, MESES, pad, iso, aFecha, hoyChile, sumarDias, fechaTxt, diaSemana, fechaLarga,
    quincenaDe, quincenaDeClave, quincenaTxt, ultimasQuincenas, calcHoras, parseHora, num, peso, horasTxt,
    normNombre, normRut, formatearRut, nombrePropio, variantes, buscarPersona, sugerirPersonas,
    resumenQuincena, quincenaConPagos, leerCartolaMP, personaDeDestinatario, saldosPorPersona, conciliar, cobertura };
  // funciones que cumple cada persona en el turno (Part-Time)
  L.FUNCIONES = [['CAJA', 'Caja'], ['ROTICERIA', 'Rotisería'], ['REPONEDOR', 'Reponedor'], ['ENCARGADO', 'Encargado'], ['PANADERIA', 'Panadería']];
  L.nombreFuncion = (c) => { const f = L.FUNCIONES.find((x) => x[0] === c); return f ? f[1] : ''; };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else raiz.L = L;
})(this);
