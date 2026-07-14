/* ============================================================
   CHOZEN SOLUTIONS FOUNDING REWARDS
   app.js — data layer, rendering, and interactions
   ============================================================
   DATA MODEL (all stored in localStorage under key "csfr_data"):
   {
     customers: [{ id, fullName, email, phone, business, customerType,
                    dateJoined, notes, active }],
     ledger:    [{ id, customerEmail, customerName, date, activityType,
                    points, dollarAmount, orderRef, source, status,
                    notes, approvedBy }],
     testimonials: [{ id, customerEmail, customerName, dateSubmitted,
                    testimonialText, photoRef, videoUrl,
                    permWebsite, permSocial, permAdvertising,
                    approvalStatus, pointsAwarded, featured, notes }],
     referrals: [{ id, referringEmail, referringName, referredName,
                    referredContact, dateReferred, status, orderValue,
                    rewardIssued, notes }],
     settings: { programName, pointsPerDollar, testimonialReward,
                    photoReward, photoTestimonialReward, videoReward,
                    referralReward, minRedemption, termsText }
   }

   IMPORTANT: A customer's points balance is NEVER stored directly.
   It is always calculated by summing approved ledger entries for
   that customer's email. This keeps one official source of truth,
   per the program's own rule.
   ============================================================ */

const STORAGE_KEY = "csfr_data";

const DEFAULT_SETTINGS = {
  programName: "A Chozen Few",
  pointsPerDollar: 1,
  testimonialReward: 100,
  photoReward: 150,
  photoTestimonialReward: 300,
  videoReward: 500,
  referralReward: 750,          // referrer earns this when referred friend makes a purchase
  signupBonus: 250,             // one-time, on account creation
  birthdayBonus: 200,           // annual
  pointsPerDollarRedemption: 100, // 100 points = $1 off
  minRedemption: 500,           // minimum points balance to redeem ($5 value)
  referredFriendDiscount: 10,   // $ off the referred friend's first order
  referredFriendMinPurchase: 50, // minimum purchase for referred friend's discount to apply
  termsText: "A Chozen Few points are earned through purchases (1 point per $1 spent), account signup (250 points), birthday (200 points), testimonials, photos, and referrals (750 points when your referral makes a purchase). 100 points = $1 off. Minimum redemption balance is 500 points ($5 value), applied to your entire order, not stackable with other discounts. Points have no cash value outside of redemption and cannot be transferred between accounts."
};

function emptyData() {
  return {
    customers: [],
    ledger: [],
    testimonials: [],
    referrals: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

let DATA = loadData();
let currentProfileEmail = null;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw);
    // merge with defaults in case of older saved versions missing fields
    return {
      customers: parsed.customers || [],
      ledger: parsed.ledger || [],
      testimonials: parsed.testimonials || [],
      referrals: parsed.referrals || [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
    };
  } catch (e) {
    console.error("Failed to load data, starting fresh.", e);
    return emptyData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPoints(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US");
}

// Real monetary value of a points balance, per A Chozen Few: 100 points = $1.
function pointsToDollars(points) {
  const rate = DATA.settings.pointsPerDollarRedemption || 100;
  return (Number(points) || 0) / rate;
}
function fmtPointsValue(points) {
  return `${fmtPoints(points)} pts (${fmtMoney(pointsToDollars(points))})`;
}
function canRedeem(points) {
  return (Number(points) || 0) >= (DATA.settings.minRedemption || 500);
}

// Priority tier, internal tracking only, not pushed to Smile.io.
function getTier(lifetimeSpend) {
  const s = Number(lifetimeSpend) || 0;
  if (s >= 200) return "Gold";
  if (s >= 100) return "Silver";
  if (s >= 50) return "Bronze";
  return "Standard";
}
function tierColor(tier) {
  return { Gold: "var(--tan)", Silver: "var(--silver)", Bronze: "var(--brown)", Standard: "var(--text-muted)" }[tier] || "var(--text-muted)";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());
}

function toast(msg, isDanger) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("danger", !!isDanger);
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ============================================================
   BALANCE CALCULATION — single source of truth: the ledger
   ============================================================ */
function getCustomerLedger(email) {
  return DATA.ledger.filter(l => l.customerEmail === email);
}
function getCustomerBalance(email) {
  return getCustomerLedger(email)
    .filter(l => l.status === "Approved")
    .reduce((sum, l) => sum + Number(l.points || 0), 0);
}
function getCustomerLifetimeEarned(email) {
  return getCustomerLedger(email)
    .filter(l => l.status === "Approved" && Number(l.points) > 0)
    .reduce((sum, l) => sum + Number(l.points || 0), 0);
}
function getCustomerLifetimeRedeemed(email) {
  return getCustomerLedger(email)
    .filter(l => l.status === "Approved" && Number(l.points) < 0)
    .reduce((sum, l) => sum + Math.abs(Number(l.points || 0)), 0);
}
function getCustomerTotalPurchases(email) {
  return getCustomerLedger(email)
    .filter(l => l.status === "Approved" && l.dollarAmount)
    .reduce((sum, l) => sum + Number(l.dollarAmount || 0), 0);
}
function getCustomerByEmail(email) {
  return DATA.customers.find(c => c.email.toLowerCase() === (email || "").toLowerCase());
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + viewId).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(n => {
    n.classList.toggle("active", n.dataset.view === viewId);
  });
  document.getElementById("sidebar").classList.remove("open");
  window.scrollTo(0, 0);

  if (viewId === "dashboard") renderDashboard();
  if (viewId === "customers") renderCustomers();
  if (viewId === "ledger") renderLedger();
  if (viewId === "testimonials") renderTestimonials();
  if (viewId === "referrals") renderReferrals();
  if (viewId === "settings") renderSettings();
}

