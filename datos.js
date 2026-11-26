// Part-Time Duck Market · acceso a datos.
//  - Con config.js completo usa Supabase (la base decide los permisos de cada usuario).
//  - Sin config (o con ?demo en la dirección) usa datos de ejemplo en memoria, para probar la página.
(function (raiz) {
  'use strict';
  const L = raiz.L;
  const CFG = raiz.CONFIG_PARTTIME || {};
  const usarDemo = /[?&]demo\b/.test(location.search) || !CFG.url || !CFG.clave || CFG.url.indexOf('PEGA') >= 0;

  const correoDe = (usuario) => usuario.indexOf('@') >= 0 ? usuario.trim().toLowerCase() : usuario.trim().toLowerCase() + '@' + (CFG.dominio || 'parttime.duckmarket.cl');
  const traducir = (m) => {
    m = String(m || '');
    if (/Invalid login credentials/i.test(m)) return 'Usuario o clave incorrectos.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión con la base. Revisa internet e intenta de nuevo.';
    if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto.';
    if (/duplicate key.*personas_nombre/i.test(m)) return 'Ya existe una persona con ese nombre.';
    if (/JWT expired/i.test(m)) return 'La sesión expiró. Vuelve a entrar.';
    return m;
  };

  // ================================================================== Supabase
  function crearSupabase() {
    const sb = raiz.supabase.createClient(CFG.url, CFG.clave, { auth: { persistSession: true, storageKey: 'parttime-sesion' } });
    let perfil = null;
    const ok = (r) => { if (r.error) throw new Error(traducir(r.error.message)); return r.data; };
    async function todo(armar) {           // Supabase entrega de a 1000 filas
      let res = [], i = 0;
      for (;;) { const d = ok(await armar().range(i, i + 999)); res = res.concat(d); if (d.length < 1000) return res; i += 1000; }
    }
    async function cargarPerfil() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const d = ok(await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle());
      if (!d) throw new Error('Tu cuenta no tiene un perfil de Part-Time. Pide al administrador que lo cree.');
      if (!d.activo) throw new Error('Tu usuario está desactivado.');
      perfil = d; return d;
    }
    return {
      demo: false,
      cliente: () => sb,   // Vacaciones usa el mismo cliente de Supabase para leer su acceso y sus datos
      async sesion() { const { data } = await sb.auth.getSession(); return data.session ? cargarPerfil() : null; },
      async entrar(usuario, clave) {
        ok(await sb.auth.signInWithPassword({ email: correoDe(usuario), password: clave }));
        try { return await cargarPerfil(); } catch (e) { await sb.auth.signOut(); throw e; }
      },
      async salir() { await sb.auth.signOut(); perfil = null; },
      cliente: () => sb,
      async cambiarClave(nueva) { ok(await sb.auth.updateUser({ password: nueva })); },

      turnos: (f) => todo(() => { let q = sb.from('turnos').select('*').order('fecha').order('entrada').order('id');
        if (f.desde) q = q.gte('fecha', f.desde); if (f.hasta) q = q.lte('fecha', f.hasta); if (f.sucursal) q = q.eq('sucursal', f.sucursal); return q; }),
      async guardarTurno(t) {
        const campos = { fecha: t.fecha, sucursal: t.sucursal, nombre: t.nombre, rut: t.rut || '', entrada: t.entrada, salida: t.salida,
          colacion: t.colacion || 0, pago: t.pago || 0, locomocion: t.locomocion || 0, obs: t.obs || '', funcion: t.funcion || '' };
        return t.id ? ok(await sb.from('turnos').update(campos).eq('id', t.id).select().single())
                    : ok(await sb.from('turnos').insert(campos).select().single());
      },
      async eliminarTurno(id) { const d = ok(await sb.from('turnos').delete().eq('id', id).select()); if (!d.length) throw new Error('No tienes permiso para eliminar este turno.'); },

      personasLista: () => todo(() => sb.from('personas_lista').select('*').order('nombre')),
      personas: () => todo(() => sb.from('personas').select('*').order('nombre')),
      async guardarPersona(p) {
        const c = { nombre: p.nombre, rut: p.rut || '', telefono: p.telefono || '', direccion: p.direccion || '', correo: p.correo || '',
          banco: p.banco || '', tipo_cuenta: p.tipo_cuenta || '', cuenta: p.cuenta || '', activo: p.activo !== false, variantes: p.variantes || '',
          obs: p.obs || '', actualizado: new Date().toISOString(), usuario: perfil ? perfil.usuario : '' };
        return p.id ? ok(await sb.from('personas').update(c).eq('id', p.id).select().single()) : ok(await sb.from('personas').insert(c).select().single());
      },

      abonos: () => todo(() => sb.from('abonos').select('*').order('id')),
      async registrarAbono(a) {
        return ok(await sb.rpc('registrar_abono', { p_nombre: a.nombre, p_rut: a.rut || '', p_quincena: a.quincena, p_monto: a.monto,
          p_fecha_pago: a.fecha_pago, p_obs: a.obs || '', p_comprobante: a.comprobante || '' }));
      },
      async anularAbono(id) { ok(await sb.rpc('anular_abono', { p_id: id })); },
      async emitirComprobantePartime(id) { return ok(await sb.rpc('emitir_comprobante_partime', { p_abono: id })); },
      async comprobantesPartime() { return todo(() => sb.from('comprobantes_partime').select('*')); },
      async pagosLocal(quincena, sucursal) { return ok(await sb.rpc('pagos_de_mi_local', { p_quincena: quincena, p_sucursal: sucursal })); },
      async marcarComprobante(id, comp) { ok(await sb.from('abonos').update({ comprobante: comp }).eq('id', id)); },

      dias: (f) => todo(() => { let q = sb.from('dias').select('*').order('fecha'); if (f && f.desde) q = q.gte('fecha', f.desde); if (f && f.hasta) q = q.lte('fecha', f.hasta); return q; }),
      async guardarDia(d) {
        ok(await sb.from('dias').upsert({ fecha: d.fecha, nombre: d.nombre || '', dotacion: d.dotacion, activo: d.activo !== false, obs: d.obs || '',
          actualizado: new Date().toISOString(), usuario: perfil ? perfil.usuario : '' }));
      },
      async eliminarDia(fecha) { ok(await sb.from('dias').delete().eq('fecha', fecha)); },
      feriados: () => todo(() => sb.from('feriados').select('*').order('fecha')),
      presupuestos: (mes) => todo(() => sb.from('presupuestos').select('*').eq('mes', mes)),
      async guardarPresupuesto(p) { ok(await sb.from('presupuestos').upsert({ mes: p.mes, sucursal: p.sucursal, monto: p.monto, actualizado_por: perfil.usuario }, { onConflict: 'mes,sucursal' })); },

      plan: (f) => todo(() => { let q = sb.from('plan').select('*').order('fecha').order('entrada').order('id');
        if (f.desde) q = q.gte('fecha', f.desde); if (f.hasta) q = q.lte('fecha', f.hasta); if (f.sucursal) q = q.eq('sucursal', f.sucursal); return q; }),
      async guardarPlan(p) {
        const c = { fecha: p.fecha, sucursal: p.sucursal, nombre: p.nombre, rut: p.rut || '', entrada: p.entrada, salida: p.salida,
          colacion: p.colacion || 0, pago: p.pago || 0, locomocion: p.locomocion || 0, obs: p.obs || '', funcion: p.funcion || '' };
        return p.id ? ok(await sb.from('plan').update(c).eq('id', p.id).select().single()) : ok(await sb.from('plan').insert(c).select().single());
      },
      async cancelarPlan(id, motivo) { ok(await sb.from('plan').update({ estado: 'CANCELADO', motivo: motivo || '' }).eq('id', id)); },
      async confirmarPlan(id, t, turnoExistente) {
        return ok(await sb.rpc('confirmar_plan', { p_plan: id, p_entrada: t.entrada, p_salida: t.salida, p_colacion: t.colacion || 0,
          p_pago: t.pago || 0, p_locomocion: t.locomocion || 0, p_obs: t.obs || '', p_turno_existente: turnoExistente || null }));
      },
      async inasistencia(id, motivo) { ok(await sb.rpc('marcar_inasistencia', { p_plan: id, p_motivo: motivo || '' })); },

      historial: (f) => todo(() => { let q = sb.from('historial').select('*').order('id', { ascending: false });
        if (f.desde) q = q.gte('cuando', f.desde); return q.limit(f.limite || 2000); }),
      perfiles: () => todo(() => sb.from('perfiles').select('*').order('usuario')),
      async crearUsuario(u) {
        const r = await sb.functions.invoke('crear-usuario', { body: u });
        if (r.error) { let m = r.error.message || 'No se pudo crear el usuario'; try { const j = await r.error.context.json(); m = j.error || m; } catch (e) {} throw new Error(m); }
        if (!r.data || !r.data.ok) throw new Error((r.data && r.data.error) || 'No se pudo crear el usuario');
        return r.data;
      },
      async guardarPerfil(p) {
        ok(await sb.from('perfiles').update({ nombre: p.nombre, sucursal: p.sucursal || null, rol: p.rol, admin: p.rol === 'admin', permisos: p.rol === 'admin' ? [] : p.permisos, activo: p.activo !== false }).eq('id', p.id));
      },
      roles: () => todo(() => sb.from('roles').select('*').order('nombre')),
      async guardarRol(r) { ok(await sb.from('roles').upsert({ id: r.id, nombre: r.nombre, permisos: r.permisos, sistema: !!r.sistema })); },
      async eliminarRol(id) { ok(await sb.from('roles').delete().eq('id', id)); }
    };
  }

  // ================================================================== datos de ejemplo (sin base)
  function crearDemo() {
    const hoy = L.hoyChile(), d = (n) => L.sumarDias(hoy, n);
    const rolesDemo = [
      { id: 'gerente', nombre: 'Gerente', sistema: true, permisos: ['Registrar', 'Modificar', 'Eliminar', 'EditarAnteriores', 'EditarOtras', 'VerMontos', 'VerResumen', 'AbrirExcel', 'VerOtras', 'Planificar', 'PlanificarOtras', 'DiasPlan', 'ReportesPlan', 'Pagos', 'Personas', 'Exportar', 'Historial'] },
      { id: 'sucursal', nombre: 'Sucursal', sistema: true, permisos: ['Registrar', 'Modificar', 'VerMontos', 'VerResumen', 'Planificar', 'ReportesPlan'] }
    ];
    const suc0 = rolesDemo[1].permisos;
    const perfilesDemo = [
      { id: 'u1', usuario: 'admin', nombre: 'Administrador', sucursal: null, rol: 'admin', admin: true, permisos: [], activo: true },
      { id: 'u5', usuario: 'gerente', nombre: 'Gerente', sucursal: null, rol: 'gerente', admin: false, permisos: rolesDemo[0].permisos.concat(['RegistrarPago', 'AnularPago', 'Conciliar', 'EditarPersonas']), activo: true },
      { id: 'u2', usuario: 'andes', nombre: 'Encargado Andes', sucursal: 'ANDES', rol: 'sucursal', admin: false, permisos: suc0.concat(['Historial', 'VerPagosLocal']), activo: true },
      { id: 'u3', usuario: 'encinas', nombre: 'Encargado Encinas', sucursal: 'ENCINAS', rol: 'sucursal', admin: false, permisos: suc0.slice(), activo: true },
      { id: 'u4', usuario: 'sanmartin', nombre: 'Encargado San Martín', sucursal: 'SAN MARTIN', rol: 'sucursal', admin: false, permisos: suc0.filter((k) => k !== 'Planificar'), activo: true }
    ];
    const nombres = ['Camila Rojas Fuentes', 'Matías Henríquez Lagos', 'Valentina Soto Pérez', 'Diego Araya Muñoz', 'Fernanda Castro Vidal',
      'Ignacio Paredes Silva', 'Javiera Núñez Toro', 'Tomás Fuentes Reyes', 'Andrea Molina Vera'];
    const personas = nombres.map((n, i) => ({ id: i + 1, nombre: n, rut: '', telefono: '9 ' + (61234560 + i), direccion: '', correo: '', banco: i % 2 ? 'BancoEstado' : 'Banco de Chile',
      tipo_cuenta: i % 2 ? 'Cuenta RUT' : 'Cuenta Corriente', cuenta: String(10000000 + i * 137), activo: true, variantes: i === 2 ? 'VALENTINA SOTO P' : '', obs: '', actualizado: '', usuario: '' }));
    let turnos = [], abonos = [], plan = [], dias = [], historial = [], sig = { t: 1, a: 1, p: 1, h: 1 }, presup = [], compsPT = [];
    let perfil = null;
    const suc = ['ANDES', 'ENCINAS', 'SAN MARTIN'];
    const q = L.quincenaDe(hoy), qAnt = L.quincenaDe(L.sumarDias(q.desde, -1));
    for (let k = 0; k < 26; k++) {
      const f = L.sumarDias(qAnt.desde, k);
      if (f > hoy) break;
      if (L.aFecha(f).getDay() % 3 !== 0 && k % 4) continue;
      for (let j = 0; j < 2; j++) {
        const n = nombres[(k + j * 3) % nombres.length], s = suc[(k + j) % 3];
        turnos.push({ id: sig.t++, fecha: f, sucursal: s, nombre: n, rut: '', entrada: j ? '15:00' : '09:00', salida: j ? '21:00' : '15:00', colacion: 0, horas: 6,
          pago: 25000, locomocion: (k + j) % 3 ? 0 : 4000, total: 0, obs: '', creado_el: f + 'T12:00:00', creado_por: s.toLowerCase().replace(' ', '') });
      }
    }
    turnos.forEach((t) => { t.total = t.pago + t.locomocion; });
    for (const n of nombres.slice(0, 4)) {
      const tot = turnos.filter((t) => t.nombre === n && t.fecha >= qAnt.desde && t.fecha <= qAnt.hasta).reduce((s, t) => s + t.total, 0);
      if (tot) abonos.push({ id: sig.a++, quincena: qAnt.clave, desde: qAnt.desde, hasta: qAnt.hasta, nombre: n, rut: '', monto: n === nombres[1] ? Math.round(tot / 2) : tot,
        fecha_pago: L.sumarDias(qAnt.hasta, 2) > hoy ? hoy : L.sumarDias(qAnt.hasta, 2), obs: 'Transferencia', estado: 'VIGENTE', total_quincena: tot, pagado_antes: 0,
        saldo_despues: 0, registrado_el: '', usuario: 'admin', anulado_el: null, anulado_por: '', comprobante: '' });
    }
    // próximos domingos y hoy
    const proximos = [hoy];
    for (let k = 1; proximos.length < 4 && k < 40; k++) if (L.aFecha(d(k)).getDay() === 0) proximos.push(d(k));
    proximos.forEach((f, i) => dias.push({ fecha: f, nombre: i === 0 ? 'Día de prueba' : 'Domingo', dotacion: { ANDES: 3, ENCINAS: 2 + (i % 2), 'SAN MARTIN': 2 }, activo: true, obs: '', actualizado: '', usuario: 'admin' }));
    const nuevoPlan = (f, s, n, e, sa, est) => plan.push({ id: sig.p++, fecha: f, sucursal: s, nombre: n, rut: '', entrada: e, salida: sa, colacion: 0, horas: L.calcHoras(e, sa, 0),
      pago: 25000, locomocion: 0, total: 25000, obs: '', estado: est || 'PLANIFICADO', motivo: '', turno_id: null, planificado_por: 'andes', planificado_el: '', confirmado_por: '', confirmado_el: null });
    nuevoPlan(hoy, 'ANDES', nombres[2], '09:00', '15:00'); nuevoPlan(hoy, 'ANDES', nombres[6], '15:00', '21:00');
    nuevoPlan(hoy, 'ENCINAS', nombres[3], '10:00', '14:00');
    nuevoPlan(proximos[1], 'ANDES', nombres[2], '09:00', '15:00'); nuevoPlan(proximos[1], 'ANDES', nombres[7], '15:00', '21:00');

    const permiso = (p) => perfil && (perfil.admin || perfil.permisos.indexOf(p) >= 0);
    const ve = (s) => perfil && (perfil.admin || permiso('VerOtras') || s === perfil.sucursal);
    const escribe = (s) => perfil && (perfil.admin || s === perfil.sucursal || (permiso('EditarOtras') && ve(s)));
    const planifica = (s) => perfil && permiso('Planificar') && (perfil.admin || s === perfil.sucursal || (permiso('PlanificarOtras') && ve(s)));
    const exigir = (c, m) => { if (!c) throw new Error(m || 'No tienes permiso para hacer esto.'); };
    const anotar = (accion, tabla, x, antes) => historial.unshift({ id: sig.h++, cuando: new Date().toISOString(), usuario: perfil.usuario, accion, tabla,
      sucursal: x.sucursal || '', ref_id: String(x.id || x.fecha || ''), fecha_reg: x.fecha || x.fecha_pago || null, persona: x.nombre || '', antes: antes || null, despues: x });
    const copia = (x) => JSON.parse(JSON.stringify(x));
    const espera = (v) => new Promise((r) => setTimeout(() => r(copia(v)), 60));
    function reglasTurno(viejo, nuevo) {
      if (perfil.admin) return;
      if (viejo) exigir(viejo.fecha >= L.hoyChile() || permiso('EditarAnteriores'), 'No tienes permiso para cambiar turnos de días anteriores.');
      if (permiso('ModificarPagado')) return;
      if (viejo) exigir(!L.quincenaConPagos(abonos, viejo.nombre, viejo.fecha), 'La quincena de ' + viejo.nombre + ' ya tiene pagos registrados. Pide a la oficina que lo revise.');
      if (nuevo) exigir(!L.quincenaConPagos(abonos, nuevo.nombre, nuevo.fecha), 'La quincena de ' + nuevo.nombre + ' ya tiene pagos registrados. Pide a la oficina que lo revise.');
    }
    function crearTurno(t) {
      const n = Object.assign({}, t, { id: sig.t++, horas: L.calcHoras(t.entrada, t.salida, t.colacion), total: Number(t.pago || 0) + Number(t.locomocion || 0),
        creado_el: new Date().toISOString(), creado_por: perfil.usuario });
      turnos.push(n); anotar('INGRESO', 'turnos', n); return n;
    }
    return {
      demo: true,
      async sesion() { return perfil ? copia(perfil) : null; },
      async entrar(usuario) {
        const p = perfilesDemo.find((x) => x.usuario === String(usuario).trim().toLowerCase());
        if (!p) throw new Error('En el modo de prueba entra como admin, gerente, andes, encinas o sanmartin (cualquier clave).');
        perfil = p; return espera(p);
      },
      async salir() { perfil = null; },
      async cambiarClave() { },
      turnos: (f) => espera(turnos.filter((t) => ve(t.sucursal) && (!f.desde || t.fecha >= f.desde) && (!f.hasta || t.fecha <= f.hasta) && (!f.sucursal || t.sucursal === f.sucursal))
        .sort((a, b) => (a.fecha + a.entrada).localeCompare(b.fecha + b.entrada) || a.id - b.id)),
      async guardarTurno(t) {
        if (t.id) {
          const v = turnos.find((x) => x.id === t.id); exigir(v && permiso('Modificar') && escribe(v.sucursal) && escribe(t.sucursal));
          reglasTurno(v, t); const antes = copia(v);
          Object.assign(v, t, { horas: L.calcHoras(t.entrada, t.salida, t.colacion), total: Number(t.pago || 0) + Number(t.locomocion || 0) });
          anotar('MODIFICACIÓN', 'turnos', v, antes); return espera(v);
        }
        exigir(permiso('Registrar') && escribe(t.sucursal)); reglasTurno(null, t); return espera(crearTurno(t));
      },
      async eliminarTurno(id) {
        const v = turnos.find((x) => x.id === id); exigir(v && permiso('Eliminar') && escribe(v.sucursal)); reglasTurno(v, null);
        turnos = turnos.filter((x) => x.id !== id); plan.forEach((p) => { if (p.turno_id === id) p.turno_id = null; }); anotar('ELIMINACIÓN', 'turnos', v); return espera(true);
      },
      personasLista: () => espera(personas.map((p) => ({ id: p.id, nombre: p.nombre, rut: p.rut, activo: p.activo, variantes: p.variantes }))),
      personas: () => { exigir(permiso('Personas') || permiso('Pagos')); return espera(personas); },
      async guardarPersona(p) {
        exigir(permiso('EditarPersonas'));
        exigir(!personas.some((x) => x.id !== p.id && L.normNombre(x.nombre) === L.normNombre(p.nombre)), 'Ya existe una persona con ese nombre.');
        if (p.id) { const v = personas.find((x) => x.id === p.id); Object.assign(v, p); anotar('PERSONA MODIFICADA', 'personas', v); return espera(v); }
        const n = Object.assign({}, p, { id: personas.length + 1 }); personas.push(n); anotar('PERSONA AGREGADA', 'personas', n); return espera(n);
      },
      abonos: () => { exigir(permiso('Pagos')); return espera(abonos); },
      async registrarAbono(a) {
        exigir(permiso('RegistrarPago'), 'Sin permiso para registrar pagos.');
        const qq = L.quincenaDeClave(a.quincena), n = L.normNombre(a.nombre);
        const tot = turnos.filter((t) => t.fecha >= qq.desde && t.fecha <= qq.hasta && L.normNombre(t.nombre) === n).reduce((s, t) => s + t.total, 0);
        const pag = abonos.filter((x) => x.estado === 'VIGENTE' && x.quincena === a.quincena && L.normNombre(x.nombre) === n).reduce((s, x) => s + x.monto, 0);
        const nuevo = { id: sig.a++, quincena: a.quincena, desde: qq.desde, hasta: qq.hasta, nombre: a.nombre, rut: a.rut || '', monto: Number(a.monto), fecha_pago: a.fecha_pago,
          obs: a.obs || '', estado: 'VIGENTE', total_quincena: tot, pagado_antes: pag, saldo_despues: tot - pag - a.monto, registrado_el: new Date().toISOString(),
          usuario: perfil.usuario, anulado_el: null, anulado_por: '', comprobante: a.comprobante || '' };
        abonos.push(nuevo); anotar('PAGO', 'abonos', nuevo); return espera(nuevo.id);
      },
      async pagosLocal(quincena, sucursal) {
        const qDe = (f) => String(f).slice(0, 7) + (Number(String(f).slice(8, 10)) <= 15 ? '-Q1' : '-Q2');
        const grupos = new Map();
        turnos.filter((t) => t.sucursal === sucursal && qDe(t.fecha) === quincena).forEach((t) => {
          const k = L.normNombre(t.nombre), x = grupos.get(k) || { nombre: t.nombre, turnos: 0, monto_local: 0 };
          x.turnos++; x.monto_local += Number(t.total); grupos.set(k, x);
        });
        return [...grupos.entries()].map(([k, x]) => {
          const total = turnos.filter((t) => qDe(t.fecha) === quincena && L.normNombre(t.nombre) === k).reduce((a, t) => a + Number(t.total), 0);
          const pagado = abonos.filter((a) => a.estado === 'VIGENTE' && a.quincena === quincena && L.normNombre(a.nombre) === k).reduce((a, r) => a + r.monto, 0);
          return { nombre: x.nombre, turnos: x.turnos, monto_local: x.monto_local, estado: pagado >= total - 0.5 ? 'PAGADO' : 'PENDIENTE' };
        }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      },
      async emitirComprobantePartime(id) { const ex = compsPT.find((c) => c.abono_id === id); if (ex) return espera(ex.numero); const n = compsPT.length + 1; compsPT.push({ numero: n, abono_id: id }); return espera(n); },
      async comprobantesPartime() { return espera(compsPT.slice()); },
      async anularAbono(id) {
        exigir(permiso('AnularPago')); const a = abonos.find((x) => x.id === id && x.estado === 'VIGENTE'); exigir(a, 'El pago no existe o ya está anulado.');
        const antes = copia(a); Object.assign(a, { estado: 'ANULADO', anulado_el: new Date().toISOString(), anulado_por: perfil.usuario }); anotar('PAGO ANULADO', 'abonos', a, antes);
      },
      async marcarComprobante(id, comp) { exigir(permiso('Conciliar')); const a = abonos.find((x) => x.id === id); a.comprobante = comp; anotar('PAGO CONCILIADO', 'abonos', a); },
      dias: (f) => espera(dias.filter((x) => (!f || !f.desde || x.fecha >= f.desde) && (!f || !f.hasta || x.fecha <= f.hasta)).sort((a, b) => a.fecha.localeCompare(b.fecha))),
      async guardarDia(x) {
        exigir(permiso('DiasPlan')); const v = dias.find((y) => y.fecha === x.fecha);
        if (v) { Object.assign(v, x); anotar('DÍA MODIFICADO', 'dias', v); } else { dias.push(Object.assign({ activo: true, obs: '' }, x)); anotar('DÍA AGREGADO', 'dias', x); }
      },
      async eliminarDia(f) { exigir(permiso('DiasPlan')); const v = dias.find((y) => y.fecha === f); dias = dias.filter((y) => y.fecha !== f); anotar('DÍA ELIMINADO', 'dias', v); },
      presupuestos: (mes) => espera(presup.filter((x) => x.mes === mes)),
      async guardarPresupuesto(p) { const i = presup.findIndex((x) => x.mes === p.mes && x.sucursal === p.sucursal); if (i >= 0) presup[i] = p; else presup.push(p); return espera(p); },
      feriados: () => espera([{ fecha: L.hoyChile().slice(0, 4) + '-12-08', nombre: 'Inmaculada Concepción', abierto: true }, { fecha: L.hoyChile().slice(0, 4) + '-12-25', nombre: 'Navidad', abierto: false }]),
      plan: (f) => espera(plan.filter((p) => ve(p.sucursal) && (!f.desde || p.fecha >= f.desde) && (!f.hasta || p.fecha <= f.hasta) && (!f.sucursal || p.sucursal === f.sucursal))
        .sort((a, b) => (a.fecha + a.entrada).localeCompare(b.fecha + b.entrada) || a.id - b.id)),
      async guardarPlan(p) {
        exigir(planifica(p.sucursal));
        const h = L.calcHoras(p.entrada, p.salida, p.colacion), tot = Number(p.pago || 0) + Number(p.locomocion || 0);
        if (p.id) { const v = plan.find((x) => x.id === p.id); const antes = copia(v); Object.assign(v, p, { horas: h, total: tot }); anotar('PLAN MODIFICADO', 'plan', v, antes); return espera(v); }
        exigir(p.fecha >= L.hoyChile(), 'Solo se planifica desde hoy en adelante.');
        const n = Object.assign({ estado: 'PLANIFICADO', motivo: '', turno_id: null, confirmado_por: '', confirmado_el: null }, p, { id: sig.p++, horas: h, total: tot, planificado_por: perfil.usuario, planificado_el: new Date().toISOString() });
        plan.push(n); anotar('PLANIFICACIÓN', 'plan', n); return espera(n);
      },
      async cancelarPlan(id, motivo) { const v = plan.find((x) => x.id === id); exigir(v && planifica(v.sucursal)); v.estado = 'CANCELADO'; v.motivo = motivo || ''; anotar('PLAN CANCELADO', 'plan', v); },
      async confirmarPlan(id, t, existente) {
        const v = plan.find((x) => x.id === id); exigir(v && planifica(v.sucursal), 'Sin permiso para confirmar.');
        exigir(v.fecha <= L.hoyChile(), 'Solo se puede confirmar el mismo día o después.'); exigir(v.estado === 'PLANIFICADO', 'Esta planificación ya está ' + v.estado.toLowerCase() + '.');
        let tid = existente;
        if (!tid) { reglasTurno(null, v); tid = crearTurno({ fecha: v.fecha, sucursal: v.sucursal, nombre: v.nombre, rut: v.rut, funcion: v.funcion || '', entrada: t.entrada, salida: t.salida, colacion: t.colacion || 0, pago: t.pago, locomocion: t.locomocion, obs: t.obs || '' }).id; }
        Object.assign(v, { estado: 'ASISTIÓ', turno_id: tid, confirmado_por: perfil.usuario, confirmado_el: new Date().toISOString(), entrada: t.entrada, salida: t.salida, pago: t.pago, locomocion: t.locomocion });
        anotar('ASISTENCIA CONFIRMADA', 'plan', v); return tid;
      },
      async inasistencia(id, motivo) {
        const v = plan.find((x) => x.id === id); exigir(v && planifica(v.sucursal)); exigir(v.fecha <= L.hoyChile(), 'Solo se puede marcar el mismo día o después.');
        Object.assign(v, { estado: 'NO ASISTIÓ', motivo: motivo || '', confirmado_por: perfil.usuario, confirmado_el: new Date().toISOString() }); anotar('INASISTENCIA', 'plan', v);
      },
      historial: () => { if (!permiso('Historial')) return espera([]); return espera(historial.filter((h) => perfil.admin || ve(h.sucursal) || (!h.sucursal && permiso('VerOtras')))); },
      perfiles: () => { exigir(perfil.admin || permiso('Usuarios')); return espera(perfilesDemo); },
      async crearUsuario() { throw new Error('En modo de prueba no se crean usuarios.'); },
      async guardarPerfil(p) {
        exigir(perfil.admin || permiso('Usuarios'));
        const v = perfilesDemo.find((x) => x.id === p.id);
        if (!perfil.admin) {
          exigir(p.rol !== 'admin' && !v.admin, 'Solo un administrador puede crear o cambiar administradores.');
          exigir(p.permisos.every((k) => perfil.permisos.indexOf(k) >= 0), 'No puedes dar permisos que tú no tienes.');
          exigir(v.id !== perfil.id || JSON.stringify(v.permisos) === JSON.stringify(p.permisos), 'No puedes cambiar tus propios permisos.');
        }
        Object.assign(v, p, { admin: p.rol === 'admin', permisos: p.rol === 'admin' ? [] : p.permisos }); anotar('USUARIO MODIFICADO', 'perfiles', v);
      },
      roles: () => espera(rolesDemo),
      async guardarRol(r) { exigir(perfil.admin); const v = rolesDemo.find((x) => x.id === r.id); if (v) Object.assign(v, r); else rolesDemo.push(Object.assign({ sistema: false }, r)); },
      async eliminarRol(id) { exigir(perfil.admin); const i = rolesDemo.findIndex((x) => x.id === id); if (i >= 0) rolesDemo.splice(i, 1); }
    };
  }

  raiz.DB = usarDemo ? crearDemo() : crearSupabase();
})(this);
