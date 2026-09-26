/**
 * JURAGAN CHICKEN - Google Apps Script API V4 + MIDTRANS SNAP
 *
 * Existing endpoints are preserved:
 * - GET  ?action=publicData
 * - GET  ?action=adminData
 * - POST action=createOrder
 * - POST action=createFranchiseLead
 * - POST action=saveCatalog
 *
 * Phase 4 additions:
 * - POST action=createPayment  -> creates Midtrans Snap transaction
 * - POST notification from Midtrans -> updates Payments sheet
 *
 * SECURITY:
 * - MIDTRANS_SERVER_KEY is stored in Script Properties, never in HTML.
 * - For Sandbox, set MIDTRANS_IS_PRODUCTION = false.
 * - For Production, set MIDTRANS_IS_PRODUCTION = true.
 */

const SPREADSHEET_ID = 'ISI_SPREADSHEET_ID_DI_SINI';

function ss(){ return SpreadsheetApp.openById(SPREADSHEET_ID); }

function props(){ return PropertiesService.getScriptProperties(); }

function midtransConfig(){
  const serverKey = props().getProperty('MIDTRANS_SERVER_KEY') || '';
  const isProduction = String(props().getProperty('MIDTRANS_IS_PRODUCTION') || 'false').toLowerCase() === 'true';
  return {
    serverKey: serverKey,
    isProduction: isProduction,
    endpoint: isProduction
      ? 'https://app.midtrans.com/snap/v1/transactions'
      : 'https://app.sandbox.midtrans.com/snap/v1/transactions'
  };
}

function doGet(e){
  const action = (e.parameter && e.parameter.action) || 'publicData';
  if(action === 'publicData') return json(publicData());
  if(action === 'adminData') return json(adminData());
  return json({ok:false,error:'Unknown action'});
}

function doPost(e){
  try{
    const raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(raw);

    // Midtrans Notification Webhook does not contain our "action" field.
    if(body.transaction_status && body.order_id){
      return json(handleMidtransNotification(body));
    }

    if(body.action === 'createOrder') return json(createOrder(body));
    if(body.action === 'createFranchiseLead') return json(createFranchiseLead(body));
    if(body.action === 'saveCatalog') return json(saveCatalog(body));
    if(body.action === 'createPayment') return json(createPayment(body));

    return json({ok:false,error:'Unknown action'});
  }catch(err){
    console.error(err);
    return json({ok:false,error:String(err)});
  }
}

function publicData(){
  return {
    ok:true,
    products: readSheet('Products'),
    outlets: readSheet('Outlets')
  };
}

function adminData(){
  const orders = readSheet('Orders');
  const leads = readSheet('FranchiseLeads');
  return {
    ok:true,
    products: readSheet('Products'),
    outlets: readSheet('Outlets'),
    ordersCount: Math.max(0, orders.length),
    leadsCount: Math.max(0, leads.length)
  };
}

function createOrder(b){
  appendRow('Orders', [
    new Date(), b.name||'', b.phone||'', b.outlet||'', b.product||'',
    b.qty||1, b.price||0, b.notes||'', 'NEW'
  ]);
  return {ok:true,message:'Order tersimpan'};
}

function createFranchiseLead(b){
  appendRow('FranchiseLeads', [
    new Date(), b.name||'', b.phone||'', b.city||'', b.locationStatus||'',
    b.area||'', b.targetDate||'', b.notes||'', 'NEW'
  ]);
  return {ok:true,message:'Lead franchise tersimpan'};
}

function saveCatalog(b){
  if(!Array.isArray(b.products) || !Array.isArray(b.outlets)) return {ok:false,error:'Format catalog tidak valid'};
  replaceSheet('Products', b.products, ['id','name','cat','price','img','desc']);
  replaceSheet('Outlets', b.outlets, ['id','name','city','wa','maps']);
  return {ok:true,message:'Catalog tersimpan'};
}

/* =========================
   MIDTRANS SNAP
   ========================= */