document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
document.getElementById("mobileNavToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard() {
  const totalCustomers = DATA.customers.length;
  const totalOutstanding = DATA.customers.reduce((s, c) => s + getCustomerBalance(c.email), 0);
  const totalIssued = DATA.ledger.filter(l => l.status === "Approved" && Number(l.points) > 0)
    .reduce((s, l) => s + Number(l.points), 0);
  const totalRedeemed = DATA.ledger.filter(l => l.status === "Approved" && Number(l.points) < 0)
    .reduce((s, l) => s + Math.abs(Number(l.points)), 0);
  const pendingTestimonials = DATA.testimonials.filter(t => t.approvalStatus === "Pending").length;

  const stats = [
    { label: "Total Customers", value: totalCustomers, cls: "" },
    { label: "Outstanding Points", value: fmtPoints(totalOutstanding), cls: "accent-tan" },
    { label: "Outstanding Liability", value: fmtMoney(pointsToDollars(totalOutstanding)), cls: "accent-brown" },
    { label: "Total Points Issued", value: fmtPoints(totalIssued), cls: "accent-blue" },
    { label: "Total Points Redeemed", value: fmtPoints(totalRedeemed), cls: "accent-brown" },
    { label: "Pending Testimonials", value: pendingTestimonials, cls: "" },
  ];
  document.getElementById("statGrid").innerHTML = stats.map(s => `
    <div class="stat-card">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value ${s.cls}">${s.value}</div>
    </div>
  `).join("");

  // Pending testimonials
  const pending = DATA.testimonials.filter(t => t.approvalStatus === "Pending").slice(0, 5);
  document.getElementById("pendingTestimonialsList").innerHTML = pending.length
    ? pending.map(t => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <strong style="font-size:13px">${esc(t.customerName)}</strong>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${fmtDate(t.dateSubmitted)}</div>
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:13px">Nothing pending review.</p>`;

  // Top balances
  const top = [...DATA.customers]
    .map(c => ({ ...c, balance: getCustomerBalance(c.email) }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  document.getElementById("topBalancesList").innerHTML = top.length
    ? top.map(c => `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:13px">${esc(c.fullName)}</span>
          <span class="num" style="color:var(--tan);font-size:13px">${fmtPoints(c.balance)} pts</span>
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:13px">No customers yet.</p>`;

  // Recent activity
  const recent = [...DATA.ledger].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 6);
  document.getElementById("recentActivityList").innerHTML = recent.length
    ? recent.map(l => `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:13px">${esc(l.customerName)}</div>
            <div style="font-size:11.5px;color:var(--text-muted)">${esc(l.activityType)} · ${fmtDate(l.date)}</div>
          </div>
          <span class="num" style="font-size:13px;color:${Number(l.points) >= 0 ? 'var(--success)' : 'var(--danger)'}">${Number(l.points) >= 0 ? '+' : ''}${fmtPoints(l.points)}</span>
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:13px">No activity yet.</p>`;

  // Recent referrals
  const recentRef = [...DATA.referrals].sort((a, b) => (b.dateReferred || "").localeCompare(a.dateReferred || "")).slice(0, 5);
  document.getElementById("recentReferralsList").innerHTML = recentRef.length
    ? recentRef.map(r => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:13px">${esc(r.referredName)}</div>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">referred by ${esc(r.referringName)} · <span class="badge badge-type" style="font-size:10px">${esc(r.status)}</span></div>
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:13px">No referrals yet.</p>`;
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/* ============================================================
   CUSTOMERS
   ============================================================ */
function renderCustomers() {
  const search = (document.getElementById("customerSearch").value || "").toLowerCase();
  const typeFilter = document.getElementById("customerTypeFilter").value;
  const statusFilter = document.getElementById("customerStatusFilter").value;
  const sort = document.getElementById("customerSort").value;

  let rows = DATA.customers.filter(c => {
    const matchesSearch = !search ||
      c.fullName.toLowerCase().includes(search) ||
      c.email.toLowerCase().includes(search) ||
      (c.business || "").toLowerCase().includes(search);
    const matchesType = !typeFilter || c.customerType === typeFilter;
    const matchesStatus = !statusFilter || (statusFilter === "active" ? c.active : !c.active);
    return matchesSearch && matchesType && matchesStatus;
  }).map(c => ({
    ...c,
    balance: getCustomerBalance(c.email),
    lifetimeEarned: getCustomerLifetimeEarned(c.email),
    totalPurchases: getCustomerTotalPurchases(c.email),
    tier: getTier(getCustomerTotalPurchases(c.email))
  }));

  rows.sort((a, b) => {
    if (sort === "name-asc") return a.fullName.localeCompare(b.fullName);
    if (sort === "name-desc") return b.fullName.localeCompare(a.fullName);
    if (sort === "balance-desc") return b.balance - a.balance;
    if (sort === "balance-asc") return a.balance - b.balance;
    if (sort === "date-desc") return (b.dateJoined || "").localeCompare(a.dateJoined || "");
    if (sort === "date-asc") return (a.dateJoined || "").localeCompare(b.dateJoined || "");
    return 0;
  });

  const tbody = document.getElementById("customersTableBody");
  const emptyState = document.getElementById("customersEmptyState");

  if (!rows.length) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    document.getElementById("customersTable").style.display = DATA.customers.length ? "table" : "none";
  } else {
    emptyState.style.display = "none";
    document.getElementById("customersTable").style.display = "table";
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td><a class="row-link" data-email="${esc(c.email)}">${esc(c.fullName)}</a></td>
        <td>${esc(c.email)}</td>
        <td><span class="badge badge-type">${typeLabel(c.customerType)}</span></td>
        <td class="num" style="color:var(--tan)">${fmtPoints(c.balance)}<div style="font-size:11px;color:var(--text-muted)">${fmtMoney(pointsToDollars(c.balance))}</div></td>
        <td class="num">${fmtPoints(c.lifetimeEarned)}</td>
        <td class="num">${fmtMoney(c.totalPurchases)}</td>
        <td><span style="color:${tierColor(c.tier)};font-size:12px;font-weight:600">${c.tier}</span></td>
        <td><span class="badge ${c.active ? 'badge-active' : 'badge-inactive'}">${c.active ? 'Active' : 'Inactive'}</span></td>
        <td><a class="row-link" data-email="${esc(c.email)}">Open →</a></td>
      </tr>
    `).join("");
    tbody.querySelectorAll(".row-link").forEach(a => {
      a.addEventListener("click", () => openProfile(a.dataset.email));
    });
  }
}

function typeLabel(t) {
  return { website: "Website", custom: "Custom-Order", partner: "Partner", referral: "Referral" }[t] || t;
}

["customerSearch", "customerTypeFilter", "customerStatusFilter", "customerSort"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderCustomers);
  document.getElementById(id).addEventListener("change", renderCustomers);
});

document.getElementById("btnAddCustomer").addEventListener("click", () => openCustomerModal());
document.getElementById("btnAddCustomerEmpty").addEventListener("click", () => openCustomerModal());

function openCustomerModal(existingEmail) {
  const existing = existingEmail ? getCustomerByEmail(existingEmail) : null;
  const isEdit = !!existing;

  renderModal(`
    <h2>${isEdit ? "Edit Customer" : "Add Customer"}</h2>
    <div class="modal-field">
      <label class="field-label">Full name *</label>
      <input type="text" class="text-input" id="mFullName" value="${esc(existing?.fullName || "")}">
    </div>
    <div class="modal-field">
      <label class="field-label">Email *</label>
      <input type="email" class="text-input" id="mEmail" value="${esc(existing?.email || "")}" ${isEdit ? "readonly" : ""}>
      <div class="modal-error" id="mEmailError">A customer with this email already exists.</div>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label class="field-label">Phone</label>
        <input type="text" class="text-input" id="mPhone" value="${esc(existing?.phone || "")}">
      </div>
      <div class="modal-field">
        <label class="field-label">Business / organization</label>
        <input type="text" class="text-input" id="mBusiness" value="${esc(existing?.business || "")}">
      </div>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label class="field-label">Customer type</label>
        <select class="select-input text-input" id="mType">
          <option value="website" ${existing?.customerType === "website" ? "selected" : ""}>Website customer</option>
          <option value="custom" ${!existing || existing?.customerType === "custom" ? "selected" : ""}>Custom-order customer</option>
          <option value="partner" ${existing?.customerType === "partner" ? "selected" : ""}>Partner</option>
          <option value="referral" ${existing?.customerType === "referral" ? "selected" : ""}>Referral</option>
        </select>
      </div>
      <div class="modal-field">
        <label class="field-label">Status</label>
        <select class="select-input text-input" id="mActive">
          <option value="true" ${existing?.active !== false ? "selected" : ""}>Active</option>
          <option value="false" ${existing?.active === false ? "selected" : ""}>Inactive</option>
        </select>
      </div>
    </div>
    <div class="modal-field">
      <label class="field-label">Notes</label>
      <textarea class="notes-textarea" id="mNotes">${esc(existing?.notes || "")}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost-sm" id="mCancel">Cancel</button>
      <button class="btn-primary-sm" id="mSave">${isEdit ? "Save Changes" : "Add Customer"}</button>
    </div>
  `);

  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", () => {
    const fullName = document.getElementById("mFullName").value.trim();
    const email = document.getElementById("mEmail").value.trim().toLowerCase();
    const phone = document.getElementById("mPhone").value.trim();
    const business = document.getElementById("mBusiness").value.trim();
    const customerType = document.getElementById("mType").value;
    const active = document.getElementById("mActive").value === "true";
    const notes = document.getElementById("mNotes").value.trim();

    if (!fullName || !email) { toast("Name and email are required.", true); return; }
    if (!isValidEmail(email)) { toast("That email address doesn't look valid.", true); return; }
    if (!isEdit && getCustomerByEmail(email)) {
      document.getElementById("mEmailError").classList.add("show");
      return;
    }

    if (isEdit) {
      Object.assign(existing, { fullName, phone, business, customerType, active, notes });
    } else {
      DATA.customers.push({
        id: uid("cust"), fullName, email, phone, business, customerType,
        dateJoined: todayISO(), notes, active
      });
    }
    saveData();
    closeModal();
    toast(isEdit ? "Customer updated." : "Customer added.");
    renderCustomers();
    if (currentProfileEmail === email) renderProfile(email);
  });
}

/* ============================================================
   CUSTOMER PROFILE
   ============================================================ */
function openProfile(email) {
  currentProfileEmail = email;
  showViewRaw("profile");
  renderProfile(email);
}
function showViewRaw(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById("view-" + viewId).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(n => n.classList.remove("active"));
  window.scrollTo(0, 0);
}

document.getElementById("btnBackToCustomers").addEventListener("click", () => showView("customers"));
document.getElementById("btnEditCustomer").addEventListener("click", () => openCustomerModal(currentProfileEmail));

function renderProfile(email) {
  const c = getCustomerByEmail(email);
  if (!c) { showView("customers"); return; }

  document.getElementById("profileName").textContent = c.fullName;
  document.getElementById("profileEmail").textContent = c.email + (c.business ? " · " + c.business : "");

  const balance = getCustomerBalance(email);
  const earned = getCustomerLifetimeEarned(email);
  const redeemed = getCustomerLifetimeRedeemed(email);
  const purchases = getCustomerTotalPurchases(email);
  const tier = getTier(purchases);
  const eligible = canRedeem(balance);

  document.getElementById("profileStatGrid").innerHTML = `
    <div class="stat-card"><div class="stat-label">Current Balance</div><div class="stat-value accent-tan">${fmtPoints(balance)}</div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${fmtMoney(pointsToDollars(balance))} value ${eligible ? "· redeemable" : "· below min"}</div></div>
    <div class="stat-card"><div class="stat-label">Lifetime Earned</div><div class="stat-value accent-blue">${fmtPoints(earned)}</div></div>
    <div class="stat-card"><div class="stat-label">Lifetime Redeemed</div><div class="stat-value accent-brown">${fmtPoints(redeemed)}</div></div>
    <div class="stat-card"><div class="stat-label">Total Purchases</div><div class="stat-value">${fmtMoney(purchases)}</div><div style="font-size:12px;margin-top:4px;color:${tierColor(tier)}">${tier} tier</div></div>
  `;

  const entries = [...getCustomerLedger(email)].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  document.getElementById("profileLedgerBody").innerHTML = entries.length
    ? entries.map(l => `
        <tr>
          <td>${fmtDate(l.date)}</td>
          <td>${esc(l.activityType)}</td>
          <td class="num" style="color:${Number(l.points) >= 0 ? 'var(--success)' : 'var(--danger)'}">${Number(l.points) >= 0 ? '+' : ''}${fmtPoints(l.points)}</td>
          <td class="num">${l.dollarAmount ? fmtMoney(l.dollarAmount) : "—"}</td>
          <td><span class="badge badge-${l.status.toLowerCase()}">${esc(l.status)}</span></td>
          <td style="white-space:normal;max-width:220px">${esc(l.notes || "")}</td>
        </tr>`).join("")
    : `<tr><td colspan="6" style="color:var(--text-muted);text-align:center;padding:24px">No transactions yet.</td></tr>`;

  const testimonials = DATA.testimonials.filter(t => t.customerEmail === email);
  document.getElementById("profileTestimonials").innerHTML = testimonials.length
    ? testimonials.map(t => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between">
            <span class="badge badge-${t.approvalStatus.toLowerCase()}">${esc(t.approvalStatus)}</span>
            <span style="font-size:11.5px;color:var(--text-muted)">${fmtDate(t.dateSubmitted)}</span>
          </div>
          ${t.testimonialText ? `<p style="font-size:13px;color:var(--text-secondary);margin-top:8px">"${esc(t.testimonialText)}"</p>` : ""}
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:13px">No testimonials from this customer yet.</p>`;

  const referrals = DATA.referrals.filter(r => r.referringEmail === email);
  document.getElementById("profileReferrals").innerHTML = referrals.length
    ? referrals.map(r => `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:13px">${esc(r.referredName)}</span>
          <span class="badge badge-type">${esc(r.status)}</span>
        </div>`).join("")
    : `<p style="color:var(--text-muted);font-size:13px">No referrals from this customer yet.</p>`;

  document.getElementById("profileNotesText").value = c.notes || "";
}

document.getElementById("btnSaveNotes").addEventListener("click", () => {
  const c = getCustomerByEmail(currentProfileEmail);
  if (!c) return;
  c.notes = document.getElementById("profileNotesText").value.trim();
  saveData();
  toast("Notes saved.");
});

document.querySelectorAll(".profile-actions [data-action]").forEach(btn => {
  btn.addEventListener("click", () => handleProfileAction(btn.dataset.action));
});

function handleProfileAction(action) {
  const email = currentProfileEmail;
  const c = getCustomerByEmail(email);
  if (!c) return;

  if (action === "add-purchase") return openLedgerModal(email, c.fullName, "purchase");
  if (action === "add-reward") return openLedgerModal(email, c.fullName, "reward");
  if (action === "redeem") return openLedgerModal(email, c.fullName, "redeem");
  if (action === "adjust") return openLedgerModal(email, c.fullName, "adjust");
  if (action === "add-testimonial") return openTestimonialModal(email, c.fullName);
  if (action === "add-photo") return openTestimonialModal(email, c.fullName, true);
  if (action === "add-referral") return openReferralModal(email, c.fullName);
}

/* ============================================================
   LEDGER ENTRY MODAL (purchase, reward, redeem, adjust)
   ============================================================ */
function openLedgerModal(email, name, mode) {
  const titles = {
    purchase: "Add Purchase",
    reward: "Add Reward Activity",
    redeem: "Redeem Points",
    adjust: "Manual Adjustment"
  };
  const s = DATA.settings;

  let activityOptions = "";
  if (mode === "purchase") {
    activityOptions = `<option value="Purchase">Purchase</option>`;
  } else if (mode === "reward") {
    activityOptions = `
      <option value="Written Testimonial">Written testimonial (+${s.testimonialReward})</option>
      <option value="Customer Photo">Customer photo (+${s.photoReward})</option>
      <option value="Photo + Testimonial">Photo + testimonial (+${s.photoTestimonialReward})</option>
      <option value="Video Testimonial">Approved video testimonial (+${s.videoReward})</option>
      <option value="Referral Reward">Referral → paid customer (+${s.referralReward})</option>
      <option value="Sign Up Bonus">Account sign up (+${s.signupBonus})</option>
      <option value="Birthday Bonus">Birthday (+${s.birthdayBonus})</option>
      <option value="Other Reward">Other</option>`;
  } else if (mode === "redeem") {
    activityOptions = `<option value="Redemption">Redemption</option>`;
  } else {
    activityOptions = `<option value="Manual Adjustment">Manual Adjustment</option>`;
  }

  renderModal(`
    <h2>${titles[mode]} — ${esc(name)}</h2>
    <div class="modal-field">
      <label class="field-label">Activity</label>
      <select class="select-input text-input" id="mActivity">${activityOptions}</select>
    </div>
    <div class="modal-row">
      ${mode === "purchase" ? `
        <div class="modal-field">
          <label class="field-label">Dollar amount *</label>
          <input type="number" class="text-input" id="mDollar" min="0" step="0.01" placeholder="0.00">
        </div>
        <div class="modal-field">
          <label class="field-label">Points (auto-calculated)</label>
          <input type="number" class="text-input" id="mPoints" readonly>
        </div>
      ` : mode === "redeem" ? `
        <div class="modal-field">
          <label class="field-label">Points to redeem * (100 points = $1)</label>
          <input type="number" class="text-input" id="mPoints" min="${DATA.settings.minRedemption}" step="100">
        </div>
        <div class="modal-field">
          <label class="field-label">Current balance</label>
          <input type="text" class="text-input" value="${fmtPointsValue(getCustomerBalance(email))}" readonly>
        </div>
        <p style="font-size:12px;color:${canRedeem(getCustomerBalance(email)) ? 'var(--success)' : 'var(--danger)'};margin-top:-6px">
          ${canRedeem(getCustomerBalance(email))
            ? `Eligible to redeem, minimum is ${fmtPoints(DATA.settings.minRedemption)} points.`
            : `Not yet eligible, needs ${fmtPoints(DATA.settings.minRedemption)} points minimum to redeem (${fmtPoints(DATA.settings.minRedemption - getCustomerBalance(email))} more needed).`}
        </p>
      ` : `
        <div class="modal-field">
          <label class="field-label">Points *</label>
          <input type="number" class="text-input" id="mPoints" step="1" placeholder="${mode === 'adjust' ? 'positive or negative' : '0'}">
        </div>
        <div class="modal-field">
          <label class="field-label">Dollar amount (optional)</label>
          <input type="number" class="text-input" id="mDollar" min="0" step="0.01" placeholder="0.00">
        </div>
      `}
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label class="field-label">Date</label>
        <input type="date" class="text-input" id="mDate" value="${todayISO()}">
      </div>
      <div class="modal-field">
        <label class="field-label">Order / reference number</label>
        <input type="text" class="text-input" id="mRef" placeholder="Optional">
      </div>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label class="field-label">Source</label>
        <select class="select-input text-input" id="mSource">
          <option value="Custom Order" ${mode === "purchase" ? "selected" : ""}>Custom Order</option>
          <option value="Shopify">Shopify</option>
          <option value="Manual" ${mode !== "purchase" ? "selected" : ""}>Manual</option>
          <option value="Testimonial">Testimonial</option>
          <option value="Referral">Referral</option>
        </select>
      </div>
      <div class="modal-field">
        <label class="field-label">Status</label>
        <select class="select-input text-input" id="mStatus">
          <option value="Approved" selected>Approved</option>
          <option value="Pending">Pending</option>
        </select>
      </div>
    </div>
    <div class="modal-field">
      <label class="field-label">Notes</label>
      <textarea class="notes-textarea" id="mNotes" placeholder="Optional context for this entry"></textarea>
    </div>
    <div class="modal-field">
      <label class="field-label">Approved by</label>
      <input type="text" class="text-input" id="mApprovedBy" placeholder="Your name">
    </div>
    <div class="modal-actions">
      <button class="btn-ghost-sm" id="mCancel">Cancel</button>
      <button class="btn-primary-sm" id="mSave">Save Entry</button>
    </div>
  `);

  // auto-calc points for purchase mode
  if (mode === "purchase") {
    const dollarInput = document.getElementById("mDollar");
    const pointsInput = document.getElementById("mPoints");
    dollarInput.addEventListener("input", () => {
      const val = parseFloat(dollarInput.value) || 0;
      pointsInput.value = Math.round(val * DATA.settings.pointsPerDollar);
    });
  }

  // auto-fill points when reward type changes
  if (mode === "reward") {
    const activitySelect = document.getElementById("mActivity");
    const rewardMap = {
      "Written Testimonial": s.testimonialReward,
      "Customer Photo": s.photoReward,
      "Photo + Testimonial": s.photoTestimonialReward,
      "Video Testimonial": s.videoReward,
      "Referral Reward": s.referralReward,
      "Sign Up Bonus": s.signupBonus,
      "Birthday Bonus": s.birthdayBonus,
      "Other Reward": 0
    };
    const setPoints = () => {
      document.getElementById("mPoints").value = rewardMap[activitySelect.value] || 0;
    };
    activitySelect.addEventListener("change", setPoints);
    setPoints();
  }

  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", () => {
    const activityType = document.getElementById("mActivity").value;
    let points = parseFloat(document.getElementById("mPoints").value) || 0;
    const dollarAmount = document.getElementById("mDollar") ? (parseFloat(document.getElementById("mDollar").value) || 0) : 0;
    const date = document.getElementById("mDate").value || todayISO();
    const orderRef = document.getElementById("mRef").value.trim();
    const source = document.getElementById("mSource").value;
    const status = document.getElementById("mStatus").value;
    const notes = document.getElementById("mNotes").value.trim();
    const approvedBy = document.getElementById("mApprovedBy").value.trim();

    if (mode === "redeem") {
      const balance = getCustomerBalance(email);
      if (!canRedeem(balance)) { toast(`Balance must be at least ${fmtPoints(DATA.settings.minRedemption)} points to redeem, per A Chozen Few rules.`, true); return; }
      if (points < DATA.settings.minRedemption) { toast(`Minimum redemption is ${fmtPoints(DATA.settings.minRedemption)} points per A Chozen Few rules.`, true); return; }
      if (points > balance) { toast(`This customer only has ${fmtPoints(balance)} points available.`, true); return; }
      points = -Math.abs(points); // redemption is a negative ledger entry
    }
    if (mode === "purchase" && dollarAmount <= 0) { toast("Enter a purchase amount.", true); return; }

    DATA.ledger.push({
      id: uid("ledg"), customerEmail: email, customerName: name, date,
      activityType, points, dollarAmount: dollarAmount || null, orderRef,
      source, status, notes, approvedBy
    });
    saveData();
    closeModal();
    toast("Entry saved to the ledger.");
    renderProfile(email);
  });
}

/* ============================================================
   TESTIMONIAL / PHOTO MODAL
   ============================================================ */
function openTestimonialModal(email, name, photoFocus) {
  renderModal(`
    <h2>Add ${photoFocus ? "Photo" : "Testimonial"} — ${esc(name)}</h2>
    <div class="modal-field">
      <label class="field-label">Written testimonial ${photoFocus ? "(optional)" : ""}</label>
      <textarea class="notes-textarea" id="mText" placeholder="Paste or type the customer's words, any tone is welcome, honest and usable is what counts."></textarea>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label class="field-label">Photo filename or URL</label>
        <input type="text" class="text-input" id="mPhotoRef" placeholder="e.g. IMG_2044.jpg or a link">
      </div>
      <div class="modal-field">
        <label class="field-label">Video URL (optional)</label>
        <input type="text" class="text-input" id="mVideoUrl" placeholder="Optional">
      </div>
    </div>
    <div class="modal-field">
      <label class="field-label">Permission to use on</label>
      <div style="display:flex;gap:16px;margin-top:6px">
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="mPermWebsite"> Website</label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="mPermSocial"> Social Media</label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="mPermAd"> Advertising</label>
      </div>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label class="field-label">Date submitted</label>
        <input type="date" class="text-input" id="mDate" value="${todayISO()}">
      </div>
      <div class="modal-field">
        <label class="field-label">Approval status</label>
        <select class="select-input text-input" id="mApproval">
          <option value="Pending" selected>Pending</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>
    </div>
    <div class="modal-field">
      <label style="font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="mFeatured"> Feature this on the website/marketing</label>
    </div>
    <div class="modal-field">
      <label class="field-label">Notes</label>
      <textarea class="notes-textarea" id="mNotes"></textarea>
    </div>
    <p style="font-size:11.5px;color:var(--text-muted);line-height:1.6">By recording this submission you confirm the customer has given permission for the uses checked above. Points are awarded once approved, whether the submission is glowing or critical, honest feedback counts either way.</p>
    <div class="modal-actions">
      <button class="btn-ghost-sm" id="mCancel">Cancel</button>
      <button class="btn-primary-sm" id="mSave">Save Submission</button>
    </div>
  `);

  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", () => {
    const testimonialText = document.getElementById("mText").value.trim();
    const photoRef = document.getElementById("mPhotoRef").value.trim();
    const videoUrl = document.getElementById("mVideoUrl").value.trim();
    const permWebsite = document.getElementById("mPermWebsite").checked;
    const permSocial = document.getElementById("mPermSocial").checked;
    const permAdvertising = document.getElementById("mPermAd").checked;
    const dateSubmitted = document.getElementById("mDate").value || todayISO();
    const approvalStatus = document.getElementById("mApproval").value;
    const featured = document.getElementById("mFeatured").checked;
    const notes = document.getElementById("mNotes").value.trim();

    if (!testimonialText && !photoRef && !videoUrl) {
      toast("Add at least a testimonial, photo, or video reference.", true);
      return;
    }

    const rec = {
      id: uid("test"), customerEmail: email, customerName: name, dateSubmitted,
      testimonialText, photoRef, videoUrl, permWebsite, permSocial, permAdvertising,
      approvalStatus, pointsAwarded: 0, featured, notes
    };
    DATA.testimonials.push(rec);

    // If approved right away, log the appropriate ledger reward
    if (approvalStatus === "Approved") {
      const s = DATA.settings;
      let pts = 0, activityType = "Written Testimonial";
      if (videoUrl) { pts = s.videoReward; activityType = "Video Testimonial"; }
      else if (testimonialText && photoRef) { pts = s.photoTestimonialReward; activityType = "Photo + Testimonial"; }
      else if (photoRef) { pts = s.photoReward; activityType = "Customer Photo"; }
      else { pts = s.testimonialReward; activityType = "Written Testimonial"; }

      rec.pointsAwarded = pts;
      DATA.ledger.push({
        id: uid("ledg"), customerEmail: email, customerName: name, date: dateSubmitted,
        activityType, points: pts, dollarAmount: null, orderRef: rec.id,
        source: "Testimonial", status: "Approved", notes: "Auto-logged from testimonial submission.", approvedBy: ""
      });
    }

    saveData();
    closeModal();
    toast("Submission saved.");
    if (document.getElementById("view-profile").classList.contains("active")) renderProfile(email);
  });
}

/* ============================================================
   REFERRAL MODAL
   ============================================================ */
function openReferralModal(email, name) {
  renderModal(`
    <h2>Add Referral — ${esc(name)}</h2>
    <div class="modal-row">
      <div class="modal-field">
        <label class="field-label">Referred person or business *</label>
        <input type="text" class="text-input" id="mReferredName">
      </div>
      <div class="modal-field">
        <label class="field-label">Contact info</label>
        <input type="text" class="text-input" id="mReferredContact" placeholder="Phone or email">
      </div>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label class="field-label">Date referred</label>
        <input type="date" class="text-input" id="mDate" value="${todayISO()}">
      </div>
      <div class="modal-field">
        <label class="field-label">Status</label>
        <select class="select-input text-input" id="mStatus">
          <option value="New" selected>New</option>
          <option value="Contacted">Contacted</option>
          <option value="Quoted">Quoted</option>
          <option value="Paid Customer">Paid Customer</option>
          <option value="Closed">Closed</option>
        </select>
      </div>
    </div>
    <div class="modal-field">
      <label class="field-label">Order value (if applicable)</label>
      <input type="number" class="text-input" id="mOrderValue" min="0" step="0.01" placeholder="0.00">
    </div>
    <div class="modal-field">
      <label class="field-label">Notes</label>
      <textarea class="notes-textarea" id="mNotes"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost-sm" id="mCancel">Cancel</button>
      <button class="btn-primary-sm" id="mSave">Save Referral</button>
    </div>
  `);

  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("mSave").addEventListener("click", () => {
    const referredName = document.getElementById("mReferredName").value.trim();
    const referredContact = document.getElementById("mReferredContact").value.trim();
    const dateReferred = document.getElementById("mDate").value || todayISO();
    const status = document.getElementById("mStatus").value;
    const orderValue = parseFloat(document.getElementById("mOrderValue").value) || 0;
    const notes = document.getElementById("mNotes").value.trim();

    if (!referredName) { toast("Enter who was referred.", true); return; }

    const rec = {
      id: uid("ref"), referringEmail: email, referringName: name, referredName,
      referredContact, dateReferred, status, orderValue, rewardIssued: false, notes
    };

    // If this referral is already a paid customer, offer the reward automatically
    if (status === "Paid Customer") {
      const s = DATA.settings;
      DATA.ledger.push({
        id: uid("ledg"), customerEmail: email, customerName: name, date: dateReferred,
        activityType: "Referral Reward", points: s.referralReward, dollarAmount: null,
        orderRef: rec.id, source: "Referral", status: "Approved",
        notes: `Referral reward for ${referredName} becoming a paid customer.`, approvedBy: ""
      });
      rec.rewardIssued = true;
    }

    DATA.referrals.push(rec);
    saveData();
    closeModal();
    toast("Referral saved.");
    if (document.getElementById("view-profile").classList.contains("active")) renderProfile(email);
  });
}

/* ============================================================
   MODAL HELPERS
   ============================================================ */
function renderModal(html) {
  document.getElementById("modalBox").innerHTML = html;
  document.getElementById("modalOverlay").classList.add("open");
}
function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  document.getElementById("modalBox").innerHTML = "";
}
document.getElementById("modalOverlay").addEventListener("click", (e) => {
  if (e.target.id === "modalOverlay") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* ============================================================
   LEDGER VIEW
   ============================================================ */
function renderLedger() {
  const search = (document.getElementById("ledgerSearch").value || "").toLowerCase();
  const sourceFilter = document.getElementById("ledgerSourceFilter").value;
  const statusFilter = document.getElementById("ledgerStatusFilter").value;

  let rows = [...DATA.ledger].filter(l => {
    const matchesSearch = !search ||
      l.customerName.toLowerCase().includes(search) ||
      l.activityType.toLowerCase().includes(search) ||
      (l.orderRef || "").toLowerCase().includes(search);
    const matchesSource = !sourceFilter || l.source === sourceFilter;
    const matchesStatus = !statusFilter || l.status === statusFilter;
    return matchesSearch && matchesSource && matchesStatus;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const tbody = document.getElementById("ledgerTableBody");
  const emptyState = document.getElementById("ledgerEmptyState");

  if (!rows.length) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    document.getElementById("ledgerTable").style.display = DATA.ledger.length ? "table" : "none";
  } else {
    emptyState.style.display = "none";
    document.getElementById("ledgerTable").style.display = "table";
    tbody.innerHTML = rows.map(l => `
      <tr>
        <td>${fmtDate(l.date)}</td>
        <td><a class="row-link" data-email="${esc(l.customerEmail)}">${esc(l.customerName)}</a></td>
        <td>${esc(l.activityType)}</td>
        <td class="num" style="color:${Number(l.points) >= 0 ? 'var(--success)' : 'var(--danger)'}">${Number(l.points) >= 0 ? '+' : ''}${fmtPoints(l.points)}</td>
        <td class="num">${l.dollarAmount ? fmtMoney(l.dollarAmount) : "—"}</td>
        <td>${esc(l.source)}</td>
        <td><span class="badge badge-${l.status.toLowerCase()}">${esc(l.status)}</span></td>
        <td>${esc(l.orderRef || "—")}</td>
        <td>${l.status !== "Reversed" ? `<a class="row-link" data-reverse="${l.id}">Reverse</a>` : ""}</td>
      </tr>
    `).join("");
    tbody.querySelectorAll("[data-email]").forEach(a => a.addEventListener("click", () => openProfile(a.dataset.email)));
    tbody.querySelectorAll("[data-reverse]").forEach(a => a.addEventListener("click", () => reverseEntry(a.dataset.reverse)));
  }
}

function reverseEntry(id) {
  const entry = DATA.ledger.find(l => l.id === id);
  if (!entry) return;
  if (!confirm(`Reverse this ${entry.activityType} entry for ${entry.customerName}? This creates an offsetting entry rather than deleting the record.`)) return;

  entry.status = "Reversed";
  DATA.ledger.push({
    id: uid("ledg"), customerEmail: entry.customerEmail, customerName: entry.customerName,
    date: todayISO(), activityType: "Reversal of " + entry.activityType,
    points: -Number(entry.points), dollarAmount: null, orderRef: entry.id,
    source: "Manual", status: "Approved", notes: `Reversal of entry ${entry.id}.`, approvedBy: ""
  });
  saveData();
  toast("Entry reversed. Original record kept, an offsetting entry was added.");
  renderLedger();
}

["ledgerSearch", "ledgerSourceFilter", "ledgerStatusFilter"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderLedger);
  document.getElementById(id).addEventListener("change", renderLedger);
});

/* ============================================================
   TESTIMONIALS VIEW
   ============================================================ */
function renderTestimonials() {
  const statusFilter = document.getElementById("testimonialStatusFilter").value;
  const featuredFilter = document.getElementById("testimonialFeaturedFilter").value;

  let rows = [...DATA.testimonials].filter(t => {
    const matchesStatus = !statusFilter || t.approvalStatus === statusFilter;
    const matchesFeatured = !featuredFilter || t.featured;
    return matchesStatus && matchesFeatured;
  }).sort((a, b) => (b.dateSubmitted || "").localeCompare(a.dateSubmitted || ""));

  const grid = document.getElementById("testimonialsGrid");
  const emptyState = document.getElementById("testimonialsEmptyState");

  if (!rows.length) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
    grid.innerHTML = rows.map(t => `
      <div class="testimonial-card ${t.featured ? "featured" : ""}">
        <div class="testimonial-card-top">
          <div>
            <div class="testimonial-customer">${esc(t.customerName)}</div>
            <div class="testimonial-date">${fmtDate(t.dateSubmitted)}</div>
          </div>
          <span class="badge badge-${t.approvalStatus.toLowerCase()}">${esc(t.approvalStatus)}</span>
        </div>
        ${t.testimonialText ? `<p class="testimonial-text">"${esc(t.testimonialText)}"</p>` : ""}
        ${t.photoRef ? `<p style="font-size:12px;color:var(--text-muted)">📷 ${esc(t.photoRef)}</p>` : ""}
        ${t.videoUrl ? `<p style="font-size:12px;color:var(--text-muted)">🎬 ${esc(t.videoUrl)}</p>` : ""}
        <div class="testimonial-perms">
          <span class="perm-tag ${t.permWebsite ? "granted" : ""}">Website</span>
          <span class="perm-tag ${t.permSocial ? "granted" : ""}">Social</span>
          <span class="perm-tag ${t.permAdvertising ? "granted" : ""}">Advertising</span>
        </div>
        ${t.pointsAwarded ? `<p style="font-size:12px;color:var(--tan)">+${fmtPoints(t.pointsAwarded)} points awarded</p>` : ""}
        <div class="testimonial-actions">
          ${t.approvalStatus === "Pending" ? `<button class="btn-primary-sm" data-approve="${t.id}">Approve</button><button class="btn-danger-sm" data-reject="${t.id}">Reject</button>` : ""}
          <button class="btn-ghost-sm" data-feature="${t.id}">${t.featured ? "Unfeature" : "Feature"}</button>
        </div>
      </div>
    `).join("");

    grid.querySelectorAll("[data-approve]").forEach(b => b.addEventListener("click", () => approveTestimonial(b.dataset.approve)));
    grid.querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", () => {
      const t = DATA.testimonials.find(x => x.id === b.dataset.reject);
      if (t) { t.approvalStatus = "Rejected"; saveData(); toast("Marked as rejected."); renderTestimonials(); }
    }));
    grid.querySelectorAll("[data-feature]").forEach(b => b.addEventListener("click", () => {
      const t = DATA.testimonials.find(x => x.id === b.dataset.feature);
      if (t) { t.featured = !t.featured; saveData(); renderTestimonials(); }
    }));
  }
}

