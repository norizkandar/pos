(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const state = { user:null, business:null, products:[], customers:[], sales:[], cart:[], currency:"MYR" };
  const money = n => new Intl.NumberFormat("en-MY",{style:"currency",currency:state.currency}).format(Number(n||0));
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const toast = msg => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2800); };
  const fail = (err) => { console.error(err); toast(err?.message || "Something went wrong."); };
  const ready = () => { if(!window.sb) { $("#authMessage").textContent="Add your Supabase URL and anon key in assets/js/config.js, then refresh."; return false; } return true; };
  const businessId = () => state.business?.id;

  async function init(){
    $("#year").textContent=new Date().getFullYear();
    $("#todayLabel").textContent=new Intl.DateTimeFormat("en-MY",{dateStyle:"medium"}).format(new Date());
    $("#themeBtn").onclick=()=>{ const root=document.documentElement; root.dataset.theme=root.dataset.theme==="dark"?"light":"dark"; localStorage.setItem("eonix-pos-theme",root.dataset.theme); };
    document.documentElement.dataset.theme=localStorage.getItem("eonix-pos-theme")||"dark";
    if(!ready()) return;
    const {data:{session}}=await sb.auth.getSession();
    if(session) await enterApp(session.user);
    sb.auth.onAuthStateChange((_event,session)=>{ if(session) enterApp(session.user); else showAuth(); });
    $("#authForm").onsubmit=async e=>{e.preventDefault(); const {error}=await sb.auth.signInWithPassword({email:$("#email").value,password:$("#password").value}); if(error) $("#authMessage").textContent=error.message;};
    $("#signupBtn").onclick=async()=>{const {data,error}=await sb.auth.signUp({email:$("#email").value,password:$("#password").value}); $("#authMessage").textContent=error?error.message:(data.session?"Account created.":"Check your email to confirm your account.");};
    $("#signOutBtn").onclick=()=>sb.auth.signOut();
    $$(".nav-link[data-page]").forEach(b=>b.onclick=()=>navigate(b.dataset.page));
    $$("[data-goto]").forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
    $("#productSearch").oninput=renderPosProducts;
    $("#clearCartBtn").onclick=()=>{state.cart=[];renderCart();};
    $("#discountInput").oninput=renderCart;
    $("#completeSaleBtn").onclick=completeSale;
    $("#addProductBtn").onclick=()=>productModal();
    $("#addCustomerBtn").onclick=()=>customerModal();
    $("#businessForm").onsubmit=saveBusiness;
    $("#exportSalesBtn").onclick=exportSales;
  }
  function showAuth(){ $("#authScreen").classList.remove("hidden"); $("#appShell").classList.add("hidden"); }
  async function enterApp(user){
    state.user=user; $("#authScreen").classList.add("hidden"); $("#appShell").classList.remove("hidden");
    $("#userAvatar").textContent=(user.email||"E")[0].toUpperCase();
    try { await loadBusiness(); await refreshAll(); } catch(e){fail(e);}
  }
  async function loadBusiness(){
    let {data,error}=await sb.from("businesses").select("*").order("created_at").limit(1).maybeSingle();
    if(error) throw error;
    if(!data){ const {data:created,error:insertErr}=await sb.from("businesses").insert({owner_id:state.user.id,name:"My Business",currency:"MYR"}).select().single(); if(insertErr) throw insertErr; data=created; }
    state.business=data; state.currency=data.currency||"MYR";
    $("#businessName").textContent=data.name; $("#settingBusinessName").value=data.name||"";
    $("#settingCurrency").value=state.currency; $("#settingEmail").value=data.email||"";
  }
  async function refreshAll(){ await Promise.all([loadProducts(),loadCustomers(),loadSales()]); renderDashboard(); renderProducts(); renderCustomers(); renderSales(); renderPosProducts(); renderCustomerOptions(); renderReports(); }
  async function loadProducts(){ const {data,error}=await sb.from("products").select("*").eq("business_id",businessId()).eq("is_active",true).order("name"); if(error) throw error; state.products=data||[]; }
  async function loadCustomers(){ const {data,error}=await sb.from("customers").select("*").eq("business_id",businessId()).order("name"); if(error) throw error; state.customers=data||[]; }
  async function loadSales(){ const {data,error}=await sb.from("sales").select("*, sale_items(quantity,product_name)").eq("business_id",businessId()).order("created_at",{ascending:false}).limit(500); if(error) throw error; state.sales=data||[]; }
  function navigate(page){ $$(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page)); $$(".nav-link[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page)); const names={dashboard:["BUSINESS OVERVIEW","Overview"],pos:["POINT OF SALE","Checkout"],products:["CATALOGUE","Products & Stock"],sales:["TRANSACTIONS","Sales history"],customers:["CUSTOMER DIRECTORY","Customers"],reports:["BUSINESS INSIGHTS","Reports"],settings:["WORKSPACE","Settings"]}; $("#pageEyebrow").textContent=names[page][0]; $("#pageTitle").textContent=names[page][1]; }
  function renderDashboard(){
    const today=new Date().toISOString().slice(0,10), todays=state.sales.filter(s=>s.created_at.slice(0,10)===today), gross=state.sales.reduce((a,s)=>a+Number(s.total),0);
    $("#statToday").textContent=money(todays.reduce((a,s)=>a+Number(s.total),0)); $("#statOrders").textContent=`${todays.length} completed orders`;
    $("#statGross").textContent=money(gross); $("#statProducts").textContent=state.products.length;
    const low=state.products.filter(p=>Number(p.stock_quantity)<=Number(p.low_stock_threshold)); $("#statLow").textContent=low.length;
    $("#recentSales").innerHTML=salesTableHTML(state.sales.slice(0,5));
    $("#stockWatch").innerHTML=low.length?low.slice(0,7).map(p=>`<div class="stock-row"><span>${esc(p.name)}</span><b>${p.stock_quantity} left</b></div>`).join(""):'<div class="empty-state">All tracked stock levels look good.</div>';
  }
  function renderProducts(){ $("#productsTable").innerHTML=state.products.length?`<table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>${state.products.map(p=>`<tr><td><b>${esc(p.name)}</b><small>${esc(p.category||"Uncategorised")}</small></td><td>${esc(p.sku||"—")}</td><td>${money(p.price)}</td><td>${p.stock_quantity}</td><td><span class="pill ${p.stock_quantity<=p.low_stock_threshold?"warning":"success"}">${p.stock_quantity<=p.low_stock_threshold?"Low stock":"In stock"}</span></td><td><button class="mini-btn" data-edit-product="${p.id}">Edit</button></td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No products yet. Add your first product.</div>'; $$("[data-edit-product]").forEach(b=>b.onclick=()=>productModal(state.products.find(p=>p.id===b.dataset.editProduct))); }
  function renderPosProducts(){ const q=($("#productSearch")?.value||"").toLowerCase(); const list=state.products.filter(p=>`${p.name} ${p.sku||""}`.toLowerCase().includes(q)); $("#posProducts").innerHTML=list.length?list.map(p=>`<button class="product-tile" data-add-product="${p.id}" ${p.stock_quantity<=0?"disabled":""}><span class="tile-icon">◇</span><b>${esc(p.name)}</b><small>${esc(p.sku||"No SKU")}</small><strong>${money(p.price)}</strong><em>${p.stock_quantity} available</em></button>`).join(""):'<div class="empty-state">No matching products. Add products in Products & Stock.</div>'; $$("[data-add-product]").forEach(b=>b.onclick=()=>addToCart(b.dataset.addProduct)); }
  function addToCart(id){const p=state.products.find(x=>x.id===id); if(!p)return; const line=state.cart.find(x=>x.product.id===id); if(line){if(line.qty>=p.stock_quantity)return toast("Not enough stock.");line.qty++;}else state.cart.push({product:p,qty:1});renderCart();}
  function renderCart(){ const el=$("#cartItems"); el.innerHTML=state.cart.length?state.cart.map((x,i)=>`<div class="cart-row"><div><b>${esc(x.product.name)}</b><small>${money(x.product.price)} each</small></div><div class="qty-control"><button data-dec="${i}">−</button><span>${x.qty}</span><button data-inc="${i}">＋</button></div><b>${money(x.qty*x.product.price)}</b></div>`).join(""):'<div class="empty-state">Your cart is empty.</div>'; $$("[data-dec]").forEach(b=>b.onclick=()=>{const x=state.cart[+b.dataset.dec];x.qty--;if(!x.qty)state.cart.splice(+b.dataset.dec,1);renderCart();}); $$("[data-inc]").forEach(b=>b.onclick=()=>{const x=state.cart[+b.dataset.inc];if(x.qty<x.product.stock_quantity)x.qty++;else toast("Not enough stock.");renderCart();}); const sub=state.cart.reduce((a,x)=>a+x.qty*x.product.price,0),disc=Math.max(0,Math.min(sub,Number($("#discountInput").value||0))); $("#cartSubtotal").textContent=money(sub);$("#cartTotal").textContent=money(sub-disc);}
  function renderCustomerOptions(){ $("#saleCustomer").innerHTML='<option value="">Walk-in customer</option>'+state.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join(""); }
  async function completeSale(){
    if(!state.cart.length)return toast("Add at least one product first.");
    const sub=state.cart.reduce((a,x)=>a+x.qty*x.product.price,0),discount=Math.max(0,Math.min(sub,Number($("#discountInput").value||0))),total=sub-discount;
    const payload={business_id:businessId(),customer_id:$("#saleCustomer").value||null,created_by:state.user.id,subtotal:sub,discount,total,payment_method:$("#paymentMethod").value,status:"completed"};
    $("#completeSaleBtn").disabled=true;
    try{
      const {data:sale,error}=await sb.from("sales").insert(payload).select().single(); if(error)throw error;
      const rows=state.cart.map(x=>({sale_id:sale.id,product_id:x.product.id,product_name:x.product.name,sku:x.product.sku,unit_price:x.product.price,quantity:x.qty,line_total:x.qty*x.product.price}));
      const {error:itemErr}=await sb.from("sale_items").insert(rows); if(itemErr)throw itemErr;
      for(const x of state.cart){const {error:stockErr}=await sb.from("products").update({stock_quantity:x.product.stock_quantity-x.qty}).eq("id",x.product.id).eq("business_id",businessId());if(stockErr)throw stockErr;}
      state.cart=[];$("#discountInput").value=0;renderCart();await refreshAll();toast(`Sale completed · ${money(total)}`);navigate("sales");
      receiptModal(sale,rows,total);
    }catch(e){fail(e);}finally{$("#completeSaleBtn").disabled=false;}
  }
  function salesTableHTML(sales){return sales.length?`<table><thead><tr><th>Receipt</th><th>Date</th><th>Payment</th><th>Total</th><th>Status</th></tr></thead><tbody>${sales.map(s=>`<tr><td><b>${esc(s.receipt_number||s.id.slice(0,8).toUpperCase())}</b></td><td>${new Date(s.created_at).toLocaleString("en-MY")}</td><td>${esc(s.payment_method.replace("_"," "))}</td><td><b>${money(s.total)}</b></td><td><span class="pill success">${esc(s.status)}</span></td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No sales recorded yet.</div>';}
  function renderSales(){ $("#salesTable").innerHTML=salesTableHTML(state.sales); }
  function renderCustomers(){ $("#customersTable").innerHTML=state.customers.length?`<table><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Added</th></tr></thead><tbody>${state.customers.map(c=>`<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.email||"—")}</td><td>${esc(c.phone||"—")}</td><td>${new Date(c.created_at).toLocaleDateString("en-MY")}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-state">No customers yet.</div>'; }
  function renderReports(){const month=new Date().toISOString().slice(0,7),ms=state.sales.filter(s=>s.created_at.slice(0,7)===month),total=state.sales.reduce((a,s)=>a+Number(s.total),0),units=state.sales.reduce((a,s)=>a+(s.sale_items||[]).reduce((n,i)=>n+Number(i.quantity),0),0);$("#reportMonth").textContent=money(ms.reduce((a,s)=>a+Number(s.total),0));$("#reportAverage").textContent=money(state.sales.length?total/state.sales.length:0);$("#reportCount").textContent=state.sales.length;$("#reportUnits").textContent=units;const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const key=d.toISOString().slice(0,10);return {label:d.toLocaleDateString("en",{weekday:"short"}),value:state.sales.filter(s=>s.created_at.slice(0,10)===key).reduce((a,s)=>a+Number(s.total),0)};});const max=Math.max(1,...days.map(x=>x.value));$("#dailyReport").innerHTML=days.map(d=>`<div class="bar-col"><div class="bar-value">${money(d.value)}</div><div class="bar-track"><i style="height:${Math.max(4,d.value/max*100)}%"></i></div><small>${d.label}</small></div>`).join("");}
  function productModal(p={}){modal(`<h3>${p.id?"Edit product":"Add product"}</h3><form id="productForm" class="modal-form"><label>Product name<input name="name" required value="${esc(p.name||"")}"></label><div class="form-two"><label>SKU / Barcode<input name="sku" value="${esc(p.sku||"")}"></label><label>Category<input name="category" value="${esc(p.category||"")}"></label></div><div class="form-two"><label>Price (${state.currency})<input name="price" type="number" min="0" step=".01" required value="${p.price??""}"></label><label>Stock quantity<input name="stock_quantity" type="number" min="0" step="1" required value="${p.stock_quantity??0}"></label></div><label>Low stock threshold<input name="low_stock_threshold" type="number" min="0" value="${p.low_stock_threshold??5}"></label><button class="primary full">Save product</button></form>`);$("#productForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),v=Object.fromEntries(f);v.price=Number(v.price);v.stock_quantity=Number(v.stock_quantity);v.low_stock_threshold=Number(v.low_stock_threshold);v.business_id=businessId();try{const req=p.id?sb.from("products").update(v).eq("id",p.id).eq("business_id",businessId()):sb.from("products").insert(v);const {error}=await req;if(error)throw error;closeModal();await refreshAll();toast("Product saved.");}catch(err){fail(err);}};}
  function customerModal(){modal(`<h3>Add customer</h3><form id="customerForm" class="modal-form"><label>Customer name<input name="name" required></label><label>Email<input name="email" type="email"></label><label>Phone<input name="phone"></label><button class="primary full">Save customer</button></form>`);$("#customerForm").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));v.business_id=businessId();try{const {error}=await sb.from("customers").insert(v);if(error)throw error;closeModal();await refreshAll();toast("Customer added.");}catch(err){fail(err);}};}
  async function saveBusiness(e){e.preventDefault();const v={name:$("#settingBusinessName").value.trim(),currency:$("#settingCurrency").value,email:$("#settingEmail").value.trim()||null};const {error}=await sb.from("businesses").update(v).eq("id",businessId());if(error)return fail(error);state.business={...state.business,...v};state.currency=v.currency;$("#businessName").textContent=v.name;await refreshAll();toast("Business settings saved.");}
  function receiptModal(sale,rows,total){modal(`<div class="receipt"><p class="eyebrow">EONIX POS · RECEIPT</p><h2>${esc(state.business.name)}</h2><p class="muted">${new Date(sale.created_at).toLocaleString("en-MY")}</p><hr>${rows.map(r=>`<div class="receipt-line"><span>${esc(r.product_name)} × ${r.quantity}</span><b>${money(r.line_total)}</b></div>`).join("")}<hr><div class="receipt-line"><b>Total</b><strong>${money(total)}</strong></div><p class="tiny muted">Payment recorded: ${esc(sale.payment_method)}</p><button class="primary full" onclick="window.print()">Print receipt</button><button class="ghost full" id="receiptClose">Close</button></div>`);$("#receiptClose").onclick=closeModal;}
  function modal(html){$("#modalRoot").innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${html}<button class="modal-x" id="modalX">×</button></div></div>`;$("#modalX").onclick=closeModal;$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal();};}
  function closeModal(){$("#modalRoot").innerHTML="";}
  function exportSales(){const rows=[["Receipt","Date","Payment","Subtotal","Discount","Total","Status"],...state.sales.map(s=>[s.receipt_number||s.id,s.created_at,s.payment_method,s.subtotal,s.discount,s.total,s.status])];const csv=rows.map(r=>r.map(x=>`"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="eonix-pos-sales.csv";a.click();URL.revokeObjectURL(a.href);}
  init();
})();