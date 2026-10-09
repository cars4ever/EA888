/* Lossless compression of large telemetry fields only. Money, hardware and migration
 * versions remain ordinary JSON. lz-string 1.5.0 (MIT) is packaged locally, never fetched at runtime. */
(function(root){
  'use strict';
  const LZ=typeof module!=='undefined' && module.exports ? require('./vendor/lz-string.min.js') : root.LZString;
  const fields=new Set(['lastDyno','dynoRuns','lastDrag','dragRuns','ghost','mapTunes','gripTunes','advice']);
  const cache=new Map();
  function stringify(state){
    return JSON.stringify(state,(key,value)=>{
      if(!fields.has(key) || !value || typeof value!=='object' || value.__ea888Lz16===1) return value;
      const json=JSON.stringify(value);
      if(json.length<4096) return value;
      let packed=cache.get(json);
      if(!packed){packed={__ea888Lz16:1,data:LZ.compressToUTF16(json)};cache.set(json,packed);if(cache.size>48)cache.delete(cache.keys().next().value);}
      return packed;
    });
  }
  function parse(raw){
    return JSON.parse(raw,(_,value)=>{
      if(value && value.__ea888Lz16===1){
        if(typeof value.data!=='string')throw new Error('Ongeldige gecomprimeerde meetdata');
        const text=LZ.decompressFromUTF16(value.data);
        if(!text)throw new Error('Meetdata konden niet worden hersteld');
        return JSON.parse(text);
      }
      return value;
    });
  }
  const api={stringify,parse};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.EA888SaveCodec=api;
})(typeof globalThis!=='undefined'?globalThis:this);