function approveTestimonial(id) {
  const t = DATA.testimonials.find(x => x.id === id);
  if (!t) return;
  t.approvalStatus = "Approved";

  const s = DATA.settings;
  let pts = 0, activityType = "Written Testimonial";
  if (t.videoUrl) { pts = s.videoReward; activityType = "Video Testimonial"; }
  else if (t.testimonialText && t.photoRef) { pts = s.photoTestimonialReward; activityType = "Photo + Testimonial"; }
  else if (t.photoRef) { pts = s.photoReward; activityType = "Customer Photo"; }
  else { pts = s.testimonialReward; }

  t.pointsAwarded = pts;
  DATA.ledger.push({
    id: uid("ledg"), customerEmail: t.customerEmail, customerName: t.customerName, date: todayISO(),
    activityType, points: pts, dollarAmount: null, orderRef: t.id,
    source: "Testimonial", status: "Approved", notes: "Approved from Testimonials view.", approvedBy: ""
  });
  saveData();
  toast(`Approved. ${fmtPoints(pts)} points awarded.`);
  renderTestimonials();
}

["testimonialStatusFilter", "testimonialFeaturedFilter"].forEach(id => {
  document.getElementById(id).addEventListener("change", renderTestimonials);
});

/* ============================================================
   REFERRALS VIEW
   ============================================================ */
