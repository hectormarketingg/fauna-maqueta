/* FAUNA — interacción del sitio. Sin dependencias. */
(() => {
  "use strict";
  document.documentElement.classList.add("js");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ROOT = window.FAUNA_ROOT || "./";
  const CATALOG = JSON.parse($("#catalog")?.textContent || "{}");
  const KEY = "fauna.bolsa.v1";
  const MAX_QTY = 5;
  const fmt = (n) => "$" + new Intl.NumberFormat("es-CO").format(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Bolsa (estado) ---------- */
  const store = {
    read() {
      try {
        const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
        return Array.isArray(raw) ? raw.filter((l) => CATALOG[l.sku] && CATALOG[l.sku].status !== "agotado") : [];
      } catch { return []; }
    },
    write(lines) {
      try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* almacenamiento no disponible */ }
      render();
    },
    add(sku, strap) {
      const lines = this.read();
      const hit = lines.find((l) => l.sku === sku && l.strap === strap);
      if (hit) hit.qty = Math.min(MAX_QTY, hit.qty + 1); else lines.push({ sku, strap, qty: 1 });
      this.write(lines);
    },
    setQty(i, q) { const lines = this.read(); if (!lines[i]) return; lines[i].qty = Math.max(1, Math.min(MAX_QTY, q)); this.write(lines); },
    remove(i) { const lines = this.read(); lines.splice(i, 1); this.write(lines); },
    clear() { this.write([]); },
    count() { return this.read().reduce((a, l) => a + l.qty, 0); },
    subtotal() { return this.read().reduce((a, l) => a + CATALOG[l.sku].price * l.qty, 0); },
  };

  function lineHTML(l, i, editable) {
    const p = CATALOG[l.sku];
    const ctl = editable
      ? `<div class="line__ctl"><div class="qty" role="group" aria-label="Cantidad de ${esc(p.name)}">
          <button type="button" data-qty="${i}" data-d="-1" aria-label="Quitar una unidad" ${l.qty <= 1 ? "disabled" : ""}>−</button>
          <output aria-live="polite">${l.qty}</output>
          <button type="button" data-qty="${i}" data-d="1" aria-label="Agregar una unidad" ${l.qty >= MAX_QTY ? "disabled" : ""}>+</button></div>
          <button type="button" class="line__rm" data-rm="${i}">Eliminar</button></div>`
      : `<p class="line__meta">Cantidad: ${l.qty}</p>`;
    return `<div class="line"><a href="${p.url}"><img class="line__img" src="${p.img}" alt="${esc(p.name)}" width="88" height="110" loading="lazy"></a>
      <div><div class="line__top"><a class="line__name" href="${p.url}">${esc(p.name)}</a><span class="line__price">${fmt(p.price * l.qty)}</span></div>
      <p class="line__meta">Strap: ${esc(l.strap)}${l.qty > 1 ? ` · ${fmt(p.price)} c/u` : ""}</p>${ctl}</div></div>`;
  }

  function sumHTML(withActions) {
    const sub = store.subtotal();
    return `<dl class="sum"><div><dt>Subtotal</dt><dd>${fmt(sub)}</dd></div>
      <div><dt>Envío</dt><dd>Se calcula según destino</dd></div>
      <div class="sum__total"><dt>Total sin envío</dt><dd>${fmt(sub)} COP</dd></div></dl>
      <p class="sum__note">Pago anticipado en línea. Las tarifas de envío están pendientes de confirmación por FAUNA.</p>
      ${withActions ? `<div class="cart-actions"><a class="btn btn--primary btn--block" href="${ROOT}checkout/">Finalizar compra</a>
      <button type="button" class="link" data-cart-close data-continue>Seguir comprando</button></div>` : ""}`;
  }

  function render() {
    const lines = store.read();
    const n = lines.reduce((a, l) => a + l.qty, 0);
    $$("[data-cart-count]").forEach((el) => { el.textContent = n; });
    $$("[data-cart-count-label]").forEach((el) => { el.textContent = n ? `(${n})` : ""; });
    $$("[data-cart-lines]").forEach((el) => {
      el.innerHTML = lines.length
        ? lines.map((l, i) => lineHTML(l, i, true)).join("")
        : `<div class="cart-empty"><p class="h3">Tu bolsa está vacía.</p><p>Empieza por la silueta que más se parezca a tu día.</p>
           <a class="btn btn--ghost" href="${ROOT}tienda/">Ver los bolsos</a></div>`;
    });
    $$("[data-cart-foot]").forEach((el) => {
      el.hidden = !lines.length;
      el.innerHTML = lines.length ? sumHTML(true) : "";
    });
    renderCheckout();
  }

  document.addEventListener("click", (ev) => {
    const q = ev.target.closest("[data-qty]");
    if (q) { const i = +q.dataset.qty; const l = store.read()[i]; if (l) store.setQty(i, l.qty + +q.dataset.d); return; }
    const rm = ev.target.closest("[data-rm]");
    if (rm) { store.remove(+rm.dataset.rm); toast("Eliminado de tu bolsa"); }
  });
  window.addEventListener("storage", (ev) => { if (ev.key === KEY) render(); });

  /* ---------- Capas: menú y bolsa ---------- */
  const scrim = $("[data-scrim]");
  let openLayer = null, lastFocus = null;
  const focusables = (el) => $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', el).filter((x) => x.offsetParent !== null);

  function open(layer) {
    if (!layer) return;
    if (openLayer) close(false);
    lastFocus = document.activeElement;
    layer.hidden = false;
    if (layer.id === "drawer") scrim.hidden = false;
    document.body.style.overflow = "hidden";
    openLayer = layer;
    $("[data-menu-open]")?.setAttribute("aria-expanded", layer.id === "menu" ? "true" : "false");
    requestAnimationFrame(() => (focusables(layer)[0] || layer).focus());
  }
  function close(restore = true) {
    if (!openLayer) return;
    openLayer.hidden = true; scrim.hidden = true;
    document.body.style.overflow = "";
    $("[data-menu-open]")?.setAttribute("aria-expanded", "false");
    openLayer = null;
    if (restore && lastFocus) lastFocus.focus();
  }
  document.addEventListener("keydown", (ev) => {
    if (!openLayer) return;
    if (ev.key === "Escape") { ev.preventDefault(); close(); }
    if (ev.key === "Tab") {
      const f = focusables(openLayer); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  $("[data-menu-open]")?.addEventListener("click", () => open($("#menu")));
  document.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-menu-close]")) close();
    if (ev.target.closest("[data-cart-close]")) close();
    if (ev.target === scrim) close();
    const opener = ev.target.closest("[data-cart-open]");
    if (opener && !document.body.classList.contains("pg-cart") && !document.body.classList.contains("pg-co")) { ev.preventDefault(); open($("#drawer")); }
  });

  /* ---------- Toast ---------- */
  let toastT;
  function toast(msg) {
    const t = $("[data-toast]"); if (!t) return;
    t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("is-on"), 2600);
  }

  /* ---------- Header sobre el hero ---------- */
  const hdr = $("[data-header]");
  if (hdr?.classList.contains("hdr--overlay")) {
    const hero = $(".hero");
    let ticking = false;
    const upd = () => {
      const limit = hero ? hero.offsetHeight * 0.55 : 40;
      hdr.classList.toggle("is-solid", window.scrollY > limit);
      ticking = false;
    };
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }

  /* ---------- Apariciones ---------- */
  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else reveals.forEach((el) => el.classList.add("is-in"));

  /* ---------- Ficha de producto ---------- */
  const pdp = $("[data-pdp]");
  if (pdp) {
    const sku = pdp.dataset.sku;
    const form = $("[data-add-form]", pdp);
    const label = $("[data-strap-label]", pdp);
    form.addEventListener("change", (ev) => { if (ev.target.name === "strap") label.textContent = ev.target.value; });
    const add = () => {
      if (CATALOG[sku].status === "agotado") return;
      const strap = (form.querySelector("input[name=strap]:checked") || {}).value || "Combinado";
      store.add(sku, strap);
      $$("[data-cart-count]").forEach((c) => { c.classList.add("is-bump"); setTimeout(() => c.classList.remove("is-bump"), 300); });
      open($("#drawer"));
    };
    form.addEventListener("submit", (ev) => { ev.preventDefault(); add(); });

    const buybar = $("[data-buybar]");
    const mainBtn = $("button[type=submit]", form);
    if (buybar && "IntersectionObserver" in window) {
      buybar.hidden = false;
      new IntersectionObserver(([en]) => buybar.classList.toggle("is-on", !en.isIntersecting && en.boundingClientRect.top < 0)).observe(mainBtn);
      $("[data-buybar-add]")?.addEventListener("click", add);
    }

    // Galería: contador al deslizar
    const track = $("[data-track]", pdp);
    const cur = $("[data-current]", pdp);
    if (track && cur) {
      track.addEventListener("scroll", () => { cur.textContent = Math.round(track.scrollLeft / track.clientWidth) + 1; }, { passive: true });
      track.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowRight") track.scrollBy({ left: track.clientWidth, behavior: "smooth" });
        if (ev.key === "ArrowLeft") track.scrollBy({ left: -track.clientWidth, behavior: "smooth" });
      });
    }

    // Visor ampliado
    const lb = $("[data-lightbox]");
    const gal = $("[data-gallery]", pdp);
    const imgs = JSON.parse(gal?.dataset.images || "[]");
    if (lb && imgs.length && typeof lb.showModal === "function") {
      const stage = $("[data-lb-stage]", lb), im = $("[data-lb-img]", lb);
      let idx = 0;
      const show = (i) => { idx = (i + imgs.length) % imgs.length; stage.classList.remove("is-zoom"); im.src = imgs[idx].src; im.alt = imgs[idx].alt; };
      $$("[data-zoom]", pdp).forEach((b) => b.addEventListener("click", () => { show(+b.dataset.zoom); lb.showModal(); document.body.style.overflow = "hidden"; }));
      lb.addEventListener("close", () => { document.body.style.overflow = ""; });
      $("[data-lb-close]", lb).addEventListener("click", () => lb.close());
      $("[data-lb-prev]", lb).addEventListener("click", () => show(idx - 1));
      $("[data-lb-next]", lb).addEventListener("click", () => show(idx + 1));
      $$("[data-lb-prev],[data-lb-next]", lb).forEach((b) => { b.hidden = imgs.length < 2; });
      stage.addEventListener("click", (ev) => {
        const r = im.getBoundingClientRect();
        im.style.transformOrigin = `${((ev.clientX - r.left) / r.width) * 100}% ${((ev.clientY - r.top) / r.height) * 100}%`;
        stage.classList.toggle("is-zoom");
      });
      stage.addEventListener("mousemove", (ev) => {
        if (!stage.classList.contains("is-zoom")) return;
        const r = stage.getBoundingClientRect();
        im.style.transformOrigin = `${((ev.clientX - r.left) / r.width) * 100}% ${((ev.clientY - r.top) / r.height) * 100}%`;
      });
      lb.addEventListener("keydown", (ev) => { if (ev.key === "ArrowRight") show(idx + 1); if (ev.key === "ArrowLeft") show(idx - 1); });
    }
  }

  /* ---------- Tienda: filtros y orden ---------- */
  const plp = $("[data-plp]");
  if (plp) {
    const form = $("[data-filters]", plp), grid = $("[data-grid]", plp);
    const cards = $$(".card", grid), count = $("[data-count]", plp), empty = $("[data-empty]", plp);
    cards.forEach((c, i) => { c.dataset.i = i; });
    const params = new URLSearchParams(location.search);
    (params.get("color") || "").split(",").filter(Boolean).forEach((c) => { const x = form.querySelector(`input[name=color][value="${CSS.escape(c)}"]`); if (x) x.checked = true; });
    if (params.get("disponibles") === "1") form.disponibles.checked = true;
    if (params.get("orden")) form.orden.value = params.get("orden");

    const apply = () => {
      const colors = $$("input[name=color]:checked", form).map((x) => x.value);
      const onlyAvail = form.disponibles.checked;
      const order = form.orden.value;
      let shown = 0;
      cards.forEach((c) => {
        const ok = (!colors.length || colors.includes(c.dataset.color)) && (!onlyAvail || c.dataset.status !== "agotado");
        c.classList.toggle("is-hidden", !ok); if (ok) shown++;
      });
      const sorted = [...cards].sort((a, b) => order === "precio-asc" ? a.dataset.price - b.dataset.price || a.dataset.i - b.dataset.i
        : order === "precio-desc" ? b.dataset.price - a.dataset.price || a.dataset.i - b.dataset.i : a.dataset.i - b.dataset.i);
      sorted.forEach((c) => grid.appendChild(c));
      count.textContent = shown === 1 ? "1 bolso" : `${shown} bolsos`;
      empty.hidden = shown > 0;
      const p = new URLSearchParams();
      if (colors.length) p.set("color", colors.join(","));
      if (onlyAvail) p.set("disponibles", "1");
      if (order !== "destacados") p.set("orden", order);
      history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
    };
    form.addEventListener("change", apply);
    form.addEventListener("reset", () => setTimeout(apply));
    $("[data-reset]", plp)?.addEventListener("click", () => { form.reset(); });
    const tog = $("[data-filter-toggle]", plp);
    tog?.addEventListener("click", () => { const o = form.classList.toggle("is-open"); tog.setAttribute("aria-expanded", o); });
    if (params.toString()) { form.classList.add("is-open"); tog?.setAttribute("aria-expanded", "true"); }
    apply();
  }

  /* ---------- Checkout (demostración) ---------- */
  function renderCheckout() {
    const box = $("[data-co-lines]"); if (!box) return;
    const lines = store.read();
    const form = $("[data-co-form]");
    if (!lines.length) {
      box.innerHTML = `<p class="sum__note">Tu bolsa está vacía.</p><a class="btn btn--ghost btn--block" href="${ROOT}tienda/">Ver los bolsos</a>`;
      $("[data-co-total]").textContent = "";
      if (form) $("button[type=submit]", form).disabled = true;
      return;
    }
    if (form) $("button[type=submit]", form).disabled = false;
    box.innerHTML = lines.map((l) => { const p = CATALOG[l.sku];
      return `<div class="mini-line"><img src="${p.img}" alt="" width="56" height="70" loading="lazy"><div>${esc(p.name)}<small>Strap ${esc(l.strap.toLowerCase())} · Cant. ${l.qty}</small></div><span>${fmt(p.price * l.qty)}</span></div>`; }).join("") + sumHTML(false);
    $("[data-co-total]").textContent = fmt(store.subtotal());
  }

  const sumbox = $("[data-sumbox]");
  if (sumbox && matchMedia("(min-width: 1024px)").matches) sumbox.open = true;
  const coForm = $("[data-co-form]");
  if (coForm) {
    const rules = {
      nombre: (v) => v.trim().split(/\s+/).length >= 2 && v.trim().length >= 5 || "Escribe tu nombre y apellido.",
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || "Revisa tu correo electrónico.",
      telefono: (v) => /^3\d{9}$/.test(v.replace(/\D/g, "")) || "Escribe un celular colombiano de 10 dígitos que empiece por 3.",
      departamento: (v) => !!v || "Selecciona el departamento.",
      ciudad: (v) => v.trim().length >= 3 || "Escribe la ciudad o municipio.",
      direccion: (v) => v.trim().length >= 6 || "Escribe la dirección completa.",
    };
    const errId = { nombre: "co-name-err", email: "co-email-err", telefono: "co-tel-err", departamento: "co-depto-err", ciudad: "co-city-err", direccion: "co-addr-err" };
    const check = (name) => {
      const el = coForm.elements[name]; const res = rules[name](el.value);
      const err = document.getElementById(errId[name]);
      const bad = res !== true;
      el.setAttribute("aria-invalid", bad); el.setAttribute("aria-describedby", errId[name]);
      err.textContent = bad ? res : "";
      return !bad;
    };
    Object.keys(rules).forEach((n) => coForm.elements[n].addEventListener("blur", () => { if (coForm.elements[n].value) check(n); }));
    coForm.telefono.addEventListener("input", (ev) => { ev.target.value = ev.target.value.replace(/\D/g, "").slice(0, 10); });
    coForm.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const okFields = Object.keys(rules).map(check);
      const terms = coForm.acepto.checked;
      $("#co-terms-err").textContent = terms ? "" : "Debes aceptar los términos y la política de datos para continuar.";
      coForm.acepto.setAttribute("aria-invalid", !terms);
      const firstBad = Object.keys(rules).find((n, i) => !okFields[i]);
      if (firstBad || !terms) { (firstBad ? coForm.elements[firstBad] : coForm.acepto).focus(); return; }
      const lines = store.read(); if (!lines.length) return;
      const order = {
        id: "DEMO-" + Date.now().toString(36).toUpperCase().slice(-6),
        nombre: coForm.nombre.value.trim(), email: coForm.email.value.trim(),
        ciudad: `${coForm.ciudad.value.trim()}, ${coForm.departamento.value}`,
        lines: lines.map((l) => ({ name: CATALOG[l.sku].name, strap: l.strap, qty: l.qty, total: CATALOG[l.sku].price * l.qty })),
        subtotal: store.subtotal(),
      };
      try { sessionStorage.setItem("fauna.pedido.demo", JSON.stringify(order)); } catch { /* sin almacenamiento */ }
      store.clear();
      location.href = `${ROOT}checkout/confirmacion/`;
    });
  }
  const done = $("[data-done]");
  if (done) {
    let o = null; try { o = JSON.parse(sessionStorage.getItem("fauna.pedido.demo") || "null"); } catch { /* */ }
    if (o) {
      $("[data-done-lede]").textContent = `${o.nombre.split(" ")[0]}, registramos tu pedido de prueba ${o.id}. En la tienda real recibirías la confirmación en ${o.email}.`;
      $("[data-done-box]").innerHTML = o.lines.map((l) => `<div class="mini-line" style="grid-template-columns:1fr auto"><div>${esc(l.name)}<small>Strap ${esc(l.strap.toLowerCase())} · Cant. ${l.qty}</small></div><span>${fmt(l.total)}</span></div>`).join("")
        + `<dl class="sum" style="margin-top:1rem"><div class="sum__total"><dt>Total sin envío</dt><dd>${fmt(o.subtotal)} COP</dd></div><div><dt>Entrega en</dt><dd>${esc(o.ciudad)}</dd></div></dl>`;
    } else {
      $("[data-done-lede]").textContent = "No encontramos un pedido reciente en esta sesión.";
      $("[data-done-box]").hidden = true;
    }
  }

  /* ---------- Newsletter (demostración) ---------- */
  $$("[data-newsletter]").forEach((f) => f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const msg = $("[data-msg]", f);
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim());
    msg.classList.toggle("is-err", !ok || !f.consent.checked);
    if (!ok) { msg.textContent = "Revisa tu correo electrónico."; f.email.focus(); return; }
    if (!f.consent.checked) { msg.textContent = "Necesitamos tu autorización para escribirte."; return; }
    msg.textContent = "Vista previa: la suscripción aún no está conectada a un servicio de correo, así que tu dirección no se guardó.";
    f.reset();
  }));

  render();
})();
