/* Full game profiles. The existing garage codec remains the state boundary.
 * IndexedDB transactions atomically publish snapshots + slot pointers; the old
 * localStorage saves remain untouched as migration backups. No renderer objects. */
(function(root){
  'use strict';
  const MODES=['workshop','career','qa'], CASH=10000000, MAX_CHARS=60000000;
  const clone=x=>JSON.parse(JSON.stringify(x));
  function validate(s){
    if(!s || typeof s!=='object' || Array.isArray(s))throw new Error('Geen volledige spel-save.');
    if(!Number.isFinite(s.bank) || s.bank<0)throw new Error('Ongeldig saldo.');
    if(Number(s.version)>12)throw new Error('Deze save gebruikt een nieuwere spelindeling.');
    for(const k of ['selections','tune','vehicle','service'])if(!s[k] || typeof s[k]!=='object')throw new Error('Save mist '+k+'.');
    if(s.gameMode && !MODES.includes(s.gameMode))throw new Error('Onbekende spelmodus.');
    return s;
  }
  function migrateWorkshop(input){
    const s=clone(input);
    if(s.gameMode==='workshop' && !s.workshopBudgetVersion){
      const before=s.bank;s.bank=Math.max(CASH,before);s.workshopBudgetVersion=1;
      s.moneyLedger=[{at:new Date().toISOString(),reason:'Eenmalig herstel werkplaatsbudget',delta:s.bank-before,before,after:s.bank},...(s.moneyLedger||[])].slice(0,200);
    }
    return s;
  }
  function topUp(input){
    if(input.gameMode!=='workshop')throw new Error('Budget aanvullen kan alleen in werkplaats.');
    const s=clone(input);s.bank=Math.max(CASH,s.bank);s.workshopBudgetVersion=1;return s;
  }
  function decodeImport(text,codec){
    if(typeof text!=='string' || text.length>MAX_CHARS)throw new Error('Bestand is te groot (maximaal 60 miljoen tekens).');
    let p;try{p=JSON.parse(text);}catch(e){throw new Error('Bestand bevat ongeldige JSON.');}
    if(p.app!=='EA888-LAB' || p.kind!=='full-backup' || !p.state)throw new Error('Dit is geen volledige EA888-save.');
    if(p.formatVersion && p.formatVersion>1)throw new Error('Nieuwere back-upversie wordt niet ondersteund.');
    return validate(codec.parse(JSON.stringify(p.state)));
  }
  const request=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  class Store {
    constructor(core,codec,version,dbName='ea888-full-saves-v1'){this.C=core;this.codec=codec;this.version=version;this.dbName=dbName;}
    async open(){
      const r=indexedDB.open(this.dbName,1);
      r.onupgradeneeded=()=>{for(const n of ['profiles','snapshots','meta'])r.result.createObjectStore(n,{keyPath:'id'});};
      this.db=await request(r);return this;
    }
    transaction(mode,fn){
      return new Promise((ok,no)=>{
        const tx=this.db.transaction(['profiles','snapshots','meta'],mode),stores=Object.fromEntries(['profiles','snapshots','meta'].map(n=>[n,tx.objectStore(n)]));
        let result,error;tx.oncomplete=()=>ok(result);tx.onabort=()=>no(error||tx.error||new Error('Opslagtransactie afgebroken.'));tx.onerror=()=>{};
        Promise.resolve().then(()=>fn(stores)).then(r=>{result=r;},e=>{error=e;try{tx.abort();}catch(_){no(e);}});
      });
    }
    async prepare(state){
      validate(state);
      const canonical=this.C.persistGarageState(this.C.restoreGarageState(state));
      const payload=this.codec.stringify(canonical);
      if(payload.length>MAX_CHARS)throw new Error('Save is te groot. Exporteer en verklein de meetgeschiedenis.');
      validate(this.codec.parse(payload));
      const bytes=new TextEncoder().encode(payload),digest=await crypto.subtle.digest('SHA-256',bytes);
      const id=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      return {id,payload,bytes:bytes.length,at:new Date().toISOString(),version:this.version,
        summary:{mode:canonical.gameMode||'workshop',carId:canonical.garage?.active||'scirocco',bank:canonical.bank}};
    }
    async unpack(snap){
      if(!snap?.payload)throw new Error('Savebestand ontbreekt. Kies een herstelkopie.');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snap.payload));
      const id=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      if(id!==snap.id)throw new Error('Savecontrole mislukt: beschadigd bestand. Kies een herstelkopie.');
      return validate(this.codec.parse(snap.payload));
    }
    list(){return this.transaction('readonly',s=>request(s.profiles.getAll()));}
    activeMetadata(qa=false){return this.transaction('readonly',async s=>{const meta=await request(s.meta.get('lastActive'));return request(s.profiles.get(qa?'vehicle-qa':meta?.value||'legacy-workshop'));});}
    async read(id,ref='current'){
      const pair=await this.transaction('readonly',async s=>{const p=await request(s.profiles.get(id));if(!p)throw new Error('Profiel niet gevonden.');
        const allowed=[p.current,p.lastGood,p.migrationBackup,...(p.autos||[]).map(x=>x.ref),...(p.slots||[]).filter(Boolean).map(x=>x.ref)];
        if(ref!=='current'&&!allowed.includes(ref))throw new Error('Deze kopie hoort bij een ander profiel.');
        return {profile:p,snapshot:await request(s.snapshots.get(ref==='current'?p.current:ref))};});
      const state=await this.unpack(pair.snapshot);state.gameMode=pair.profile.mode;return {...pair,state};
    }
    async collect(s){
      const profiles=await request(s.profiles.getAll()),used=new Set();
      for(const p of profiles)for(const id of [p.current,p.lastGood,p.migrationBackup,...(p.autos||[]).map(x=>x.ref),...(p.slots||[]).filter(Boolean).map(x=>x.ref)])if(id)used.add(id);
      for(const id of await request(s.snapshots.getAllKeys()))if(!used.has(id))s.snapshots.delete(id);
    }
    async create(name,mode,state,id){
      if(!MODES.includes(mode))throw new Error('Onbekende modus.');
      state=migrateWorkshop({...clone(state),gameMode:mode});
      const snap=await this.prepare(state),profile={id:id||crypto.randomUUID(),name:String(name||'Mijn spel').trim().slice(0,60),mode,current:snap.id,lastGood:snap.id,autos:[],slots:[null,null,null,null,null],updatedAt:snap.at,version:this.version,summary:snap.summary};
      await this.transaction('readwrite',async s=>{if(await request(s.profiles.get(profile.id)))throw new Error('Profiel bestaat al.');s.snapshots.put(snap);s.profiles.add(profile);});return profile;
    }
    async commit(id,state,reason='Voortgang',slot=null,name=''){
      const previous=await this.transaction('readonly',async s=>{const p=await request(s.profiles.get(id));return {profile:p,snapshot:p?await request(s.snapshots.get(p.current)):null};});
      let previousValid=false;try{await this.unpack(previous.snapshot);previousValid=true;}catch(e){/* keep older last-known-good */}
      const snap=await this.prepare(state);
      return this.transaction('readwrite',async s=>{
        const p=await request(s.profiles.get(id));if(!p)throw new Error('Profiel ontbreekt.');
        if(p.current!==previous.profile?.current)throw new Error('Dit profiel is elders gewijzigd. Laad het opnieuw voordat je opslaat.');
        if(p.mode!==snap.summary.mode)throw new Error('Een save mag niet stilzwijgend van modus veranderen.');
        if(slot!==null && (!Number.isInteger(slot)||slot<0||slot>=5))throw new Error('Ongeldig saveslot.');
        if(p.current!==snap.id){
          if(previousValid)p.lastGood=p.current;
          p.autos=[...(previousValid?[{ref:p.current,at:p.updatedAt,name:'Autosave vóór '+reason,summary:p.summary,version:p.version}]:[]),...(p.autos||[])].filter((x,i,a)=>a.findIndex(y=>y.ref===x.ref)===i).slice(0,3);
        }
        s.snapshots.put(snap);p.current=snap.id;p.summary=snap.summary;p.updatedAt=snap.at;p.version=this.version;
        if(slot!==null)p.slots[slot]={ref:snap.id,name:String(name||'Opslag '+(slot+1)).slice(0,60),at:snap.at,summary:snap.summary,version:this.version};
        s.profiles.put(p);await this.collect(s);return p;
      });
    }
    async activate(id){await this.read(id);await this.transaction('readwrite',s=>{s.meta.put({id:'lastActive',value:id});});}
    async remove(id,slot=null){
      return this.transaction('readwrite',async s=>{
        const p=await request(s.profiles.get(id));if(!p)throw new Error('Profiel ontbreekt.');
        if(slot!==null){if(!Number.isInteger(slot)||slot<0||slot>=5)throw new Error('Ongeldig slot.');p.slots[slot]=null;s.profiles.put(p);}
        else{const last=await request(s.meta.get('lastActive'));if(last?.value===id)throw new Error('Laad eerst een ander profiel voordat je dit verwijdert.');s.profiles.delete(id);}
        await this.collect(s);
      });
    }
    async bootstrap(legacy,qa){
      let profiles=await this.list();
      if(!qa && !profiles.some(p=>p.mode!=='qa')){
        if(legacy.saveRecoveryError)throw new Error(legacy.saveRecoveryError);
        // v1.30 used one root key for workshop and career, without a mode bit.
        // Preserve a separately loadable, uncredited career copy as well as the
        // exact immutable localStorage original before granting workshop money.
        const mode=legacy.gameMode||'workshop';
        const original=await this.prepare({...legacy,gameMode:mode});
        const fixed=migrateWorkshop({...legacy,gameMode:mode}),snap=await this.prepare(fixed);
        const p={id:'legacy-'+mode,name:'Mijn '+(mode==='career'?'carrière':'werkplaats'),mode,current:snap.id,lastGood:original.id,migrationBackup:original.id,slots:[null,null,null,null,null],autos:[],updatedAt:snap.at,version:this.version,summary:snap.summary};
        await this.transaction('readwrite',async s=>{
          s.snapshots.put(original);s.snapshots.put(snap);s.profiles.put(p);s.meta.put({id:'lastActive',value:p.id});
          if(!legacy.gameMode && !qa){const c={...p,id:'legacy-career',name:'Carrière vóór werkplaatsherstel',mode:'career',current:original.id,lastGood:original.id,migrationBackup:original.id,summary:{...original.summary,mode:'career'}};s.profiles.put(c);}
        });
      }
      profiles=await this.list();
      if(qa){
        let q=profiles.find(p=>p.mode==='qa');if(!q)q=await this.create('Voertuig-QA','qa',legacy.qaProfile?legacy:this.C.createVehicleQA(),'vehicle-qa');
        return this.read(q.id);
      }
      const last=await this.transaction('readonly',s=>request(s.meta.get('lastActive')));
      const id=last?.value||profiles.find(p=>p.mode!=='qa')?.id||profiles[0].id;
      const result=await this.read(id);
      // The preserved legacy-career snapshot intentionally has no monetary edits.
      result.state.gameMode=result.profile.mode;return result;
    }
  }
  const api={Store,validate,migrateWorkshop,topUp,decodeImport,CASH};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.EA888Saves=api;
})(typeof globalThis!=='undefined'?globalThis:this);