function renderReferrals() {
  const statusFilter = document.getElementById("referralStatusFilter").value;
  let rows = [...DATA.referrals].filter(r => !statusFilter || r.status === statusFilter)
    .sort((a, b) => (b.dateReferred || "").localeCompare(a.dateReferred || ""));

  const tbody = document.getElementById("referralsTableBody");
  const emptyState = document.getElementById("referralsEmptyState");

  if (!rows.length) {
    tbody.innerHTML = "";
    emptyState.style.display = "block";
    document.getElementById("referralsTable").style.display = DATA.referrals.length ? "table" : "none";
  } else {
    emptyState.style.display = "none";
    document.getElementById("referralsTable").style.display = "table";
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><a class="row-link" data-email="${esc(r.referringEmail)}">${esc(r.referringName)}</a></td>
        <td>${esc(r.referredName)}</td>
        <td>${fmtDate(r.dateReferred)}</td>
        <td><span class="badge badge-type">${esc(r.status)}</span></td>
        <td class="num">${r.orderValue ? fmtMoney(r.orderValue) : "—"}</td>
        <td>${r.rewardIssued ? '<span class="badge badge-approved">Yes</span>' : '<span class="badge badge-inactive">No</span>'}</td>
      </tr>
    `).join("");
    tbody.querySelectorAll("[data-email]").forEach(a => a.addEventListener("click", () => openProfile(a.dataset.email)));
  }
}
document.getElementById("referralStatusFilter").addEventListener("change", renderReferrals);

/* ============================================================
   SETTINGS VIEW
   ============================================================ */
function renderSettings() {
  const s = DATA.settings;
  document.getElementById("settingProgramName").value = s.programName;
  document.getElementById("settingPointsPerDollar").value = s.pointsPerDollar;
  document.getElementById("settingTestimonialReward").value = s.testimonialReward;
  document.getElementById("settingPhotoReward").value = s.photoReward;
  document.getElementById("settingPhotoTestimonialReward").value = s.photoTestimonialReward;
  document.getElementById("settingVideoReward").value = s.videoReward;
  document.getElementById("settingReferralReward").value = s.referralReward;
  document.getElementById("settingSignupBonus").value = s.signupBonus;
  document.getElementById("settingBirthdayBonus").value = s.birthdayBonus;
  document.getElementById("settingPointsPerDollarRedemption").value = s.pointsPerDollarRedemption;
  document.getElementById("settingMinRedemption").value = s.minRedemption;
  document.getElementById("settingReferredFriendDiscount").value = s.referredFriendDiscount;
  document.getElementById("settingReferredFriendMinPurchase").value = s.referredFriendMinPurchase;
  document.getElementById("settingTermsText").value = s.termsText;
}

document.getElementById("btnSaveSettings").addEventListener("click", () => {
  const s = DATA.settings;
  s.programName = document.getElementById("settingProgramName").value.trim() || DEFAULT_SETTINGS.programName;
  s.pointsPerDollar = parseFloat(document.getElementById("settingPointsPerDollar").value) || 0;
  s.testimonialReward = parseInt(document.getElementById("settingTestimonialReward").value) || 0;
  s.photoReward = parseInt(document.getElementById("settingPhotoReward").value) || 0;
  s.photoTestimonialReward = parseInt(document.getElementById("settingPhotoTestimonialReward").value) || 0;
  s.videoReward = parseInt(document.getElementById("settingVideoReward").value) || 0;
  s.referralReward = parseInt(document.getElementById("settingReferralReward").value) || 0;
  s.signupBonus = parseInt(document.getElementById("settingSignupBonus").value) || 0;
  s.birthdayBonus = parseInt(document.getElementById("settingBirthdayBonus").value) || 0;
  s.pointsPerDollarRedemption = parseInt(document.getElementById("settingPointsPerDollarRedemption").value) || 100;
  s.minRedemption = parseInt(document.getElementById("settingMinRedemption").value) || 0;
  s.referredFriendDiscount = parseFloat(document.getElementById("settingReferredFriendDiscount").value) || 0;
  s.referredFriendMinPurchase = parseFloat(document.getElementById("settingReferredFriendMinPurchase").value) || 0;
  saveData();
  toast("Settings saved.");
});
document.getElementById("btnSaveTerms").addEventListener("click", () => {
  DATA.settings.termsText = document.getElementById("settingTermsText").value.trim();
  saveData();
  toast("Terms saved.");
});

/* ============================================================
   EXPORT / IMPORT / BACKUP
   ============================================================ */
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportJson() {
  downloadFile(
    `chozen-rewards-backup-${todayISO()}.json`,
    JSON.stringify(DATA, null, 2),
    "application/json"
  );
  toast("Backup downloaded.");
}

function toCsv(rows, columns) {
  const header = columns.map(c => `"${c.label}"`).join(",");
  const lines = rows.map(row => columns.map(c => {
    let v = row[c.key];
    if (v == null) v = "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(","));
  return [header, ...lines].join("\n");
}

function exportCustomersCsv() {
  const rows = DATA.customers.map(c => ({
    ...c,
    balance: getCustomerBalance(c.email),
    lifetimeEarned: getCustomerLifetimeEarned(c.email),
    lifetimeRedeemed: getCustomerLifetimeRedeemed(c.email),
    totalPurchases: getCustomerTotalPurchases(c.email)
  }));
  const csv = toCsv(rows, [
    { key: "fullName", label: "Full Name" }, { key: "email", label: "Email" },
    { key: "phone", label: "Phone" }, { key: "business", label: "Business" },
    { key: "customerType", label: "Type" }, { key: "dateJoined", label: "Date Joined" },
    { key: "balance", label: "Balance" }, { key: "lifetimeEarned", label: "Lifetime Earned" },
    { key: "lifetimeRedeemed", label: "Lifetime Redeemed" }, { key: "totalPurchases", label: "Total Purchases" },
    { key: "active", label: "Active" }, { key: "notes", label: "Notes" }
  ]);
  downloadFile(`chozen-rewards-customers-${todayISO()}.csv`, csv, "text/csv");
  toast("Customers CSV downloaded.");
}

function exportLedgerCsv() {
  const csv = toCsv(DATA.ledger, [
    { key: "date", label: "Date" }, { key: "customerName", label: "Customer" },
    { key: "customerEmail", label: "Email" }, { key: "activityType", label: "Activity" },
    { key: "points", label: "Points" }, { key: "dollarAmount", label: "Dollar Amount" },
    { key: "orderRef", label: "Reference" }, { key: "source", label: "Source" },
    { key: "status", label: "Status" }, { key: "notes", label: "Notes" }
  ]);
  downloadFile(`chozen-rewards-ledger-${todayISO()}.csv`, csv, "text/csv");
  toast("Ledger CSV downloaded.");
}

document.getElementById("btnExportJson").addEventListener("click", exportJson);
document.getElementById("btnBackup").addEventListener("click", exportJson);
document.getElementById("btnExportCustomersCsv").addEventListener("click", exportCustomersCsv);
document.getElementById("btnExportLedgerCsv").addEventListener("click", exportLedgerCsv);
document.getElementById("btnExportLedgerCsv2").addEventListener("click", exportLedgerCsv);

document.getElementById("importJsonInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid file");
      if (!confirm("Importing will replace all current data with this backup. Continue?")) return;
      DATA = {
        customers: parsed.customers || [],
        ledger: parsed.ledger || [],
        testimonials: parsed.testimonials || [],
        referrals: parsed.referrals || [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
      };
      saveData();
      toast("Backup restored.");
      showView("dashboard");
    } catch (err) {
      toast("That file couldn't be read as a valid backup.", true);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

document.getElementById("btnClearAllData").addEventListener("click", () => {
  if (!confirm("This will permanently erase all customers, ledger entries, testimonials, and referrals from this browser. This cannot be undone unless you have a backup. Continue?")) return;
  if (!confirm("Are you absolutely sure? Type OK to confirm you want to erase everything.")) return;
  DATA = emptyData();
  saveData();
  toast("All data cleared.");
  showView("dashboard");
});

document.getElementById("btnLoadSampleData").addEventListener("click", () => {
  if (!confirm("This will add sample demo customers and transactions to whatever's already here. You can delete them later. Continue?")) return;
  loadSampleData();
  saveData();
  toast("Sample data loaded.");
  showView("dashboard");
});

function loadSampleData() {
  const c1 = { id: uid("cust"), fullName: "Marcus Reed", email: "demo.marcus@example.com", phone: "478-555-0142", business: "Reed Media", customerType: "custom", dateJoined: "2026-05-12", notes: "Demo record, safe to delete.", active: true };
  const c2 = { id: uid("cust"), fullName: "Priya Nandan", email: "demo.priya@example.com", phone: "478-555-0198", business: "", customerType: "website", dateJoined: "2026-06-02", notes: "Demo record, safe to delete.", active: true };
  const c3 = { id: uid("cust"), fullName: "Tobias Hale", email: "demo.tobias@example.com", phone: "", business: "Hale Ministries", customerType: "partner", dateJoined: "2026-04-20", notes: "Demo record, safe to delete.", active: true };
  DATA.customers.push(c1, c2, c3);

  DATA.ledger.push(
    { id: uid("ledg"), customerEmail: c1.email, customerName: c1.fullName, date: "2026-05-12", activityType: "Purchase", points: 84, dollarAmount: 84, orderRef: "DEMO-1001", source: "Custom Order", status: "Approved", notes: "Demo entry.", approvedBy: "Davis" },
    { id: uid("ledg"), customerEmail: c1.email, customerName: c1.fullName, date: "2026-05-20", activityType: "Written Testimonial", points: 100, dollarAmount: null, orderRef: "", source: "Testimonial", status: "Approved", notes: "Demo entry.", approvedBy: "Davis" },
    { id: uid("ledg"), customerEmail: c2.email, customerName: c2.fullName, date: "2026-06-02", activityType: "Purchase", points: 46, dollarAmount: 46, orderRef: "SHOP-2044", source: "Shopify", status: "Approved", notes: "Demo entry.", approvedBy: "" },
    { id: uid("ledg"), customerEmail: c2.email, customerName: c2.fullName, date: "2026-06-10", activityType: "Customer Photo", points: 150, dollarAmount: null, orderRef: "", source: "Testimonial", status: "Pending", notes: "Demo entry.", approvedBy: "" },
    { id: uid("ledg"), customerEmail: c3.email, customerName: c3.fullName, date: "2026-04-25", activityType: "Purchase", points: 320, dollarAmount: 320, orderRef: "DEMO-1002", source: "Custom Order", status: "Approved", notes: "Demo entry.", approvedBy: "Davis" }
  );

  DATA.testimonials.push(
    { id: uid("test"), customerEmail: c1.email, customerName: c1.fullName, dateSubmitted: "2026-05-20", testimonialText: "Quick turnaround and the shirts held up after a dozen washes. Would order again.", photoRef: "", videoUrl: "", permWebsite: true, permSocial: true, permAdvertising: false, approvalStatus: "Approved", pointsAwarded: 100, featured: true, notes: "Demo entry." },
    { id: uid("test"), customerEmail: c2.email, customerName: c2.fullName, dateSubmitted: "2026-06-10", testimonialText: "", photoRef: "demo-photo.jpg", videoUrl: "", permWebsite: true, permSocial: false, permAdvertising: false, approvalStatus: "Pending", pointsAwarded: 0, featured: false, notes: "Demo entry." }
  );

  DATA.referrals.push(
    { id: uid("ref"), referringEmail: c3.email, referringName: c3.fullName, referredName: "Grace Fellowship Youth Group", referredContact: "478-555-0177", dateReferred: "2026-06-15", status: "Quoted", orderValue: 0, rewardIssued: false, notes: "Demo entry." }
  );
}

/* ============================================================
   INIT
   ============================================================ */
renderDashboard();
