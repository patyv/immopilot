(function(root){
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  const ITERATIONS=600000,FORMAT='immopilot-aesgcm',AAD=encoder.encode('ImmoPilot backup v1');
  function toBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)}
  function fromBase64(text,max){if(typeof text!=='string'||text.length>max||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))throw Error('Sauvegarde chiffrée invalide.');try{return Uint8Array.from(atob(text),c=>c.charCodeAt(0))}catch{throw Error('Sauvegarde chiffrée invalide.')}}
  function supported(){if(!root.crypto?.subtle)throw Error('Le chiffrement nécessite HTTPS et un navigateur récent. Ouvrez le site GitHub Pages.');}
  async function key(password,salt){supported();const material=await root.crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return root.crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  async function encrypt(data,password){
    supported();if(typeof password!=='string'||password.length<12)throw Error('Choisissez une phrase secrète d’au moins 12 caractères.');
    const raw=encoder.encode(JSON.stringify(data));if(raw.byteLength>1024*1024)throw Error('Sauvegarde trop volumineuse (1 Mo maximum).');
    const salt=root.crypto.getRandomValues(new Uint8Array(16)),iv=root.crypto.getRandomValues(new Uint8Array(12));
    const encrypted=await root.crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},await key(password,salt),raw);
    return {format:FORMAT,version:1,iterations:ITERATIONS,salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(encrypted))};
  }
  async function decrypt(data,password){
    supported();if(data?.format!==FORMAT||data.version!==1||data.iterations!==ITERATIONS)throw Error('Format de chiffrement non reconnu.');
    const salt=fromBase64(data.salt,24),iv=fromBase64(data.iv,16),cipher=fromBase64(data.ciphertext,1500000);
    if(salt.length!==16||iv.length!==12||cipher.length<16||cipher.length>1024*1024+16)throw Error('Sauvegarde chiffrée invalide.');
    try{const raw=await root.crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:AAD},await key(password,salt),cipher);return JSON.parse(decoder.decode(raw))}catch{throw Error('Phrase secrète incorrecte ou sauvegarde endommagée.');}
  }
  function toLink(data,base){const u=new URL(base);u.hash='transfer='+toBase64(encoder.encode(JSON.stringify(data))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');if(u.href.length>14000)throw Error('Trop de projets pour un lien fiable. Téléchargez plutôt le fichier chiffré.');return u.href;}
  function fromFragment(fragment){if(!fragment.startsWith('#transfer='))return null;let s=fragment.slice(10);if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length>16000)throw Error('Lien de transfert invalide ou trop volumineux.');s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return JSON.parse(decoder.decode(fromBase64(s,17000)));}
  const api={encrypt,decrypt,toLink,fromFragment};root.ImmoBackup=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