function createPayment(b){
  if(!b.invoice) return {ok:false,error:'Invoice tidak ditemukan'};

  const cfg = midtransConfig();
  if(!cfg.serverKey) return {ok:false,error:'MIDTRANS_SERVER_KEY belum diatur pada Script Properties'};

  const inv = b.invoice;
  const orderId = String(inv.number || '').trim();
  const grossAmount = Math.round(Number(inv.total) || 0);

  if(!orderId || !grossAmount) return {ok:false,error:'Nomor invoice atau total transaksi tidak valid'};

  const items = Array.isArray(inv.items) ? inv.items : [];
  const itemDetails = items.map(function(item){
    return {
      id: String(item.id || item.name || 'ITEM'),
      price: Math.round(Number(item.price) || 0),
      quantity: Math.max(1, Number(item.qty) || 1),
      name: String(item.name || 'Produk Juragan Chicken').substring(0, 50)
    };
  });

  const payload = {
    transaction_details: {
      order_id: orderId,
      gross_amount: grossAmount
    },
    item_details: itemDetails,
    customer_details: {
      first_name: String(inv.name || 'Customer').substring(0, 50),
      phone: String(inv.phone || '').substring(0, 20)
    }
  };

  const auth = Utilities.base64Encode(cfg.serverKey + ':');
  const response = UrlFetchApp.fetch(cfg.endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Accept: 'application/json',
      Authorization: 'Basic ' + auth
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  let data = {};
  try { data = JSON.parse(text); } catch(e) {}

  if(code < 200 || code >= 300 || !data.token){
    return {
      ok:false,
      error:data.error_messages ? data.error_messages.join(', ') : ('Midtrans HTTP ' + code)
    };
  }

  ensurePaymentsSheet();
  appendRow('Payments', [
    new Date(), orderId, inv.name||'', inv.phone||'', inv.outlet||'',
    grossAmount, inv.payment||'Midtrans', 'PENDING',
    data.token||'', data.redirect_url||'', '', '', '', ''
  ]);

  return {
    ok:true,
    token:data.token,
    redirectUrl:data.redirect_url || '',
    orderId:orderId,
    environment:cfg.isProduction ? 'production' : 'sandbox'
  };
}

function handleMidtransNotification(n){
  const cfg = midtransConfig();
  if(!cfg.serverKey) return {ok:false,error:'MIDTRANS_SERVER_KEY belum diatur'};

  // Midtrans signature: SHA512(order_id + status_code + gross_amount + server_key)
  const expected = sha512Hex(
    String(n.order_id || '') +
    String(n.status_code || '') +
    String(n.gross_amount || '') +
    cfg.serverKey
  );

  if(String(n.signature_key || '').toLowerCase() !== expected.toLowerCase()){
    return {ok:false,error:'Invalid signature'};
  }

  ensurePaymentsSheet();
  updatePaymentRow(n);

  return {ok:true,message:'Notification processed'};
}

function sha512Hex(value){
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_512,
    value,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(b){
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function ensurePaymentsSheet(){
  const headers = [
    'timestamp','invoice','name','phone','outlet','gross_amount','payment_method',
    'status','snap_token','redirect_url','transaction_id','transaction_status',
    'payment_type','fraud_status'
  ];
  const sh = getOrCreateSheet('Payments');
  if(sh.getLastRow() === 0){
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sh;
}

function updatePaymentRow(n){
  const sh = ensurePaymentsSheet();
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  const invoiceCol = headers.indexOf('invoice');
  if(invoiceCol < 0) return;

  let rowNumber = -1;
  for(let i=0;i<values.length;i++){
    if(String(values[i][invoiceCol]) === String(n.order_id)){
      rowNumber = i + 2;
      break;
    }
  }

  const status = normalizePaymentStatus(n.transaction_status, n.fraud_status);
  const patch = {
    status: status,
    transaction_id: n.transaction_id || '',
    transaction_status: n.transaction_status || '',
    payment_type: n.payment_type || '',
    fraud_status: n.fraud_status || ''
  };

  if(rowNumber < 0){
    appendRow('Payments', [
      new Date(), n.order_id || '', '', '', '', Number(n.gross_amount || 0),
      n.payment_type || '', status, '', '', patch.transaction_id,
      patch.transaction_status, patch.payment_type, patch.fraud_status
    ]);
    return;
  }

  Object.keys(patch).forEach(function(key){
    const col = headers.indexOf(key);
    if(col >= 0) sh.getRange(rowNumber, col + 1).setValue(patch[key]);
  });
}

function normalizePaymentStatus(transactionStatus, fraudStatus){
  const s = String(transactionStatus || '').toLowerCase();
  const f = String(fraudStatus || '').toLowerCase();
  if(s === 'settlement') return 'PAID';
  if(s === 'capture' && (!f || f === 'accept')) return 'PAID';
  if(s === 'pending') return 'PENDING';
  if(['deny','cancel','expire','failure'].indexOf(s) >= 0) return 'FAILED';
  return s ? s.toUpperCase() : 'UNKNOWN';
}

function readSheet(name){
  const sh = ss().getSheetByName(name);
  if(!sh || sh.getLastRow()<2) return [];
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  return values.filter(r => r.some(v=>v!=='')).map(row=>{
    const o={}; headers.forEach((h,i)=>o[h]=row[i]);
    return o;
  });
}

function appendRow(name,row){
  const sh = getOrCreateSheet(name);
  sh.appendRow(row);
}

function replaceSheet(name, objects, headers){
  const sh = getOrCreateSheet(name);
  sh.clearContents();
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  if(objects.length){
    const rows=objects.map(o=>headers.map(h=>o[h]??''));
    sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  }
}

function getOrCreateSheet(name){
  let sh=ss().getSheetByName(name);
  if(!sh) sh=ss().insertSheet(name);
  return sh;
}

function json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/*
SETUP SHEETS:
Products:
id | name | cat | price | img | desc

Outlets:
id | name | city | wa | maps

Orders:
timestamp | name | phone | outlet | product | qty | price | notes | status

FranchiseLeads:
timestamp | name | phone | city | locationStatus | area | targetDate | notes | status

Payments (created automatically):
timestamp | invoice | name | phone | outlet | gross_amount | payment_method | status |
snap_token | redirect_url | transaction_id | transaction_status | payment_type | fraud_status
*/
